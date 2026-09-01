#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://fabsy.ca';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_KEY = '029f128b27e35d1bf1707629f053c5db';
export const INDEXNOW_KEY_LOCATION = `${SITE}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_KEY_FILE = `public/${INDEXNOW_KEY}.txt`;
const MAX_URLS = 10_000;

export function canonicalFromHtml(html) {
  const tag = String(html || '').match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0];
  return tag?.match(/\bhref=["']([^"']+)["']/i)?.[1] || null;
}

export function isIndexableHtml(html) {
  const tag = String(html || '').match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i)?.[0];
  const directive = tag?.match(/\bcontent=["']([^"']+)["']/i)?.[1] || '';
  return /(?:^|,)\s*index\s*(?:,|$)/i.test(directive) && !/(?:^|,)\s*noindex\s*(?:,|$)/i.test(directive);
}

export function normalizePublicUrl(value) {
  const url = new URL(value, SITE);
  if (url.origin !== SITE || !/^https:$/.test(url.protocol)) {
    throw new Error(`IndexNow URL must use the ${new URL(SITE).hostname} HTTPS origin: ${value}`);
  }
  url.hash = '';
  return url.href;
}

export function indexNowPayload(urls) {
  const urlList = [...new Set(urls.map(normalizePublicUrl))].sort();
  if (urlList.length > MAX_URLS) throw new Error(`IndexNow batch exceeds ${MAX_URLS} URLs`);
  return {
    host: new URL(SITE).hostname,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList,
  };
}

function git(repoRoot, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: options.encoding || 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function validBaseRef(repoRoot, ref) {
  if (!ref || /^0+$/.test(ref)) return false;
  try {
    git(repoRoot, ['cat-file', '-e', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function previousFile(repoRoot, ref, filename) {
  try {
    return git(repoRoot, ['show', `${ref}:${filename}`]);
  } catch {
    return null;
  }
}

export function parseNameStatus(buffer) {
  const fields = buffer.toString('utf8').split('\0').filter(Boolean);
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (/^[RC]/.test(status)) {
      changes.push({ status, oldPath: fields[index++], path: fields[index++] });
    } else {
      changes.push({ status, path: fields[index++] });
    }
  }
  return changes;
}

function addSnapshotUrl(urls, html, includeNoindex = false) {
  if (!html || (!includeNoindex && !isIndexableHtml(html))) return;
  const canonical = canonicalFromHtml(html);
  if (canonical) urls.add(normalizePublicUrl(canonical));
}

function addPolicies(urls, policies) {
  if (!policies || typeof policies !== 'object') return;
  for (const [source, target] of Object.entries(policies.redirects || {})) {
    urls.add(normalizePublicUrl(source));
    urls.add(normalizePublicUrl(target));
  }
  for (const source of policies.gone || []) urls.add(normalizePublicUrl(source));
}

function readPolicies(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function collectChangedUrls({ repoRoot, fromRef, toRef, explicitUrls = [] }) {
  const urls = new Set(explicitUrls.map(normalizePublicUrl));
  const baseRef = validBaseRef(repoRoot, fromRef)
    ? fromRef
    : validBaseRef(repoRoot, 'HEAD^') ? 'HEAD^' : 'HEAD';
  const args = ['diff', '--name-status', '-z', baseRef];
  if (toRef && toRef !== 'WORKTREE') args.push(toRef);
  args.push('--', 'public/prerendered', 'src/config/seoRoutePolicies.json', INDEXNOW_KEY_FILE);
  const changes = parseNameStatus(git(repoRoot, args, { encoding: 'buffer' }));

  for (const change of changes) {
    const changedPath = change.path;
    if (changedPath === 'src/config/seoRoutePolicies.json' || change.oldPath === 'src/config/seoRoutePolicies.json') {
      const currentPath = path.join(repoRoot, 'src/config/seoRoutePolicies.json');
      if (fs.existsSync(currentPath)) addPolicies(urls, readPolicies(fs.readFileSync(currentPath, 'utf8')));
      addPolicies(urls, readPolicies(previousFile(repoRoot, baseRef, 'src/config/seoRoutePolicies.json')));
      continue;
    }

    if (changedPath === INDEXNOW_KEY_FILE || change.oldPath === INDEXNOW_KEY_FILE) {
      urls.add(`${SITE}/`);
      continue;
    }

    for (const filename of [change.oldPath, changedPath].filter(Boolean)) {
      if (!/^public\/prerendered\/.+\.html$/.test(filename)) continue;
      if (filename === changedPath && !/^D/.test(change.status)) {
        const currentPath = path.join(repoRoot, filename);
        if (fs.existsSync(currentPath)) addSnapshotUrl(urls, fs.readFileSync(currentPath, 'utf8'));
      }
      // Submit the previous canonical for removals, redirects, canonical
      // changes, and index-to-noindex transitions. Duplicate URLs collapse in
      // the Set for ordinary content edits.
      addSnapshotUrl(urls, previousFile(repoRoot, baseRef, filename), true);
    }
  }

  if (!toRef || toRef === 'WORKTREE') {
    const untracked = git(repoRoot, [
      'ls-files', '--others', '--exclude-standard', '-z', '--',
      'public/prerendered', INDEXNOW_KEY_FILE,
    ]).split('\0').filter(Boolean);
    for (const filename of untracked) {
      if (filename === INDEXNOW_KEY_FILE) {
        urls.add(`${SITE}/`);
        continue;
      }
      if (!/^public\/prerendered\/.+\.html$/.test(filename)) continue;
      const currentPath = path.join(repoRoot, filename);
      if (fs.existsSync(currentPath)) addSnapshotUrl(urls, fs.readFileSync(currentPath, 'utf8'));
    }
  }

  return indexNowPayload([...urls]).urlList;
}

function parseArgs(argv) {
  const options = { explicitUrls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') options.dryRun = true;
    else if (value === '--from') options.fromRef = argv[++index];
    else if (value === '--to') options.toRef = argv[++index];
    else if (value === '--url') options.explicitUrls.push(argv[++index]);
    else throw new Error(`Unknown IndexNow option: ${value}`);
  }
  return options;
}

export async function submitIndexNow(urls, fetchImpl = fetch) {
  const payload = indexNowPayload(urls);
  if (payload.urlList.length === 0) return { status: 204, payload };
  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (response.status === 200 || response.status === 202) return { status: response.status, payload };
  const detail = (await response.text()).slice(0, 500);
  const meanings = {
    400: 'invalid request',
    403: 'key verification failed',
    422: 'URLs do not belong to the submitted host',
    429: 'rate limited',
  };
  throw new Error(`IndexNow returned ${response.status} (${meanings[response.status] || 'unexpected response'})${detail ? `: ${detail}` : ''}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const urls = collectChangedUrls({
    repoRoot,
    fromRef: options.fromRef || process.env.INDEXNOW_FROM || process.env.GITHUB_EVENT_BEFORE || 'HEAD^',
    toRef: options.toRef || process.env.INDEXNOW_TO || 'WORKTREE',
    explicitUrls: options.explicitUrls,
  });
  if (options.dryRun) {
    console.log(JSON.stringify(indexNowPayload(urls), null, 2));
    return;
  }
  if (urls.length === 0) {
    console.log('IndexNow: no changed public URLs to submit.');
    return;
  }
  const result = await submitIndexNow(urls);
  console.log(`IndexNow accepted ${result.payload.urlList.length} URL(s) with HTTP ${result.status}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
