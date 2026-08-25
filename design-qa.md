# Fabsy unified ticket intake — design QA

- visual target: `/Users/brettbilon/.codex/visualizations/2026/08/25/01a0395c-182c-7893-be46-f8f86d7dc4e4/fabsy-intake-audit/02-upload-step.png`
- local preview: `http://127.0.0.1:8080/`
- comparison viewport: 1265 × 712
- responsive viewport: 390 × 844
- comparison artifact: `/tmp/fabsy-design-comparison.png`
- desktop capture: `/tmp/fabsy-unified-modal.png`
- mobile capture: `/tmp/fabsy-service-choice-mobile.png`

## Visual comparison

The restored experience retains the source Fabsy visual language: white cards, blue primary actions, dashed upload boundary, familiar spacing, typography, header and icon treatment. The old single ambiguous drop zone is now a focused Free Ticket Review modal with explicit **Choose File** and **Take Photo** actions. This preserves the original capture affordance while making camera use and the free/paid boundary clearer.

The connected four-step intake uses the existing Fabsy card, badge, progress, form and responsive-grid patterns. At 390 px, the document flow and service cards stack without horizontal overflow (`innerWidth = scrollWidth = 390`).

## Interaction QA

- Homepage Free Ticket Review opens the capture modal.
- Browse and camera controls are separately accessible.
- Camera inputs use `capture="environment"`.
- Ticket inputs accept PDF, JPEG, PNG, WebP, HEIC and HEIF, with a 10 MB limit.
- PDF selection retains the source file and clearly states that manual review will be used instead of OCR.
- Policy-document step accepts 1–5 files and exposes separate browse/camera controls.
- Policy selection persists visibly after the browser file chooser closes.
- Signed limited review consent is separate from representation authority.
- Product choice exposes distinct `$149` Priority Review and `$488` Full Representation actions.
- Browser console contained no application errors; only existing React Router v7 future-flag notices.

final result: passed
