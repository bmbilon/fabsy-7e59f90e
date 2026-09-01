#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceOnly = process.argv.includes('--source-only');
const sourceTargets = [
  'src',
  'ssg-pages',
  'supabase/functions',
  'scripts/generate-photo-radar-snapshots.cjs',
  'scripts/generate-static-snapshots.cjs',
  'scripts/public-offer-snapshot-guardrail.cjs',
  'scripts/validate-snapshot-guardrails.cjs',
  'scripts/fixtures/public-offer-browser-fragments.json',
];
const snapshotTargets = ['public/prerendered'];
const readableExtensions = new Set(['.cjs', '.html', '.js', '.json', '.jsx', '.mjs', '.ts', '.tsx']);
const forbidden = [
  /\bno insurance impact\b(?!\s+report)/i,
  /\bno demerits?[^.!?\n]{0,50}\b(?:no\s+)?insurance impact\b/i,
  /\bonly the fine is on the table\b/i,
  /\bthe only thing on the table is the fine\b/i,
  /\bno insurance consequences\b/i,
  /\b(?:does|do|will) not affect (?:your )?(?:driving record or )?insurance\b/i,
  /\b(?:has|have) no (?:effect|impact) on (?:your )?(?:driving record or )?insurance\b/i,
  /\bno Insurance Impact Report is (?:included or needed|needed)\b/i,
];

function filesUnder(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) return filesUnder(path.relative(root, child));
    return entry.isFile() ? [child] : [];
  });
}

const findings = [];
for (const target of [...sourceTargets, ...(sourceOnly ? [] : snapshotTargets)]) {
  for (const file of filesUnder(target)) {
    if (!readableExtensions.has(path.extname(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      const match = pattern.exec(text);
      if (!match) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push(`${path.relative(root, file)}:${line}: ${match[0]}`);
    }
  }
}

assert.deepEqual(
  findings,
  [],
  `Absolute photo-radar insurance claims remain:\n${findings.join('\n')}`,
);
console.log(`Photo-radar insurance-claim guard passed (${sourceOnly ? 'source only' : 'source and public/prerendered'}).`);
