import assert from "node:assert/strict";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from "https://esm.sh/pdf-lib@1.17.1";
import { CONSENT_SOURCE_ATTACHMENT, createConsentPdf } from "./consent-pdf.ts";
import { ConsentTextError, shapeConsentLine, wrapConsentText } from "./consent-unicode.ts";
import { CONSENT_FIXTURE_DATE, CONSENT_FIXTURES } from "../../tests/consent-fixtures.ts";
import reference from "../../tests/consent-shaping-reference.json" with { type: "json" };
import type { PreferredLocale } from "./locale-policy.ts";

Deno.test("consent shaping matches independent native HarfBuzz glyph IDs and mark positions", async () => {
  for (const item of reference.cases) {
    const result = await shapeConsentLine(item.text, item.locale as PreferredLocale, 11);
    assert.equal(result.runs.length, 1);
    assert.equal(result.runs[0].direction, item.direction);
    assert.deepEqual(result.runs[0].glyphs.map((glyph) => ({
      g: glyph.id, cl: glyph.cluster, dx: glyph.xOffset, dy: glyph.yOffset, ax: glyph.xAdvance, ay: glyph.yAdvance,
    })), item.glyphs, `${item.name}: native reference ${reference.generator}`);
  }
});

Deno.test("bidi keeps Latin ticket IDs intact and mirrors brackets in Arabic without reversing source", async () => {
  const text = "أحمد (AB-123)";
  const result = await shapeConsentLine(text, "ar", 11);
  assert.equal(result.text, text);
  assert.equal(result.direction, "rtl");
  assert.deepEqual(result.runs.map((run) => [run.text, run.direction]), [
    [")", "rtl"], ["AB-123", "ltr"], ["(", "rtl"], ["أحمد ", "rtl"],
  ]);
  assert.equal(result.runs[0].glyphs[0].id, 11); // displayed opening bracket
  assert.equal(result.runs[2].glyphs[0].id, 12); // displayed closing bracket
  assert.deepEqual(result.runs[1].glyphs.map((glyph) => glyph.id), [36, 37, 16, 20, 21, 22]);
});

Deno.test("Chinese keeps its source characters while selecting Simplified and Traditional glyph forms", async () => {
  const simplified = await shapeConsentLine("骨直令", "zh-hans", 11);
  const traditional = await shapeConsentLine("骨直令", "zh-hant", 11);
  assert.equal(simplified.text, traditional.text);
  assert.deepEqual(simplified.runs[0].glyphs.map((glyph) => glyph.id), [45133, 27874, 9809]);
  assert.deepEqual(traditional.runs[0].glyphs.map((glyph) => glyph.id), [45134, 27874, 9810]);
});

Deno.test("wrapping retains complete original source including combining marks, tabs, CRLF and trailing spaces", async () => {
  const original = "  ਹਰਪ੍ਰੀਤ ਸਿੰਘ\tक्षि त्रि श्रद्धा\r\nأَحْمَدُ (AB-123)\n超速行駛  ".repeat(10);
  const lines = await wrapConsentText(original, "pa", 11, 150);
  assert.equal(lines.map((line) => line.text).join(""), original);
  assert.ok(lines.length > 10);
  for (const line of lines) assert.ok(line.width <= 150);
  const rtlParagraph = "أحمد (AB-123) ABC DEF GHI JKL المزيد من المعلومات (456)";
  const rtlLines = await wrapConsentText(rtlParagraph, "ar", 11, 100);
  assert.equal(rtlLines.map((line) => line.text).join(""), rtlParagraph);
  assert.ok(rtlLines.some((line) => /^[A-Z]/.test(line.text)));
  for (const line of rtlLines) assert.equal(line.direction, "rtl");
});

Deno.test("all Wave 1 PDFs embed native fonts and preserve exact fields in ActualText and UTF-8 attachment", async () => {
  for (const fixture of CONSENT_FIXTURES) {
    const bytes = await createConsentPdf(fixture.fields, fixture.locale, new Date(CONSENT_FIXTURE_DATE));
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 2);
    assert.ok(bytes.length < 200_000);
    const names = pdf.catalog.lookup(PDFName.of("Names"), PDFDict);
    const embedded = names.lookup(PDFName.of("EmbeddedFiles"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
    assert.equal(embedded.lookup(0)!.toString(), PDFHexString.fromText(CONSENT_SOURCE_ATTACHMENT).toString());
    const spec = embedded.lookup(1, PDFDict);
    const stream = spec.lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"));
    assert.ok(stream instanceof PDFRawStream);
    const attachment = JSON.parse(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
    assert.deepEqual(attachment.fields, fixture.fields);
    assert.equal(attachment.preferredLocale, fixture.locale);
    assert.equal(attachment.documentLanguage, "en");

    let logicalText = "";
    for (const page of pdf.getPages()) {
      const content = page.node.Contents();
      assert.ok(content instanceof PDFArray);
      for (let i = 0; i < content.size(); i++) {
        const source = new TextDecoder().decode(decodePDFRawStream(content.lookup(i, PDFRawStream)).decode());
        for (const match of source.matchAll(/\/ActualText\s*<([\dA-Fa-f]+)>/g)) {
          logicalText += PDFHexString.of(match[1]).decodeText();
        }
      }
      const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
      assert.ok(fonts.keys().length >= 2);
    }
    for (const [key, value] of Object.entries(fixture.fields)) {
      if (key !== "submissionId") assert.ok(logicalText.includes(value), `${fixture.name}: original ${key} missing`);
    }
  }
});

Deno.test("unsupported characters fail explicitly without substituting or deleting original data", async () => {
  const fields = { ...CONSENT_FIXTURES[0].fields, firstName: "Alex 🚀", digitalSignature: "Alex 🚀 Example" };
  const before = JSON.stringify(fields);
  await assert.rejects(createConsentPdf(fields), (error: unknown) => {
    assert.ok(error instanceof ConsentTextError);
    assert.equal(error.codePoint, 0x1F680);
    assert.equal(error.status, 422);
    return true;
  });
  assert.equal(JSON.stringify(fields), before);
});
