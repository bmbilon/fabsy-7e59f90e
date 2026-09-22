import { PDFDocument, PDFName, PDFPage, PDFString, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { ConsentUnicodeWriter, wrapConsentText } from "./consent-unicode.ts";
import type { PreferredLocale } from "./locale-policy.ts";
import { requireEnglishProductLocale } from "./product-locale.ts";
import { CONSENT_AUTHORIZATION_LINES, PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES, CONSENT_PRIVACY_LINES, type IntakeConsent } from "./intake-consent.ts";
export { CONSENT_AUTHORIZATION_LINES, PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES, CONSENT_PRIVACY_LINES } from "./intake-consent.ts";

export interface ConsentFormData {
  serviceOrderTitle?: string;
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
  intakeConsent?: IntakeConsent;
}

export const CONSENT_SOURCE_ATTACHMENT = "consent-original-fields.json";

/** Pure document generation: no database, network, storage or email effects. */
export async function createConsentPdf(
  formData: ConsentFormData,
  locale: PreferredLocale = "en",
  generatedAt = new Date(),
): Promise<Uint8Array> {
  if (formData.ticketType === "photo_radar") requireEnglishProductLocale(locale, "photo_radar");
  const authorizationLines = formData.intakeConsent?.authorization ?? (formData.ticketType === "photo_radar" ? PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES : CONSENT_AUTHORIZATION_LINES);
  const privacyLines = formData.intakeConsent?.privacy ?? CONSENT_PRIVACY_LINES;
  const doc = await PDFDocument.create();
  doc.setTitle(formData.serviceOrderTitle || "Client consent for traffic ticket agent services");
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
    page.drawText(formData.serviceOrderTitle || "Client consent for traffic ticket agent services", { x: margin, y, size: 14, font: bold, color: ink });
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
  await field("Name", [formData.firstName, formData.lastName].filter(Boolean).join(" "));
  await field("Email", formData.email);
  await field("Phone", formData.phone);
  await field("Address", [formData.address, formData.city, formData.province].filter(Boolean).join(", "));
  await field("Postal code", formData.postalCode);
  await field("Driver's license", formData.driversLicense);
  section(formData.serviceOrderTitle ? "SERVICE ORDER INFORMATION" : "TICKET INFORMATION");
  await field("Ticket number", formData.ticketNumber);
  await field("Violation", formData.violation);
  await field(formData.ticketType === "photo_radar" ? "Offence date" : "Issue date", formData.issueDate);
  if (formData.ticketType === "photo_radar") await field("Offence-date ownership", formData.registeredOwnerOnOffenceDate?.replaceAll("_", " ") || "Not supplied");
  section(formData.serviceOrderTitle ? "SERVICE AUTHORIZATION" : formData.intakeConsent?.identitySource === "uploaded_ticket_pending_review" ? "UPLOADED TICKET AUTHORIZATION" : formData.ticketType === "photo_radar" ? "PHOTO RADAR AUTHORIZATION" : "RAPID RESOLUTION AUTHORIZATION");
  for (const line of authorizationLines) english(line);
  if (typeof formData.intakeConsent?.pleadNotGuilty === "boolean") {
    section("CLIENT PLEA INSTRUCTION");
    english(`${formData.intakeConsent.pleaLabel}: ${formData.intakeConsent.pleadNotGuilty ? "Checked" : "Not checked"}`);
    english(formData.intakeConsent.pleaInstruction || "No plea instruction recorded.");
    english("The checkbox choice above was submitted with this electronic acceptance.", 9, 15);
  }
  const signatureLines = await wrapConsentText(formData.digitalSignature || "Not supplied", locale, 11, printableWidth - 108);
  ensureRoom(signatureLines.length * 23 + 136);
  section(formData.intakeConsent?.method === "checkbox" ? "CLIENT ELECTRONIC ACCEPTANCE" : "CLIENT SIGNATURE");
  if (formData.intakeConsent?.method === "checkbox") {
    await field("Accepted by", formData.intakeConsent.name || "Person identified on the uploaded ticket; identity pending review");
    if (formData.intakeConsent.ticketDocumentPath) await field("Submitted ticket", formData.intakeConsent.ticketDocumentPath);
    english(formData.serviceOrderTitle ? "Method: customer checked the consent box and submitted the service order." : "Method: customer checked the consent box and submitted the ticket.");
    english(formData.intakeConsent.label);
    english(formData.intakeConsent.confirmation);
    english("This records Fabsy authorization; a prescribed Government of Alberta form may still be required.");
  } else {
    await field("Digital signature", formData.digitalSignature);
  }
  if (formData.intakeConsent) {
    english(`Accepted (UTC): ${formData.intakeConsent.acceptedAt}`, 9, 15);
    english(`Consent version: ${formData.intakeConsent.version}`, 9, 15);
  }
  english(`Document generated (UTC): ${generatedAt.toISOString()}`, 9, 15);
  y -= 10;
  ensureRoom(privacyLines.length * 14 + 20);
  for (const line of privacyLines) english(line, 9, 14);
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
    privacyLines,
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
