#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(SCRIPT_DIR, 'insurer-rules-template.csv');
const EXPECTED_HEADERS = [
  'carrier_name',
  'conviction_class',
  'threshold_count',
  'behavior',
  'surcharge_note',
  'forgiveness_product',
  'forgiveness_note',
  'phone',
  'quote_url',
  'source_publisher',
  'source_title',
  'source_url',
  'last_verified',
  'estimate_min_percent',
  'estimate_max_percent',
  'estimate_source_publisher',
  'estimate_source_title',
  'estimate_source_url',
  'estimate_last_verified',
  'active',
];
const CONVICTION_CLASSES = new Set(['minor', 'major', 'serious']);
const BEHAVIORS = new Set(['no_surcharge', 'surcharge', 'decline']);

function usage() {
  console.log('Usage: node scripts/import-insurer-rules.mjs [--file path.csv] [--dry-run]');
}

function parseArgs(args) {
  let filePath = DEFAULT_FILE;
  let dryRun = false;
  let positionalFile = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (arg === '--file') {
      const next = args[index + 1];
      if (!next) throw new Error('--file requires a path.');
      filePath = next;
      index += 1;
    } else if (arg.startsWith('--file=')) {
      filePath = arg.slice('--file='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!positionalFile) {
      positionalFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (positionalFile) filePath = positionalFile;
  return { filePath: path.resolve(filePath), dryRun };
}

function parseCsv(source) {
  const text = source.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const finishRow = () => {
    row.push(field);
    field = '';
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length > 0) throw new Error('Invalid quote in an unquoted CSV field.');
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      finishRow();
    } else if (char === '\r') {
      if (text[index + 1] === '\n') index += 1;
      finishRow();
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length > 0 || row.length > 0) finishRow();
  return rows;
}

function validateHeaders(headers) {
  const normalized = headers.map((value) => value.trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('CSV header contains duplicate columns.');
  }

  const missing = EXPECTED_HEADERS.filter((header) => !normalized.includes(header));
  const unexpected = normalized.filter((header) => !EXPECTED_HEADERS.includes(header));
  if (missing.length || unexpected.length) {
    const details = [];
    if (missing.length) details.push(`missing: ${missing.join(', ')}`);
    if (unexpected.length) details.push(`unexpected: ${unexpected.join(', ')}`);
    throw new Error(`CSV header does not match the insurer_rules schema (${details.join('; ')}).`);
  }
  return normalized;
}

function required(value, field, rowNumber) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Row ${rowNumber}: ${field} is required.`);
  return normalized;
}

function optional(value) {
  const normalized = value.trim();
  return normalized || null;
}

function parseOptionalPhone(value, rowNumber) {
  const normalized = optional(value);
  if (!normalized) return null;
  if (!/^\+?[0-9][0-9().\s-]{6,24}(?:\s*(?:x|ext\.?)\s*\d{1,6})?$/i.test(normalized)) {
    throw new Error(`Row ${rowNumber}: phone must be a valid public contact number.`);
  }
  return normalized;
}

function parseBoolean(value, field, rowNumber) {
  const normalized = required(value, field, rowNumber).toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Row ${rowNumber}: ${field} must be true or false.`);
}

function parseInteger(value, field, rowNumber) {
  const normalized = required(value, field, rowNumber);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Row ${rowNumber}: ${field} must be a non-negative integer.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Row ${rowNumber}: ${field} is outside the supported integer range.`);
  }
  return parsed;
}

function parseHttpsUrl(value, field, rowNumber) {
  const normalized = required(value, field, rowNumber);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Row ${rowNumber}: ${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Row ${rowNumber}: ${field} must be a public HTTPS URL without credentials.`);
  }
  return parsed.toString();
}

function parseOptionalHttpsUrl(value, field, rowNumber) {
  const normalized = value.trim();
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Row ${rowNumber}: ${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Row ${rowNumber}: ${field} must be a public HTTPS URL without credentials.`);
  }
  return parsed.toString();
}

function parseIsoDate(value, field, rowNumber) {
  const normalized = required(value, field, rowNumber);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`Row ${rowNumber}: ${field} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`Row ${rowNumber}: ${field} is not a valid calendar date.`);
  }
  if (normalized > new Date().toISOString().slice(0, 10)) {
    throw new Error(`Row ${rowNumber}: ${field} cannot be in the future.`);
  }
  return normalized;
}

function parseNonNegativeNumber(value, field, rowNumber) {
  const normalized = required(value, field, rowNumber);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Row ${rowNumber}: ${field} must be a non-negative number.`);
  }
  return parsed;
}

function validateRows(csvRows) {
  if (csvRows.length === 0) throw new Error('CSV is empty and has no header row.');
  const headers = validateHeaders(csvRows[0]);
  const records = [];
  const conflictKeys = new Set();

  for (let index = 1; index < csvRows.length; index += 1) {
    const values = csvRows[index];
    const rowNumber = index + 1;
    if (values.length !== headers.length) {
      throw new Error(`Row ${rowNumber}: expected ${headers.length} fields, found ${values.length}.`);
    }

    const raw = Object.fromEntries(headers.map((header, fieldIndex) => [header, values[fieldIndex]]));
    if (Object.values(raw).some((value) => value.includes('\u2014'))) {
      throw new Error(`Row ${rowNumber}: em dash characters are not allowed.`);
    }

    const convictionClass = required(raw.conviction_class, 'conviction_class', rowNumber).toLowerCase();
    if (!CONVICTION_CLASSES.has(convictionClass)) {
      throw new Error(`Row ${rowNumber}: conviction_class must be minor, major, or serious.`);
    }

    const behavior = required(raw.behavior, 'behavior', rowNumber).toLowerCase();
    if (!BEHAVIORS.has(behavior)) {
      throw new Error(`Row ${rowNumber}: behavior must be no_surcharge, surcharge, or decline.`);
    }

    const estimateFields = [
      'estimate_min_percent',
      'estimate_max_percent',
      'estimate_source_publisher',
      'estimate_source_title',
      'estimate_source_url',
      'estimate_last_verified',
    ];
    const hasEstimate = estimateFields.some((field) => raw[field].trim() !== '');
    if (hasEstimate) {
      const missingEstimateFields = estimateFields.filter((field) => raw[field].trim() === '');
      if (missingEstimateFields.length > 0) {
        throw new Error(
          `Row ${rowNumber}: a premium estimate requires all estimate fields (missing: ${missingEstimateFields.join(', ')}).`,
        );
      }
    }

    const estimateMinimum = hasEstimate
      ? parseNonNegativeNumber(raw.estimate_min_percent, 'estimate_min_percent', rowNumber)
      : null;
    const estimateMaximum = hasEstimate
      ? parseNonNegativeNumber(raw.estimate_max_percent, 'estimate_max_percent', rowNumber)
      : null;
    if (estimateMinimum !== null && estimateMaximum !== null && estimateMaximum < estimateMinimum) {
      throw new Error(`Row ${rowNumber}: estimate_max_percent must be at least estimate_min_percent.`);
    }

    const record = {
      carrier_name: required(raw.carrier_name, 'carrier_name', rowNumber),
      conviction_class: convictionClass,
      threshold_count: parseInteger(raw.threshold_count, 'threshold_count', rowNumber),
      behavior,
      surcharge_note: optional(raw.surcharge_note),
      forgiveness_product: parseBoolean(raw.forgiveness_product, 'forgiveness_product', rowNumber),
      forgiveness_note: optional(raw.forgiveness_note),
      phone: parseOptionalPhone(raw.phone, rowNumber),
      quote_url: parseOptionalHttpsUrl(raw.quote_url, 'quote_url', rowNumber),
      source_publisher: required(raw.source_publisher, 'source_publisher', rowNumber),
      source_title: required(raw.source_title, 'source_title', rowNumber),
      source_url: parseHttpsUrl(raw.source_url, 'source_url', rowNumber),
      last_verified: parseIsoDate(raw.last_verified, 'last_verified', rowNumber),
      estimate_min_percent: estimateMinimum,
      estimate_max_percent: estimateMaximum,
      estimate_source_publisher: hasEstimate
        ? required(raw.estimate_source_publisher, 'estimate_source_publisher', rowNumber)
        : null,
      estimate_source_title: hasEstimate
        ? required(raw.estimate_source_title, 'estimate_source_title', rowNumber)
        : null,
      estimate_source_url: hasEstimate
        ? parseHttpsUrl(raw.estimate_source_url, 'estimate_source_url', rowNumber)
        : null,
      estimate_last_verified: hasEstimate
        ? parseIsoDate(raw.estimate_last_verified, 'estimate_last_verified', rowNumber)
        : null,
      active: parseBoolean(raw.active, 'active', rowNumber),
    };

    const conflictKey = [
      record.carrier_name.toLowerCase(),
      record.conviction_class,
      record.threshold_count,
      record.source_url,
    ].join('|');
    if (conflictKeys.has(conflictKey)) {
      throw new Error(`Row ${rowNumber}: duplicate insurer rule in the same CSV.`);
    }
    conflictKeys.add(conflictKey);
    records.push(record);
  }

  return records;
}

async function importRows(records) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for import.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const chunkSize = 200;
  let imported = 0;

  for (let offset = 0; offset < records.length; offset += chunkSize) {
    const chunk = records.slice(offset, offset + chunkSize);
    const { data, error } = await supabase
      .from('insurer_rules')
      .upsert(chunk, {
        onConflict: 'carrier_name,conviction_class,threshold_count,source_url',
      })
      .select('id');
    if (error) throw error;
    if ((data || []).length !== chunk.length) {
      throw new Error(`Import verification failed at CSV row ${offset + 2}.`);
    }
    imported += chunk.length;
  }

  return imported;
}

async function main() {
  const { filePath, dryRun } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(filePath)) throw new Error(`CSV file not found: ${filePath}`);
  const records = validateRows(parseCsv(fs.readFileSync(filePath, 'utf8')));
  console.log(`Validated ${records.length} insurer rule row(s) from ${filePath}.`);

  if (dryRun) {
    console.log('Dry run complete. No database changes were made.');
    return;
  }
  if (records.length === 0) {
    console.log('The template contains no data rows. No database changes were made.');
    return;
  }

  const imported = await importRows(records);
  console.log(`Imported ${imported} insurer rule row(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
