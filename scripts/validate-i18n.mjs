#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fingerprint,
  isLocaleIndexable,
  isLocaleReleased,
  LEGAL_SOURCE_DOCUMENT_PATHS,
  MACHINE_TRANSLATION_DISCLAIMER_VERSION,
  WAVE_ONE_LOCALES,
} from '../src/i18n/locale-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const registry = read('src/i18n/locales.json');
const review = read('src/i18n/review-status.json');
const english = read('src/i18n/locales/en.json');
const offers = read('src/config/offers.json');
const sourceFingerprint = fingerprint({ english, offers });
const sourceDocuments = Object.fromEntries(LEGAL_SOURCE_DOCUMENT_PATHS
  .map(file => [file, fingerprint(fs.readFileSync(path.join(root, file), 'utf8'))]));

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value) ? flatten(value, name) : [[name, value]];
  });
}
const source = new Map(flatten(english));
const placeholders = value => [...String(value).matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(match => match[1]).sort();
const failures = [];
// The public English promise and its translation source must change together.
// Otherwise a fee-policy edit could leave an apparently released translation stale.
const feeRefund = read('src/config/feeRefund.json');
for (const key of ['headline', 'photoHeadline', 'payment', 'condition', 'photoCondition', 'details', 'scope']) {
  if (english.feeRefund?.[key] !== feeRefund[key]) failures.push(`en: feeRefund.${key} differs from the canonical public offer`);
}
const results = [];
for (const { code, wave } of registry.locales) {
  if (wave > 1) continue;
  const file = `src/i18n/locales/${code}.json`;
  if (!fs.existsSync(path.join(root, file))) { failures.push(`${code}: missing bundle`); continue; }
  const bundle = read(file);
  const strings = new Map(flatten(bundle));
  for (const [key, value] of source) {
    const translated = strings.get(key);
    if (typeof translated !== 'string' || !translated.trim()) failures.push(`${code}: missing/empty ${key}`);
    else if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(translated))) failures.push(`${code}: placeholder mismatch at ${key}`);
    if (typeof translated === 'string' && /<\/?(?:script|iframe|a)\b/i.test(translated)) failures.push(`${code}: HTML not allowed at ${key}`);
  }
  for (const key of strings.keys()) if (!source.has(key)) failures.push(`${code}: unknown key ${key}`);
  const bundleFingerprint = fingerprint(bundle);
  const releaseContext = { sourceVersion: registry.sourceVersion, sourceFingerprint, bundleFingerprint, sourceDocuments };
  const released = isLocaleReleased(code, review, releaseContext);
  const indexable = isLocaleIndexable(code, review, releaseContext);
  const publication = review.locales[code]?.publication;
  const indexingFieldsPresent = publication && ['indexingAuthorizedBy', 'indexingAuthorizedAt', 'disclaimerVersion']
    .some(key => Object.hasOwn(publication, key));
  const ownerIndexingAttestation = publication?.basis === 'owner_authorized_machine_translation' &&
    typeof publication.indexingAuthorizedBy === 'string' && publication.indexingAuthorizedBy.trim() &&
    typeof publication.indexingAuthorizedAt === 'string' && Number.isFinite(Date.parse(publication.indexingAuthorizedAt)) &&
    publication.disclaimerVersion === MACHINE_TRANSLATION_DISCLAIMER_VERSION;
  if (review.locales[code]?.status === 'approved' && !released) failures.push(`${code}: approval is incomplete/stale or service is not ready`);
  if (review.locales[code]?.status === 'published' && !released) failures.push(`${code}: owner publication is incomplete or its source/bundle fingerprints are stale`);
  if (review.locales[code]?.status === 'published' && indexingFieldsPresent && !ownerIndexingAttestation) failures.push(`${code}: owner indexing attestation is incomplete or has the wrong disclaimer version`);
  if (review.locales[code]?.status === 'published' && indexable && !ownerIndexingAttestation) failures.push(`${code}: machine-translation indexing lacks an explicit owner disclaimer attestation`);
  if (indexable && !released) failures.push(`${code}: indexable locale must also be publicly released`);
  if (code !== 'en' && released) {
    for (const [file, hash] of Object.entries(sourceDocuments)) {
      if (review.locales[code]?.sourceDocuments?.[file] !== hash) failures.push(`${code}: English legal source changed or was not attested: ${file}`);
    }
  }
  results.push({ locale: code, strings: strings.size, state: released ? 'released' : 'draft', indexable, releaseBasis: review.locales[code]?.publication?.basis || review.locales[code]?.status, bundleFingerprint });
}
if (JSON.stringify(registry.locales.filter(item => item.wave <= 1).map(item => item.code)) !== JSON.stringify(WAVE_ONE_LOCALES)) failures.push('Wave 1 registry and route policy differ');
if (review.sourceVersion !== registry.sourceVersion) failures.push('Registry and review source versions differ');

if (process.argv.includes('--review-values')) console.log(JSON.stringify({ sourceVersion: registry.sourceVersion, sourceFingerprint, sourceDocuments, locales: results }, null, 2));
else console.log(`i18n: ${results.length} bundles, ${source.size} source strings; ${results.filter(item => item.state === 'draft').length} unpublished drafts, ${results.filter(item => item.state === 'released' && item.releaseBasis === 'owner_authorized_machine_translation').length} owner-published machine translations, ${results.filter(item => item.locale !== 'en' && item.indexable).length} indexable translations.`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('i18n coverage, placeholders and release attestations passed.');
