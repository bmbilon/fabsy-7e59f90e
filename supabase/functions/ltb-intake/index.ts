import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { LTB_BUCKET, LtbRequestError, parseLtbSubmission } from "../_shared/ltb-intake-core.ts";
import { queueLtbIntake, wakeAlertWorker } from "../_shared/process-ltb-intake.ts";

/**
 * Public intake for Ontario LTB practice pages.
 *
 * submit   -> registers or reuses the client, opens a case, returns one-time
 *             private upload URLs (bucket ltb-documents).
 * finalize -> confirms which uploads landed and starts background reading.
 *
 * The browser only ever holds a random intake token; its hash authorizes
 * finalize for that one case.
 */

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const attempts = new Map<string, { count: number; until: number }>();

export function allowedOrigins(): string[] {
  return (Deno.env.get("LTB_ALLOWED_ORIGINS") ||
    "https://anderhue-paralegal.vercel.app,https://anderson-paralegal.vercel.app")
    .split(",").map(origin => origin.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && allowedOrigins().includes(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
    base["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    base["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return base;
}

const hash = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
)).map(byte => byte.toString(16).padStart(2, "0")).join("");

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

function rateLimit(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const bucket = attempts.get(ip);
  if (bucket && bucket.until > now && bucket.count >= 8) {
    throw new LtbRequestError("Too many submissions. Please try again later or call the office.", 429);
  }
  attempts.set(ip, {
    count: bucket && bucket.until > now ? bucket.count + 1 : 1,
    until: bucket && bucket.until > now ? bucket.until : now + 3_600_000,
  });
}

export const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: headers["Access-Control-Allow-Origin"] ? 204 : 403, headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (origin && !headers["Access-Control-Allow-Origin"]) return json({ error: "Origin not allowed." }, 403);
  try {
    const input = await req.json().catch(() => null);
    if (!input || typeof input !== "object") throw new LtbRequestError("Your request could not be read.");

    if (input.action === "submit") {
      const submission = parseLtbSubmission(input);
      // Bots get an ordinary-looking receipt and nothing is stored.
      if (submission.bot) return json({ ok: true, caseId: null, caseNumber: null, intakeToken: null, uploads: [] });
      rateLimit(req);
      const intakeToken = randomToken();
      const documents = submission.files.map((file, index) => ({
        id: crypto.randomUUID(), extension: file.extension, contentType: file.contentType,
        size: file.size, name: file.name, index,
      }));
      const { data, error } = await admin.rpc("ltb_register_intake", {
        p_practice_id: submission.practiceId,
        p_intake: {
          email: submission.email, firstName: submission.firstName, lastName: submission.lastName,
          phone: submission.phone, city: submission.city, issue: submission.issue,
          noticeServed: submission.noticeServed, owed: submission.owed, notes: submission.notes,
          userAgent: (req.headers.get("user-agent") || "").slice(0, 400),
          source: input.smokeTest === true ? "smoke-test" : "ltb-landing",
        },
        p_token_hash: await hash(intakeToken),
        p_documents: documents.map(({ index: _index, ...doc }) => doc),
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row?.case_id) {
        console.error("ltb_register_intake failed", error?.code || "no_row");
        throw new LtbRequestError("Your file could not be opened. Please try again or call the office.", 503);
      }
      const uploads = [];
      for (const doc of documents) {
        const path = `${row.case_id}/${doc.id}.${doc.extension}`;
        const { data: signed, error: signError } = await admin.storage.from(LTB_BUCKET).createSignedUploadUrl(path);
        if (!signError && signed?.signedUrl) {
          uploads.push({ documentId: doc.id, index: doc.index, path, signedUrl: signed.signedUrl, contentType: doc.contentType });
        }
      }
      if (!documents.length) {
        const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
        runtime?.waitUntil?.(wakeAlertWorker(admin));
      }
      return json({ ok: true, caseId: row.case_id, caseNumber: row.case_number, intakeToken, uploads });
    }

    if (input.action === "finalize") {
      if (typeof input.caseId !== "string" || !uuid.test(input.caseId) ||
          typeof input.intakeToken !== "string" || !/^[a-f0-9]{64}$/.test(input.intakeToken)) {
        throw new LtbRequestError("File authorization is invalid.", 403);
      }
      const caseId = input.caseId.toLowerCase();
      const claimed: string[] = Array.isArray(input.uploaded)
        ? input.uploaded.filter((id: unknown): id is string => typeof id === "string" && uuid.test(id)).slice(0, 6)
        : [];
      // Trust storage, not the browser, for which files actually arrived.
      const { data: objects } = await admin.storage.from(LTB_BUCKET).list(caseId, { limit: 20 });
      const present = new Set((objects || []).map(object => object.name.split(".")[0]));
      const confirmed = claimed.filter(id => present.has(id.toLowerCase()));
      const { data: status, error } = await admin.rpc("ltb_finalize_intake", {
        p_case_id: caseId, p_token_hash: await hash(input.intakeToken), p_uploaded: confirmed,
      });
      if (error) throw new LtbRequestError("File authorization is invalid.", 403);
      if (status === "pending_scan") queueLtbIntake(admin, caseId, Deno.env.get("LOVABLE_API_KEY") || "");
      else {
        const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
        runtime?.waitUntil?.(wakeAlertWorker(admin));
      }
      return json({ ok: true, received: confirmed.length });
    }

    throw new LtbRequestError("Unknown intake action.");
  } catch (error) {
    if (error instanceof LtbRequestError) return json({ error: error.message }, error.status);
    console.error("ltb-intake error", error instanceof Error ? error.name : "unknown");
    return json({ error: "Your request could not be completed." }, 500);
  }
};

if (import.meta.main) serve(handler);
