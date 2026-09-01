import { PDFDocument, PDFName, PDFPage, PDFString, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { ConsentUnicodeWriter, wrapConsentText } from "./consent-unicode.ts";
import type { PreferredLocale } from "./locale-policy.ts";
import { requireEnglishProductLocale } from "./product-locale.ts";
import feeRefund from "../../../src/config/feeRefund.json" with { type: "json" };

export interface ConsentFormData {
  ticketType?: "photo_radar" | "officer_issued";
  registeredOwnerOnOffenceDate?: string | null;
  submissionId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  driversLicense: string;
  ticketNumber: string;
  violation: string;
  issueDate: string;
  digitalSignature: string;
}

// English authorization wording. Refund eligibility follows each written order.
// Existing saved signed PDFs must never be regenerated to amend purchase terms. These clauses
// must all print; long original fields must never cause a clause to be skipped.
export const CONSENT_AUTHORIZATION_LINES = [
  "I authorize Fabsy Traffic Ticket Services and its designated agents to deliver",
  "Rapid Resolution for the ticket above, if accepted and within permitted agent scope.",
  "",
  "Within the scope permitted by applicable law and court or tribunal rules, I authorize",
  "Fabsy's agents to:",
  "• Request, receive, track, and review disclosure for this ticket",
  "• Communicate with court, prosecution, and government contacts where authorized",
  "• Prepare and submit a fact-specific prosecutor-review request",
  "• Receive and explain a Crown response and its stated consequences",
  "• Finalize a resolution only after receiving my case-specific instruction",
  "",
  "I understand that:",
  "• Fabsy is an agent service, not a law firm, and does not provide legal advice",
  "• Fabsy will not accept an offer or enter a plea without my specific instruction",
  "• Fabsy may access only information actually needed and lawfully available for this matter",
  "• Outcomes vary and Fabsy does not promise a particular result",
  "• Service-fee refund rights follow the written purchase terms for my order",
  `• ${feeRefund.declinedOfferText}`,
  "• Rapid Resolution costs $198 CAD plus GST; trial and government fines are separate",
  "• The 48-hour commitment starts after complete disclosure is received and matched",
  "• The 48-hour commitment excludes Crown response and final-outcome timing",
] as const;

export const PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES = [
  "I authorize Fabsy Traffic Ticket Services and its designated agents to deliver",
  "Rapid Resolution: Photo Radar for the registered-owner notice above, if accepted.",
  "This service covers Alberta automated enforcement notices under TSA s.160(1).",
  "",
  "Within permitted agent scope, I specifically instruct and authorize Fabsy to:",
  "• Enter a not-guilty plea for this notice and request and review disclosure",
  "• Review the owner notice, images, site, timing and device records available",
  "• Pursue a Crown reduction or withdrawal based on the evidence",
  "• Explain each Crown response and obtain my decision on any proposed deal",
  "• Finalize a proposed resolution only after my case-specific approval",
  "",
  "I understand that:",
  "• Fabsy is an agent service, not a law firm, and does not provide legal advice",
  "• Under the current demerit schedule, an owner conviction under Traffic Safety Act s.160 receives no demerit points",
  "• No insurer, underwriting, or premium result is promised; an Insurance Impact Report is not included",
  "• The one-time service fee is $79 CAD plus 5% GST ($82.95 total) at checkout",
  "• No legal outcome is promised; service-fee refund rights follow my written purchase terms",
  `• ${feeRefund.declinedOfferText}`,
  "• There is no success fee and no trial representation; government fines are separate",
  "• Fabsy takes its next authorized step within 48 hours after complete disclosure",
  "• The 48-hour commitment excludes Crown response and final-outcome timing",
] as const;

export const CONSENT_PRIVACY_LINES = [
  "By signing this form, I consent to the processing of my personal information",
  "for this ticket matter, including controlled technology-assisted document analysis,",
  "as described in Fabsy's Privacy Policy. Fabsy may use only",
  "the information it actually accesses for the requested service and may disclose it",
  "to authorized service providers or public bodies when needed or required by law.",
] as const;

export const CONSENT_SOURCE_ATTACHMENT = "consent-original-fields.json";

/** Pure document generation: no database, network, storage or email effects. */
export async function createConsentPdf(
  formData: ConsentFormData,
  locale: PreferredLocale = "en",
  generatedAt = new Date(),
): Promise<Uint8Array> {
  if (formData.ticketType === "photo_radar") requireEnglishProductLocale(locale, "photo_radar");
  const authorizationLines = formData.ticketType === "photo_radar" ? PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES : CONSENT_AUTHORIZATION_LINES;
  const doc = await PDFDocument.create();
  doc.setTitle("Client consent for traffic ticket agent services");
  doc.setAuthor("Fabsy Traffic Ticket Services");
  doc.setSubject("English authorization with original client-entered fields");
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);
  doc.catalog.set(PDFName.of("Lang"), PDFString.of("en-CA"));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const unicode = new ConsentUnicodeWriter(doc);
  const ink = rgb(0.09, 0.15, 0.22);
  const secondary = rgb(0.3, 0.36, 0.42);
  const margin = 48;
  const pageWidth = 612;
  const printableWidth = pageWidth - margin * 2;
  const bottom = 62;
  let page: PDFPage;
  let y = 0;

  function newPage() {
    page = doc.addPage([pageWidth, 792]);
    y = 746;
    page.drawText("FABSY TRAFFIC TICKET SERVICES", { x: margin, y, size: 9, font: bold, color: secondary });
    y -= 24;
    page.drawText("Client consent for traffic ticket agent services", { x: margin, y, size: 14, font: bold, color: ink });
    y -= 23;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, color: rgb(0.8, 0.83, 0.86), thickness: 0.6 });
    y -= 25;
  }

  function ensureRoom(height: number) {
    if (y - height < bottom) newPage();
  }

  function section(title: string) {
    ensureRoom(54);
    y -= 6;
    page.drawText(title, { x: margin, y, size: 11, font: bold, color: ink });
    y -= 23;
  }

  function english(text: string, size = 10, lineHeight = 15) {
    if (!text) { ensureRoom(lineHeight); y -= lineHeight / 2; return; }
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && regular.widthOfTextAtSize(candidate, size) > printableWidth) {
        ensureRoom(lineHeight);
        page.drawText(line, { x: margin, y, size, font: regular, color: ink });
        y -= lineHeight;
        line = word;
      } else line = candidate;
    }
    if (line) {
      ensureRoom(lineHeight);
      page.drawText(line, { x: margin, y, size, font: regular, color: ink });
      y -= lineHeight;
    }
  }

  async function field(label: string, value: string) {
    const valueX = margin + 108;
    const valueWidth = printableWidth - 108;
    const lines = await wrapConsentText(value || "Not supplied", locale, 11, valueWidth);
    // Space for native ascenders/descenders, vowel marks, and a continuation.
    ensureRoom(Math.min(lines.length, 2) * 23);
    page.drawText(label, { x: margin, y, size: 9, font: bold, color: secondary });
    for (const line of lines) {
      ensureRoom(23);
      const x = line.direction === "rtl" ? valueX + valueWidth - line.width : valueX;
      await unicode.drawLine(page, line, x, y, 11);
      y -= 23;
    }
  }

  newPage();
  english("Authorization wording is in English. Client details retain their original script.", 9, 15);
  y -= 7;
  section("CLIENT INFORMATION");
  await field("Name", `${formData.firstName} ${formData.lastName}`);
  await field("Email", formData.email);
  await field("Phone", formData.phone);
  await field("Address", `${formData.address}, ${formData.city}, ${formData.province}`);
  await field("Postal code", formData.postalCode);
  await field("Driver's license", formData.driversLicense);
  section("TICKET INFORMATION");
  await field("Ticket number", formData.ticketNumber);
  await field("Violation", formData.violation);
  await field(formData.ticketType === "photo_radar" ? "Offence date" : "Issue date", formData.issueDate);
  if (formData.ticketType === "photo_radar") await field("Offence-date ownership", formData.registeredOwnerOnOffenceDate?.replaceAll("_", " ") || "Not supplied");
  section(formData.ticketType === "photo_radar" ? "PHOTO RADAR AUTHORIZATION" : "RAPID RESOLUTION AUTHORIZATION");
  for (const line of authorizationLines) english(line);
  const signatureLines = await wrapConsentText(formData.digitalSignature || "Not supplied", locale, 11, printableWidth - 108);
  ensureRoom(signatureLines.length * 23 + 136);
  section("CLIENT SIGNATURE");
  await field("Digital signature", formData.digitalSignature);
  english(`Document generated (UTC): ${generatedAt.toISOString()}`, 9, 15);
  y -= 10;
  ensureRoom(CONSENT_PRIVACY_LINES.length * 14 + 20);
  for (const line of CONSENT_PRIVACY_LINES) english(line, 9, 14);
  y -= 8;
  english(`The PDF attachment ${CONSENT_SOURCE_ATTACHMENT} preserves the original field text.`, 8, 12);

  for (const [index, item] of doc.getPages().entries()) {
    item.drawText(`Fabsy Traffic Ticket Services  |  Page ${index + 1} of ${doc.getPageCount()}`, {
      x: margin, y: 34, size: 8, font: regular, color: secondary,
    });
  }
  // Keep a byte-verifiable logical source, independent of PDF readers' varying
  // support for ActualText, ligatures or right-to-left copy/paste. No normalization
  // or transliteration is applied to the submitted strings.
  const sourceRecord = {
    schemaVersion: "fabsy-consent-original-fields-v1",
    documentLanguage: "en",
    preferredLocale: locale,
    generatedAt: generatedAt.toISOString(),
    fields: formData,
    authorizationLines,
    privacyLines: CONSENT_PRIVACY_LINES,
  };
  await doc.attach(new TextEncoder().encode(JSON.stringify(sourceRecord, null, 2)), CONSENT_SOURCE_ATTACHMENT, {
    mimeType: "application/json",
    description: "Exact original Unicode client fields and English consent wording; no translation or normalization.",
    creationDate: generatedAt,
    modificationDate: generatedAt,
  });
  unicode.finish();
  return await doc.save();
}
