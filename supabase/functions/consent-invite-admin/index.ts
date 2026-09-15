import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  buildConsentInviteDelivery,
  type ConsentInviteLinkRecord,
  parseConsentInviteCreate,
  parseConsentInviteList,
  parseConsentInviteReissue,
  publicConsentInviteMetadata,
} from "../_shared/consent-invite-admin.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(
  /\/$/,
  "",
);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedOrigins = new Set([
  siteUrl,
  "https://fabsy.ca",
  "https://www.fabsy.ca",
  "https://fabsy-blue.vercel.app",
  "https://fabsy-execom.vercel.app",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

class RequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function responseHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : siteUrl,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(req),
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requestBody(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 16_000) {
    throw new RequestError("Request is too large.", 413);
  }
  const raw = await req.text();
  if (!raw || raw.length > 16_000) {
    throw new RequestError("A JSON request body is required.");
  }
  try {
    return record(JSON.parse(raw));
  } catch {
    throw new RequestError("A valid JSON request body is required.");
  }
}

async function requireStaff(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new RequestError("Staff sign-in is required.", 401);
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data.user) {
    throw new RequestError("Staff sign-in is invalid or expired.", 401);
  }
  const { data: roles, error: roleError } = await admin.from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .in("role", ["admin", "case_manager"])
    .limit(1);
  if (roleError) throw roleError;
  if (!roles?.length) {
    throw new RequestError("Admin or case-manager access is required.", 403);
  }
  return data.user;
}

function accessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function expiryInDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString();
}

function inviteRecord(value: unknown) {
  return record(value) as unknown as ConsentInviteLinkRecord;
}

function validated<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new RequestError(
      error instanceof Error ? error.message : "Request details are invalid.",
      400,
    );
  }
}

async function createInvite(req: Request, raw: Record<string, unknown>) {
  const input = validated(() => parseConsentInviteCreate(raw));
  const token = accessToken();
  const tokenHash = await sha256(token);
  const expiresAt = expiryInDays(input.expiresInDays);
  const { data, error } = await admin.from("representation_consent_invites")
    .insert({
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt,
      client_legal_name: `${input.firstName} ${input.lastName}`,
      client_first_name: input.firstName,
      client_last_name: input.lastName,
      client_email: input.email,
      ticket_number: input.ticketNumber,
      ticket_numbers: [input.ticketNumber],
      charge_description: input.chargeDescription,
      offence_date_text: input.offenceDateText,
      court_location: input.courtLocation,
      court_date_text: input.courtDateText,
      matter_details: input.matterDetails,
      // Commercial terms are handled separately from this consent-only link.
      base_fee_cents: 0,
      tax_terms: "Handled under separate service agreement",
      success_fee_percent: 0,
      success_fee_waived: true,
    })
    .select(
      "id,status,expires_at,client_legal_name,client_email,ticket_number,ticket_numbers,charge_description,created_at,reissued_from_invite_id",
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new RequestError(
        "An active consent invitation already exists for this client and ticket. Reissue it from the recent invitations list.",
        409,
      );
    }
    throw error;
  }
  return json(
    req,
    buildConsentInviteDelivery(siteUrl, token, inviteRecord(data)),
    201,
  );
}

async function reissueInvite(req: Request, raw: Record<string, unknown>) {
  const input = validated(() => parseConsentInviteReissue(raw));
  const token = accessToken();
  const { data, error } = await admin.rpc(
    "reissue_representation_consent_invite",
    {
      p_invite_id: input.inviteId,
      p_token_hash: await sha256(token),
      p_expires_at: expiryInDays(input.expiresInDays),
    },
  );
  if (error) throw error;
  const result = record(data);
  const outcome = String(result.result || "");
  if (outcome === "not_found") {
    throw new RequestError("Consent invitation was not found.", 404);
  }
  if (outcome === "not_reissuable") {
    throw new RequestError(
      `A ${String(result.status || "current")} invitation cannot be reissued.`,
      409,
    );
  }
  if (outcome === "already_reissued") {
    throw new RequestError(
      "This invitation was already reissued. Refresh the list and reissue the newest invitation if its link was lost.",
      409,
    );
  }
  if (outcome !== "created") {
    throw new RequestError("Consent invitation could not be reissued.", 409);
  }
  const invite = inviteRecord(result.invite);
  return json(req, buildConsentInviteDelivery(siteUrl, token, invite), 201);
}

async function listInvites(req: Request, raw: Record<string, unknown>) {
  const { limit } = validated(() => parseConsentInviteList(raw));
  const { data, error } = await admin.from("representation_consent_invites")
    .select(
      "id,status,expires_at,client_legal_name,client_email,ticket_number,ticket_numbers,charge_description,created_at,reissued_from_invite_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const now = Date.now();
  const replacedInviteIds = new Set(
    (data || []).map((value) => inviteRecord(value).reissued_from_invite_id)
      .filter((value): value is string => Boolean(value)),
  );
  const invites = (data || []).map((value) => {
    const invite = inviteRecord(value);
    if (
      invite.status === "pending" &&
      Date.parse(invite.expires_at) <= now
    ) {
      invite.status = "expired";
    }
    return {
      ...publicConsentInviteMetadata(invite),
      hasReplacement: replacedInviteIds.has(invite.id),
    };
  });
  return json(req, { invites });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed." }, 405);
  }
  const origin = req.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) {
    return json(req, { error: "Origin is not allowed." }, 403);
  }
  try {
    await requireStaff(req);
    const body = await requestBody(req);
    if (body.action === "create") return await createInvite(req, body);
    if (body.action === "reissue") return await reissueInvite(req, body);
    if (body.action === "list") return await listInvites(req, body);
    throw new RequestError("Action is invalid.");
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    if (status >= 500) console.error("consent-invite-admin failed", error);
    return json(req, {
      error: status >= 500
        ? "The consent invitation service is temporarily unavailable."
        : (error as Error).message,
    }, status);
  }
}

if (import.meta.main) serve(handler);
