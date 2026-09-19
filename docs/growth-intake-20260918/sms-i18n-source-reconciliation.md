# SMS privacy-source reconciliation

The September 18 SMS connector release changes the English Privacy Policy to describe incoming SMS, AI replies, the staff inbox and internal notification email, channel opt-outs, secure-document boundaries, and database/provider retention. The frozen source was checked against the SMS implementation and migration contracts before deliberately updating its exact-source publication record.

Only `src/pages/PrivacyPolicy.tsx` changed in the localization gate's nine-file legal-source inventory: `fnv1a-340fa157` becomes `fnv1a-09ab4088`. `src/i18n/review-status.json` updates that one source-document field for each of the seven previously published machine translations. The existing authorization for those languages and the current connector implementation remains the basis for this release; no new native or legal reviewer, approval date, owner identity, indexing authorization or staffed-language claim is recorded.

The aggregate English catalog/offer fingerprint, every translated bundle fingerprint, the other eight legal-source hashes, publication provenance, null reviewer fields and `serviceReady: false` are unchanged. All eight catalogs remain at 268 keys; the 1,876-row translation review CSV is already current and is not regenerated or marked approved.

`/privacy-policy` continues to be the canonical English page. The English `/contact` page's phone/SMS links do not modify the separate localized contact component or its translated email-first wording. This bounded reconciliation does not claim that the new SMS disclosure or contact CTA was translated. It preserves the existing translated intake and public-information release while including the reviewed English privacy disclosure in its exact-source record.

Validation: full `npm run test:i18n` checks catalog coverage, placeholders, release/source drift, review inventory, locale SEO and the mounted public-language flow. No build gate or source inventory is weakened, and builds do not refresh publication hashes automatically.
