"""Inspect locally generated synthetic PDFs; optionally render every page.

Requires pypdf and Poppler's pdftotext/pdftoppm. No Supabase credentials, HTTP,
mail, or payment calls. Generate fixtures with generate-consent-fixtures.ts first.
"""

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess

from pypdf import PdfReader


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--pdftotext", default=shutil.which("pdftotext"))
    parser.add_argument("--pdftoppm", default=shutil.which("pdftoppm"))
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args()
    if not args.pdftotext:
        parser.error("Pass --pdftotext or install Poppler on PATH.")
    if args.render and not args.pdftoppm:
        parser.error("Pass --pdftoppm or install Poppler on PATH.")
    fixtures = json.loads((args.directory / "expected-original-fields.json").read_text())
    page_count = 0
    for fixture in fixtures:
        filename = args.directory / ("consent-" + fixture["name"] + ".pdf")
        reader = PdfReader(filename)
        original = reader.attachments["consent-original-fields.json"]
        assert len(original) == 1
        source = json.loads(original[0].decode("utf-8"))
        assert source["fields"] == fixture["fields"]
        assert source["preferredLocale"] == fixture["locale"]
        assert source["documentLanguage"] == "en"
        logical_text = []
        embedded_font_count = 0
        for page in reader.pages:
            fonts = page["/Resources"]["/Font"]
            for entry in fonts.values():
                font = entry.get_object()
                if font["/Subtype"] != "/Type0":
                    continue
                descendant = font["/DescendantFonts"][0].get_object()
                descriptor = descendant["/FontDescriptor"]
                stream = descriptor.get("/FontFile2") or descriptor.get("/FontFile3")
                assert stream and len(stream.get_object().get_data()) > 0
                assert font.get("/ToUnicode")
                embedded_font_count += 1
            for operands, operator in page.get_contents().operations:
                if operator == b"BDC" and operands[0] == "/Span":
                    logical_text.append(str(operands[1]["/ActualText"]))
                if operator == b"Tm":
                    x, y = float(operands[4]), float(operands[5])
                    assert 30 <= x <= 582 and 30 <= y <= 770, (filename, x, y)
        assert embedded_font_count
        logical_text = "".join(logical_text)
        for key, text in fixture["fields"].items():
            if key != "submissionId":
                assert text in logical_text, (filename, key, text)
        extraction = subprocess.run(
            [args.pdftotext, "-layout", str(filename), "-"], check=True, capture_output=True, text=True
        )
        assert not extraction.stderr.strip(), (filename, extraction.stderr)
        normalized = re.sub(r"\s+", " ", extraction.stdout)
        # /ActualText must preserve every logical native value. A reader may add
        # bidi display controls in plain text, so do not mistake that for source
        # equality. The embedded UTF-8 original above is the exact source check.
        for clause in source["authorizationLines"] + source["privacyLines"]:
            assert re.sub(r"\s+", " ", clause) in normalized, (filename, clause)
        for page in range(1, len(reader.pages) + 1):
            assert f"Page {page} of {len(reader.pages)}" in normalized
        if args.render:
            subprocess.run(
                [args.pdftoppm, "-png", "-scale-to", "1400", str(filename), str(filename.with_suffix(""))],
                check=True,
            )
        page_count += len(reader.pages)
        print(f"PASS {fixture['name']}: {len(reader.pages)} pages, exact original fields, embedded fonts, all consent clauses")
    print(f"Verified {len(fixtures)} synthetic PDFs / {page_count} pages.")


if __name__ == "__main__":
    main()
