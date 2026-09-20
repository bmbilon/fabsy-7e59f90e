import { type ConsentWelcomeContext, type ConsentWelcomeDocuments, ConsentWelcomeError, consentWelcomeHash, SHA256, UUID } from "./consent-welcome-types.ts";

export type ConsentDocumentReader = (bucket: string, path: string) => Promise<Uint8Array>;
const safePath = (value: string) => value.length < 1000 && !value.includes("..") && !value.includes("\\") && !value.startsWith("/")
  && Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}
function pdf(bytes: Uint8Array) {
  return bytes.length > 20 && bytes.length <= 10 * 1024 * 1024
    && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"
    && new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024))).includes("%%EOF");
}

export async function consentWelcomeDocuments(context: ConsentWelcomeContext, read: ConsentDocumentReader): Promise<ConsentWelcomeDocuments> {
  const submissionId = context.submission_id || "", inviteId = context.invite_id || "";
  const standalone = context.source_type === "invite" && !submissionId;
  const path = context.consent_form_path || "";
  if (context.consent_bucket !== "consent-forms" || !safePath(path) || !path.endsWith(".pdf")) throw new ConsentWelcomeError("consent_path_invalid", true);
  const inviteDocument = UUID.test(inviteId) && path.startsWith(`standalone/${inviteId}/`);
  const submissionDocument = UUID.test(submissionId) && path.startsWith(`${submissionId}/`);
  if (!inviteDocument && !submissionDocument) throw new ConsentWelcomeError("consent_ownership_invalid", true);
  if (context.source_type === "invite" && !inviteDocument) throw new ConsentWelcomeError("consent_ownership_invalid", true);
  const documents: ConsentWelcomeDocuments = { attachments: [], fingerprints: [] };
  if (!standalone) {
    const owner = context.ticket_document_owner_id || context.source_assessment_id || submissionId;
    const ticketPath = context.ticket_document_path || "";
    if (!UUID.test(submissionId) || !UUID.test(owner) || context.ticket_document_bucket !== "assessment-tickets"
      || !safePath(ticketPath) || !ticketPath.startsWith(`${owner}/`)) throw new ConsentWelcomeError("ticket_upload_unavailable");
    const uploadedTicket = await read("assessment-tickets", ticketPath);
    if (!uploadedTicket.length || uploadedTicket.length > 20 * 1024 * 1024) throw new ConsentWelcomeError("ticket_upload_unavailable");
    documents.fingerprints.push({ path: `assessment-tickets/${ticketPath}`, sha256: await consentWelcomeHash(uploadedTicket) });
  }
  const add = async (bucket: string, storagePath: string, expected: string | null | undefined, filename: string, requireHash: boolean) => {
    if ((requireHash && !SHA256.test(expected || "")) || (expected && !SHA256.test(expected))) throw new ConsentWelcomeError("consent_hash_invalid", true);
    const bytes = await read(bucket, storagePath);
    if (!pdf(bytes)) throw new ConsentWelcomeError("consent_pdf_unavailable");
    const actual = await consentWelcomeHash(bytes);
    if (expected && actual !== expected) throw new ConsentWelcomeError("consent_hash_mismatch", true);
    documents.fingerprints.push({ path: `${bucket}/${storagePath}`, sha256: actual });
    documents.attachments.push({ filename, content: base64(bytes), content_type: "application/pdf" });
  };
  if (context.signature_method === "manual_scan") {
    const scan = context.manual_scan_pdf_path || "";
    if (!inviteDocument || context.manual_scan_bucket !== "representation-consent-scans" || !safePath(scan)
      || !scan.startsWith(`manual/${inviteId}/`) || !scan.endsWith("/signed-scan.pdf")) throw new ConsentWelcomeError("manual_scan_ownership_invalid", true);
    await add("representation-consent-scans", scan, context.manual_scan_pdf_sha256, "Signed-consent-scan.pdf", true);
    await add("consent-forms", path, context.consent_sha256, "Consent-signing-record.pdf", true);
  } else {
    await add("consent-forms", path, context.consent_sha256, context.signature_method === "checkbox" ? "Consent-copy.pdf" : "Signed-consent.pdf", inviteDocument);
  }
  return documents;
}
