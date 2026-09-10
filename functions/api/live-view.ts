import {
  isBot,
  livePage,
  pageStage,
  SOURCES,
  visitorDevice,
} from "../../src/lib/live-view/core";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface CloudflareLocation {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  botManagement?: { verifiedBot?: boolean };
}
interface Context {
  request: Request & { cf?: CloudflareLocation };
  env: Env;
}

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers,
  });
const publicKey = "sb_publishable_KEo-G1wij9RC_IDDzblisw_VISRvwrX";
const projectUrl = "https://gcasbisxfrssonllpqrw.supabase.co";

async function rpc(
  env: Env,
  name: string,
  body: unknown,
  token?: string,
): Promise<Response> {
  return fetch(`${env.SUPABASE_URL || projectUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: token
        ? env.SUPABASE_ANON_KEY || publicKey
        : env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${token || env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

async function smallJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  if (!request.body || Number(request.headers.get("Content-Length")) > 1024)
    return null;
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function coordinate(value: string | undefined, limit: number): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit
    ? Math.round(n * 10) / 10
    : null;
}
// Strip controls from edge-provided metadata before storing it.
const locationText = (value: string | undefined) =>
  value
    ?.replace(/[<>]/g, "")
    .split("")
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .slice(0, 80) || null;

export const onRequest = async ({
  request,
  env,
}: Context): Promise<Response> => {
  try {
    if (request.method === "GET") {
      const authorization = request.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer "))
        return reply(401, { error: "Sign in to view site activity." });
      if (!env.SUPABASE_SERVICE_ROLE_KEY)
        return reply(503, { error: "Live View collection is not configured." });
      const result = await rpc(
        env,
        "admin_live_view",
        {},
        authorization.slice(7),
      );
      if (!result.ok) {
        const denied = [401, 403].includes(result.status);
        return reply(denied ? 403 : 503, {
          error: denied
            ? "Administrator access is required."
            : "Live View is temporarily unavailable.",
        });
      }
      return reply(200, await result.json());
    }
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed." });
    const url = new URL(request.url);
    if (request.headers.get("Origin") !== url.origin) return reply(403);
    if (!["fabsy.ca", "www.fabsy.ca"].includes(url.hostname)) return reply(204);
    if (
      request.headers.get("DNT") === "1" ||
      request.headers.get("Sec-GPC") === "1" ||
      isBot(request.headers.get("User-Agent") || "") ||
      request.cf?.botManagement?.verifiedBot
    )
      return reply(204);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return reply(415);
    const data = await smallJson(request);
    const page = livePage(data?.page);
    if (
      !data ||
      data.consent !== true ||
      !page ||
      typeof data.session_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data.session_id,
      ) ||
      !SOURCES.some((source) => source === data.source) ||
      !["browsing", "intake", "review"].includes(String(data.stage)) ||
      Object.keys(data).some(
        (key) =>
          !["session_id", "page", "source", "stage", "consent"].includes(key),
      )
    )
      return reply(400);
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return reply(503);

    // Salt changes daily. Raw network addresses and user agents never enter storage.
    const day = new Date().toISOString().slice(0, 10);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.SUPABASE_SERVICE_ROLE_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const hash = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        `${day}:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
      ),
    );
    const networkHash = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const cf = request.cf;
    const result = await rpc(env, "ingest_live_visitor", {
      p_session_id: data.session_id,
      p_page: page,
      p_stage: pageStage(page, data.stage),
      p_source: data.source,
      p_device: visitorDevice(request.headers.get("User-Agent") || ""),
      p_network_hash: networkHash,
      p_city: locationText(cf?.city),
      p_region: locationText(cf?.region),
      p_country: locationText(cf?.country),
      p_latitude: coordinate(cf?.latitude, 90),
      p_longitude: coordinate(cf?.longitude, 180),
    });
    if (!result.ok) return reply(503);
    return reply((await result.json()) === false ? 429 : 204);
  } catch {
    return reply(503, { error: "Live View is temporarily unavailable." });
  }
};
