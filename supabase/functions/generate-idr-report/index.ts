import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";
import { buildIdrPdf } from "../_shared/idr-pdf.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";

const DISCLAIMER = "This report provides consumer research and planning information, not an insurer quote, licensed broker recommendation or promise of eligibility, premium savings or a particular insurance outcome. Fabsy is not an insurance agent or broker and does not sell, quote or place insurance.";
const LEGACY_DISCLAIMER = "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
const admin = createClient(supabaseUrl, serviceRoleKey);
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

// Delivery validation intentionally inspects arbitrary persisted JSON before narrowing it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

interface ReminderRow {
  event_type: "renewal_45_day" | "conviction_aging";
  event_key: string;
  scheduled_for: string;
}

interface EmailEvent {
  id: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  claimed_at: string | null;
}

interface DeliveryClaim {
  order_id: string;
  report_id: string;
  report_json: JsonRecord;
  source_review_version: number;
  claim_token: string;
  claimed_at: string;
}

const EMAIL_LEASE_MS = 15 * 60 * 1000;

const allowedOrigins = new Set([
  siteUrl,
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : siteUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pdfText(value: unknown) {
  return String(value ?? "")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201c", '"')
    .replaceAll("\u201d", '"')
    .replaceAll("\u2022", "-")
    .replace(/[^\x20-\x7E]/g, " ");
}

function money(cents: unknown) {
  const amount = Number(cents);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(amount / 100)
    : "Unavailable";
}

function formatDate(value: unknown) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || "Unavailable";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${text}T12:00:00Z`));
}

function isHttpsUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidSource(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as JsonRecord;
  return typeof source.publisher === "string" && Boolean(source.publisher.trim()) &&
    typeof source.title === "string" && Boolean(source.title.trim()) &&
    isHttpsUrl(source.url) &&
    typeof source.accessedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.accessedDate);
}

function validateReport(report: JsonRecord) {
  if (!report || typeof report !== "object") throw new Error("Stored report JSON is invalid.");
  if (![DISCLAIMER, LEGACY_DISCLAIMER].includes(report.disclaimer)) {
    throw new Error("Stored report is missing a recognized consumer research disclaimer.");
  }
  if (!Array.isArray(report.convictions)) throw new Error("Stored report convictions are invalid.");
  for (const conviction of report.convictions) {
    if (conviction.applicableLookbackSource && !isValidSource(conviction.applicableLookbackSource)) {
      throw new Error("A conviction has an invalid applicable-lookback source.");
    }
  }
  if (report.ticketScenario !== undefined) {
    const scenario = report.ticketScenario;
    const hasValidOptionalClass = scenario?.convictionClass === undefined ||
      ["minor", "major", "serious"].includes(scenario.convictionClass);
    const hasValidOptionalDate = scenario?.assumedConvictionDate === undefined ||
      (typeof scenario.assumedConvictionDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(scenario.assumedConvictionDate));
    if (
      !scenario ||
      typeof scenario !== "object" ||
      Array.isArray(scenario) ||
      scenario.label !== "Current-ticket conviction scenario" ||
      !["listed", "projected"].includes(scenario.mode) ||
      !["projected", "already-reflected", "review-required"].includes(scenario.status) ||
      !hasValidOptionalClass ||
      !hasValidOptionalDate ||
      (scenario.mode === "projected" && !scenario.convictionClass) ||
      (scenario.status === "projected" && !scenario.assumedConvictionDate) ||
      typeof scenario.appliedAsAdditionalConviction !== "boolean" ||
      (scenario.mode === "listed" && scenario.appliedAsAdditionalConviction !== false) ||
      (scenario.status === "projected" &&
        (scenario.mode !== "projected" || scenario.appliedAsAdditionalConviction !== true)) ||
      (scenario.status !== "projected" && scenario.appliedAsAdditionalConviction === true) ||
      typeof scenario.basis !== "string" ||
      !scenario.basis.trim()
    ) {
      throw new Error("Stored ticket scenario is invalid.");
    }
  }
  if (report.verification?.deliveryReady !== true) {
    throw new Error("The stored report is not marked delivery-ready.");
  }
  if (!Array.isArray(report.verification?.blockers) || report.verification.blockers.length > 0) {
    throw new Error("The stored report still has delivery blockers.");
  }
  if (!Array.isArray(report.carrierCallList?.entries)) throw new Error("Stored carrier call list is invalid.");
  if (report.carrierCallList.status !== "ready") {
    throw new Error("The stored carrier call list is not ready for delivery.");
  }
  if (report.carrierCallList.entries.length < 3 || report.carrierCallList.entries.length > 5) {
    throw new Error("A delivery-ready report requires 3 to 5 public insurer research entries.");
  }
  const carrierIds = new Set<string>();
  for (const carrier of report.carrierCallList.entries) {
    if (typeof carrier.carrierId !== "string" || !carrier.carrierId.trim()) {
      throw new Error("Every carrier entry requires a stable carrier identifier.");
    }
    const carrierId = carrier.carrierId.trim().toLowerCase();
    if (carrierIds.has(carrierId)) throw new Error("The carrier call list contains duplicate carriers.");
    carrierIds.add(carrierId);
    if (carrier.quoteUrl && !isHttpsUrl(carrier.quoteUrl)) {
      throw new Error("Every legacy insurer information URL must use HTTPS.");
    }
    if (
      !Array.isArray(carrier.researchSources) ||
      carrier.researchSources.length === 0 ||
      carrier.researchSources.some((source: unknown) => !isValidSource(source))
    ) {
      throw new Error("Every insurer directory entry requires verified public research source data.");
    }
    if (!Array.isArray(carrier.evaluatedPostures) || carrier.evaluatedPostures.length === 0) {
      throw new Error("Every carrier entry requires at least one evaluated underwriting posture.");
    }
  }
  const estimate = report.estimatedThreeYearPremiumImpact;
  if (!estimate || !["estimated", "unavailable"].includes(estimate.status)) {
    throw new Error("Stored premium impact status is invalid.");
  }
  if (
    !Array.isArray(estimate.sources) ||
    estimate.sources.some((source: unknown) => !isValidSource(source)) ||
    (estimate.baseline?.source && !isValidSource(estimate.baseline.source))
  ) {
    throw new Error("Stored premium impact source data is invalid.");
  }
  if (estimate.status === "estimated") {
    const minimumCents = Number(estimate.range?.minimumCents);
    const maximumCents = Number(estimate.range?.maximumCents);
    if (
      !Number.isFinite(minimumCents) ||
      !Number.isFinite(maximumCents) ||
      minimumCents < 0 ||
      maximumCents < minimumCents
    ) {
      throw new Error("Estimated impact is missing a valid range.");
    }
    if (
      Number(estimate.carrierEstimateCount) < 3 ||
      !estimate.baseline ||
      !Number.isFinite(Number(estimate.baseline.annualPremiumCents)) ||
      Number(estimate.baseline.annualPremiumCents) <= 0 ||
      estimate.sources.length === 0 ||
      estimate.sources.some((source: unknown) => !isValidSource(source))
    ) {
      throw new Error("Estimated impact lacks a sufficient sourced carrier basis.");
    }
  }
  const grid = report.gridBenchmark;
  if (!grid || !["calculated", "unavailable", "out-of-date"].includes(grid.status)) {
    throw new Error("Stored Alberta Grid benchmark status is invalid.");
  }
  if (!isValidSource(grid.source)) {
    throw new Error("Stored Alberta Grid benchmark source is invalid.");
  }
  if (
    grid.status === "calculated" &&
    (
      !Number.isFinite(Number(grid.annualPremiumCents)) ||
      Number(grid.annualPremiumCents) <= 0 ||
      !Array.isArray(grid.limitations) ||
      grid.limitations.length === 0
    )
  ) {
    throw new Error("Calculated Alberta Grid benchmark lacks its amount, source, or limitations.");
  }
  if (!Array.isArray(report.renewalSchedule)) {
    throw new Error("Stored renewal schedule is invalid.");
  }
  const renewalReminderKeys = new Set<string>();
  for (const renewal of report.renewalSchedule) {
    if (
      !renewal ||
      typeof renewal !== "object" ||
      Array.isArray(renewal) ||
      !isIsoDate(renewal.renewalDate) ||
      !Array.isArray(renewal.reminderDates)
    ) {
      throw new Error("Stored renewal schedule is invalid.");
    }
    for (const reminder of renewal.reminderDates) {
      if (
        !reminder ||
        typeof reminder !== "object" ||
        Array.isArray(reminder) ||
        !Number.isInteger(reminder.leadDays) ||
        reminder.leadDays < 0 ||
        !isIsoDate(reminder.reminderDate) ||
        dateMinusDays(renewal.renewalDate, reminder.leadDays) !== reminder.reminderDate
      ) {
        throw new Error("Stored renewal reminder is invalid.");
      }
      const reminderKey = `${renewal.renewalDate}:${reminder.leadDays}`;
      if (renewalReminderKeys.has(reminderKey)) {
        throw new Error("Stored renewal schedule contains a duplicate reminder.");
      }
      renewalReminderKeys.add(reminderKey);
    }
  }
}

async function requireStaff(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization) throw new Error("Staff authorization is required.");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Staff authorization is invalid.");
  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .in("role", ["admin", "case_manager"])
    .limit(1)
    .maybeSingle();
  if (roleError || !role) throw new Error("Staff access is required.");
  return data.user;
}

async function claimEmailEvent(event: EmailEvent) {
  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - EMAIL_LEASE_MS).toISOString();
  const claimValues = {
    status: "processing",
    claimed_at: claimedAt,
    last_error: null,
  };
  let result = await admin.from("idr_email_events").update(claimValues)
    .eq("id", event.id)
    .in("status", ["pending", "failed"])
    .select("id,attempts")
    .maybeSingle();
  if (result.error) throw result.error;

  if (!result.data && event.status === "processing") {
    result = await admin.from("idr_email_events").update(claimValues)
      .eq("id", event.id)
      .eq("status", "processing")
      .lte("claimed_at", staleBefore)
      .is("last_error", null)
      .select("id,attempts")
      .maybeSingle();
    if (result.error) throw result.error;
  }
  if (!result.data && event.status === "processing" && !event.claimed_at) {
    result = await admin.from("idr_email_events").update(claimValues)
      .eq("id", event.id)
      .eq("status", "processing")
      .is("claimed_at", null)
      .is("last_error", null)
      .select("id,attempts")
      .maybeSingle();
    if (result.error) throw result.error;
  }
  return result.data ? { ...result.data, claimedAt } : null;
}

function buildHtml(report: JsonRecord, clientName: string) {
  const convictionHtml = report.convictions.map((item: JsonRecord) => `
    <li><strong>${escapeHtml(item.offence)}</strong> (${escapeHtml(item.convictionClass)})<br>
    Convicted ${escapeHtml(formatDate(item.convictionDate))}. Three-year exit date: <strong>${escapeHtml(formatDate(item.threeYearExitDate))}</strong>.${item.applicableLookbackSource ? `<br>Lookback source: <a href="${escapeHtml(item.applicableLookbackSource.url)}">${escapeHtml(item.applicableLookbackSource.title)}</a>` : ""}</li>
  `).join("");
  const sourceLinks = (sources: JsonRecord[]) => sources
    .map((source) => `<a href="${escapeHtml(source.url)}">${escapeHtml(source.publisher)}: ${escapeHtml(source.title)}</a>`)
    .join("; ");
  const directoryEntries = [...report.carrierCallList.entries].sort((left: JsonRecord, right: JsonRecord) =>
    String(left.carrierName || "").localeCompare(String(right.carrierName || ""), "en-CA")
  );
  const carrierHtml = directoryEntries.map((item: JsonRecord) => {
    const sources = Array.isArray(item.researchSources) ? item.researchSources : [];
    return `<li><strong>${escapeHtml(item.carrierName)}</strong>${item.phone ? `<br>Public phone: ${escapeHtml(item.phone)}` : ""}<br>Public information: ${sourceLinks(sources)}</li>`;
  }).join("");
  const estimate = report.estimatedThreeYearPremiumImpact;
  const estimateText = estimate.status === "estimated" && estimate.range
    ? `${money(estimate.range.minimumCents)} to ${money(estimate.range.maximumCents)}, estimated 3-year range, not a quote`
    : "A reliable estimated range is unavailable from the verified inputs.";
  const estimateBaseline = estimate.baseline
    ? `<p>Annual premium baseline: ${escapeHtml(money(estimate.baseline.annualPremiumCents))} (${escapeHtml(String(estimate.baseline.basis || "supplied baseline").replaceAll("-", " "))}).</p>`
    : "";
  const estimateSources = Array.isArray(estimate.sources) && estimate.sources.length
    ? `<p>Estimate sources: ${sourceLinks(estimate.sources)}</p>`
    : "";
  const grid = report.gridBenchmark;
  const gridLimitations = Array.isArray(grid.limitations)
    ? `<ul>${grid.limitations.map((item: unknown) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const gridSource = grid.source ? `<p>Grid source: ${sourceLinks([grid.source])}</p>` : "";
  const scenario = report.ticketScenario;
  const scenarioHtml = scenario
    ? `<div class="scenario"><h2>${escapeHtml(scenario.label)}</h2><p><strong>Mode:</strong> ${escapeHtml(scenario.mode)}. <strong>Status:</strong> ${escapeHtml(String(scenario.status).replaceAll("-", " "))}.${scenario.convictionClass ? ` <strong>Class:</strong> ${escapeHtml(scenario.convictionClass)}.` : ""}${scenario.assumedConvictionDate ? ` <strong>${scenario.status === "projected" ? "Assumed" : "Matched"} conviction date:</strong> ${escapeHtml(formatDate(scenario.assumedConvictionDate))}.` : ""}</p><p>${escapeHtml(scenario.basis)}</p><p><strong>${scenario.appliedAsAdditionalConviction ? "Applied as one additional conviction in the projection." : "Not added as another conviction in the projection."}</strong></p></div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fabsy Insurance Impact &amp; Renewal Planning Report</title><style>body{font:16px/1.55 Arial,sans-serif;color:#1f2937;max-width:850px;margin:0 auto;padding:40px}header{background:#111827;color:white;padding:36px;border-radius:14px}h1{margin:0}h2{color:#5b21b6;margin-top:34px;border-bottom:1px solid #ddd;padding-bottom:8px}li{margin:12px 0}.scenario{border:2px solid #c4b5fd;background:#f5f3ff;padding:18px;margin-top:28px}.notice{border:2px solid #cbd5e1;background:#f8fafc;padding:18px;margin-top:36px}@media print{body{padding:0}header{border-radius:0}}</style></head><body><header><p>FABSY</p><h1>Insurance Impact &amp; Renewal Planning Report</h1><p>${escapeHtml(clientName)} | Prepared ${escapeHtml(formatDate(report.asOfDate))}</p></header><main><h2>Abstract verification</h2><p>Status: ${escapeHtml(report.verification.status)}. Convictions checked: ${escapeHtml(report.verification.checkedConvictions)}.</p>${scenarioHtml}<h2>Conviction aging timeline</h2><ol>${convictionHtml || "<li>No convictions transcribed.</li>"}</ol><h2>Estimated premium exposure</h2><p><strong>${escapeHtml(estimateText)}</strong></p><p>${escapeHtml(estimate.basis)}</p>${estimateBaseline}${estimateSources}<h2>Public Alberta Grid benchmark</h2><p>${escapeHtml(grid.basis)}</p>${gridSource}${gridLimitations}<h2>Public insurer research directory</h2><p>Entries are listed alphabetically from public sources. They are not ranked or recommended, and inclusion does not predict eligibility, pricing or coverage. Ask a licensed broker for insurer-specific advice or quotes.</p><ul>${carrierHtml || "<li>No current public insurer research entries are available.</li>"}</ul><div class="notice"><strong>Important consumer research disclaimer</strong><p>${escapeHtml(DISCLAIMER)}</p></div></main></body></html>`;
}

async function sendReportDeliveryEmail(
  reportId: string,
  orderId: string,
  client: { first_name: string; email: string },
) {
  const eventKey = `report:${reportId}:delivered`;
  const { error: seedEmailError } = await admin.from("idr_email_events").upsert({
    event_key: eventKey,
    idr_report_id: reportId,
    event_type: "report_delivered",
    recipient_email: client.email,
  }, {
    onConflict: "event_key",
    ignoreDuplicates: true,
  });
  if (seedEmailError) throw seedEmailError;

  const { data: emailEvent, error: emailLookupError } = await admin
    .from("idr_email_events")
    .select("id,status,attempts,claimed_at")
    .eq("event_key", eventKey)
    .single();
  if (emailLookupError || !emailEvent) throw new Error("Unable to reserve report delivery email.");
  if (emailEvent.status === "sent") return "already_sent";

  const claimedEvent = await claimEmailEvent(emailEvent as EmailEvent);
  if (!claimedEvent) return "already_processing";

  let providerAccepted = false;
  try {
    await sendResendEmail(resendApiKey, {
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "hello@fabsy.ca",
      to: [client.email],
      subject: "Your Fabsy Insurance Impact & Renewal Planning Report is ready",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1f2937"><h1>Your Insurance Impact &amp; Renewal Planning Report is ready</h1><p>Hi ${escapeHtml(client.first_name)},</p><p>Open your private Fabsy portal to review the report and download the PDF.</p><p style="margin:28px 0"><a href="${siteUrl}/portal/insurance-reports/${encodeURIComponent(orderId)}" style="background:#7c3aed;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Open your private report</a></p><p style="font-size:13px;color:#6b7280;line-height:1.5">${DISCLAIMER}</p>${getFabsyEmailSignature()}</div>`,
    }, `idr-report/${reportId}`);
    providerAccepted = true;
    const { data: sentEvent, error: sentError } = await admin.from("idr_email_events").update({
      status: "sent",
      attempts: Number(claimedEvent.attempts || 0) + 1,
      sent_at: new Date().toISOString(),
      claimed_at: null,
    })
      .eq("id", claimedEvent.id)
      .eq("claimed_at", claimedEvent.claimedAt)
      .select("id")
      .maybeSingle();
    if (sentError || !sentEvent) throw sentError || new Error("Report email claim was lost before completion.");
    return "sent";
  } catch (emailError) {
    await admin.from("idr_email_events").update({
      status: providerAccepted ? "processing" : "failed",
      attempts: Number(claimedEvent.attempts || 0) + 1,
      last_error: providerAccepted
        ? "Email provider accepted delivery. Database completion requires manual reconciliation."
        : emailError instanceof Error ? emailError.message.slice(0, 1000) : "Delivery email failed",
      claimed_at: providerAccepted ? claimedEvent.claimedAt : null,
    })
      .eq("id", claimedEvent.id)
      .eq("claimed_at", claimedEvent.claimedAt);
    throw emailError;
  }
}

function dateMinusDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
  let activeDeliveryClaim: { orderId: string; claimToken: string } | null = null;
  let pendingArtifactPaths: string[] = [];
  try {
    await requireStaff(req);
    const { orderId } = await req.json();
    if (typeof orderId !== "string") return json(req, { error: "orderId is required." }, 400);

    const { data: order, error: orderError } = await admin
      .from("idr_orders")
      .select("id,client_id,ticket_submission_id,status")
      .eq("id", orderId)
      .single();
    if (orderError || !order) throw new Error("IDR order was not found.");
    if (order.status !== "in_review" && order.status !== "delivered") {
      throw new Error("Only an IDR order in review can be delivered; only a delivered order can retry its notification.");
    }
    const { data: client, error: clientError } = await admin
      .from("clients")
      .select("first_name,last_name,email")
      .eq("id", order.client_id)
      .single();
    if (clientError || !client?.email) throw new Error("IDR client was not found or has no delivery email.");
    if (order.status === "delivered") {
      const { data: storedReport, error: reportError } = await admin
        .from("idr_reports")
        .select("id,report_json,pdf_url,html_url")
        .eq("idr_order_id", orderId)
        .single();
      if (reportError || !storedReport) throw new Error("The delivered report record was not found.");
      validateReport(storedReport.report_json as JsonRecord);
      if (!storedReport.pdf_url || !storedReport.html_url) {
        throw new Error("The delivered report is missing its generated files.");
      }
      const emailStatus = await sendReportDeliveryEmail(storedReport.id, orderId, client);
      return json(req, {
        success: true,
        reportId: storedReport.id,
        pdfPath: storedReport.pdf_url,
        htmlPath: storedReport.html_url,
        emailStatus,
        recoveredDeliveryEmail: true,
      });
    }

    const claimToken = crypto.randomUUID();
    activeDeliveryClaim = { orderId, claimToken };
    const { data: deliveryClaimData, error: deliveryClaimError } = await admin.rpc(
      "begin_idr_report_delivery",
      { p_order_id: orderId, p_claim_token: claimToken },
    );
    const deliveryClaim = deliveryClaimData as DeliveryClaim | null;
    if (
      deliveryClaimError ||
      !deliveryClaim?.report_id ||
      deliveryClaim.order_id !== orderId ||
      deliveryClaim.claim_token !== claimToken ||
      !Number.isInteger(deliveryClaim.source_review_version)
    ) {
      throw deliveryClaimError || new Error("The saved report version could not be frozen for delivery.");
    }
    const storedReport = {
      id: deliveryClaim.report_id,
      report_json: deliveryClaim.report_json,
    };
    const report = storedReport.report_json as JsonRecord;
    validateReport(report);

    const clientName = `${client.first_name} ${client.last_name}`.trim();
    const [pdfBytes, html] = await Promise.all([
      Promise.resolve(buildIdrPdf(report, clientName)),
      Promise.resolve(buildHtml(report, clientName)),
    ]);
    const pdfPath = `${orderId}/${claimToken}/insurance-damage-report.pdf`;
    const htmlPath = `${orderId}/${claimToken}/insurance-damage-report.html`;
    pendingArtifactPaths = [pdfPath, htmlPath];
    const [pdfUpload, htmlUpload] = await Promise.all([
      admin.storage.from("idr-reports").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true }),
      admin.storage.from("idr-reports").upload(htmlPath, new TextEncoder().encode(html), { contentType: "text/html", upsert: true }),
    ]);
    if (pdfUpload.error) throw pdfUpload.error;
    if (htmlUpload.error) throw htmlUpload.error;

    const reminderRows: ReminderRow[] = [];
    for (const renewal of report.renewalSchedule) {
      for (const reminder of renewal.reminderDates) {
        reminderRows.push({
          event_type: "renewal_45_day",
          event_key: reminder.leadDays === 45
            ? `renewal:${renewal.renewalDate}`
            : `renewal:${renewal.renewalDate}:${reminder.leadDays}`,
          scheduled_for: reminder.reminderDate,
        });
      }
    }
    for (const conviction of report.convictions) {
      if (typeof conviction.convictionId === "string" && conviction.convictionId && conviction.threeYearExitDate) reminderRows.push({
        event_type: "conviction_aging",
        event_key: `conviction:${conviction.convictionId}`,
        scheduled_for: conviction.threeYearExitDate,
      });
    }
    const { data: finalizedData, error: finalizeError } = await admin.rpc(
      "finalize_idr_report_delivery",
      {
        p_order_id: orderId,
        p_report_id: storedReport.id,
        p_claim_token: claimToken,
        p_pdf_url: pdfPath,
        p_html_url: htmlPath,
        p_reminders: reminderRows,
      },
    );
    const finalized = finalizedData as { status?: string; report_id?: string } | null;
    if (finalizeError || finalized?.status !== "delivered" || finalized.report_id !== storedReport.id) {
      throw finalizeError || new Error("The frozen report version could not be finalized for delivery.");
    }
    activeDeliveryClaim = null;
    pendingArtifactPaths = [];

    const emailStatus = await sendReportDeliveryEmail(storedReport.id, orderId, client);
    return json(req, { success: true, reportId: storedReport.id, pdfPath, htmlPath, emailStatus });
  } catch (error) {
    let claimReleased = false;
    if (activeDeliveryClaim) {
      const { data: releaseData, error: releaseError } = await admin.rpc("release_idr_report_delivery", {
        p_order_id: activeDeliveryClaim.orderId,
        p_claim_token: activeDeliveryClaim.claimToken,
      });
      if (releaseError) console.error("IDR delivery claim release failed", releaseError);
      claimReleased = releaseData === true;
    }
    if (claimReleased && pendingArtifactPaths.length > 0) {
      const { error: cleanupError } = await admin.storage.from("idr-reports").remove(pendingArtifactPaths);
      if (cleanupError) console.error("IDR abandoned artifact cleanup failed", cleanupError);
    }
    const message = error instanceof Error ? error.message : "IDR report generation failed.";
    const status = /authorization|access/i.test(message) ? 401 : 500;
    return json(req, { error: status === 500 ? "IDR report generation failed." : message }, status);
  }
});
