# Fonts for original-script consent records

The five Noto Regular fonts in this directory are redistributable under the
SIL Open Font License 1.1. The upstream license files are retained as `OFL.txt`
and `OFL-CJK.txt`. `manifest.json` records the exact upstream commit URLs,
uncompressed SHA-256 checksums and byte sizes; no font was subsetted at build
time and no available name characters were deliberately removed.

- Noto Sans: English, Tagalog, Spanish and Latin-script field data.
- Noto Sans Gurmukhi: Punjabi.
- Noto Sans Devanagari: Hindi.
- Noto Naskh Arabic: Arabic, including combining vowel marks.
- Noto Sans CJK SC: full CJK coverage, including Traditional Chinese. HarfBuzz
  selects Traditional Chinese regional forms with `zh-Hant` and the font's
  OpenType `locl` tables; it never converts the submitted characters.

The official [Noto CJK documentation](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/README.md#language-specific-otfs)
describes the regional forms included in this full language-specific OTF.
The CJK file is gzip-compressed without changes to its decompressed bytes to
fit the local CLI Edge Function bundle budget. `Deno.readFile` and
`DecompressionStream` load it locally, on demand. No request fetches fonts
from Google, a CDN, a storage bucket, or another service.

The PDF embeds subsets containing the actual shaped glyphs. Fontkit 2.0.4
parses/subsets fonts, HarfBuzz 14.3.0 (`harfbuzzjs` 1.6.0) performs shaping,
and bidi-js 1.0.3 resolves Unicode bidirectional run order. pdf-lib 1.17.1
writes the document using explicit glyph advances and offsets. Using
`drawText` with a custom font alone is insufficient: pdf-lib's default
font writer does not use all complex-script glyph-position adjustments.

Unsupported characters fail with `consent_character_not_supported` (HTTP
422); no text is deleted, replaced with a question mark, or transliterated.
The original submission remains intact. This font set is not a promise of
universal Unicode/emoji coverage. Native typography review remains part of
locale release, and no release flags are changed by the PDF implementation.

See `supabase/MULTILINGUAL_OPERATIONS.md` for bundle, test, and PDF reader limits.
