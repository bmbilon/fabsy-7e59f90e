/// <reference types="https://esm.sh/@types/emscripten@1.41.5/index.d.ts" />
import * as fontkit from "https://esm.sh/fontkit@2.0.4?bundle&conditions=browser";
import bidiFactory from "https://esm.sh/bidi-js@1.0.3";
import {
  beginText,
  endText,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  PDFRef,
  PDFString,
  setFontAndSize,
  setTextMatrix,
  showText,
} from "https://esm.sh/pdf-lib@1.17.1";
// @deno-types="./consent-harfbuzz/index.d.mts"
import * as hb from "./consent-harfbuzz/index.mjs";
import type { PreferredLocale } from "./locale-policy.ts";

// pdf-lib's drawText ignores OpenType glyph offsets/advances. Fontkit is used
// ONLY for font parsing/subsetting; HarfBuzz performs all complex shaping.
// These imports are pinned and tested together. Neither fonts nor shaping are
// fetched at request time. See consent-fonts/README.md for asset provenance.
type FontKey = "latin" | "gurmukhi" | "devanagari" | "arabic" | "cjk";
const FONT_FILES: Record<FontKey, string> = {
  latin: "NotoSans-Regular.ttf",
  gurmukhi: "NotoSansGurmukhi-Regular.ttf",
  devanagari: "NotoSansDevanagari-Regular.ttf",
  arabic: "NotoNaskhArabic-Regular.ttf",
  cjk: "NotoSansCJKsc-Regular.otf.gz",
};
const SCRIPT_TAGS: Record<FontKey, string> = {
  latin: "Latn", gurmukhi: "Guru", devanagari: "Deva", arabic: "Arab", cjk: "Hani",
};

interface FontKitGlyph {
  id: number;
  advanceWidth: number;
}
interface FontKitSubset {
  cff?: unknown;
  includeGlyph(glyph: FontKitGlyph): number;
  encode(): Uint8Array;
}
interface FontKitFont {
  unitsPerEm: number;
  postscriptName: string;
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  getGlyph(id: number): FontKitGlyph;
  createSubset(): FontKitSubset;
}
interface LoadedFont {
  key: FontKey;
  parsed: FontKitFont;
  shaper: hb.Font;
}
interface EmbeddedFont {
  source: LoadedFont;
  subset: FontKitSubset;
  ref: PDFRef;
  glyphs: Map<number, { cid: number; width: number; unicode: string }>;
}
interface ShapedGlyph {
  id: number;
  cluster: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}
export interface ConsentTextRun {
  text: string;
  font: FontKey;
  direction: "ltr" | "rtl";
  script: string;
  language: string;
  unitsPerEm: number;
  glyphs: ShapedGlyph[];
  width: number;
}
export interface ConsentTextLine {
  text: string;
  runs: ConsentTextRun[];
  width: number;
  direction: "ltr" | "rtl";
}

export class ConsentTextError extends Error {
  readonly status = 422;
  readonly code = "consent_character_not_supported";
  constructor(public codePoint: number) {
    super(`The consent PDF cannot safely display character U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}. Your original information has not been changed. Please contact Fabsy before paying.`);
  }
}

const fontCache = new Map<FontKey, Promise<LoadedFont>>();
interface BidiLevels {
  levels: Uint8Array;
  paragraphs: Array<{ start: number; end: number; level: number }>;
}
const bidi = bidiFactory() as {
  getEmbeddingLevels(text: string): BidiLevels;
  getReorderedIndices(text: string, levels: BidiLevels, start?: number, end?: number): number[];
};
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
const invisibleControl = /^[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE00-\uFE0F\uFEFF\u{E0100}-\u{E01EF}]$/u;

async function loadFont(key: FontKey): Promise<LoadedFont> {
  let pending = fontCache.get(key);
  if (!pending) {
    pending = (async () => {
      let bytes = await Deno.readFile(new URL(`./consent-fonts/${FONT_FILES[key]}`, import.meta.url));
      if (FONT_FILES[key].endsWith(".gz")) {
        bytes = new Uint8Array(await new Response(
          new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer());
      }
      // The pinned browser build accepts Uint8Array; the upstream Node typings
      // unnecessarily require Buffer for this browser entry point.
      const parseFont = fontkit.create as unknown as (bytes: Uint8Array) => FontKitFont;
      const parsed = parseFont(bytes);
      const face = new hb.Face(new hb.Blob(bytes.buffer));
      return { key, parsed, shaper: new hb.Font(face) };
    })();
    fontCache.set(key, pending);
    pending.catch(() => fontCache.delete(key));
  }
  return await pending;
}

function scriptFont(text: string): FontKey | undefined {
  if (/\p{Script=Gurmukhi}/u.test(text)) return "gurmukhi";
  if (/\p{Script=Devanagari}/u.test(text)) return "devanagari";
  if (/\p{Script=Arabic}/u.test(text)) return "arabic";
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return "cjk";
  if (/[\u3000-\u303F\uFF01-\uFF60]/u.test(text)) return "cjk";
  if (/[\u0600-\u06FF]/u.test(text)) return "arabic";
  if (/[\u0964-\u0965]/u.test(text)) return "devanagari";
  if (/\p{Letter}/u.test(text)) return "latin";
}

function missingCharacter(font: LoadedFont, text: string): number | undefined {
  for (const character of text) {
    if (invisibleControl.test(character)) continue;
    const codePoint = character.codePointAt(0)!;
    if (!font.shaper.nominalGlyph(codePoint)) return codePoint;
  }
}

function languageFor(font: FontKey, locale: PreferredLocale): string {
  if (font === "arabic") return "ar";
  if (font === "gurmukhi") return "pa";
  if (font === "devanagari") return "hi";
  // This full Noto CJK font has all regional glyphs. HarfBuzz's locl feature
  // selects TC forms for Traditional Chinese; the source text is never converted.
  if (font === "cjk") return locale === "zh-hant" ? "zh-Hant" : "zh-Hans";
  return locale === "es" || locale === "tl" ? locale : "en";
}

/** Logical source in; visually ordered runs out. Never reverse Unicode strings. */
export async function shapeConsentLine(
  text: string,
  locale: PreferredLocale,
  size: number,
  paragraph?: { text: string; levels: BidiLevels; start: number },
): Promise<ConsentTextLine> {
  for (const character of text) {
    const cp = character.codePointAt(0)!;
    if ((cp < 0x20 && cp !== 9) || (cp >= 0xD800 && cp <= 0xDFFF)) throw new ConsentTextError(cp);
  }
  // A tab is visibly expanded only. /ActualText and the UTF-8 attachment retain it.
  const display = text.replace(/\t/g, "    ");
  const levels = paragraph?.levels ?? bidi.getEmbeddingLevels(display);
  const lineStart = paragraph?.start ?? 0;
  const paragraphText = paragraph?.text ?? display;
  const chunks = Array.from(graphemes.segment(display));
  const logicalRuns: Array<{ text: string; start: number; end: number; level: number; font: LoadedFont }> = [];
  let previousFont: FontKey = "latin";
  for (const chunk of chunks) {
    const explicit = scriptFont(chunk.segment);
    const preferred = explicit ?? previousFont;
    let source = await loadFont(preferred);
    const missing = missingCharacter(source, chunk.segment);
    if (missing !== undefined) {
      // Common punctuation may be absent in a script font (Naskh has no Latin
      // parentheses). Keep the character with a covering font, without replacing it.
      let covered = false;
      const candidates: FontKey[] = ["latin", "cjk", "arabic", "devanagari", "gurmukhi"];
      for (const key of candidates) {
        if (key === source.key) continue;
        const fallback = await loadFont(key);
        if (missingCharacter(fallback, chunk.segment) === undefined) {
          source = fallback;
          covered = true;
          break;
        }
      }
      if (!covered) throw new ConsentTextError(missing);
    }
    if (explicit) previousFont = source.key;
    const level = levels.levels[lineStart + chunk.index] ?? 0;
    const last = logicalRuns.at(-1);
    if (last && last.font.key === source.key && last.level === level) {
      last.text += chunk.segment;
      last.end = lineStart + chunk.index + chunk.segment.length;
    } else {
      logicalRuns.push({ text: chunk.segment, start: lineStart + chunk.index, end: lineStart + chunk.index + chunk.segment.length, level, font: source });
    }
  }

  const runAt = new Map<number, number>();
  logicalRuns.forEach((run, index) => {
    for (let at = run.start; at < run.end; at++) runAt.set(at, index);
  });
  const visualOrder: number[] = [];
  const seen = new Set<number>();
  // UAX #9 applies to run order, including numerals and punctuation. HarfBuzz
  // separately shapes each run in its resolved direction (including mirroring).
  for (const at of bidi.getReorderedIndices(paragraphText, levels, lineStart, lineStart + display.length - 1)) {
    const index = runAt.get(at);
    if (index !== undefined && !seen.has(index)) {
      seen.add(index);
      visualOrder.push(index);
    }
  }
  const runs = visualOrder.map((index): ConsentTextRun => {
    const run = logicalRuns[index];
    const direction = run.level % 2 ? "rtl" : "ltr";
    const script = SCRIPT_TAGS[run.font.key];
    const language = languageFor(run.font.key, locale);
    const buffer = new hb.Buffer();
    buffer.addText(run.text);
    buffer.setDirection(direction === "rtl" ? hb.Direction.RTL : hb.Direction.LTR);
    buffer.setScript(script);
    buffer.setLanguage(language);
    hb.shape(run.font.shaper, buffer);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    const glyphs = infos.map((info, i) => ({ id: info.codepoint, cluster: info.cluster, ...positions[i] }));
    if (glyphs.some((glyph) => glyph.id === 0)) {
      throw new ConsentTextError(run.text.codePointAt(glyphs.find((glyph) => glyph.id === 0)!.cluster)!);
    }
    const unitsPerEm = run.font.parsed.unitsPerEm;
    return { text: run.text, font: run.font.key, direction, script, language, unitsPerEm, glyphs,
      width: glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0) * size / unitsPerEm };
  });
  return { text, runs, width: runs.reduce((sum, run) => sum + run.width, 0),
    direction: levels.paragraphs[0]?.level % 2 ? "rtl" : "ltr" };
}

/** Wrap without splitting grapheme clusters or discarding whitespace/source text. */
export async function wrapConsentText(text: string, locale: PreferredLocale, size: number, width: number): Promise<ConsentTextLine[]> {
  const lines: ConsentTextLine[] = [];
  const paragraphs = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) ?? [""];
  for (const paragraph of paragraphs) {
    const ending = paragraph.match(/(?:\r\n|\r|\n)$/)?.[0] ?? "";
    const content = paragraph.slice(0, paragraph.length - ending.length);
    const paragraphText = content.replace(/\t/g, "    ");
    const paragraphLevels = bidi.getEmbeddingLevels(paragraphText);
    const clusters = Array.from(graphemes.segment(content));
    if (!clusters.length) {
      lines.push({ text: paragraph, runs: [], width: 0, direction: "ltr" });
      continue;
    }
    let start = 0;
    while (start < clusters.length) {
      // UAX #9 embedding levels belong to the whole paragraph. A continuation
      // starting with an English ticket ID must not switch an Arabic paragraph
      // to LTR, and bidi isolates/embeddings may span a soft line break.
      const context = { text: paragraphText, levels: paragraphLevels,
        start: content.slice(0, clusters[start].index).replace(/\t/g, "    ").length };
      let low = start + 1;
      let high = clusters.length;
      let fit = start;
      const measured = new Map<number, ConsentTextLine>();
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const end = middle === clusters.length ? content.length : clusters[middle].index;
        const line = await shapeConsentLine(content.slice(clusters[start].index, end), locale, size, context);
        measured.set(middle, line);
        if (line.width <= width) { fit = middle; low = middle + 1; } else high = middle - 1;
      }
      if (fit === start) throw new Error("A consent text cluster exceeds the printable line width.");
      // Prefer a complete word when wrapping alphabetic text; CJK can wrap at
      // grapheme boundaries. Keep the exact space on the preceding source line.
      if (fit < clusters.length) {
        for (let at = fit - 1; at > start; at--) {
          if (/\s$/u.test(clusters[at].segment)) { fit = at + 1; break; }
        }
      }
      const end = fit === clusters.length ? content.length : clusters[fit].index;
      const line = measured.get(fit) ?? await shapeConsentLine(content.slice(clusters[start].index, end), locale, size, context);
      if (fit === clusters.length) line.text += ending;
      lines.push(line);
      start = fit;
    }
  }
  return lines;
}

function hex(value: number): string { return value.toString(16).toUpperCase().padStart(4, "0"); }

/** A narrow Type0 PDF font writer: fontkit subsets + explicit HarfBuzz positions. */
export class ConsentUnicodeWriter {
  private fonts = new Map<FontKey, EmbeddedFont>();
  constructor(private doc: PDFDocument) {}

  private async font(key: FontKey): Promise<EmbeddedFont> {
    let font = this.fonts.get(key);
    if (!font) {
      const source = await loadFont(key);
      font = { source, subset: source.parsed.createSubset(), ref: this.doc.context.nextRef(), glyphs: new Map() };
      this.fonts.set(key, font);
    }
    return font;
  }

  async drawLine(page: PDFPage, line: ConsentTextLine, x: number, y: number, size: number): Promise<void> {
    const actualText = this.doc.context.obj({ ActualText: PDFHexString.fromText(line.text) });
    page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("Span"), actualText.toString()]));
    let cursorX = x;
    for (const run of line.runs) {
      const font = await this.font(run.font);
      const fontKey = page.node.newFontDictionary(`Consent${run.font}`, font.ref);
      const clusterEnds = [...new Set(run.glyphs.map((glyph) => glyph.cluster)), run.text.length].sort((a, b) => a - b);
      let cursorY = y;
      page.pushOperators(beginText(), setFontAndSize(fontKey, size));
      for (const glyph of run.glyphs) {
        let encoded = font.glyphs.get(glyph.id);
        if (!encoded) {
          const rawGlyph = font.source.parsed.getGlyph(glyph.id);
          const cid = font.subset.includeGlyph(rawGlyph);
          const nextCluster = clusterEnds[clusterEnds.indexOf(glyph.cluster) + 1];
          encoded = { cid, width: rawGlyph.advanceWidth * 1000 / run.unitsPerEm,
            unicode: run.text.slice(glyph.cluster, nextCluster) };
          font.glyphs.set(glyph.id, encoded);
        }
        const scale = size / run.unitsPerEm;
        page.pushOperators(setTextMatrix(1, 0, 0, 1, cursorX + glyph.xOffset * scale, cursorY + glyph.yOffset * scale),
          showText(PDFHexString.of(hex(encoded.cid))));
        cursorX += glyph.xAdvance * scale;
        cursorY += glyph.yAdvance * scale;
      }
      page.pushOperators(endText());
    }
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }

  finish(): void {
    for (const font of this.fonts.values()) {
      const { parsed } = font.source;
      const name = PDFName.of(`FabsyConsent-${parsed.postscriptName}`);
      const scale = 1000 / parsed.unitsPerEm;
      const bytes = font.subset.encode();
      const isCFF = Boolean(font.subset.cff);
      const fontFile = this.doc.context.register(this.doc.context.flateStream(bytes,
        isCFF ? { Subtype: "CIDFontType0C" } : { Length1: bytes.length }));
      const descriptor = this.doc.context.register(this.doc.context.obj({
        Type: "FontDescriptor", FontName: name, Flags: 4,
        FontBBox: [parsed.bbox.minX, parsed.bbox.minY, parsed.bbox.maxX, parsed.bbox.maxY].map((n) => n * scale),
        ItalicAngle: parsed.italicAngle, Ascent: parsed.ascent * scale, Descent: parsed.descent * scale,
        CapHeight: (parsed.capHeight || parsed.ascent) * scale, StemV: 80,
        [isCFF ? "FontFile3" : "FontFile2"]: fontFile,
      }));
      const glyphs = [...font.glyphs.values()].sort((a, b) => a.cid - b.cid);
      const widths = glyphs.flatMap((glyph) => [glyph.cid, [glyph.width]]);
      const descendant = this.doc.context.register(this.doc.context.obj({
        Type: "Font", Subtype: isCFF ? "CIDFontType0" : "CIDFontType2", BaseFont: name,
        CIDSystemInfo: { Registry: PDFString.of("Adobe"), Ordering: PDFString.of("Identity"), Supplement: 0 },
        FontDescriptor: descriptor, DW: 1000, W: widths, ...(!isCFF ? { CIDToGIDMap: "Identity" } : {}),
      }));
      const mappings: string[] = [];
      for (let start = 0; start < glyphs.length; start += 100) {
        const group = glyphs.slice(start, start + 100);
        mappings.push(`${group.length} beginbfchar`, ...group.map((glyph) =>
          `<${hex(glyph.cid)}> <${PDFHexString.fromText(glyph.unicode || " ").asString().slice(4)}>`), "endbfchar");
      }
      const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /FabsyConsent-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${mappings.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
      const toUnicode = this.doc.context.register(this.doc.context.flateStream(cmap));
      this.doc.context.assign(font.ref, this.doc.context.obj({ Type: "Font", Subtype: "Type0", BaseFont: name,
        Encoding: "Identity-H", DescendantFonts: [descendant], ToUnicode: toUnicode }));
    }
  }
}
