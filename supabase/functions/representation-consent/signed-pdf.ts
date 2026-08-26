import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "https://esm.sh/pdf-lib@1.17.1";

export interface SignedConsentPdfInvite {
  ticket_number: unknown;
  pending_consent_text: unknown;
  pending_consent_text_version: unknown;
  pending_consent_text_hash: unknown;
  pending_signature_method: unknown;
  pending_manual_signed_name: unknown;
  pending_digital_signature: unknown;
  pending_signed_at: unknown;
  pending_client_reported_signed_at: unknown;
  pending_client_phone: unknown;
  pending_client_date_of_birth: unknown;
  pending_client_address: unknown;
  pending_client_city: unknown;
  pending_client_province: unknown;
  pending_client_postal_code: unknown;
  pending_manual_signed_date: unknown;
  pending_manual_scan_source_sha256: unknown;
  pending_manual_scan_pdf_sha256: unknown;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function pdfSafe(value: unknown) {
  return String(value ?? "");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function splitWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const chunks: string[] = [];
  let chunk = "";
  for (const character of word) {
    const candidate = chunk + character;
    if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapPdfText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean).flatMap((word) =>
    splitWord(word, font, size, maxWidth)
  );
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function createSignedConsentPdf(
  invite: SignedConsentPdfInvite,
) {
  const consentText = pdfSafe(invite.pending_consent_text);
  const consentVersion = pdfSafe(invite.pending_consent_text_version);
  const consentHash = pdfSafe(invite.pending_consent_text_hash);
  const signatureMethod = pdfSafe(invite.pending_signature_method);
  const signature = signatureMethod === "manual_scan"
    ? pdfSafe(invite.pending_manual_signed_name)
    : pdfSafe(invite.pending_digital_signature);
  const signedAt = pdfSafe(invite.pending_signed_at);
  const clientReportedSignedAt = pdfSafe(
    invite.pending_client_reported_signed_at,
  );
  const signedClientDetails = {
    phone: pdfSafe(invite.pending_client_phone),
    dateOfBirth: pdfSafe(invite.pending_client_date_of_birth),
    address: pdfSafe(invite.pending_client_address),
    city: pdfSafe(invite.pending_client_city),
    province: pdfSafe(invite.pending_client_province),
    postalCode: pdfSafe(invite.pending_client_postal_code),
  };
  if (
    !consentText || !consentVersion || !SHA256_PATTERN.test(consentHash) ||
    !["typed", "manual_scan"].includes(signatureMethod) || !signature ||
    !signedAt || !clientReportedSignedAt || !signedClientDetails.dateOfBirth ||
    !signedClientDetails.address || !signedClientDetails.city
  ) {
    throw new Error("Claimed consent audit data is incomplete.");
  }
  if (await sha256Hex(consentText) !== consentHash) {
    throw new Error("Claimed consent text hash does not match.");
  }

  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const bottom = 42;
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.37, 0.39, 0.44);
  const brand = rgb(0.31, 0.12, 0.58);
  let page!: PDFPage;
  let y = 0;

  const addPage = () => {
    page = document.addPage([pageWidth, pageHeight]);
    page.drawText("FABSY", {
      x: margin,
      y: pageHeight - 32,
      size: 12,
      font: bold,
      color: brand,
    });
    page.drawText("Traffic Ticket Defense", {
      x: margin + 45,
      y: pageHeight - 31,
      size: 7.5,
      font: regular,
      color: muted,
    });
    page.drawLine({
      start: { x: margin, y: pageHeight - 39 },
      end: { x: pageWidth - margin, y: pageHeight - 39 },
      thickness: 0.75,
      color: rgb(0.84, 0.81, 0.9),
    });
    y = pageHeight - 57;
  };

  const ensureSpace = (height: number) => {
    if (y - height < bottom) addPage();
  };

  const drawParagraph = (
    text: string,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gapAfter?: number;
      lineHeight?: number;
    } = {},
  ) => {
    const selectedFont = options.font || regular;
    const size = options.size || 8.15;
    const indent = options.indent || 0;
    const lineHeight = options.lineHeight || size * 1.26;
    const lines = wrapPdfText(text, selectedFont, size, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: margin + indent,
        y,
        size,
        font: selectedFont,
        color: options.color || ink,
      });
      y -= lineHeight;
    }
    y -= options.gapAfter ?? 2.25;
  };

  addPage();
  drawParagraph("SIGNED CLIENT CONSENT", {
    font: bold,
    size: 14,
    color: brand,
    gapAfter: 5,
  });
  drawParagraph(`Version: ${consentVersion}`, {
    size: 7.1,
    color: muted,
    gapAfter: 1,
  });
  drawParagraph(`Consent SHA-256: ${consentHash}`, {
    size: 7.1,
    color: muted,
    gapAfter: 7,
  });

  drawParagraph("DETAILS SUPPLIED AT SIGNING", {
    font: bold,
    size: 9,
    color: brand,
    gapAfter: 3,
  });
  const address = [
    signedClientDetails.address,
    signedClientDetails.city,
    signedClientDetails.province,
    signedClientDetails.postalCode,
  ].filter(Boolean).join(", ");
  drawParagraph(
    `Date of birth: ${signedClientDetails.dateOfBirth}  |  Mailing address: ${address}`,
    { size: 7.8, gapAfter: signedClientDetails.phone ? 1.5 : 6 },
  );
  if (signedClientDetails.phone) {
    drawParagraph(`Phone: ${signedClientDetails.phone}`, {
      size: 7.8,
      gapAfter: 6,
    });
  }

  for (const rawLine of consentText.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      y -= 2.25;
      continue;
    }
    const isHeading = /^[A-Z][A-Z ]+$/.test(line) && line.length <= 64;
    if (isHeading) ensureSpace(18);
    drawParagraph(line, {
      font: isHeading ? bold : regular,
      size: isHeading ? 8.9 : 8.15,
      color: isHeading ? brand : ink,
      gapAfter: isHeading ? 3 : 1.8,
    });
  }

  ensureSpace(signatureMethod === "manual_scan" ? 100 : 72);
  y -= 4;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.75,
    color: rgb(0.84, 0.81, 0.9),
  });
  y -= 14;
  drawParagraph(
    signatureMethod === "manual_scan"
      ? "MANUAL SIGNATURE SCAN AUDIT"
      : "ELECTRONIC SIGNATURE AUDIT",
    { font: bold, size: 9, color: brand, gapAfter: 3 },
  );
  drawParagraph(
    `${
      signatureMethod === "manual_scan"
        ? "Printed legal name"
        : "Typed signature"
    }: ${signature}`,
    { font: bold, size: 8.5, gapAfter: 1.5 },
  );
  drawParagraph(
    `Method: ${signatureMethod}  |  Server time: ${signedAt}  |  Client time: ${clientReportedSignedAt}`,
    { size: 7.4, gapAfter: 1.5 },
  );
  if (signatureMethod === "manual_scan") {
    drawParagraph(
      `Client-entered signed date: ${
        pdfSafe(invite.pending_manual_signed_date)
      }`,
      { size: 7.4, gapAfter: 1.5 },
    );
    drawParagraph(
      `Uploaded source SHA-256: ${
        pdfSafe(invite.pending_manual_scan_source_sha256)
      }`,
      { size: 7.1, gapAfter: 1.5 },
    );
    drawParagraph(
      `Normalized scan SHA-256: ${
        pdfSafe(invite.pending_manual_scan_pdf_sha256)
      }`,
      { size: 7.1, gapAfter: 1.5 },
    );
    drawParagraph(
      "The privately stored signature scan is pending staff review.",
      { size: 7.2, color: muted, gapAfter: 1.5 },
    );
  }
  drawParagraph(
    "The client affirmatively accepted the versioned consent recorded above before submitting this signature.",
    { size: 7.2, color: muted },
  );

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawText(
      `Fabsy client consent | Page ${index + 1} of ${pages.length}`,
      {
        x: margin,
        y: 24,
        size: 7,
        font: regular,
        color: rgb(0.45, 0.47, 0.52),
      },
    );
  });
  document.setTitle(
    `Client consent - ${pdfSafe(invite.ticket_number)}`,
  );
  document.setAuthor("Fabsy Traffic Ticket Services");
  document.setSubject("Signed traffic ticket representation consent");
  document.setCreator("Fabsy secure consent service");
  document.setProducer("Fabsy secure consent service");
  document.setCreationDate(new Date(signedAt));
  document.setModificationDate(new Date(signedAt));
  return document.save({ useObjectStreams: false });
}
