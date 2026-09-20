import { consentWelcomeDocuments, type ConsentDocumentReader } from "./consent-welcome-documents.ts";
import { consentWelcomeEmail } from "./consent-welcome-email.ts";
import { type ConsentDocumentFingerprint, type ConsentWelcomeContext, type ConsentWelcomeEmail, type ConsentWelcomeJob, type ConsentWelcomePayment, ConsentWelcomeError, consentWelcomeHash, SHA256, WELCOME_VERSION } from "./consent-welcome-types.ts";

export async function sendConsentWelcome(apiKey: string, email: ConsentWelcomeEmail, id: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!apiKey || !/^[a-f0-9-]{36}$/i.test(id) || !email.attachments.length || email.to.length !== 1) throw new ConsentWelcomeError("welcome_send_configuration_invalid", true);
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST", redirect: "error", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `${WELCOME_VERSION}/${id}` },
      body: JSON.stringify(email), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ConsentWelcomeError("welcome_provider_uncertain"); }
  const result = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!response.ok) throw new ConsentWelcomeError(`welcome_provider_http_${response.status}`, response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status));
  if (!result || typeof result.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(result.id)) throw new ConsentWelcomeError("welcome_provider_response_uncertain");
  return result.id;
}

export type ConsentWelcomeDependencies = {
  claim: () => Promise<ConsentWelcomeJob | null>;
  context: (job: ConsentWelcomeJob) => Promise<ConsentWelcomeContext>;
  readDocument: ConsentDocumentReader;
  payment: (context: ConsentWelcomeContext) => Promise<ConsentWelcomePayment>;
  begin: (job: ConsentWelcomeJob, fingerprint: string, payloadHash: string, documents: ConsentDocumentFingerprint[]) => Promise<boolean>;
  send: (payload: ConsentWelcomeEmail, id: string) => Promise<string>;
  finish: (job: ConsentWelcomeJob, status: "pending" | "sent" | "failed" | "indeterminate", providerId: string | null, code: string | null) => Promise<boolean>;
};

export async function processConsentWelcome(deps: ConsentWelcomeDependencies, clock = Date.now) {
  const result = { claimed: 0, sent: 0, pending: 0, failed: 0, indeterminate: 0, recordingFailed: 0 };
  const deadline = clock() + 110000;
  const timeAvailable = () => { if (clock() >= deadline) throw new ConsentWelcomeError("welcome_worker_time_budget"); };
  for (let i = 0; i < 3 && clock() < deadline; i++) {
    const job = await deps.claim(); if (!job) break;
    result.claimed++;
    let status: "pending" | "sent" | "failed" | "indeterminate" = "pending";
    let providerId: string | null = null, code: string | null = null;
    let beganOrUncertain = false;
    try {
      const context = await deps.context(job);
      if (!context.eligible) throw new ConsentWelcomeError(/^[a-z0-9_]{1,80}$/.test(context.reason || "") ? context.reason! : "welcome_source_unavailable", context.retryable === false);
      if (!SHA256.test(context.source_fingerprint || "") || context.id !== job.id || context.source_type !== job.source_type
        || context.submission_id !== job.submission_id || context.invite_id !== job.invite_id) throw new ConsentWelcomeError("welcome_source_identity_invalid", true);
      const documents = await consentWelcomeDocuments(context, deps.readDocument);
      timeAvailable();
      const payment = await deps.payment(context);
      const email = consentWelcomeEmail(context, documents, payment);
      const payloadHash = await consentWelcomeHash(JSON.stringify(email));
      timeAvailable();
      const latest = await deps.context(job);
      if (!latest.eligible || latest.source_fingerprint !== context.source_fingerprint || latest.recipient !== context.recipient) throw new ConsentWelcomeError("welcome_source_changed");
      // Object replacements can precede their source-row update. Compare actual
      // bytes again, rather than relying only on stored path/metadata hashes.
      const latestDocuments = await consentWelcomeDocuments(latest, deps.readDocument);
      if (JSON.stringify(latestDocuments.fingerprints) !== JSON.stringify(documents.fingerprints)) throw new ConsentWelcomeError("welcome_document_changed");
      timeAvailable();
      const latestPayment = await deps.payment(latest);
      if (JSON.stringify(latestPayment) !== JSON.stringify(payment)) throw new ConsentWelcomeError("welcome_payment_changed");
      if (await consentWelcomeHash(JSON.stringify(consentWelcomeEmail(latest, latestDocuments, latestPayment))) !== payloadHash) throw new ConsentWelcomeError("welcome_payload_changed");
      timeAvailable();
      // Once this write may have committed, a lost response must never cause an
      // automatic provider attempt on a later worker invocation.
      beganOrUncertain = true;
      const began = await deps.begin(job, context.source_fingerprint!, payloadHash, documents.fingerprints);
      if (!began) { beganOrUncertain = false; throw new ConsentWelcomeError("welcome_source_changed"); }
      providerId = await deps.send(email, job.id);
      status = "sent";
    } catch (error) {
      code = error instanceof ConsentWelcomeError ? error.code : "welcome_attempt_unavailable";
      status = error instanceof ConsentWelcomeError && error.permanent ? "failed" : beganOrUncertain ? "indeterminate" : "pending";
    }
    try { if (await deps.finish(job, status, providerId, code)) result[status]++; else result.recordingFailed++; }
    catch { result.recordingFailed++; }
  }
  return result;
}
