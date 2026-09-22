import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { parseServiceOrder, serviceProduct } from "../_shared/service-checkout.ts";
import { createConsentPdf } from "../_shared/service-consent-pdf.ts";
import { recordServiceOrderPayment } from "../_shared/service-order-payment.ts";
import { queuePhotoIntake } from "../_shared/process-photo-intake.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const site = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
const origins = new Set([site, "https://www.fabsy.ca", "http://localhost:4173", "http://localhost:5173"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
class RequestError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2, "0")).join("");
const stripeClient = () => new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
const rate = new Map<string, { count: number; until: number }>();
async function staff(req: Request) {
  const { data, error } = await admin.auth.getUser((req.headers.get("authorization") || "").replace(/^Bearer /, ""));
  if (error || !data.user) throw new RequestError("Staff sign-in required.", 401);
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", data.user.id).in("role", ["admin", "case_manager"]).limit(1).maybeSingle();
  if (!role) throw new RequestError("Staff access required.", 403);
}
function publicOrder(order: Record<string, any>) {
  const product = serviceProduct(order.product);
  return { id: order.id, product: order.product, productName: product.name, mode: order.mode, name: order.name, email: order.email,
    representedName: order.represented_name, ticketNumber: order.ticket_number, subtotalCents: order.subtotal_cents,
    gstCents: order.gst_cents, totalCents: order.total_cents, consentSaved: Boolean(order.consent_form_path),
    paymentStatus: order.payment_status, ticketUploaded: Boolean(order.ticket_document_path), report: product.report };
}
async function consentDocument(order: Record<string, any>) {
  if (!order.consent || order.consent_form_path) return;
  const bytes = await createConsentPdf({ serviceOrderTitle: "Fabsy service authorization", submissionId: order.id, firstName: order.name,
    lastName: "", email: order.email, phone: "", address: "", city: "", province: "", postalCode: "", driversLicense: "",
    ticketNumber: order.ticket_number || "Not supplied; to be matched using purchase email", violation: `${serviceProduct(order.product).name}; for ${order.represented_name}`,
    issueDate: "Not supplied", digitalSignature: "", intakeConsent: order.consent });
  const path = `service-orders/${order.id}/authorization.pdf`;
  const { error } = await admin.storage.from("consent-forms").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new RequestError("Your authorization was recorded, but its copy could not be saved. Please try again.", 503);
  const { error: saveError } = await admin.from("service_orders").update({ consent_form_path: path }).eq("id", order.id);
  if (saveError) throw saveError;
  order.consent_form_path = path;
}
async function reconcile(orderId: string) {
  const { error } = await admin.rpc("match_service_order", { p_id: orderId });
  if (error) throw error;
  const { error: applyError } = await admin.rpc("apply_service_order", { p_id: orderId });
  if (applyError) console.error("Service order needs case review", orderId);
}

export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin") || "";
  const headers = { "Access-Control-Allow-Origin": origins.has(origin) ? origin : site,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "Content-Type": "application/json", Vary: "Origin" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (origin && !origins.has(origin)) return json({ error: "Origin not allowed." }, 403);
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RequestError("Invalid request.");
    if (["staff-list", "staff-link", "staff-file"].includes(raw.action)) {
      await staff(req);
      if (raw.action === "staff-file") {
        const { data: order } = await admin.from("service_orders").select("consent_form_path,ticket_document_path").eq("id", raw.orderId).single();
        const consent = raw.kind === "consent";
        const path = consent ? order?.consent_form_path : order?.ticket_document_path;
        if (!path) throw new RequestError("No document is stored.");
        const { data, error } = await admin.storage.from(consent ? "consent-forms" : "assessment-tickets").createSignedUrl(path, 300);
        if (error) throw error;
        return json({ url: data.signedUrl });
      }
      if (raw.action === "staff-link") {
        const { data: order } = await admin.from("service_orders").select("id,email,product,ticket_submission_id").eq("id", raw.orderId).single();
        const { data: ticket } = await admin.from("ticket_submissions").select("id,email,ticket_type,deleted_at,service_type").eq("id", raw.ticketId).single();
        if (!order || !ticket || ticket.deleted_at || ticket.service_type !== "representation" || ticket.email.trim().toLowerCase() !== order.email ||
            (ticket.ticket_type === "photo_radar") !== (order.product === "photo_radar") || (order.ticket_submission_id && order.ticket_submission_id !== ticket.id)) throw new RequestError("Choose a compatible ticket with the same email.");
        const { error } = await admin.from("service_orders").update({ ticket_submission_id: ticket.id, match_status: "matched" }).eq("id", order.id);
        if (error) throw error;
        await reconcile(order.id);
        return json({ success: true });
      }
      let query = admin.from("service_orders").select("id,product,mode,name,represented_name,email,ticket_number,consent_form_path,ticket_document_path,total_cents,payment_status,paid_at,created_at,ticket_submission_id,match_status,applied_at").order("created_at", { ascending: false }).limit(100);
      if (typeof raw.email === "string" && raw.email.trim()) query = query.eq("email", raw.email.trim().toLowerCase());
      const { data: orders, error } = await query;
      if (error) throw error;
      for (const order of orders || []) if (!order.applied_at) await reconcile(order.id);
      const emails = [...new Set((orders || []).map(order => order.email))];
      const { data: tickets, error: ticketError } = emails.length ? await admin.from("ticket_submissions")
        .select("id,email,ticket_number,first_name,last_name,ticket_type,status").in("email", emails).is("deleted_at", null).eq("service_type", "representation").limit(300) : { data: [], error: null };
      if (ticketError) throw ticketError;
      const { data: fresh, error: freshError } = await query;
      if (freshError) throw freshError;
      return json({ orders: fresh, tickets });
    }
    if (typeof raw.orderId !== "string" || !uuid.test(raw.orderId) || typeof raw.accessToken !== "string" || !/^[a-f0-9]{64}$/.test(raw.accessToken)) throw new RequestError("This checkout session is invalid. Start again from the checkout page.", 403);
    const orderId = raw.orderId.toLowerCase();
    const tokenHash = await hash(raw.accessToken);
    let { data: order, error: readError } = await admin.from("service_orders").select("*").eq("id", orderId).maybeSingle();
    if (readError) throw readError;
    if (order && order.access_token_hash !== tokenHash) throw new RequestError("This checkout session could not be verified.", 403);
    if (raw.action === "prepare") {
      const input = parseServiceOrder(raw);
      const fingerprint = await hash(JSON.stringify({ ...input, consent: input.consent ? { ...input.consent, acceptedAt: "" } : null, purchase_terms: { ...input.purchase_terms, acceptedAt: "" } }));
      if (order && order.request_fingerprint !== fingerprint) throw new RequestError("This request was already saved with different details. Start a new request to change them.", 409);
      if (!order) {
        const key = await hash(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown");
        const bucket = rate.get(key); const now = Date.now();
        if (bucket && bucket.until > now && bucket.count >= 12) throw new RequestError("Too many requests. Please try again later.", 429);
        if (rate.size > 10000) for (const [k, value] of rate) if (value.until < now) rate.delete(k);
        rate.set(key, { count: bucket && bucket.until > now ? bucket.count + 1 : 1, until: bucket && bucket.until > now ? bucket.until : now + 3600000 });
        const { error: insertError } = await admin.from("service_orders").insert({ id: orderId, access_token_hash: tokenHash, request_fingerprint: fingerprint, ...input });
        if (insertError && insertError.code !== "23505") throw insertError;
        const { data, error } = await admin.from("service_orders").select("*").eq("id", orderId).single();
        if (error || !data || data.access_token_hash !== tokenHash || data.request_fingerprint !== fingerprint) throw new RequestError("The request could not be saved. Please retry.", 409);
        order = data;
      }
      if (!order.client_id) {
        const { error } = await admin.from("clients").upsert({ id: orderId, drivers_license: null, first_name: order.name, last_name: "", email: order.email, phone: "", sms_opt_in: false }, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
        const { error: clientError } = await admin.from("service_orders").update({ client_id: orderId }).eq("id", orderId);
        if (clientError) throw clientError;
        order.client_id = orderId;
      }
      await consentDocument(order);
      await reconcile(orderId);
      return json({ order: publicOrder(order) });
    }
    if (!order) throw new RequestError("Your request was not found. Start again from the checkout page.", 404);
    if (raw.action === "consent-copy") {
      if (!order.consent_form_path) throw new RequestError("No authorization was recorded for this request.");
      const { data, error } = await admin.storage.from("consent-forms").createSignedUrl(order.consent_form_path, 300);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }
    if (raw.action === "upload-prepare") {
      const extension = extensions[raw.file?.contentType];
      if (!extension || !Number.isInteger(raw.file?.size) || raw.file.size <= 0 || raw.file.size > 10 * 1024 * 1024) throw new RequestError("Choose a photo or PDF, 10 MB or smaller.");
      if (order.ticket_document_path) return json({ alreadyUploaded: true });
      const path = order.pending_upload_path || `service-orders/${orderId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await admin.from("service_orders").update({ pending_upload_path: path }).eq("id", orderId);
      if (error) throw error;
      const { data, error: uploadError } = await admin.storage.from("assessment-tickets").createSignedUploadUrl(path, { upsert: true });
      if (uploadError) throw uploadError;
      return json({ upload: { path, token: data.token } });
    }
    if (raw.action === "upload-complete") {
      if (!order.pending_upload_path && !order.ticket_document_path) throw new RequestError("Prepare the upload first.");
      const path = order.ticket_document_path || order.pending_upload_path;
      const slash = path.lastIndexOf("/");
      const { data, error } = await admin.storage.from("assessment-tickets").list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 10 });
      const file = data?.find(item => item.name === path.slice(slash + 1));
      if (error || !file || Number(file.metadata?.size) <= 0 || Number(file.metadata?.size) > 10 * 1024 * 1024) throw new RequestError("Your upload did not finish. Please try again.");
      const { error: saveError } = await admin.from("service_orders").update({ ticket_document_path: path, pending_upload_path: null }).eq("id", orderId);
      if (saveError) throw saveError;
      order.ticket_document_path = path;
      // Ticket ingestion is independent of checkout. Unread details stay blank
      // and in review, while the customer can complete the purchase immediately.
      if (order.product !== "insurance_report" && !order.ticket_submission_id) {
        await reconcile(orderId);
        const { data: matched } = await admin.from("service_orders").select("ticket_submission_id,match_status").eq("id", orderId).single();
        if (!matched?.ticket_submission_id && matched?.match_status !== "needs_review") {
          const photo = order.product === "photo_radar";
          const { error: ticketError } = await admin.from("ticket_submissions").upsert({ id: orderId, client_id: order.client_id,
            first_name: order.represented_name, last_name: "", email: order.email, phone: "", ticket_number: order.ticket_number || "",
            violation: "", fine_amount: "", status: "awaiting_payment", service_type: "representation", preferred_locale: "en",
            intake_mode: "photo_only", intake_review_status: order.consent_form_path ? "pending_scan" : "needs_review", intake_consent: order.consent,
            consent_form_path: order.consent_form_path, representation_access_token_hash: tokenHash, ticket_document_path: path,
            ticket_type: photo ? "photo_radar" : "officer_issued", ticket_type_source: "manual", order_type: photo ? "photo_radar" : "rapid_resolution",
            review_path: photo ? "ate" : "standard", registered_owner_on_offence_date: photo && order.registered_owner ? "yes" : null,
            additional_notes: "Universal checkout order. Payment and consent are recorded separately against the purchase email; review ticket details before acting." }, { onConflict: "id", ignoreDuplicates: true });
          if (ticketError) throw ticketError;
          const { error: linkError } = await admin.from("service_orders").update({ ticket_submission_id: orderId, match_status: "matched" }).eq("id", orderId);
          if (linkError) throw linkError;
          if (order.consent_form_path) queuePhotoIntake(admin, orderId);
        }
      }
      return json({ order: publicOrder(order) });
    }
    if (raw.action === "status" || raw.action === "checkout") {
      if (order.stripe_session_id && !["paid", "refunded", "disputed"].includes(order.payment_status)) {
        const session = await stripeClient().checkout.sessions.retrieve(order.stripe_session_id);
        if (session.payment_status === "paid" && session.status === "complete") {
          await recordServiceOrderPayment(admin, session);
          order.payment_status = "paid";
        } else if (session.status === "expired") {
          const { error } = await admin.from("service_orders").update({ payment_status: "expired" }).eq("id", orderId).neq("payment_status", "paid");
          if (error) throw error;
          order.payment_status = "expired";
        } else if (raw.action === "checkout" && session.status === "open" && session.url) return json({ url: session.url, order: publicOrder(order) });
      }
      if (raw.action === "status" || ["paid", "refunded", "disputed"].includes(order.payment_status)) {
        await reconcile(orderId);
        return json({ order: publicOrder(order) });
      }
      if (order.mode === "consent") throw new RequestError("This request is consent only.");
      if (!order.client_id) throw new RequestError("Your request is still being saved. Please retry.", 409);
      if (order.ticket_submission_id) {
        const { data: existing, error: existingError } = await admin.from("idr_checkout_intents").select("id,status")
          .eq("ticket_submission_id", order.ticket_submission_id).in("checkout_kind", ["ticket_only", "ticket_with_addon", "photo_radar"])
          .in("status", ["creating", "open", "paid"]).neq("id", orderId).limit(1).maybeSingle();
        if (existingError) throw existingError;
        if (existing) throw new RequestError(existing.status === "paid"
          ? "Payment is already recorded for the matched ticket. Contact Fabsy if this request is for a different ticket."
          : "Another checkout is already open for the matched ticket. Contact Fabsy before paying again.", 409);
      }
      if (order.mode !== "payment" && !order.consent_form_path) throw new RequestError("Save your authorization before payment.", 409);
      if (order.payment_status === "expired") {
        const { data, error } = await admin.from("service_orders").update({ checkout_attempt: order.checkout_attempt + 1, stripe_session_id: null, payment_status: "not_started" })
          .eq("id", orderId).eq("checkout_attempt", order.checkout_attempt).eq("payment_status", "expired").select("*").maybeSingle();
        if (error || !data) throw new RequestError("Checkout changed in another tab. Refresh to continue.", 409);
        order = data;
      }
      const stripe = stripeClient();
      const taxId = Deno.env.get("STRIPE_GST_TAX_RATE_ID");
      if (!taxId) throw new RequestError("Checkout is temporarily unavailable. Please try again.", 503);
      const tax = await stripe.taxRates.retrieve(taxId);
      if (!tax.active || tax.inclusive || tax.percentage !== 5) throw new Error("GST configuration does not match the published total.");
      const fragment = new URLSearchParams({ order: orderId, token: raw.accessToken }).toString();
      const session = await stripe.checkout.sessions.create({ mode: "payment", customer_email: order.email,
        client_reference_id: orderId, payment_method_types: ["card"], billing_address_collection: "auto",
        line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: order.subtotal_cents, tax_behavior: "exclusive", product_data: { name: serviceProduct(order.product).name } }, tax_rates: [taxId] }],
        metadata: { fabsy_checkout_kind: "service_order", service_order_id: orderId, product: order.product, checkout_attempt: String(order.checkout_attempt) },
        payment_intent_data: { metadata: { service_order_id: orderId, product: order.product } },
        success_url: `${site}/checkout?result=success#${fragment}`, cancel_url: `${site}/checkout?result=canceled#${fragment}`,

      }, { idempotencyKey: `service-order-${orderId}-${order.checkout_attempt}` });
      const { error } = await admin.from("service_orders").update({ stripe_session_id: session.id, payment_status: "open" }).eq("id", orderId).neq("payment_status", "paid");
      if (error) throw error;
      return json({ url: session.url, order: publicOrder({ ...order, payment_status: "open" }) });
    }
    throw new RequestError("Unknown checkout action.");
  } catch (error) {
    if (!(error instanceof RequestError)) console.error("service-checkout failed", error instanceof Error ? error.message : "unknown");
    return json({ error: error instanceof RequestError ? error.message : rawValidationMessage(error) }, error instanceof RequestError ? error.status : 400);
  }
}
function rawValidationMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^(Choose |Enter |Accept |Review |Confirm )/.test(message) ? message : "Your request could not be completed. Please retry; your saved request will be reused.";
}
if (import.meta.main) serve(handler);
