#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const columns = [
  'locale', 'key', 'review_priority', 'source_text', 'draft_translation',
  'source_sha256', 'translation_sha256', 'status', 'reviewer_name', 'review_date', 'decision', 'notes',
];
const evidenceColumns = ['status', 'reviewer_name', 'review_date', 'decision', 'notes'];
const legalPrefixes = [
  'terms.', 'intake.consent.', 'checkout.', 'rapid.speed', 'rapid.included.', 'rapid.excluded.',
  'faq.items.', 'notifications.', 'language.englishControls', 'language.paymentBlocked',
  'language.draft', 'language.translationNote', 'common.notLawFirm', 'common.noOutcomePromise', 'common.noSuccessFee',
  'common.clientDecision', 'common.priceLine', 'home.education', 'home.scope',
  'contact.availability', 'contact.staffAvailability', 'contact.whatsapp',
  'intake.fields.smsOptIn', 'intake.review.languageNote',
  'insuranceContext.', 'proDriver.', 'feeRefund.',
];
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const rowId = row => JSON.stringify([row.locale, row.key]);
const hasEvidence = row => row.status !== 'draft' || evidenceColumns.slice(1).some(key => row[key]);

/** RFC 4180 fields, including quoted commas, escaped quotes and embedded newlines. */
export function parseCsv(text) {
  const records = [];
  let row = [], field = '', quoted = false, closedQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') { field += '"'; index += 1; }
      else { quoted = false; closedQuote = true; }
    } else if (char === ',' || char === '\r' || char === '\n') {
      row.push(field); field = ''; closedQuote = false;
      if (char !== ',') {
        records.push(row); row = [];
        if (char === '\r' && text[index + 1] === '\n') index += 1;
      }
    } else if (char === '"' && !field && !closedQuote) quoted = true;
    else {
      if (closedQuote || char === '"') throw new Error('Malformed CSV: unexpected text around a quoted field.');
      field += char;
    }
  }
  if (quoted) throw new Error('Malformed CSV: unclosed quoted field.');
  if (row.length || field || closedQuote) records.push([...row, field]);
  const header = records.shift();
  if (!header || header.length !== columns.length || new Set(header).size !== columns.length || columns.some(key => !header.includes(key))) {
    throw new Error('Review CSV has missing, duplicate or unexpected columns; refusing to discard data.');
  }
  const seen = new Set();
  return records.filter(record => !(record.length === 1 && record[0] === '')).map(record => {
    if (record.length !== header.length) throw new Error('Malformed CSV: inconsistent column count.');
    const entry = Object.fromEntries(header.map((key, index) => [key, record[index]]));
    if (!entry.locale || !entry.key || seen.has(rowId(entry))) throw new Error('Review CSV contains an empty or duplicate locale/key.');
    seen.add(rowId(entry));
    return entry;
  });
}

export function serializeCsv(rows) {
  const escape = value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return '\uFEFF' + [columns, ...rows.map(row => columns.map(key => row[key]))]
    .map(record => record.map(escape).join(',')).join('\r\n') + '\r\n';
}

function flatten(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected an object at ${prefix || 'bundle root'}.`);
  return Object.entries(value).flatMap(([key, text]) => {
    if (!key || key.includes('.')) throw new Error(`Unsupported bundle key: ${prefix}${key}`);
    const name = `${prefix}${key}`;
    if (text && typeof text === 'object' && !Array.isArray(text)) return flatten(text, `${name}.`);
    if (typeof text !== 'string' || !text.trim()) throw new Error(`Missing or non-string translation: ${name}`);
    return [[name, text]];
  });
}

export function generateReview(root = projectRoot, check = false) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const locales = read('src/i18n/locales.json').locales.filter(locale => locale.wave === 1).map(locale => locale.code);
  if (!locales.length || new Set(locales).size !== locales.length || locales.some(code => typeof code !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) || code === 'en')) {
    throw new Error('Invalid or empty Wave 1 locale registry.');
  }
  const source = new Map(flatten(read('src/i18n/locales/en.json')));
  if (!source.size) throw new Error('The English source bundle is empty.');
  const output = path.join(root, 'docs/multilingual/translation-review.csv');
  const existing = fs.existsSync(output) ? parseCsv(fs.readFileSync(output, 'utf8')) : [];
  const prior = new Map(existing.map(row => [rowId(row), row]));
  const placeholders = text => JSON.stringify([...text.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(match => match[1]).sort());
  let preserved = 0, invalidated = 0;
  const rows = locales.flatMap(locale => {
    const bundle = new Map(flatten(read(`src/i18n/locales/${locale}.json`)));
    if (bundle.size !== source.size || [...source.keys()].some(key => !bundle.has(key))) throw new Error(`${locale}: source and translation key sets differ.`);
    return [...source].map(([key, english]) => {
      const translation = bundle.get(key);
      if (placeholders(english) !== placeholders(translation)) throw new Error(`${locale}: interpolation variables differ at ${key}.`);
      const row = {
        locale, key, review_priority: legalPrefixes.some(prefix => key.startsWith(prefix)) ? 'legal-adjacent' : 'language-and-usability',
        source_text: english, draft_translation: translation,
        source_sha256: sha256(english), translation_sha256: sha256(translation),
        status: 'draft', reviewer_name: '', review_date: '', decision: '', notes: '',
      };
      const previous = prior.get(rowId(row));
      // Verify the actual reviewed text too: editing a CSV cell without updating
      // its stored digest must never make that edited wording appear approved.
      const unchanged = previous && ['source_sha256', 'translation_sha256', 'source_text', 'draft_translation'].every(column => previous[column] === row[column]);
      if (unchanged) {
        for (const column of evidenceColumns) row[column] = previous[column];
        if (hasEvidence(previous)) preserved += 1;
      } else if (previous && hasEvidence(previous)) invalidated += 1;
      return row;
    });
  });
  const current = existing.length === rows.length && rows.every(row => {
    const previous = prior.get(rowId(row));
    return previous && columns.every(column => previous[column] === row[column]);
  });
  if (check) {
    if (!current) throw new Error('Translation review CSV is missing or stale. Run node scripts/generate-translation-review.mjs to refresh it.');
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.tmp-${randomUUID()}`;
    try {
      fs.writeFileSync(temporary, serializeCsv(rows), { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporary, output);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  return { rows: rows.length, strings: source.size, locales: locales.length, preserved, invalidated, current };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let root = projectRoot, check = false;
    for (let index = 2; index < process.argv.length; index += 1) {
      const argument = process.argv[index];
      if (argument === '--check') check = true;
      else if (argument === '--root' && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) root = path.resolve(process.argv[++index]);
      else if (argument === '--help') {
        console.log('Usage: node scripts/generate-translation-review.mjs [--check] [--root <repository>]');
        process.exit(0);
      } else throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    const result = generateReview(root, check);
    console.log(`Translation review CSV ${check ? 'is current' : 'generated'}: ${result.rows} rows (${result.strings} strings × ${result.locales} languages); ${result.preserved} evidence rows preserved, ${result.invalidated} reset to draft.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
