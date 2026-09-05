#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,127}$/;
const ACTOR_ID = /^[a-z0-9][a-z0-9._:@/-]{2,127}$/;
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const CANONICAL_PRODUCTION_ORIGIN = 'https://fabsy.ca';
const APPROVED_PAID_LANDING_PATHS = new Set(['/rapid-resolution']);
const REVIEWED_PROVIDER_DESTINATIONS = Object.freeze({
  meta: Object.freeze({
    source: 'meta',
    medium: 'paid_social',
    requiredKeys: Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']),
    campaignContent: Object.freeze({
      rr_ab_en_creative_20260831: Object.freeze([
        'rr_relief_v1',
        'rr_flat_fee_v1',
        'rr_client_control_v1',
      ]),
    }),
    term: null,
  }),
  google: Object.freeze({
    source: 'google',
    medium: 'cpc',
    requiredKeys: Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']),
    campaignContent: Object.freeze({
      'rr-pilot-calgary-202608': Object.freeze(['{adgroupid}_{creative}']),
      'rr-pilot-edmonton-202608': Object.freeze(['{adgroupid}_{creative}']),
      'rr-pilot-alberta-202608': Object.freeze(['{adgroupid}_{creative}']),
    }),
    term: '{keyword}',
  }),
});
const REQUIRED_GATES = Object.freeze(Array.from({ length: 21 }, (_, index) => index + 1));
const GATE_STATUSES = new Set([
  'PASS',
  'OWNER_INPUT',
  'LOCAL_PASS_PRODUCTION_OPEN',
  'LOCAL_PARTIAL_PRODUCTION_OPEN',
  'PRODUCTION_OPEN',
  'BLOCKED',
]);
export const EXPECTED_MIGRATIONS = Object.freeze([
  '20260903120000_ticket_intake_drafts.sql',
  '20260903170000_paid_funnel_measurement.sql',
  '20260903173000_paid_funnel_reporting.sql',
  '20260903180000_ticket_intake_resume_delivery.sql',
  '20260903181000_ticket_intake_draft_cleanup.sql',
  '20260903182000_ticket_intake_rotation_recovery.sql',
  '20260903183000_paid_funnel_checkout_withdrawal_fence.sql',
  '20260903184000_paid_payment_refund_ledger.sql',
  '20260903185000_paid_payment_reporting.sql',
  '20260903190000_ticket_intake_object_deletion_queue.sql',
  '20260903191000_ticket_intake_converted_retention.sql',
  '20260903192000_ticket_intake_delivery_abuse_controls.sql',
  '20260903193000_ticket_submission_notification_idempotency.sql',
  '20260903194000_ticket_intake_staff_follow_up.sql',
]);
export const EXPECTED_CORE_FUNCTIONS = Object.freeze([
  'cache-ticket-data',
  'ticket-intake-draft',
  'submit-ticket',
  'cleanup-ticket-intake-drafts',
  'withdraw-meta-measurement',
  'record-funnel-event',
  'paid-funnel-report',
  'send-notification',
]);
export const EXPECTED_SEPARATE_FUNCTIONS = Object.freeze([
  'idr-payment-webhook',
  'create-payment',
]);
export const EXPECTED_SHARED_FUNCTION_FILES = Object.freeze([
  'supabase/functions/_shared/email-signature.ts',
  'supabase/functions/_shared/funnel-checkout.ts',
  'supabase/functions/_shared/funnel-measurement.ts',
  'supabase/functions/_shared/funnel-report.ts',
  'supabase/functions/_shared/locale-policy.ts',
  'supabase/functions/_shared/meta-capi.ts',
  'supabase/functions/_shared/meta-purchase.ts',
  'supabase/functions/_shared/notification-locale.ts',
  'supabase/functions/_shared/paid-payment-ledger.ts',
  'supabase/functions/_shared/photo-radar.ts',
  'supabase/functions/_shared/pro-licence.ts',
  'supabase/functions/_shared/pro-pricing.ts',
  'supabase/functions/_shared/pro-refund.ts',
  'supabase/functions/_shared/product-locale.ts',
  'supabase/functions/_shared/referrals.ts',
  'supabase/functions/_shared/resend-email.ts',
  'supabase/functions/_shared/submission-violation.ts',
  'supabase/functions/_shared/ticket-intake-draft-cleanup.ts',
  'supabase/functions/_shared/ticket-intake-draft.ts',
  'supabase/functions/_shared/ticket-intake-resume-delivery.ts',
  'supabase/functions/_shared/ticket-notification-html.ts',
]);
export const EXPECTED_TRUSTED_IP_FUNCTIONS = Object.freeze([
  'ticket-intake-draft',
  'record-funnel-event',
  'submit-ticket',
]);
const REVIEWED_PROVIDER_OPTIMIZATION = Object.freeze({
  meta: Object.freeze({ SALES: Object.freeze(['PURCHASE']) }),
  google: Object.freeze({ SALES: Object.freeze(['PURCHASE']) }),
});
const RELEASE_CRITICAL_PATHS = Object.freeze([
  '.github/workflows',
  'components.json',
  'deno.lock',
  'index.html',
  'package.json',
  'package-lock.json',
  'postcss.config.js',
  'public',
  'scripts',
  'src',
  'supabase',
  'tailwind.config.ts',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
]);
const NEGATIVE_EVIDENCE_VERDICTS = new Set(['BLOCKED', 'ERROR', 'FAIL', 'FAILED', 'FAILURE', 'NO_GO']);
const MONEY_TOLERANCE = 0.011;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_GO_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegative(value) {
  return finiteNumber(value) && value >= 0;
}

function rate(value) {
  return finiteNumber(value) && value >= 0 && value <= 1;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validHttpsUrl(value) {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function canonicalPaidLandingUrl(value, allowQuery = false) {
  if (!validHttpsUrl(value) || value !== value.trim() || value.includes('#') || (!allowQuery && value.includes('?'))) return null;
  const url = new URL(value);
  if (url.origin !== CANONICAL_PRODUCTION_ORIGIN ||
      !APPROVED_PAID_LANDING_PATHS.has(url.pathname) ||
      url.hash || (!allowQuery && url.search)) return null;
  const queryIndex = value.indexOf('?');
  const rawBase = queryIndex === -1 ? value : value.slice(0, queryIndex);
  if (rawBase !== `${CANONICAL_PRODUCTION_ORIGIN}${url.pathname}`) return null;
  return url;
}

function reviewedProviderDestination(value, platform) {
  const url = canonicalPaidLandingUrl(value, true);
  if (!url) return { error: 'must use the exact canonical https://fabsy.ca/rapid-resolution origin and path without a fragment' };
  const contract = Object.prototype.hasOwnProperty.call(REVIEWED_PROVIDER_DESTINATIONS, platform)
    ? REVIEWED_PROVIDER_DESTINATIONS[platform]
    : null;
  if (!contract) return { error: 'cannot be validated without an explicit reviewed platform contract' };
  const queryIndex = value.indexOf('?');
  if (queryIndex === -1 || queryIndex === value.length - 1) {
    return { error: `must include the reviewed ${platform} UTM query` };
  }
  const rawQuery = value.slice(queryIndex + 1);
  if (rawQuery.includes('%') || rawQuery.includes('\\') || /[^\x20-\x7e]/.test(rawQuery)) {
    return { error: 'must not contain encoded, backslash, or non-ASCII query components' };
  }
  const values = new Map();
  for (const component of rawQuery.split('&')) {
    const equals = component.indexOf('=');
    if (equals <= 0 || equals !== component.lastIndexOf('=') || equals === component.length - 1) {
      return { error: 'must contain only non-empty key=value UTM components' };
    }
    const key = component.slice(0, equals);
    const rawValue = component.slice(equals + 1);
    if (values.has(key)) return { error: `must not repeat query parameter ${key}` };
    values.set(key, rawValue);
  }
  if (!sameStringArray([...values.keys()].sort(), [...contract.requiredKeys].sort())) {
    return { error: `must contain exactly ${contract.requiredKeys.join(', ')} and no other query parameters` };
  }
  if (values.get('utm_source') !== contract.source || values.get('utm_medium') !== contract.medium) {
    return { error: `must use utm_source=${contract.source} and utm_medium=${contract.medium}` };
  }
  const campaign = values.get('utm_campaign');
  const content = values.get('utm_content');
  const allowedContent = Object.prototype.hasOwnProperty.call(contract.campaignContent, campaign)
    ? contract.campaignContent[campaign]
    : null;
  if (!allowedContent || !allowedContent.includes(content)) {
    return { error: `must use a reviewed ${platform} utm_campaign/utm_content pair` };
  }
  if (contract.term !== null && values.get('utm_term') !== contract.term) {
    return { error: `must use the reviewed ${platform} utm_term=${contract.term}` };
  }
  return { url, pair: `${campaign}\0${content}` };
}

function canonicalProductionBundleUrl(value) {
  if (!nonEmpty(value) || value !== value.trim() || value.includes('..') ||
      !/^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.js$/.test(value)) return null;
  try {
    const url = new URL(value, `${CANONICAL_PRODUCTION_ORIGIN}/`);
    if (url.origin !== CANONICAL_PRODUCTION_ORIGIN || url.pathname !== value ||
        url.search || url.hash || url.href !== `${CANONICAL_PRODUCTION_ORIGIN}${value}`) return null;
    return url;
  } catch {
    return null;
  }
}

function closeMoney(actual, expected) {
  return finiteNumber(actual) && Math.abs(actual - expected) < MONEY_TOLERANCE;
}

function normalizeActor(value) {
  return nonEmpty(value)
    ? value.normalize('NFKC').toLocaleLowerCase('en-CA').replace(/[^\p{L}\p{N}]+/gu, '')
    : '';
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameStringArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function safeRelativePath(value) {
  if (!nonEmpty(value) || path.isAbsolute(value) || value.includes('\0')) return false;
  const slashPath = value.replaceAll('\\', '/');
  const normalized = path.posix.normalize(slashPath);
  return normalized !== '..' && !normalized.startsWith('../') && normalized === slashPath;
}

function resolveRepositoryFile(root, relativePath) {
  if (!safeRelativePath(relativePath)) return null;
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  try {
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const real = fs.realpathSync(resolved);
    const realRelative = path.relative(fs.realpathSync(root), real);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function commitExists(root, commit) {
  try {
    execFileSync('git', ['-C', root, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function resolveGitRef(root, ref) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${ref}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function gitRefIsAnnotatedTag(root, ref) {
  try {
    return execFileSync('git', ['-C', root, 'cat-file', '-t', ref], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() === 'tag';
  } catch {
    return false;
  }
}

function commitIsAncestorOfHead(root, commit) {
  return commitIsAncestor(root, commit, 'HEAD');
}

function commitIsAncestor(root, commit, descendant) {
  try {
    execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', commit, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isTrackedFile(root, relativePath) {
  try {
    execFileSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', relativePath], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function trackedFileMatchesHead(root, relativePath) {
  if (!isTrackedFile(root, relativePath)) return false;
  try {
    execFileSync('git', ['-C', root, 'diff', '--quiet', 'HEAD', '--', relativePath], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function regularTrackedFilesAtCommit(root, commit, relativePaths) {
  if (!COMMIT.test(commit || '') || relativePaths.some(relativePath => !safeRelativePath(relativePath))) return null;
  try {
    const output = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--full-tree', commit, '--', ...relativePaths], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(output.split(/\r?\n/).filter(Boolean).flatMap(line => {
      const match = line.match(/^(?:100644|100755) blob [0-9a-f]{40}\t(.+)$/);
      return match ? [match[1]] : [];
    }));
  } catch {
    return null;
  }
}

function changedTrackedPaths(root, from, to, relativePaths) {
  try {
    const revisions = to ? [from, to] : [from];
    const output = execFileSync('git', ['-C', root, 'diff', '--name-only', ...revisions, '--', ...relativePaths], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(output.split(/\r?\n/).filter(Boolean));
  } catch {
    return null;
  }
}

function repositoryStatus(root) {
  try {
    return execFileSync('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function regularFilesRecursively(root, directory) {
  const realRoot = fs.realpathSync(root);
  const files = [];
  const invalid = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      // Use the lexical path until after lstat. Calling realpath first follows a
      // symlink and throws for a broken link instead of reporting an integrity
      // failure through the validator.
      const relative = path.relative(realRoot, absolute).replaceAll(path.sep, '/');
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        invalid.push(relative);
      } else if (stat.isDirectory()) {
        visit(absolute);
      } else if (stat.isFile()) {
        files.push(relative);
      } else {
        invalid.push(relative);
      }
    }
  };
  visit(directory);
  return { files: files.sort(), invalid: invalid.sort() };
}

function explicitNegativeEvidence(value, location = '$') {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const result = explicitNegativeEvidence(item, `${location}[${index}]`);
      if (result) return result;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    const itemLocation = `${location}.${key}`;
    if (['result', 'status', 'decision', 'verdict', 'conclusion'].includes(key) && typeof item === 'string') {
      const normalizedVerdict = item.trim().toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (NEGATIVE_EVIDENCE_VERDICTS.has(normalizedVerdict)) {
        return `${itemLocation}=${JSON.stringify(item)}`;
      }
    }
    if (['passed', 'ready', 'success'].includes(key) && item === false) {
      return `${itemLocation}=false`;
    }
    const nested = explicitNegativeEvidence(item, itemLocation);
    if (nested) return nested;
  }
  return null;
}

function exactKeys(value, keys, label, fail) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object.`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!sameStringArray(actual, expected)) {
    const missing = expected.filter(key => !actual.includes(key));
    const extra = actual.filter(key => !expected.includes(key));
    fail(`${label} keys do not match schema${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; unexpected ${extra.join(', ')}` : ''}.`);
    return false;
  }
  return true;
}

/** Parse JSON while rejecting duplicate keys at any nesting level. */
export function parseJsonWithoutDuplicateKeys(source) {
  let cursor = 0;
  const duplicates = [];
  const whitespace = () => {
    while (/\s/.test(source[cursor] || '')) cursor += 1;
  };
  const parseStringToken = () => {
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2;
      } else if (source[cursor] === '"') {
        cursor += 1;
        return JSON.parse(source.slice(start, cursor));
      } else {
        cursor += 1;
      }
    }
    throw new SyntaxError('Unterminated JSON string.');
  };
  const parseValue = location => {
    whitespace();
    const token = source[cursor];
    if (token === '{') return parseObject(location);
    if (token === '[') return parseArray(location);
    if (token === '"') return parseStringToken();
    const remainder = source.slice(cursor);
    const primitive = remainder.match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!primitive) throw new SyntaxError(`Invalid JSON value at offset ${cursor}.`);
    cursor += primitive[0].length;
    return null;
  };
  const parseObject = location => {
    cursor += 1;
    whitespace();
    const seen = new Set();
    if (source[cursor] === '}') {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      whitespace();
      if (source[cursor] !== '"') throw new SyntaxError(`Expected an object key at offset ${cursor}.`);
      const key = parseStringToken();
      const keyLocation = location ? `${location}.${key}` : key;
      if (seen.has(key)) duplicates.push(keyLocation);
      seen.add(key);
      whitespace();
      if (source[cursor] !== ':') throw new SyntaxError(`Expected ':' at offset ${cursor}.`);
      cursor += 1;
      parseValue(keyLocation);
      whitespace();
      if (source[cursor] === '}') {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ',') throw new SyntaxError(`Expected ',' at offset ${cursor}.`);
      cursor += 1;
    }
    throw new SyntaxError('Unterminated JSON object.');
  };
  const parseArray = location => {
    cursor += 1;
    whitespace();
    if (source[cursor] === ']') {
      cursor += 1;
      return;
    }
    let index = 0;
    while (cursor < source.length) {
      parseValue(`${location}[${index}]`);
      index += 1;
      whitespace();
      if (source[cursor] === ']') {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ',') throw new SyntaxError(`Expected ',' at offset ${cursor}.`);
      cursor += 1;
    }
    throw new SyntaxError('Unterminated JSON array.');
  };

  parseValue('');
  whitespace();
  if (cursor !== source.length) throw new SyntaxError(`Unexpected JSON content at offset ${cursor}.`);
  if (duplicates.length) throw new SyntaxError(`Duplicate JSON key${duplicates.length === 1 ? '' : 's'}: ${duplicates.join(', ')}.`);
  return JSON.parse(source);
}

export function calculateAcquisitionLimits(economics) {
  if (!isPlainObject(economics)) return null;
  const {
    priceCad,
    paymentFeesCad,
    fulfillmentCostCad,
    refundRate,
    supportCostCad,
    requiredContributionCad,
    qualifiedLeadToPaidRate,
    plannedLandingToPurchaseRate,
    observedClickToLandingRate,
  } = economics;
  if (![priceCad, paymentFeesCad, fulfillmentCostCad, supportCostCad, requiredContributionCad]
    .every(nonNegative) || ![refundRate, qualifiedLeadToPaidRate, plannedLandingToPurchaseRate, observedClickToLandingRate]
    .every(rate)) return null;

  const maximumCacCad = priceCad - paymentFeesCad - fulfillmentCostCad -
    (priceCad * refundRate) - supportCostCad - requiredContributionCad;
  return {
    maximumCacCad,
    maximumCplCad: maximumCacCad * qualifiedLeadToPaidRate,
    breakEvenCpcCad: maximumCacCad * plannedLandingToPurchaseRate * observedClickToLandingRate,
  };
}

export function evaluatePaidAcquisitionReadiness(record, options = {}) {
  const schemaFailures = [];
  const integrityFailures = [];
  const readinessFailures = [];
  const failSchema = message => schemaFailures.push(message);
  const failIntegrity = message => integrityFailures.push(message);
  const fail = message => readinessFailures.push(message);
  const root = path.resolve(options.root || ROOT);
  const parsedNow = options.now instanceof Date ? options.now.getTime() :
    typeof options.now === 'number' ? options.now :
      nonEmpty(options.now) ? Date.parse(options.now) : Date.now();
  const now = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const isGo = record?.decision === 'GO';
  const referencedEvidence = [];
  const referencedEvidencePaths = new Set();

  if (!isPlainObject(record)) {
    return {
      ready: false,
      ciValid: false,
      failures: ['Readiness record must be a JSON object.'],
      schemaFailures: ['Readiness record must be a JSON object.'],
      integrityFailures,
      readinessFailures,
      calculations: null,
    };
  }

  exactKeys(record, [
    'schemaVersion', 'decision', 'localReview', 'release', 'deploymentOrder', 'economics', 'operations',
    'provider', 'gates', 'review', 'spendAuthorization',
  ], 'record', failSchema);
  if (record.schemaVersion !== 3) failSchema('schemaVersion must be 3.');
  if (!['GO', 'NO_GO'].includes(record.decision)) failSchema('decision must be GO or NO_GO.');

  const evidencePath = (value, label, required = false) => {
    if (!nonEmpty(value)) {
      if (required) fail(`${label} is required.`);
      return null;
    }
    if (!safeRelativePath(value)) {
      failSchema(`${label} must be a normalized repository-relative path.`);
      return null;
    }
    const resolved = resolveRepositoryFile(root, value);
    if (!resolved) {
      failIntegrity(`${label} does not resolve to a regular repository file: ${value}.`);
      return null;
    }
    if (!referencedEvidencePaths.has(value)) {
      referencedEvidence.push({ label, relativePath: value, resolved });
      referencedEvidencePaths.add(value);
    }
    return resolved;
  };

  const timestamp = (value, label, required = false, freshForGo = true, allowFuture = false) => {
    if (!nonEmpty(value)) {
      if (required) fail(`${label} is required.`);
      return null;
    }
    if (!ISO_TIMESTAMP.test(value)) {
      failSchema(`${label} must be an explicit ISO-8601 timestamp with timezone.`);
      return null;
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      failSchema(`${label} is not a valid timestamp.`);
      return null;
    }
    if (!allowFuture && parsed > now + FUTURE_TOLERANCE_MS) failIntegrity(`${label} cannot be in the future.`);
    if (isGo && freshForGo && now - parsed > MAX_GO_EVIDENCE_AGE_MS) {
      fail(`${label} is older than the seven-day GO evidence window.`);
    }
    return parsed;
  };

  const parseReceipt = (file, label) => {
    if (!file) return null;
    try {
      return parseJsonWithoutDuplicateKeys(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      failIntegrity(`${label} is not valid duplicate-free JSON: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const localReview = record.localReview;
  let localSourceCommit = null;
  let localEvidenceCommit = null;
  let localManifestEntries = null;
  if (localReview === null) {
    if (isGo) fail('localReview is required before GO.');
  } else if (exactKeys(localReview, [
    'baseCommit', 'sourceCommit', 'evidenceCommit', 'readinessPath',
    'evidenceDirectory', 'manifestPath', 'manifestEntryCount',
  ], 'localReview', failSchema)) {
    for (const key of ['baseCommit', 'sourceCommit', 'evidenceCommit']) {
      const value = localReview[key];
      if (!COMMIT.test(value || '')) failSchema(`localReview.${key} must be a full 40-character commit SHA.`);
      else if (!commitExists(root, value)) failIntegrity(`localReview.${key} does not exist in this repository: ${value}.`);
    }
    localSourceCommit = COMMIT.test(localReview.sourceCommit || '') && commitExists(root, localReview.sourceCommit)
      ? localReview.sourceCommit : null;
    localEvidenceCommit = COMMIT.test(localReview.evidenceCommit || '') && commitExists(root, localReview.evidenceCommit)
      ? localReview.evidenceCommit : null;
    if (COMMIT.test(localReview.baseCommit || '') && localSourceCommit &&
        !commitIsAncestor(root, localReview.baseCommit, localSourceCommit)) {
      failIntegrity('localReview.baseCommit must be an ancestor of localReview.sourceCommit.');
    }
    if (localSourceCommit && localEvidenceCommit &&
        !commitIsAncestor(root, localSourceCommit, localEvidenceCommit)) {
      failIntegrity('localReview.sourceCommit must be an ancestor of localReview.evidenceCommit.');
    }
    if (localSourceCommit && localEvidenceCommit &&
        resolveGitRef(root, `${localEvidenceCommit}^`) !== localSourceCommit) {
      failIntegrity('localReview.evidenceCommit must be the direct successor of localReview.sourceCommit.');
    }
    if (localEvidenceCommit && !commitIsAncestorOfHead(root, localEvidenceCommit)) {
      failIntegrity('localReview.evidenceCommit must be an ancestor of HEAD.');
    }
    for (const [key, value] of [
      ['readinessPath', localReview.readinessPath],
      ['evidenceDirectory', localReview.evidenceDirectory],
      ['manifestPath', localReview.manifestPath],
    ]) {
      if (!safeRelativePath(value || '')) failSchema(`localReview.${key} must be a normalized repository-relative path.`);
    }
    if (!Number.isInteger(localReview.manifestEntryCount) || localReview.manifestEntryCount <= 0) {
      failSchema('localReview.manifestEntryCount must be a positive integer.');
    }

    const readinessFile = resolveRepositoryFile(root, localReview.readinessPath);
    const manifestFile = resolveRepositoryFile(root, localReview.manifestPath);
    const evidenceDirectory = safeRelativePath(localReview.evidenceDirectory || '')
      ? path.resolve(root, localReview.evidenceDirectory) : null;
    if (!readinessFile) failIntegrity(`localReview.readinessPath does not resolve: ${localReview.readinessPath}.`);
    if (!manifestFile) failIntegrity(`localReview.manifestPath does not resolve: ${localReview.manifestPath}.`);
    if (evidenceDirectory) {
      try {
        const stat = fs.lstatSync(evidenceDirectory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('not a real directory');
      } catch {
        failIntegrity(`localReview.evidenceDirectory does not resolve to a real directory: ${localReview.evidenceDirectory}.`);
      }
    }
    if (options.recordPath) {
      const suppliedRecordPath = path.relative(root, path.resolve(options.recordPath)).replaceAll(path.sep, '/');
      if (suppliedRecordPath !== localReview.readinessPath) {
        failIntegrity('The evaluated readiness file must equal localReview.readinessPath.');
      }
    }

    if (manifestFile) {
      localManifestEntries = new Map();
      const lines = fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/).filter(Boolean);
      for (const [index, line] of lines.entries()) {
        const match = line.match(/^([0-9a-f]{64})  ([^\0\r\n]+)$/);
        if (!match || !safeRelativePath(match?.[2] || '')) {
          failIntegrity(`Local review manifest line ${index + 1} is malformed.`);
          continue;
        }
        if (localManifestEntries.has(match[2])) {
          failIntegrity(`Local review manifest lists ${match[2]} more than once.`);
          continue;
        }
        localManifestEntries.set(match[2], match[1]);
      }
      if (localManifestEntries.size !== localReview.manifestEntryCount) {
        failIntegrity(`Local review manifest must contain exactly ${localReview.manifestEntryCount} entries; found ${localManifestEntries.size}.`);
      }
    }

    if (COMMIT.test(localReview.baseCommit || '') && localEvidenceCommit && localManifestEntries) {
      const expectedChanged = changedTrackedPaths(root, localReview.baseCommit, localEvidenceCommit, []);
      if (!expectedChanged) {
        failIntegrity('Could not enumerate the local review commit range.');
      } else {
        expectedChanged.delete(localReview.manifestPath);
        expectedChanged.delete(localReview.readinessPath);
        const expectedPaths = [...expectedChanged].sort();
        const manifestPaths = [...localManifestEntries.keys()].sort();
        if (!sameStringArray(manifestPaths, expectedPaths)) {
          const omitted = expectedPaths.filter(item => !localManifestEntries.has(item));
          const unexpected = manifestPaths.filter(item => !expectedChanged.has(item));
          failIntegrity(`Local review manifest must exactly cover the committed candidate diff${omitted.length ? `; omitted ${omitted.join(', ')}` : ''}${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}.`);
        }
      }
      const committedEvidenceFiles = regularTrackedFilesAtCommit(
        root,
        localEvidenceCommit,
        [...localManifestEntries.keys(), localReview.manifestPath],
      );
      for (const [relativePath, expectedHash] of localManifestEntries) {
        if (!committedEvidenceFiles?.has(relativePath)) {
          failIntegrity(`Local review manifest entry is not a regular file at evidenceCommit: ${relativePath}.`);
        }
        const currentFile = resolveRepositoryFile(root, relativePath);
        if (!currentFile || sha256File(currentFile) !== expectedHash) {
          failIntegrity(`Local review manifest entry has drifted from evidenceCommit: ${relativePath}.`);
        }
      }

      const evidenceChanges = localSourceCommit
        ? changedTrackedPaths(root, localSourceCommit, localEvidenceCommit, []) : null;
      if (evidenceChanges && evidenceDirectory) {
        const directoryPrefix = `${localReview.evidenceDirectory.replace(/\/$/, '')}/`;
        for (const relativePath of evidenceChanges) {
          if (relativePath !== localReview.manifestPath && !relativePath.startsWith(directoryPrefix)) {
            failIntegrity(`Only local review evidence may change after localReview.sourceCommit; found ${relativePath}.`);
          }
        }
      }

      const headParent = resolveGitRef(root, 'HEAD^');
      const afterEvidence = changedTrackedPaths(root, localEvidenceCommit, 'HEAD', []);
      if (headParent !== localEvidenceCommit || !afterEvidence ||
          !sameStringArray([...afterEvidence].sort(), [localReview.readinessPath])) {
        failIntegrity('HEAD must be one readiness-only commit directly after localReview.evidenceCommit.');
      }
      if (manifestFile && (!committedEvidenceFiles?.has(localReview.manifestPath) ||
          afterEvidence?.has(localReview.manifestPath))) {
        failIntegrity('localReview.manifestPath must be committed at evidenceCommit and unchanged at HEAD.');
      }
    }
    const status = repositoryStatus(root);
    if (status === null) failIntegrity('Could not inspect repository status for the local review handoff.');
    else if (status) failIntegrity('The local review handoff requires a completely clean tracked and untracked worktree.');
  }

  const release = record.release;
  exactKeys(release, [
    'sourceCommit', 'deployedGitRef', 'deploymentId', 'productionUrl', 'bundlePath',
    'bundleSha256', 'bundleEvidencePath', 'deploymentEvidencePath', 'evidenceDirectory',
    'evidenceManifestPath', 'deployedAt', 'bundleFetchedAt',
  ], 'release', failSchema);
  let deploymentReceiptFile = null;
  let bundleEvidenceFile = null;
  let releaseLandingUrl = null;
  let releaseBundleUrl = null;
  if (isPlainObject(release)) {
    if (isGo && !COMMIT.test(release.sourceCommit || '')) fail('release.sourceCommit must be a full 40-character commit SHA.');
    if (nonEmpty(release.sourceCommit) && !COMMIT.test(release.sourceCommit)) {
      failSchema('release.sourceCommit must be null or a full 40-character commit SHA.');
    } else if (COMMIT.test(release.sourceCommit || '') && !commitExists(root, release.sourceCommit)) {
      failIntegrity(`release.sourceCommit does not exist in this repository: ${release.sourceCommit}.`);
    } else if (COMMIT.test(release.sourceCommit || '') && !commitIsAncestorOfHead(root, release.sourceCommit)) {
      failIntegrity('release.sourceCommit must be an ancestor of the reviewed readiness record.');
    }
    if (isGo && !/^refs\/tags\/paid-acquisition-[A-Za-z0-9._-]+$/.test(release.deployedGitRef || '')) {
      fail('release.deployedGitRef must be an immutable refs/tags/paid-acquisition-* ref.');
    }
    if (nonEmpty(release.deployedGitRef)) {
      const resolvedCommit = resolveGitRef(root, release.deployedGitRef);
      if (!resolvedCommit) failIntegrity(`release.deployedGitRef does not resolve: ${release.deployedGitRef}.`);
      else if (resolvedCommit !== release.sourceCommit) failIntegrity('release.deployedGitRef does not resolve to release.sourceCommit.');
      if (!gitRefIsAnnotatedTag(root, release.deployedGitRef)) failIntegrity('release.deployedGitRef must be an annotated tag object.');
    }
    if (isGo && !nonEmpty(release.deploymentId)) fail('release.deploymentId is required.');
    if (!validHttpsUrl(release.productionUrl)) failSchema('release.productionUrl must be an HTTPS URL.');
    else {
      releaseLandingUrl = canonicalPaidLandingUrl(release.productionUrl);
      if (!releaseLandingUrl) {
        failSchema('release.productionUrl must be the canonical https://fabsy.ca/rapid-resolution landing URL without query or fragment.');
      }
    }
    if (isGo && !nonEmpty(release.bundlePath)) fail('release.bundlePath is required.');
    if (nonEmpty(release.bundlePath)) {
      releaseBundleUrl = canonicalProductionBundleUrl(release.bundlePath);
      if (!releaseBundleUrl) {
        failSchema('release.bundlePath must be one canonical root-relative /assets/*.js path on https://fabsy.ca, without query, fragment, backslash, encoding, or traversal.');
      }
    }
    if (isGo && !SHA256.test(release.bundleSha256 || '')) fail('release.bundleSha256 must be a lowercase SHA-256.');
    if (nonEmpty(release.bundleSha256) && !SHA256.test(release.bundleSha256)) {
      failSchema('release.bundleSha256 must be null or a lowercase SHA-256.');
    }
    bundleEvidenceFile = evidencePath(release.bundleEvidencePath, 'release.bundleEvidencePath', isGo);
    deploymentReceiptFile = evidencePath(release.deploymentEvidencePath, 'release.deploymentEvidencePath', isGo);
    if (isGo && !safeRelativePath(release.evidenceDirectory || '')) fail('release.evidenceDirectory is required.');
    if (nonEmpty(release.evidenceDirectory) && !safeRelativePath(release.evidenceDirectory)) {
      failSchema('release.evidenceDirectory must be a normalized repository-relative directory.');
    }
    evidencePath(release.evidenceManifestPath, 'release.evidenceManifestPath', isGo);
  }
  const deployedAt = timestamp(release?.deployedAt, 'release.deployedAt', isGo);
  const bundleFetchedAt = timestamp(release?.bundleFetchedAt, 'release.bundleFetchedAt', isGo);

  const deploymentOrder = record.deploymentOrder;
  exactKeys(deploymentOrder, [
    'migrationFiles', 'coreFunctions', 'sharedFunctionFiles', 'migrationsAppliedAt', 'coreFunctionsDeployedAt',
    'webhookDeployedAt', 'webhookVerifiedAt', 'createPaymentDeployedAt',
    'cleanupManualVerifiedAt', 'cleanupScheduleEnabledAt', 'frontendDeployedAt',
  ], 'deploymentOrder', failSchema);
  if (isPlainObject(deploymentOrder)) {
    if (!sameStringArray(deploymentOrder.migrationFiles, EXPECTED_MIGRATIONS)) {
      failSchema(`deploymentOrder.migrationFiles must equal the required backend-first sequence: ${EXPECTED_MIGRATIONS.join(' -> ')}.`);
    }
    if (!sameStringArray(deploymentOrder.coreFunctions, EXPECTED_CORE_FUNCTIONS)) {
      failSchema(`deploymentOrder.coreFunctions must equal the required pre-frontend function set: ${EXPECTED_CORE_FUNCTIONS.join(', ')}.`);
    }
    if (!sameStringArray(deploymentOrder.sharedFunctionFiles, EXPECTED_SHARED_FUNCTION_FILES)) {
      failSchema(`deploymentOrder.sharedFunctionFiles must equal the conservative shared-source inventory: ${EXPECTED_SHARED_FUNCTION_FILES.join(', ')}.`);
    }
  }
  if (isGo && localSourceCommit && release?.sourceCommit !== localSourceCommit) {
    failIntegrity('For GO, release.sourceCommit must equal localReview.sourceCommit.');
  }
  const sourceIntegrityCommit = localSourceCommit ||
    (isGo && COMMIT.test(release?.sourceCommit || '') && commitExists(root, release.sourceCommit)
      ? release.sourceCommit : null);
  if (sourceIntegrityCommit) {
    const requiredSourcePaths = [
      ...EXPECTED_MIGRATIONS.map(file => [`supabase/migrations/${file}`, `migration ${file}`]),
      ...[...EXPECTED_CORE_FUNCTIONS, ...EXPECTED_SEPARATE_FUNCTIONS]
        .map(name => [`supabase/functions/${name}/index.ts`, `Edge Function ${name}`]),
      ...EXPECTED_SHARED_FUNCTION_FILES.map(relativePath => [relativePath, `shared Edge Function source ${relativePath}`]),
    ];
    const relativePaths = requiredSourcePaths.map(([relativePath]) => relativePath);
    const sourceFiles = regularTrackedFilesAtCommit(root, sourceIntegrityCommit, relativePaths);
    const headFiles = regularTrackedFilesAtCommit(root, resolveGitRef(root, 'HEAD'), relativePaths);
    const committedDrift = changedTrackedPaths(root, sourceIntegrityCommit, 'HEAD', relativePaths);
    const worktreeDrift = changedTrackedPaths(root, 'HEAD', null, relativePaths);
    for (const [relativePath, label] of requiredSourcePaths) {
      const resolved = resolveRepositoryFile(root, relativePath);
      if (!resolved || !headFiles?.has(relativePath)) {
        failIntegrity(`Required ${label} must resolve to a regular tracked source file: ${relativePath}.`);
        continue;
      }
      if (!sourceFiles?.has(relativePath)) {
        failIntegrity(`Required ${label} is absent from the reviewed source commit: ${relativePath}.`);
      } else if (!committedDrift || committedDrift.has(relativePath)) {
        failIntegrity(`Required ${label} changed after the reviewed source commit: ${relativePath}.`);
      }
      if (!worktreeDrift || worktreeDrift.has(relativePath)) {
        failIntegrity(`Required ${label} has uncommitted source drift: ${relativePath}.`);
      }
    }

    const criticalCommittedDrift = changedTrackedPaths(
      root, sourceIntegrityCommit, 'HEAD', [...RELEASE_CRITICAL_PATHS],
    );
    const criticalWorktreeDrift = changedTrackedPaths(
      root, 'HEAD', null, [...RELEASE_CRITICAL_PATHS],
    );
    if (!criticalCommittedDrift) {
      failIntegrity('Could not inspect committed release-critical drift.');
    } else if (criticalCommittedDrift.size > 0) {
      failIntegrity(`Release-critical files changed after the reviewed source commit: ${[...criticalCommittedDrift].sort().join(', ')}.`);
    }
    if (!criticalWorktreeDrift) {
      failIntegrity('Could not inspect uncommitted release-critical drift.');
    } else if (criticalWorktreeDrift.size > 0) {
      failIntegrity(`Release-critical files have uncommitted drift: ${[...criticalWorktreeDrift].sort().join(', ')}.`);
    }
  }
  const migrationsAppliedAt = timestamp(deploymentOrder?.migrationsAppliedAt, 'deploymentOrder.migrationsAppliedAt', isGo);
  const coreFunctionsDeployedAt = timestamp(deploymentOrder?.coreFunctionsDeployedAt, 'deploymentOrder.coreFunctionsDeployedAt', isGo);
  const webhookDeployedAt = timestamp(deploymentOrder?.webhookDeployedAt, 'deploymentOrder.webhookDeployedAt', isGo);
  const webhookVerifiedAt = timestamp(deploymentOrder?.webhookVerifiedAt, 'deploymentOrder.webhookVerifiedAt', isGo);
  const createPaymentDeployedAt = timestamp(deploymentOrder?.createPaymentDeployedAt, 'deploymentOrder.createPaymentDeployedAt', isGo);
  const cleanupManualVerifiedAt = timestamp(deploymentOrder?.cleanupManualVerifiedAt, 'deploymentOrder.cleanupManualVerifiedAt', isGo);
  const cleanupScheduleEnabledAt = timestamp(deploymentOrder?.cleanupScheduleEnabledAt, 'deploymentOrder.cleanupScheduleEnabledAt', isGo);
  const frontendDeployedAt = timestamp(deploymentOrder?.frontendDeployedAt, 'deploymentOrder.frontendDeployedAt', isGo);
  const orderedDeploymentTimes = [
    ['migrations', migrationsAppliedAt],
    ['core functions', coreFunctionsDeployedAt],
    ['signed webhook deployment', webhookDeployedAt],
    ['signed webhook verification', webhookVerifiedAt],
    ['create-payment deployment', createPaymentDeployedAt],
    ['manual zero-deferred cleanup', cleanupManualVerifiedAt],
    ['cleanup schedule enablement', cleanupScheduleEnabledAt],
    ['frontend deployment', frontendDeployedAt],
  ];
  for (let index = 1; index < orderedDeploymentTimes.length; index += 1) {
    const [previousLabel, previousTime] = orderedDeploymentTimes[index - 1];
    const [currentLabel, currentTime] = orderedDeploymentTimes[index];
    if (previousTime !== null && currentTime !== null && currentTime <= previousTime) {
      fail(`${currentLabel} must occur after ${previousLabel}.`);
    }
  }
  if (deployedAt !== null && frontendDeployedAt !== null && deployedAt !== frontendDeployedAt) {
    fail('release.deployedAt must equal deploymentOrder.frontendDeployedAt.');
  }
  if (bundleFetchedAt !== null && deployedAt !== null && bundleFetchedAt < deployedAt) {
    fail('release.bundleFetchedAt must occur at or after release.deployedAt.');
  }

  const economics = record.economics;
  exactKeys(economics, [
    'priceCad', 'paymentFeesCad', 'fulfillmentCostCad', 'refundRate', 'supportCostCad',
    'requiredContributionCad', 'qualifiedLeadToPaidRate', 'plannedLandingToPurchaseRate',
    'observedClickToLandingRate', 'approvedMaximumCacCad', 'approvedMaximumCplCad',
    'approvedBreakEvenCpcCad', 'approvedBy', 'approvedById', 'approvedAt',
  ], 'economics', failSchema);
  const calculations = calculateAcquisitionLimits(economics);
  if (!calculations) {
    fail('economics must contain complete, finite non-negative costs and rates from 0 to 1.');
  } else {
    if (economics.priceCad !== 198) fail('economics.priceCad must match the current CA$198 Rapid Resolution price.');
    if (economics.fulfillmentCostCad !== 0) fail('economics.fulfillmentCostCad must preserve Brett\'s supplied CA$0 value.');
    if (calculations.maximumCacCad <= 0) fail('Calculated maximum CAC must be positive.');
    if (!closeMoney(economics.approvedMaximumCacCad, calculations.maximumCacCad)) {
      fail(`approvedMaximumCacCad must equal the calculated value (${calculations.maximumCacCad.toFixed(2)}).`);
    }
    if (!closeMoney(economics.approvedMaximumCplCad, calculations.maximumCplCad)) {
      fail(`approvedMaximumCplCad must equal the calculated value (${calculations.maximumCplCad.toFixed(2)}).`);
    }
    if (!closeMoney(economics.approvedBreakEvenCpcCad, calculations.breakEvenCpcCad)) {
      fail(`approvedBreakEvenCpcCad must equal the calculated value (${calculations.breakEvenCpcCad.toFixed(2)}).`);
    }
    if (!nonEmpty(economics.approvedBy) || !ACTOR_ID.test(economics.approvedById || '')) {
      fail('The acquisition limits require an approving actor name and stable actor ID.');
    }
  }
  const economicsApprovedAt = timestamp(economics?.approvedAt, 'economics.approvedAt', isGo);

  const operations = record.operations;
  let trustedCfReceiptFile = null;
  const operationalReceipt = (value, label, control) => {
    const file = evidencePath(value, label, isGo);
    const receipt = parseReceipt(file, label);
    if (!receipt) return file;
    const keys = [
      'schemaVersion', 'kind', 'control', 'result', 'sourceCommit', 'capturedAt',
      'productionUrl',
    ];
    if (!exactKeys(receipt, keys, `${label} receipt`, failIntegrity)) return file;
    if (receipt.schemaVersion !== 1 || receipt.kind !== 'paid-acquisition-operational-evidence' ||
        receipt.control !== control || receipt.result !== 'PASS') {
      failIntegrity(`${label} must be a typed ${control} receipt with result PASS.`);
    }
    if (!COMMIT.test(receipt.sourceCommit || '') || receipt.sourceCommit !== release?.sourceCommit) {
      failIntegrity(`${label} sourceCommit must match release.sourceCommit.`);
    }
    if (receipt.productionUrl !== release?.productionUrl) {
      failIntegrity(`${label} productionUrl must match release.productionUrl.`);
    }
    const capturedAt = timestamp(receipt.capturedAt, `${label} capturedAt`, isGo);
    if (capturedAt !== null && frontendDeployedAt !== null && capturedAt <= frontendDeployedAt) {
      fail(`${label} must be captured after the frontend deployment.`);
    }
    return file;
  };
  exactKeys(operations, [
    'weeklyCaseCapacity', 'maximumMediaLossCad', 'maximumSpendWithoutLeadCad',
    'maximumSpendWithoutPurchaseCad', 'maximumMediaLossApprovedBy',
    'maximumMediaLossApprovedById', 'maximumMediaLossApprovedAt',
    'noCrossPlatformOverlapStageOne', 'phoneTestEvidence', 'notificationTestEvidence',
    'stripeBrandingEvidence', 'trustedCfConnectingIpEvidence',
  ], 'operations', failSchema);
  if (isPlainObject(operations)) {
    if (!finiteNumber(operations.weeklyCaseCapacity) || operations.weeklyCaseCapacity <= 0) fail('operations.weeklyCaseCapacity must be supplied and positive.');
    if (!finiteNumber(operations.maximumMediaLossCad) || operations.maximumMediaLossCad <= 0) fail('operations.maximumMediaLossCad must be supplied and positive.');
    if (!finiteNumber(operations.maximumSpendWithoutLeadCad) || operations.maximumSpendWithoutLeadCad <= 0) fail('operations.maximumSpendWithoutLeadCad must be supplied and positive.');
    if (!finiteNumber(operations.maximumSpendWithoutPurchaseCad) || operations.maximumSpendWithoutPurchaseCad <= 0) fail('operations.maximumSpendWithoutPurchaseCad must be supplied and positive.');
    if (calculations && finiteNumber(operations.maximumMediaLossCad)) {
      const leadCeiling = Math.min(operations.maximumMediaLossCad, 3 * calculations.maximumCplCad);
      const purchaseCeiling = Math.min(operations.maximumMediaLossCad, 3 * calculations.maximumCacCad);
      if (!finiteNumber(operations.maximumSpendWithoutLeadCad) || operations.maximumSpendWithoutLeadCad > leadCeiling + MONEY_TOLERANCE) fail(`maximumSpendWithoutLeadCad cannot exceed min(maximum loss, 3 x maximum CPL), currently CA$${leadCeiling.toFixed(2)}.`);
      if (!finiteNumber(operations.maximumSpendWithoutPurchaseCad) || operations.maximumSpendWithoutPurchaseCad > purchaseCeiling + MONEY_TOLERANCE) fail(`maximumSpendWithoutPurchaseCad cannot exceed min(maximum loss, 3 x maximum CAC), currently CA$${purchaseCeiling.toFixed(2)}.`);
    }
    if (!nonEmpty(operations.maximumMediaLossApprovedBy) || !ACTOR_ID.test(operations.maximumMediaLossApprovedById || '')) fail('The maximum media loss requires an approving actor name and stable actor ID.');
    if (operations.noCrossPlatformOverlapStageOne !== true) fail('operations.noCrossPlatformOverlapStageOne must be true.');
    operationalReceipt(operations.phoneTestEvidence, 'operations.phoneTestEvidence', 'phone-route');
    operationalReceipt(operations.notificationTestEvidence, 'operations.notificationTestEvidence', 'notification-delivery');
    operationalReceipt(operations.stripeBrandingEvidence, 'operations.stripeBrandingEvidence', 'stripe-branding');
    trustedCfReceiptFile = evidencePath(operations.trustedCfConnectingIpEvidence, 'operations.trustedCfConnectingIpEvidence', isGo);
  }
  const maximumMediaLossApprovedAt = timestamp(operations?.maximumMediaLossApprovedAt, 'operations.maximumMediaLossApprovedAt', isGo);

  const provider = record.provider;
  exactKeys(provider, [
    'platform', 'accountId', 'campaignId', 'adGroupId', 'adIds', 'objective',
    'optimizationGoal', 'datasetId', 'datasetRestriction', 'optimizationEligibility',
    'conversionActionIds', 'destinationUrls', 'campaignStatus', 'readBackAt',
    'identityEvidencePath', 'objectiveEvidencePath', 'datasetRestrictionEvidencePath',
    'readbackEvidencePath',
  ], 'provider', failSchema);
  let providerReceiptFile = null;
  if (isPlainObject(provider)) {
    if (!['meta', 'google'].includes(provider.platform)) fail('provider.platform must be meta or google.');
    for (const [key, value] of [['accountId', provider.accountId], ['campaignId', provider.campaignId], ['adGroupId', provider.adGroupId]]) {
      if (!PROVIDER_ID.test(value || '')) fail(`provider.${key} is required and must be a provider identifier.`);
    }
    if (!Array.isArray(provider.adIds) || provider.adIds.length === 0 || provider.adIds.some(id => !PROVIDER_ID.test(id)) || new Set(provider.adIds).size !== provider.adIds.length) fail('provider.adIds must contain unique provider identifiers.');
    if (!nonEmpty(provider.objective)) fail('provider.objective is required.');
    if (!nonEmpty(provider.optimizationGoal)) fail('provider.optimizationGoal is required.');
    const reviewedGoals = Object.prototype.hasOwnProperty.call(REVIEWED_PROVIDER_OPTIMIZATION, provider.platform)
      ? REVIEWED_PROVIDER_OPTIMIZATION[provider.platform]?.[provider.objective]
      : null;
    if (!Array.isArray(reviewedGoals) || !reviewedGoals.includes(provider.optimizationGoal)) {
      fail(`provider objective/optimizationGoal must use the reviewed ${provider.platform || 'platform'} acquisition contract.`);
    }
    if (!['RESTRICTED', 'UNRESTRICTED', 'NOT_APPLICABLE'].includes(provider.datasetRestriction)) fail('provider.datasetRestriction must be RESTRICTED, UNRESTRICTED or NOT_APPLICABLE.');
    if (provider.optimizationEligibility !== 'ELIGIBLE') fail('provider.optimizationEligibility must be ELIGIBLE for the recorded objective and dataset restriction.');
    if (provider.platform === 'meta') {
      if (!PROVIDER_ID.test(provider.datasetId || '')) fail('Meta readiness requires provider.datasetId.');
      if (provider.datasetRestriction === 'NOT_APPLICABLE') fail('Meta readiness requires an actual dataset restriction readback.');
    }
    if (provider.platform === 'google') {
      if (provider.datasetId !== null) fail('Google readiness requires provider.datasetId to be null.');
      if (provider.datasetRestriction !== 'NOT_APPLICABLE') fail('Google provider.datasetRestriction must be NOT_APPLICABLE.');
      if (!Array.isArray(provider.conversionActionIds) || provider.conversionActionIds.length === 0 || provider.conversionActionIds.some(id => !PROVIDER_ID.test(id))) fail('Google readiness requires at least one conversion action ID.');
    }
    if (!Array.isArray(provider.conversionActionIds)) failSchema('provider.conversionActionIds must be an array.');
    if (!Array.isArray(provider.destinationUrls) || provider.destinationUrls.length === 0) {
      fail('provider.destinationUrls must contain at least one canonical paid landing destination.');
    } else {
      const seenDestinations = new Set();
      const seenCampaignContent = new Set();
      for (const [index, destination] of provider.destinationUrls.entries()) {
        const reviewedDestination = reviewedProviderDestination(destination, provider.platform);
        if (reviewedDestination.error) {
          fail(`provider.destinationUrls[${index}] ${reviewedDestination.error}.`);
          continue;
        }
        const destinationUrl = reviewedDestination.url;
        if (releaseLandingUrl && destinationUrl.pathname !== releaseLandingUrl.pathname) {
          fail(`provider.destinationUrls[${index}] must resolve to the released paid landing path.`);
        }
        if (seenDestinations.has(destination)) fail('provider.destinationUrls must be unique.');
        seenDestinations.add(destination);
        if (seenCampaignContent.has(reviewedDestination.pair)) {
          fail('provider.destinationUrls must use unique reviewed utm_campaign/utm_content pairs.');
        }
        seenCampaignContent.add(reviewedDestination.pair);
      }
    }
    if (provider.campaignStatus !== 'PAUSED') fail('provider.campaignStatus must be PAUSED before GO.');
    evidencePath(provider.identityEvidencePath, 'provider.identityEvidencePath', isGo);
    evidencePath(provider.objectiveEvidencePath, 'provider.objectiveEvidencePath', isGo);
    evidencePath(provider.datasetRestrictionEvidencePath, 'provider.datasetRestrictionEvidencePath', isGo);
    providerReceiptFile = evidencePath(provider.readbackEvidencePath, 'provider.readbackEvidencePath', isGo);
  }
  const providerReadBackAt = timestamp(provider?.readBackAt, 'provider.readBackAt', isGo);
  if (providerReadBackAt !== null && frontendDeployedAt !== null && providerReadBackAt <= frontendDeployedAt) {
    fail('provider.readBackAt must occur after the frontend deployment.');
  }

  const gates = Array.isArray(record.gates) ? record.gates : [];
  if (!Array.isArray(record.gates)) failSchema('gates must be an array.');
  const seen = new Set();
  const gateReceiptPaths = new Set();
  const gateEvidenceTimes = [];
  for (const [index, gate] of gates.entries()) {
    if (!exactKeys(gate, ['id', 'status', 'evidence'], `gates[${index}]`, failSchema)) continue;
    if (!Number.isInteger(gate.id)) {
      failSchema(`gates[${index}].id must be an integer.`);
      continue;
    }
    if (seen.has(gate.id)) failSchema(`Gate ${gate.id} appears more than once.`);
    seen.add(gate.id);
    if (!REQUIRED_GATES.includes(gate.id)) failSchema(`Gate ${gate.id} is not part of the 21-gate launch board.`);
    if (!GATE_STATUSES.has(gate.status)) failSchema(`Gate ${gate.id} has an unsupported status.`);
    if (!Array.isArray(gate.evidence) || gate.evidence.some(item => !nonEmpty(item))) {
      failSchema(`Gate ${gate.id} evidence must be an array of non-empty repository paths.`);
      continue;
    }
    if ((gate.status === 'PASS' || gate.status?.startsWith('LOCAL_PASS')) && gate.evidence.length === 0) failSchema(`Gate ${gate.id} claims ${gate.status} without evidence.`);
    if (gate.status !== 'PASS') fail(`Gate ${gate.id} is ${gate.status}; every gate must be PASS.`);
    if (gate.status === 'PASS' && gate.evidence.length < 2) {
      failSchema(`Gate ${gate.id} PASS evidence must include one typed gate receipt followed by at least one supporting artifact.`);
    }
    const evidenceFiles = gate.evidence.map((item, evidenceIndex) => evidencePath(
      item,
      `gates[${index}].evidence[${evidenceIndex}]`,
      gate.status === 'PASS',
    ));
    if (gate.status === 'PASS') {
      for (let evidenceIndex = 1; evidenceIndex < evidenceFiles.length; evidenceIndex += 1) {
        const supportFile = evidenceFiles[evidenceIndex];
        if (!supportFile || path.extname(supportFile).toLowerCase() !== '.json') continue;
        const support = parseReceipt(supportFile, `Gate ${gate.id} support ${evidenceIndex}`);
        if (!support) continue;
        const negative = explicitNegativeEvidence(support);
        if (negative) {
          failIntegrity(`Gate ${gate.id} supporting evidence contains an explicit negative verdict at ${negative}.`);
        }
      }
    }
    if (gate.status === 'PASS' && gate.evidence.length > 0) {
      const receiptPath = gate.evidence[0];
      if (gateReceiptPaths.has(receiptPath)) {
        failIntegrity(`Gate ${gate.id} must use a gate-specific receipt that is not reused by another gate.`);
      }
      gateReceiptPaths.add(receiptPath);
      const receipt = parseReceipt(evidenceFiles[0], `Gate ${gate.id} receipt`);
      if (receipt) {
        const receiptKeys = [
          'schemaVersion', 'kind', 'gateId', 'result', 'sourceCommit', 'capturedAt',
          'artifactPaths',
        ];
        if (exactKeys(receipt, receiptKeys, `Gate ${gate.id} receipt`, failIntegrity)) {
          if (receipt.schemaVersion !== 1 || receipt.kind !== 'paid-acquisition-gate-evidence') {
            failIntegrity(`Gate ${gate.id} receipt has an unsupported schemaVersion or kind.`);
          }
          if (receipt.gateId !== gate.id || receipt.result !== 'PASS') {
            failIntegrity(`Gate ${gate.id} receipt must identify gate ${gate.id} with result PASS.`);
          }
          if (!COMMIT.test(receipt.sourceCommit || '') || receipt.sourceCommit !== release?.sourceCommit) {
            failIntegrity(`Gate ${gate.id} receipt sourceCommit must match release.sourceCommit.`);
          }
          const expectedArtifacts = gate.evidence.slice(1);
          if (!sameStringArray(receipt.artifactPaths, expectedArtifacts) ||
              expectedArtifacts.length === 0 ||
              new Set(expectedArtifacts).size !== expectedArtifacts.length ||
              expectedArtifacts.includes(receiptPath)) {
            failIntegrity(`Gate ${gate.id} receipt artifactPaths must exactly list the unique supporting artifacts after its receipt path.`);
          }
          const capturedAt = timestamp(receipt.capturedAt, `Gate ${gate.id} receipt capturedAt`, true);
          if (capturedAt !== null) {
            gateEvidenceTimes.push([gate.id, capturedAt]);
            if (frontendDeployedAt !== null && capturedAt <= frontendDeployedAt) {
              fail(`Gate ${gate.id} PASS evidence must be captured after the frontend deployment.`);
            }
          }
        }
      }
    }
  }
  for (const id of REQUIRED_GATES) if (!seen.has(id)) failSchema(`Gate ${id} is missing.`);
  if (localReview === null && referencedEvidence.length > 0) {
    failIntegrity('Repository-backed evidence requires a pinned localReview handoff.');
  }

  const review = record.review;
  exactKeys(review, [
    'releaseOwner', 'releaseOwnerId', 'independentReviewer', 'independentReviewerId',
    'reviewedAt', 'providerStatusBeforeLaunch', 'oneClickPauseSeconds', 'goApprovedBy',
    'goApprovedById', 'goApprovedAt',
  ], 'review', failSchema);
  if (isPlainObject(review)) {
    if (!nonEmpty(review.releaseOwner) || !ACTOR_ID.test(review.releaseOwnerId || '')) fail('review.releaseOwner and releaseOwnerId are required.');
    if (!nonEmpty(review.independentReviewer) || !ACTOR_ID.test(review.independentReviewerId || '')) fail('review.independentReviewer and independentReviewerId are required.');
    if (!nonEmpty(review.goApprovedBy) || !ACTOR_ID.test(review.goApprovedById || '')) fail('review.goApprovedBy and goApprovedById are required.');
    if (review.providerStatusBeforeLaunch !== 'PAUSED') fail('The provider must be read back as PAUSED before launch.');
    if (provider?.campaignStatus && review.providerStatusBeforeLaunch !== provider.campaignStatus) fail('review.providerStatusBeforeLaunch must match provider.campaignStatus.');
    if (!finiteNumber(review.oneClickPauseSeconds) || review.oneClickPauseSeconds <= 0) fail('review.oneClickPauseSeconds must record a successful pause test.');
  }
  const reviewedAt = timestamp(review?.reviewedAt, 'review.reviewedAt', isGo);
  const goApprovedAt = timestamp(review?.goApprovedAt, 'review.goApprovedAt', isGo);
  if (reviewedAt !== null) {
    for (const [gateId, capturedAt] of gateEvidenceTimes) {
      if (capturedAt >= reviewedAt) fail(`Independent review must occur after Gate ${gateId} evidence is captured.`);
    }
  }

  const spend = record.spendAuthorization;
  if (spend !== null) {
    exactKeys(spend, ['platform', 'dailyCapCad', 'totalCapCad', 'startAt', 'endAt', 'taxesAdditional', 'authorizedBy', 'authorizedById', 'authorizedAt'], 'spendAuthorization', failSchema);
  } else if (isGo) {
    fail('A separate spendAuthorization is required after GO.');
  }
  if (isPlainObject(spend)) {
    if (!['meta', 'google'].includes(spend.platform)) fail('spendAuthorization.platform must be meta or google.');
    if (provider?.platform && spend.platform !== provider.platform) fail('Spend platform must match the verified provider platform.');
    if (!finiteNumber(spend.dailyCapCad) || spend.dailyCapCad <= 0) fail('spendAuthorization.dailyCapCad must be positive.');
    if (!finiteNumber(spend.totalCapCad) || spend.totalCapCad <= 0) fail('spendAuthorization.totalCapCad must be positive.');
    if (finiteNumber(spend.dailyCapCad) && finiteNumber(spend.totalCapCad) && spend.dailyCapCad > spend.totalCapCad) fail('The daily cap cannot exceed the total cap.');
    if (operations && finiteNumber(operations.maximumMediaLossCad) && finiteNumber(spend.totalCapCad) && spend.totalCapCad > operations.maximumMediaLossCad + MONEY_TOLERANCE) fail('The authorized total cap cannot exceed the approved maximum media loss.');
    if (calculations && finiteNumber(spend.totalCapCad) && spend.totalCapCad > 3 * calculations.maximumCacCad + MONEY_TOLERANCE) fail('The stage-one total cap cannot exceed three times the approved maximum CAC.');
    if (typeof spend.taxesAdditional !== 'boolean') failSchema('spendAuthorization.taxesAdditional must be explicit.');
    if (!nonEmpty(spend.authorizedBy) || !ACTOR_ID.test(spend.authorizedById || '')) fail('Spend requires an authorizing actor name and stable actor ID.');
  }
  const spendAuthorizedAt = timestamp(spend?.authorizedAt, 'spendAuthorization.authorizedAt', isGo);
  const spendStartAt = timestamp(spend?.startAt, 'spendAuthorization.startAt', isGo, false, true);
  const spendEndAt = timestamp(spend?.endAt, 'spendAuthorization.endAt', isGo, false, true);

  const ordering = [
    ['economics approval', economicsApprovedAt, 'independent review', reviewedAt],
    ['maximum-media-loss approval', maximumMediaLossApprovedAt, 'independent review', reviewedAt],
    ['frontend deployment', frontendDeployedAt, 'provider readback', providerReadBackAt],
    ['bundle fetch', bundleFetchedAt, 'independent review', reviewedAt],
    ['provider readback', providerReadBackAt, 'independent review', reviewedAt],
    ['independent review', reviewedAt, 'written GO', goApprovedAt],
    ['written GO', goApprovedAt, 'spend authorization', spendAuthorizedAt],
    ['spend authorization', spendAuthorizedAt, 'campaign start', spendStartAt],
    ['campaign start', spendStartAt, 'campaign end', spendEndAt],
  ];
  for (const [beforeLabel, before, afterLabel, after] of ordering) {
    if (before !== null && after !== null && after <= before) fail(`${afterLabel} must occur after ${beforeLabel}.`);
  }

  if (isGo) {
    const roleActors = [
      ['release owner', review?.releaseOwner, review?.releaseOwnerId],
      ['independent reviewer', review?.independentReviewer, review?.independentReviewerId],
      ['GO approver', review?.goApprovedBy, review?.goApprovedById],
      ['spend authorizer', spend?.authorizedBy, spend?.authorizedById],
    ];
    const ids = roleActors.map(([, , id]) => id).filter(nonEmpty);
    const names = roleActors.map(([, name]) => normalizeActor(name)).filter(nonEmpty);
    if (ids.length !== 4 || new Set(ids).size !== 4) fail('Release owner, independent reviewer, GO approver and spend authorizer must have four distinct stable actor IDs.');
    if (names.length !== 4 || new Set(names).size !== 4) fail('Release owner, independent reviewer, GO approver and spend authorizer must be distinct after name normalization.');
    if (economics?.approvedById !== review?.goApprovedById) fail('The written GO approver must be the actor who approved the acquisition limits.');
    if (operations?.maximumMediaLossApprovedById !== review?.goApprovedById) fail('The written GO approver must be the actor who approved the maximum media loss.');
  }

  let manifestEntries = null;
  let evidenceDirectoryResolved = null;
  const manifestPath = release?.evidenceManifestPath;
  if (safeRelativePath(release?.evidenceDirectory || '')) {
    const directory = path.resolve(root, release.evidenceDirectory);
    try {
      const stat = fs.lstatSync(directory);
      const realDirectory = fs.realpathSync(directory);
      const realRoot = fs.realpathSync(root);
      const relative = path.relative(realRoot, realDirectory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || relative.startsWith('..') || path.isAbsolute(relative)) failIntegrity('release.evidenceDirectory must resolve to a real repository directory.');
      else evidenceDirectoryResolved = realDirectory;
    } catch {
      if (isGo || nonEmpty(release.evidenceDirectory)) failIntegrity(`release.evidenceDirectory does not exist: ${release.evidenceDirectory}.`);
    }
  }
  if (nonEmpty(manifestPath)) {
    const manifestFile = resolveRepositoryFile(root, manifestPath);
    if (manifestFile) {
      manifestEntries = new Map();
      const lines = fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/).filter(Boolean);
      for (const [index, line] of lines.entries()) {
        const match = line.match(/^([0-9a-f]{64})  (.+)$/);
        if (!match || !safeRelativePath(match[2])) {
          failIntegrity(`Evidence manifest line ${index + 1} is malformed.`);
          continue;
        }
        if (manifestEntries.has(match[2])) failIntegrity(`Evidence manifest lists ${match[2]} more than once.`);
        manifestEntries.set(match[2], match[1]);
        const listedFile = resolveRepositoryFile(root, match[2]);
        if (!listedFile) failIntegrity(`Evidence manifest entry does not resolve: ${match[2]}.`);
        else {
          if (evidenceDirectoryResolved) {
            const relativeToEvidence = path.relative(evidenceDirectoryResolved, fs.realpathSync(listedFile));
            if (relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) failIntegrity(`Evidence manifest entry is outside release.evidenceDirectory: ${match[2]}.`);
          }
          if (sha256File(listedFile) !== match[1]) failIntegrity(`Evidence manifest hash drift for ${match[2]}.`);
        }
      }
      const manifestTrackedPaths = [manifestPath, ...manifestEntries.keys()];
      const headCommit = resolveGitRef(root, 'HEAD');
      const committedManifestFiles = headCommit
        ? regularTrackedFilesAtCommit(root, headCommit, manifestTrackedPaths) : null;
      const manifestWorktreeDrift = changedTrackedPaths(root, 'HEAD', null, manifestTrackedPaths);
      for (const relativePath of manifestTrackedPaths) {
        if (!committedManifestFiles?.has(relativePath) || !manifestWorktreeDrift || manifestWorktreeDrift.has(relativePath)) {
          failIntegrity(`Evidence manifest file is not committed and unchanged from HEAD: ${relativePath}.`);
        }
      }
      if (evidenceDirectoryResolved) {
        const inventory = regularFilesRecursively(root, evidenceDirectoryResolved);
        if (inventory.invalid.length) {
          failIntegrity(`release.evidenceDirectory contains symlink or special-file entries: ${inventory.invalid.join(', ')}.`);
        }
        const expectedFiles = inventory.files.filter(relativePath => relativePath !== manifestPath);
        const manifestFiles = [...manifestEntries.keys()].sort();
        if (!sameStringArray(manifestFiles, expectedFiles)) {
          const omitted = expectedFiles.filter(item => !manifestEntries.has(item));
          const unexpected = manifestFiles.filter(item => !expectedFiles.includes(item));
          failIntegrity(`Evidence manifest must exactly cover release.evidenceDirectory except itself${omitted.length ? `; omitted ${omitted.join(', ')}` : ''}${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}.`);
        }
      }
    }
  }
  const referencedPaths = referencedEvidence.map(item => item.relativePath);
  if (referencedPaths.length > 0) {
    const headCommit = resolveGitRef(root, 'HEAD');
    const committedReferencedFiles = headCommit
      ? regularTrackedFilesAtCommit(root, headCommit, referencedPaths) : null;
    const referencedWorktreeDrift = changedTrackedPaths(root, 'HEAD', null, referencedPaths);
    for (const item of referencedEvidence) {
      if (!committedReferencedFiles?.has(item.relativePath) ||
          !referencedWorktreeDrift || referencedWorktreeDrift.has(item.relativePath)) {
        failIntegrity(`${item.label} must be committed and unchanged from HEAD.`);
      }
    }
  }
  if (isGo) {
    if (!manifestEntries) fail('A readable evidence manifest is required for GO.');
    for (const item of referencedEvidence) {
      if (item.relativePath === manifestPath) continue;
      const realFile = fs.realpathSync(item.resolved);
      const relativeToEvidence = evidenceDirectoryResolved ? path.relative(evidenceDirectoryResolved, realFile) : '..';
      if (!evidenceDirectoryResolved || relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) {
        failIntegrity(`${item.label} must be inside release.evidenceDirectory.`);
        continue;
      }
      const expectedHash = manifestEntries?.get(item.relativePath);
      if (!expectedHash) failIntegrity(`${item.label} is not listed in release.evidenceManifestPath.`);
      else if (sha256File(item.resolved) !== expectedHash) failIntegrity(`${item.label} does not match its evidence manifest hash.`);
    }
  }

  if (bundleEvidenceFile && SHA256.test(release?.bundleSha256 || '') && sha256File(bundleEvidenceFile) !== release.bundleSha256) failIntegrity('release.bundleSha256 does not match the captured production bundle bytes.');

  const deploymentReceipt = parseReceipt(deploymentReceiptFile, 'release.deploymentEvidencePath');
  if (deploymentReceipt) {
    const receiptKeys = ['schemaVersion', 'kind', 'sourceCommit', 'deployedGitRef', 'deploymentId', 'productionUrl', 'bundleUrl', 'bundleSha256', 'deployedAt', 'bundleFetchedAt', 'deploymentOrder'];
    if (exactKeys(deploymentReceipt, receiptKeys, 'deployment receipt', failIntegrity)) {
      const expectedBundleUrl = releaseBundleUrl?.href ?? null;
      const expected = { schemaVersion: 1, kind: 'paid-acquisition-production-deployment', sourceCommit: release.sourceCommit, deployedGitRef: release.deployedGitRef, deploymentId: release.deploymentId, productionUrl: release.productionUrl, bundleUrl: expectedBundleUrl, bundleSha256: release.bundleSha256, deployedAt: release.deployedAt, bundleFetchedAt: release.bundleFetchedAt };
      for (const [key, value] of Object.entries(expected)) if (deploymentReceipt[key] !== value) failIntegrity(`Deployment receipt ${key} does not match the readiness record.`);
      if (JSON.stringify(deploymentReceipt.deploymentOrder) !== JSON.stringify(deploymentOrder)) failIntegrity('Deployment receipt deploymentOrder does not match the readiness record.');
    }
  }

  const providerReceipt = parseReceipt(providerReceiptFile, 'provider.readbackEvidencePath');
  if (providerReceipt) {
    const providerReceiptKeys = ['schemaVersion', 'kind', 'capturedAt', 'sourceCommit', 'platform', 'accountId', 'campaignId', 'adGroupId', 'adIds', 'objective', 'optimizationGoal', 'datasetId', 'datasetRestriction', 'optimizationEligibility', 'conversionActionIds', 'destinationUrls', 'campaignStatus'];
    if (exactKeys(providerReceipt, providerReceiptKeys, 'provider receipt', failIntegrity)) {
      if (providerReceipt.schemaVersion !== 1 || providerReceipt.kind !== 'paid-acquisition-provider-readback') failIntegrity('Provider receipt has an unsupported schemaVersion or kind.');
      const expected = { capturedAt: provider.readBackAt, sourceCommit: release.sourceCommit, platform: provider.platform, accountId: provider.accountId, campaignId: provider.campaignId, adGroupId: provider.adGroupId, adIds: provider.adIds, objective: provider.objective, optimizationGoal: provider.optimizationGoal, datasetId: provider.datasetId, datasetRestriction: provider.datasetRestriction, optimizationEligibility: provider.optimizationEligibility, conversionActionIds: provider.conversionActionIds, destinationUrls: provider.destinationUrls, campaignStatus: provider.campaignStatus };
      for (const [key, value] of Object.entries(expected)) if (JSON.stringify(providerReceipt[key]) !== JSON.stringify(value)) failIntegrity(`Provider receipt ${key} does not match the readiness record.`);
    }
  }

  const trustedCfReceipt = parseReceipt(trustedCfReceiptFile, 'operations.trustedCfConnectingIpEvidence');
  if (trustedCfReceipt) {
    const receiptKeys = [
      'schemaVersion', 'kind', 'sourceCommit', 'capturedAt', 'headerName', 'functions',
      'environments',
    ];
    if (exactKeys(trustedCfReceipt, receiptKeys, 'trusted proxy receipt', failIntegrity)) {
      if (trustedCfReceipt.schemaVersion !== 1 || trustedCfReceipt.kind !== 'trusted-cf-connecting-ip-verification') {
        failIntegrity('Trusted proxy receipt has an unsupported schemaVersion or kind.');
      }
      if (trustedCfReceipt.sourceCommit !== release?.sourceCommit) {
        failIntegrity('Trusted proxy receipt sourceCommit does not match the readiness release.');
      }
      if (trustedCfReceipt.headerName !== 'cf-connecting-ip') {
        failIntegrity('Trusted proxy receipt must verify the exact cf-connecting-ip header.');
      }
      if (!sameStringArray(trustedCfReceipt.functions, EXPECTED_TRUSTED_IP_FUNCTIONS)) {
        failIntegrity(`Trusted proxy receipt functions must equal: ${EXPECTED_TRUSTED_IP_FUNCTIONS.join(', ')}.`);
      }

      const environments = Array.isArray(trustedCfReceipt.environments) ? trustedCfReceipt.environments : [];
      if (!Array.isArray(trustedCfReceipt.environments) || environments.length !== 2) {
        failIntegrity('Trusted proxy receipt must contain exactly staging and production results.');
      }
      const expectedEnvironmentNames = ['staging', 'production'];
      const environmentTimes = [];
      const endpointOrigins = [];
      const projectRefs = [];
      for (const [index, environment] of environments.entries()) {
        const label = `trusted proxy receipt environments[${index}]`;
        const environmentKeys = [
          'name', 'projectRef', 'endpointOrigin', 'testedAt', 'trustedHeaderObserved',
          'xForwardedForIgnored', 'xRealIpIgnored', 'missingHeaderUsesUnknownBucket',
          'publicTrafficPausedDuringTest',
        ];
        if (!exactKeys(environment, environmentKeys, label, failIntegrity)) continue;
        if (environment.name !== expectedEnvironmentNames[index]) {
          failIntegrity(`Trusted proxy receipt environment ${index + 1} must be ${expectedEnvironmentNames[index]}.`);
        }
        if (!SUPABASE_PROJECT_REF.test(environment.projectRef || '')) {
          failIntegrity(`${label}.projectRef must be a 20-character Supabase project reference.`);
        } else {
          projectRefs.push(environment.projectRef);
        }
        if (!validHttpsUrl(environment.endpointOrigin)) {
          failIntegrity(`${label}.endpointOrigin must be HTTPS.`);
        } else {
          const originUrl = new URL(environment.endpointOrigin);
          if (originUrl.href !== `${originUrl.origin}/`) {
            failIntegrity(`${label}.endpointOrigin must be an origin without a path, query or fragment.`);
          }
          if (SUPABASE_PROJECT_REF.test(environment.projectRef || '') &&
              originUrl.hostname !== `${environment.projectRef}.supabase.co`) {
            failIntegrity(`${label}.endpointOrigin must be the Supabase origin for its exact projectRef.`);
          }
          endpointOrigins.push(originUrl.origin);
        }
        const testedAt = timestamp(environment.testedAt, `${label}.testedAt`, isGo);
        if (testedAt !== null) environmentTimes.push(testedAt);
        for (const property of [
          'trustedHeaderObserved', 'xForwardedForIgnored', 'xRealIpIgnored',
          'missingHeaderUsesUnknownBucket', 'publicTrafficPausedDuringTest',
        ]) {
          if (environment[property] !== true) failIntegrity(`${label}.${property} must be true.`);
        }
      }
      if (endpointOrigins.length === 2 && new Set(endpointOrigins).size !== 2) {
        failIntegrity('Staging and production trusted proxy checks must use distinct endpoint origins.');
      }
      if (projectRefs.length === 2 && new Set(projectRefs).size !== 2) {
        failIntegrity('Staging and production trusted proxy checks must use distinct project references.');
      }
      const trustedCapturedAt = timestamp(trustedCfReceipt.capturedAt, 'trusted proxy receipt capturedAt', isGo);
      if (trustedCapturedAt !== null && environmentTimes.length === 2 && trustedCapturedAt !== Math.max(...environmentTimes)) {
        failIntegrity('Trusted proxy receipt capturedAt must equal the later environment testedAt.');
      }
      if (trustedCapturedAt !== null && coreFunctionsDeployedAt !== null && trustedCapturedAt <= coreFunctionsDeployedAt) {
        fail('Trusted proxy verification must occur after the rate-limited Edge Functions are deployed.');
      }
      if (trustedCapturedAt !== null && reviewedAt !== null && trustedCapturedAt >= reviewedAt) {
        fail('Independent review must occur after trusted proxy verification.');
      }
    }
  }

  if (record.decision !== 'GO') fail('decision remains NO_GO until every requirement passes.');
  const failures = [...schemaFailures, ...integrityFailures, ...readinessFailures];
  const ready = failures.length === 0;
  const ciValid = schemaFailures.length === 0 && integrityFailures.length === 0 && (record.decision === 'GO' ? ready : record.decision === 'NO_GO' && readinessFailures.length > 0);
  return { ready, ciValid, failures, schemaFailures, integrityFailures, readinessFailures, calculations };
}

function printResult(file, result, ciMode = false) {
  const calculations = result.calculations;
  if (calculations) console.log(`Calculated limits: CAC CA$${calculations.maximumCacCad.toFixed(2)}; CPL CA$${calculations.maximumCplCad.toFixed(2)}; break-even CPC CA$${calculations.breakEvenCpcCad.toFixed(2)}.`);
  if (result.ready) {
    console.log(`GO: ${file} passes all paid-acquisition launch controls.`);
    return;
  }
  if (ciMode && result.ciValid) {
    console.log(`VALID NO-GO: ${file} is structurally sound and remains blocked by ${result.readinessFailures.length} launch requirement${result.readinessFailures.length === 1 ? '' : 's'}.`);
    return;
  }
  console.error(`NO-GO: ${file} has ${result.failures.length} issue${result.failures.length === 1 ? '' : 's'} (${result.schemaFailures.length} schema, ${result.integrityFailures.length} integrity, ${result.readinessFailures.length} launch).`);
  for (const failure of result.failures) console.error(`- ${failure}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const args = process.argv.slice(2);
  const ciMode = args.includes('--ci');
  const supplied = args.find(arg => !arg.startsWith('--')) || 'docs/paid-acquisition/2026-09-03-restart-readiness.json';
  const file = path.resolve(ROOT, supplied);
  try {
    const record = parseJsonWithoutDuplicateKeys(fs.readFileSync(file, 'utf8'));
    const result = evaluatePaidAcquisitionReadiness(record, { root: ROOT, recordPath: file });
    printResult(path.relative(ROOT, file), result, ciMode);
    if (ciMode ? !result.ciValid : !result.ready) process.exitCode = 1;
  } catch (error) {
    console.error(`NO-GO: could not validate ${path.relative(ROOT, file)}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
