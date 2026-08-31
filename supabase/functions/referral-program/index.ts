import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  mintReferralAttribution,
  normalizeReferralCode,
  ReferralRequestError,
  refreshReferralPayment,
} from "../_shared/referrals.ts";

const PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const captureLimits = new Map<string, { count: number; resetAt: number }>();
const ledgerFields = "id,referrer_id,code,order_id,ticket_type,amount,status,hold_reason,eligible_at,paid_at,payout_reference,refund_review_required,created_at";
const orderFields = "id,referral_accepted_at,referral_payment_settled_at,referral_payment_checked_at,referral_scope_confirmed,referral_fleet_account,referral_identity_checked_at,referral_plate";

type LedgerRow = Record<string, unknown> & {
  id: string;
  referrer_id: string;
  order_id: string;
  created_at: string;
  status: string;
  hold_reason: string | null;
  amount: number | string;
  order?: Record<string, unknown> | Record<string, unknown>[] | null;
};
type Payee = Record<string, unknown> & {
  referrer_id: string;
  legal_name: string | null;
  payout_email: string | null;
  paid_count: number | string;
  year_to_date_paid: number | string;
  is_past_client: boolean;
};

function containsControlCharacters(value: string, allowMultiline: boolean): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 32 || code === 127) && (!allowMultiline || ![9, 10, 13].includes(code))) return true;
  }
  return false;
}

function textField(body: Record<string, unknown>, field: string, min: number, max: number, fallback?: string, allowMultiline = false): string {
  const raw = body[field] ?? fallback;
  if (typeof raw !== "string" || raw.trim().length < min || raw.trim().length > max || containsControlCharacters(raw, allowMultiline)) {
    throw new ReferralRequestError(`Enter a valid ${field.replaceAll("_", " ")}.`);
  }
  return raw.trim();
}

function uuidField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ReferralRequestError("Choose a valid referral order.");
  return value;
}

function boolField(body: Record<string, unknown>, field: string): boolean {
  if (typeof body[field] !== "boolean") throw new ReferralRequestError(`Confirm ${field.replaceAll("_", " ")}.`);
  return body[field] as boolean;
}

function row<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function makeCursor(value: LedgerRow): string {
  return btoa(JSON.stringify({ created_at: value.created_at, id: value.id }));
}

function parseCursor(value: unknown): { created_at: string; id: string } | null {
  if (value === undefined || value === null || value === "") return null;
  try {
    if (typeof value !== "string" || value.length > 256) throw new Error();
    const cursor = JSON.parse(atob(value));
    if (!UUID_PATTERN.test(cursor.id) || typeof cursor.created_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(cursor.created_at) ||
      !Number.isFinite(Date.parse(cursor.created_at))) throw new Error();
    return cursor;
  } catch {
    throw new ReferralRequestError("This page cursor is invalid. Reload the referral page.");
  }
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new ReferralRequestError("A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); throw new ReferralRequestError("The request is too large.", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new ReferralRequestError("Provide a valid JSON request.");
  }
}

async function requireUser(admin: SupabaseClient, req: Request): Promise<User> {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new ReferralRequestError("Sign in to your referral portal.", 401);
  const { data, error } = await admin.auth.getUser(header.slice(7));
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    throw new ReferralRequestError("Sign in with a verified email to use the referral portal.", 401);
  }
  return data.user;
}

async function requireStaff(admin: SupabaseClient, user: User) {
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", user.id)
    .in("role", ["admin", "case_manager"]).limit(2);
  if (error) throw error;
  if (!data?.length) throw new ReferralRequestError("Staff access is required.", 403);
  return { canRecordPayout: data.some((entry) => entry.role === "admin") };
}

async function payees(admin: SupabaseClient, ids: string[]): Promise<Map<string, Payee>> {
  if (!ids.length) return new Map();
  const { data, error } = await admin.rpc("referral_payee_details", { p_referrer_ids: [...new Set(ids)] });
  if (error) throw error;
  return new Map((data || []).map((payee: Payee) => [payee.referrer_id, payee]));
}

async function listLedger(admin: SupabaseClient, cursor: unknown, referrerId?: string, status?: unknown) {
  const after = parseCursor(cursor);
  let query = admin.from("referrals").select(`${ledgerFields},order:ticket_submissions!referrals_order_id_fkey(${orderFields})`)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE + 1);
  if (referrerId) query = query.eq("referrer_id", referrerId);
  if (status !== undefined && status !== "all") {
    if (!["pending", "eligible", "paid", "void"].includes(String(status))) throw new ReferralRequestError("Choose a valid referral status.");
    query = query.eq("status", status);
  }
  if (after) query = query.or(`created_at.lt.${after.created_at},and(created_at.eq.${after.created_at},id.lt.${after.id})`);
  const { data, error } = await query;
  if (error) throw error;
  const page = ((data || []) as unknown as LedgerRow[]).slice(0, PAGE_SIZE);
  if (page.length) {
    const refreshed = await admin.rpc("referral_recalculate_many", { p_order_ids: page.map((entry) => entry.order_id) });
    if (refreshed.error) throw refreshed.error;
    const records = new Map<string, LedgerRow>((refreshed.data || []).map((entry: LedgerRow) => [entry.id, entry]));
    for (let index = 0; index < page.length; index++) page[index] = { ...page[index], ...records.get(page[index].id) };
  }
  return { rows: page, next_cursor: (data?.length || 0) > PAGE_SIZE ? makeCursor(page[page.length - 1]) : null };
}

function publicLedger(entry: LedgerRow) {
  return {
    id: entry.id,
    ticket_type: entry.ticket_type,
    amount: Number(entry.amount),
    status: entry.status,
    created_at: entry.created_at,
    eligible_at: entry.eligible_at,
    paid_at: entry.paid_at,
    hold_reason: entry.hold_reason,
  };
}

function profileFromPayee(payee?: Payee) {
  if (!payee?.legal_name) return null;
  return {
    legal_name: payee.legal_name,
    address_line1: payee.address_line1,
    address_line2: payee.address_line2,
    city: payee.city,
    province: payee.province,
    postal_code: payee.postal_code,
    payout_email: payee.payout_email,
  };
}

function adminLedger(entry: LedgerRow, payee?: Payee) {
  const order = entry.order ? row(entry.order) : {};
  const profile = profileFromPayee(payee);
  const profileRequired = Number(payee?.paid_count || 0) >= 1 && !profile;
  const lastChecked = typeof order.referral_payment_checked_at === "string" ? Date.parse(order.referral_payment_checked_at) : 0;
  return {
    ...publicLedger(entry),
    order_id: entry.order_id,
    code: entry.code,
    payout_reference: entry.payout_reference,
    refund_review_required: entry.refund_review_required,
    accepted_at: order.referral_accepted_at || null,
    payment_settled_at: order.referral_payment_settled_at || null,
    payment_checked_at: order.referral_payment_checked_at || null,
    scope_confirmed: order.referral_scope_confirmed ?? null,
    fleet_account: order.referral_fleet_account ?? null,
    identity_reviewed_at: order.referral_identity_checked_at || null,
    plate: order.referral_plate || null,
    profile_required: profileRequired,
    profile_complete: Boolean(profile),
    payout_ready: entry.status === "eligible" && !entry.hold_reason && !profileRequired && lastChecked >= Date.now() - 60_000,
    payee: profile,
    payout_email: payee?.payout_email || null,
    year_to_date_paid: Number(payee?.year_to_date_paid || 0),
    tax_reporting_review: Number(payee?.year_to_date_paid || 0) > 500,
  };
}

async function dashboard(admin: SupabaseClient, user: User, siteUrl: string, cursor?: unknown) {
  let { data: rawCode, error } = await admin.rpc("ensure_referral_code", { p_user_id: user.id });
  if (error?.code === "23505") {
    ({ data: rawCode, error } = await admin.rpc("ensure_referral_code", { p_user_id: user.id }));
  }
  if (error) throw error;
  const code = row(rawCode);
  if (!code?.id || !code.code || code.disabled_at) throw new ReferralRequestError("This referral account needs staff review.", 403);
  const results = await Promise.allSettled([listLedger(admin, cursor, code.id), payees(admin, [code.id])]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  const ledger = (results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof listLedger>>>).value;
  const payee = (results[1] as PromiseFulfilledResult<Map<string, Payee>>).value.get(code.id);
  const profile = profileFromPayee(payee);
  return {
    code: code.code,
    share_url: `${siteUrl}/r/${encodeURIComponent(code.code)}`,
    is_past_client: Boolean(payee?.is_past_client),
    referrals: ledger.rows.map(publicLedger),
    payout_history: ledger.rows.filter((entry) => entry.status === "paid").map(publicLedger),
    next_cursor: ledger.next_cursor,
    profile,
    profile_required: Number(payee?.paid_count || 0) >= 1 && !profile,
    payout_count: Number(payee?.paid_count || 0),
    year_to_date_paid: Number(payee?.year_to_date_paid || 0),
    tax_reporting_review: Number(payee?.year_to_date_paid || 0) > 500,
  };
}

async function adminSingle(admin: SupabaseClient, orderId: string) {
  const { data, error } = await admin.from("referrals")
    .select(`${ledgerFields},order:ticket_submissions!referrals_order_id_fkey(${orderFields})`).eq("order_id", orderId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ReferralRequestError("Referral order not found.", 404);
  const entry = data as unknown as LedgerRow;
  return adminLedger(entry, (await payees(admin, [entry.referrer_id])).get(entry.referrer_id));
}

serve(async (req) => {
  const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = new Set([siteUrl, "https://fabsy.ca", "https://www.fabsy.ca", "https://fabsy-execom.vercel.app",
    "http://localhost:5173", "http://localhost:4173", "http://localhost:8080", "http://127.0.0.1:8080"]);
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : siteUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "This request origin is not allowed." }, 403);
  let action = "unknown";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !key) return json({ error: "The referral program is temporarily unavailable." }, 503);
    const admin = createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await readBody(req);
    action = String(body.action || "");
    if (action === "capture") {
      const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
      const now = Date.now();
      if (captureLimits.size > 2000) for (const [ipKey, value] of captureLimits) if (value.resetAt <= now) captureLimits.delete(ipKey);
      const current = captureLimits.get(ip);
      const limit = current && current.resetAt > now ? current : { count: 0, resetAt: now + 600_000 };
      if (limit.count >= 60 || captureLimits.size > 5000) throw new ReferralRequestError("Please wait before trying another referral code.", 429);
      limit.count++;
      captureLimits.set(ip, limit);
      const code = normalizeReferralCode(body.code);
      if (!code) throw new ReferralRequestError("That referral code is invalid or unavailable.");
      const { data, error } = await admin.from("referral_codes").select("id").eq("code", code).is("disabled_at", null).maybeSingle();
      if (error) throw error;
      if (!data) throw new ReferralRequestError("That referral code is invalid or unavailable.");
      return json(await mintReferralAttribution(code));
    }

    const user = await requireUser(admin, req);
    if (action === "dashboard") return json(await dashboard(admin, user, siteUrl, body.cursor));
    if (action === "save_profile") {
      const payoutEmail = textField({ ...body, payout_email: body.payout_email || user.email }, "payout_email", 3, 254).toLowerCase();
      if (!EMAIL_PATTERN.test(payoutEmail)) throw new ReferralRequestError("Enter a valid payout email.");
      const postalCode = textField(body, "postal_code", 6, 7).toUpperCase().replace(/\s/g, "");
      if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(postalCode)) throw new ReferralRequestError("Enter a valid Canadian postal code.");
      const province = textField(body, "province", 2, 2).toUpperCase();
      if (!["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"].includes(province)) throw new ReferralRequestError("Choose a Canadian province or territory.");
      const { error } = await admin.rpc("referral_save_profile", {
        p_user_id: user.id,
        p_legal_name: textField(body, "legal_name", 2, 160),
        p_address_line1: textField(body, "address_line1", 3, 200),
        p_address_line2: textField(body, "address_line2", 0, 200, ""),
        p_city: textField(body, "city", 2, 100),
        p_province: province,
        p_postal_code: `${postalCode.slice(0, 3)} ${postalCode.slice(3)}`,
        p_payout_email: payoutEmail,
      });
      if (error) throw error;
      return json(await dashboard(admin, user, siteUrl));
    }

    if (!["admin_list", "admin_review", "admin_refresh", "admin_mark_paid"].includes(action)) throw new ReferralRequestError("Unknown referral action.");
    const staff = await requireStaff(admin, user);
    if (action === "admin_list") {
      const ledger = await listLedger(admin, body.cursor, undefined, body.status);
      const recipients = await payees(admin, ledger.rows.map((entry) => entry.referrer_id));
      return json({ referrals: ledger.rows.map((entry) => adminLedger(entry, recipients.get(entry.referrer_id))),
        next_cursor: ledger.next_cursor, can_record_payout: staff.canRecordPayout });
    }
    if (action === "admin_review") {
      const orderId = uuidField(body, "order_id");
      const decision = textField(body, "decision", 1, 20);
      if (!["accepted", "rejected"].includes(decision)) throw new ReferralRequestError("Choose accepted or rejected.");
      const { error } = await admin.rpc("referral_review_order", {
        p_actor_id: user.id,
        p_order_id: orderId,
        p_decision: decision,
        p_alberta_in_scope: boolField(body, "alberta_in_scope"),
        p_fleet_account: boolField(body, "fleet_account"),
        p_identity_reviewed: boolField(body, "identity_reviewed"),
        p_plate: textField(body, "plate", 0, 32, ""),
        p_notes: textField(body, "notes", 0, 2000, "", true),
      });
      if (error) throw error;
      return json({ referral: await adminSingle(admin, orderId) });
    }
    if (action === "admin_refresh") {
      const orderId = uuidField(body, "order_id");
      await refreshReferralPayment(admin, orderId);
      return json({ referral: await adminSingle(admin, orderId) });
    }
    if (!staff.canRecordPayout) throw new ReferralRequestError("Only an admin can record an Interac payout.", 403);
    const referralId = uuidField(body, "referral_id");
    const reference = textField(body, "payout_reference", 3, 120);
    const { data: target, error: targetError } = await admin.from("referrals").select("id,order_id,status")
      .eq("id", referralId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new ReferralRequestError("Referral not found.", 404);
    if (target.status !== "paid") await refreshReferralPayment(admin, target.order_id);
    const { error } = await admin.rpc("referral_mark_paid", { p_actor_id: user.id, p_referral_id: referralId, p_payout_reference: reference });
    if (error) throw error;
    return json({ referral: await adminSingle(admin, target.order_id) });
  } catch (error) {
    if (error instanceof ReferralRequestError) return json({ error: error.message }, error.status);
    const failure = error as { code?: string; message?: string };
    if (failure.code === "P0001" && failure.message && /^(Referral is not ready|Refresh Stripe|Legal name and address|This referral already|The referrer needs|Confirm Alberta)/.test(failure.message)) {
      return json({ error: failure.message }, 409);
    }
    // Keep tokens, customer identities, tax details and provider payloads out of logs.
    console.error("Referral operation failed", { action, code: failure.code || "unavailable" });
    return json({ error: "The referral request could not be completed. Please try again." }, 500);
  }
});
