# Wave 1 translation review

Prepared 2026-08-30. **All non-English copy is an unapproved machine-authored draft.** No native reviewer or legal reviewer has approved these translations, and no reviewer has been hired or contacted by this task. These files must not be represented as approved translations, staffed language services, or ready-to-spend advertising destinations.

## Files and scope

`src/i18n/locales/en.json` is the shared English string contract. Each of the seven other files in that directory has the same 243 leaf keys and interpolation variables. The separate `translation-review.csv` provides one review row per key per non-English language: 1,701 rows. Blank reviewer and approval fields are intentional.

| Bundle | Intended written language | Status |
| --- | --- | --- |
| `pa.json` | Punjabi in Gurmukhi script | Draft; native and legal-adjacent review pending |
| `tl.json` | Tagalog/Filipino | Draft; native and legal-adjacent review pending |
| `zh-hans.json` | Simplified written Chinese | Draft; native and legal-adjacent review pending |
| `zh-hant.json` | Traditional written Chinese for Cantonese-reading audiences | Draft; native and legal-adjacent review pending |
| `ar.json` | Modern Standard Arabic | Draft; native and legal-adjacent review pending |
| `hi.json` | Hindi in Devanagari script | Draft; native and legal-adjacent review pending |
| `es.json` | General Spanish | Draft; native and legal-adjacent review pending |

The Traditional Chinese draft was derived from the Simplified Chinese draft using the system's Hans-to-Hant transform, followed by terminology adjustments. It needs independent review for Traditional Chinese usage and the intended Alberta audience. Written Chinese does not establish Cantonese-speaking phone support. Punjabi Gurmukhi must not be substituted for Shahmukhi; Hindi must not be substituted for Urdu script.

The bundles cover navigation, language suggestions, draft/release notices, home, Rapid Resolution, process, FAQ, contact, intake labels and basic validation, authorization, checkout, service terms, and five notification drafts. The separate Terms of Purchase document remains English: localized purchase routes provide an explicit English handoff, not a translated purchase agreement. This is a Phase 1 set, not a translation of the 1,160 content pages or every field description in the existing English components. Routes, review gates, forms, snapshots and actual email delivery have their own implementation and verification requirements.

English source references are `src/config/offers.json`, `src/pages/RapidResolution.tsx`, `src/pages/TermsOfService.tsx`, `src/components/TicketForm.tsx`, and `src/components/form-steps/{PersonalInfoStep,TicketDetailsStep,DefenseStep,ConsentStep,ReviewStep,PaymentStep}.tsx`. This translation work did not change those source terms or English pages. Localized terms are arranged in the same 16 substantive sections; the authoritative agreement remains the English Terms of Service. A compact wording must still be compared with the complete English page during review.

The current release also preserves the distinct English `src/pages/TermsOfPurchase.tsx`, covering written-order precedence, existing-order terms and fee waivers, and the separation of consent from payment authorization. The service-term drafts do not replace that document. Checkout acknowledges both English agreements and the Privacy Policy. The shared `LEGAL_SOURCE_DOCUMENT_PATHS` inventory in `src/i18n/locale-policy.mjs` requires hashes for Terms of Service, Terms of Purchase and ConsentStep before any locale can be approved; missing or changed purchase terms invalidate the approval even though their route remains an English handoff.

## Review priorities

Arrange a paid native reviewer for each written language before release. Familiarity with Canadian traffic, court and insurance terminology matters. Legal-adjacent copy also needs review by a person qualified to assess the agreement and representations being made. Native fluency alone is not evidence of legal equivalence or legal compliance. A bilingual Hindi/Urdu reviewer can later serve both languages only if competent in both scripts.

Check these meanings wherever they appear, including headings, snippets, metadata, buttons, FAQs, consent and notification templates:

- Fabsy is a traffic-ticket agent service, not a law firm; it does not provide legal advice. Translations must not describe its agents as lawyers.
- The current Rapid Resolution service is **$198 CAD plus applicable GST**, for eligible pre-trial matters. The separate report is **$49 CAD plus applicable GST** and the bundle **$229 CAD plus applicable GST**. Copy uses offer interpolation values so pricing is not independently hardcoded into language bundles.
- There is one flat service fee and no percentage-based success fee. This does not make service fees, government fines or excluded work free.
- The **48-hour** commitment begins only when disclosure is **complete, readable, received and matched to the client's file**. It covers Fabsy's review and preparation or submission of the next authorized action. It does not promise the prosecutor's response time or final-outcome timing.
- No withdrawal, charge reduction, lower fine, fewer demerits, insurance saving, insurer eligibility or other result is promised.
- No offer acceptance, guilty plea or final resolution occurs without the client's express, case-specific instruction. Payment and general authorization are not instructions to accept an offer.
- Trial representation, appeals, reopenings, extraordinary applications, Immediate Roadside Sanctions, Notices of Administrative Penalty, fines and outside-scope work remain separate or excluded. Trial work requires a separate eligibility review, agreement and quote. Preserve the official English names where an invented local equivalent could confuse a specific program.
- Disclosure requests do not extend deadlines. The client monitors deadlines and attends personally if required. Eligibility depends on the permitted scope, charge, procedure, court and portal requirements; it is not universal.
- The insurance report is a one-time consumer research and planning product. It is not an insurer quote, broker recommendation, insurance placement, application or negotiation service. Third-party record costs remain separate; insurer-specific advice comes from a licensed broker or insurer.
- Check every client responsibility, privacy term, liability limitation, cancellation/refund condition, website condition, governing-law clause and change provision against the complete English terms. A paid, otherwise complete matter declined before substantive work begins receives the applicable service-fee refund. Statutory cancellation rights are not limited.
- English terms control if translation differs, without implying that statutory rights disappear. The English-controls notice must be clear before consent or purchase, not only in the footer.

Review voice and comprehension too: use respectful plain language, keep brand names consistent, distinguish a ticket from the amount of its fine, and avoid wording that guarantees dismissal or personal representation at every hearing. Test negative forms carefully; dropping “not” from a promise or authorization reverses its meaning.

## How to record review

The CSV contains source and translation text, per-string SHA-256 digests, priority, reviewer fields, and `draft` status. Review against the rendered page as well as the row. Return corrections with the exact key, then record the reviewer, review date, decision and explanation. Never fill approval fields on someone's behalf without actual approval evidence. CSV digests identify the reviewed text; they are not proof that a review happened.

After applying corrections to the JSON bundles, regenerate the inventory with:

```sh
node scripts/generate-translation-review.mjs
```

The generator reads the Wave 1 language list from `src/i18n/locales.json` and writes the current English/translation pairs with exact UTF-8 SHA-256 digests. It preserves review status, reviewer, date, decision and notes only when the locale, key, both digests **and both text values** match the existing row. Changed or new strings become `draft` with blank reviewer, date, decision and notes; removed keys or languages are omitted. Save an older inventory separately if you need review history. A correction entered only into the CSV is not a catalog edit and cannot retain approval when regenerated: apply the correction to the JSON first, then review the new wording.

Use the read-only check in CI or before handing the CSV to a reviewer:

```sh
node scripts/generate-translation-review.mjs --check
```

It exits unsuccessfully if the inventory is absent or differs from current keys, text or hashes. It accepts equivalent CSV quoting, column order and line endings, and never changes files. Malformed CSV, duplicate locale/key rows, unexpected columns, incomplete bundles and mismatched interpolation variables fail rather than discarding review data. The default write uses UTF-8 with a BOM, quoted fields as needed, CRLF record endings and an atomic replacement. `--root /path/to/checkout` can target another checkout or a temporary fixture with the same directory layout; without it, paths are relative to this script's repository, not the terminal's working directory. This command does not approve a language or modify the application release record.

Then run `npm run test:i18n`. Check Arabic right-to-left layout with punctuation, prices, dates, email addresses, URLs and ticket numbers. Check Gurmukhi/Devanagari shaping, Chinese line breaking, mobile wrapping, keyboard navigation and screen-reader labels. The JSON deliberately contains no bidirectional override characters; direction should be handled by the page and isolated dynamic values.

The application release record is `src/i18n/review-status.json`. The implementation uses its own source and bundle fingerprints, separate from the CSV's SHA-256 digests. Follow that release workflow only after actual approval of the exact source and translated bundle, and confirmation of service capability. Do not paste CSV SHA-256 values into implementation fingerprint fields, invent a reviewer, or set `serviceReady` merely because a bundle compiles. Changing either source or translated wording requires review of the change and a refreshed release record.

## Contact and operational limits

Current written-contact copy permits an emailed question and asks the customer to confirm language assistance and response time. It does not assert real-time translation, a phone speaker, or a response-time guarantee. The WhatsApp CTA and hint are prepared only for a configured and operational channel; a translated button is not evidence of a WhatsApp service or staffing. The release record currently has no WhatsApp number and marks every non-English locale as draft with `serviceReady: false`.

`notifications.*` holds five **draft templates only**: receipt of intake details, disclosure arrival, a file update, a request for instructions, and payment receipt. No customer email, text, mailbox draft or WhatsApp message was sent or created by this work. Before any delivery integration, retain the English original, reviewed locale, template/version information, and safe interpolation of names, references and secure links. A “payment received” template must only follow a verified payment event; a “disclosure received” template must not start the 48-hour clock before completeness/readability/file matching is confirmed.

Any future free-text translation pipeline must preserve the original statement with its English translation and mark the translated version as machine-generated until reviewed. Do not overwrite names, dates, ticket numbers, amounts, negations or the original statement; uncertain translations need human clarification. Ticket OCR remains an independent English-document workflow.

Advertising variants, native-script keyword sets, live ad spend, reviewer procurement, new community outreach, WhatsApp configuration, phone staffing, Wave 2 bundles and the Phase 2 content translation pipeline are not delivered by these JSON files.
