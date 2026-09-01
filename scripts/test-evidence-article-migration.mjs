import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260831123000_evidence_article_disclosure_correction.sql'),
  'utf8',
);
const guardSource = fs.readFileSync(
  path.join(root, 'src/lib/published-content-guardrails-core.js'),
  'utf8',
);

function guardConstant(name) {
  const match = guardSource.match(new RegExp(`const ${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1;`));
  assert.ok(match, `guardrail constant ${name} must exist`);
  return match[2];
}

function migrationDollarValue(tag) {
  const marker = `$${tag}$`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `migration dollar quote ${marker} must exist`);
  const end = migration.indexOf(marker, start + marker.length);
  assert.notEqual(end, -1, `migration dollar quote ${marker} must close`);
  return migration.slice(start + marker.length, end);
}

const legacyHeading = guardConstant('LEGACY_DISCLOSURE_HEADING');
const safeHeading = guardConstant('SAFE_DISCLOSURE_HEADING');
const legacyParagraph = guardConstant('LEGACY_DISCLOSURE_PARAGRAPH');
const safeParagraph = guardConstant('SAFE_DISCLOSURE_PARAGRAPH');

assert.equal(migrationDollarValue('slug'), 'alberta-traffic-trial-evidence-self-represented');
assert.equal(migrationDollarValue('legacy_heading'), legacyHeading);
assert.equal(migrationDollarValue('safe_heading'), safeHeading);
assert.equal(migrationDollarValue('legacy_paragraph'), legacyParagraph);
assert.equal(migrationDollarValue('safe_paragraph'), safeParagraph);

assert.match(migration, /^begin;[\s\S]*commit;\s*$/i, 'migration must be transactional');
assert.ok(
  (migration.match(/status\s*=\s*'published'/gi) || []).length >= 3,
  'target checks, lock and update must stay scoped to the published row',
);
assert.match(migration, /if v_target_count <> 1 then[\s\S]*raise exception/i);
assert.match(migration, /get diagnostics v_changed_count = row_count;/i);
assert.match(migration, /if v_changed_count <> 1 then[\s\S]*raise exception/i);
assert.match(
  migration,
  /elsif v_legacy_heading_count = 0[\s\S]*v_legacy_paragraph_count = 0[\s\S]*v_safe_heading_count = 1[\s\S]*v_safe_paragraph_count = 1 then\s*return;/i,
  'an already-corrected row must be a no-op',
);

const updateBlock = migration.match(/update public\.blog_posts\s+set([\s\S]*?)\s+where\s+slug = v_slug/i);
assert.ok(updateBlock, 'migration must update the exact blog row');
const assignedFields = [...updateBlock[1].matchAll(/^\s*([a-z_]+)\s*=/gmi)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(
  assignedFields,
  ['content', 'reviewed_at', 'updated_at'],
  'migration must preserve every field except reviewed content and editorial timestamps',
);
assert.match(
  updateBlock[1].replace(/\s+/g, ' '),
  /content = replace\( replace\(content, v_legacy_heading, v_safe_heading\), v_legacy_paragraph, v_safe_paragraph \)/i,
);
assert.doesNotMatch(migration, /\b(?:delete|insert|alter|drop|truncate)\b/i);

const legacyDocument = `Before\n\n${legacyHeading}\n\n${legacyParagraph}\n\nAfter`;
const correctedDocument = legacyDocument
  .replace(legacyHeading, safeHeading)
  .replace(legacyParagraph, safeParagraph);
assert.equal(correctedDocument.split(safeHeading).length - 1, 1);
assert.equal(correctedDocument.split(safeParagraph).length - 1, 1);
assert.ok(!correctedDocument.includes(legacyHeading));
assert.ok(!correctedDocument.includes(legacyParagraph));
assert.equal(
  correctedDocument.replace(legacyHeading, safeHeading).replace(legacyParagraph, safeParagraph),
  correctedDocument,
  'reapplying the exact replacements must not modify an already-corrected document',
);

console.log('Evidence article migration contract passed.');
