/**
 * Atomically copy crawler snapshots into dist/prerendered after verifying exact
 * page_content coverage. A missing or inconsistent manifest is always fatal.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(process.env.PRERENDER_SRC_DIR || path.join(ROOT, 'public/prerendered'));
const distDir = path.resolve(process.env.DIST_PRERENDER_DIR || path.join(ROOT, 'dist/prerendered'));
const manifestPath = path.resolve(
  process.env.SNAPSHOT_MANIFEST || path.join(src, 'content-manifest.json')
);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEGACY_GA4_MEASUREMENT_ID = 'G-YRP61S5TPF';
const LEGACY_GA4_BLOCK_RE = /\s*<!-- Google tag \(gtag\.js\) -->\s*<script async(?:="")? src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-YRP61S5TPF"><\/script>\s*<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];\s*function gtag\(\)\{dataLayer\.push\(arguments\);\}\s*gtag\('js', new Date\(\)\);\s*gtag\('config', 'G-YRP61S5TPF'\);\s*<\/script>\s*/g;

function slugArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`content snapshot manifest ${label} must be an array`);
  const seen = new Set();
  for (const slug of value) {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      throw new Error(`content snapshot manifest ${label} contains an invalid slug: ${String(slug)}`);
    }
    if (seen.has(slug)) {
      throw new Error(`content snapshot manifest ${label} contains duplicate slug: ${slug}`);
    }
    seen.add(slug);
  }
  const sorted = [...seen].sort();
  if (JSON.stringify(value) !== JSON.stringify(sorted)) {
    throw new Error(`content snapshot manifest ${label} must be sorted`);
  }
  return sorted;
}

function sameSlugs(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `content snapshot manifest ${label} mismatch (expected ${expected.length}, found ${actual.length})`
    );
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('content snapshot manifest must be an object');
  }
  if (manifest.version !== 2) {
    throw new Error(`content snapshot manifest version must be 2, found ${String(manifest.version)}`);
  }
  if (Array.isArray(manifest.excluded) && manifest.excluded.length > 0) {
    throw new Error('content snapshot manifest excludes source rows');
  }

  const slugs = slugArray(manifest.slugs, 'slugs');
  const dbSlugs = slugArray(manifest.dbSlugs, 'dbSlugs');
  const curatedSourceSlugs = slugArray(manifest.curatedSourceSlugs, 'curatedSourceSlugs');
  const curatedOnlySlugs = slugArray(manifest.curatedOnlySlugs, 'curatedOnlySlugs');
  const curatedSlugs = slugArray(manifest.curatedSlugs, 'curatedSlugs');
  const sourceUnion = [...new Set([...dbSlugs, ...curatedSourceSlugs])].sort();
  const expectedCuratedOnly = curatedSourceSlugs.filter((slug) => !dbSlugs.includes(slug));

  sameSlugs(slugs, sourceUnion, 'source union');
  sameSlugs(curatedOnlySlugs, expectedCuratedOnly, 'curated-only coverage');
  if (curatedSlugs.some((slug) => !curatedSourceSlugs.includes(slug))) {
    throw new Error('content snapshot manifest curatedSlugs contains a non-curated source slug');
  }

  const countChecks = [
    ['dbSourceCount', manifest.dbSourceCount, dbSlugs.length],
    ['curatedSourceCount', manifest.curatedSourceCount, curatedSourceSlugs.length],
    ['curatedOnlyCount', manifest.curatedOnlyCount, curatedOnlySlugs.length],
    ['sourceUnionCount', manifest.sourceUnionCount, sourceUnion.length],
    ['generatedCount', manifest.generatedCount, slugs.length],
    ['curatedCount', manifest.curatedCount, curatedSlugs.length],
    ['fallbackCount', manifest.fallbackCount, slugs.length - curatedSlugs.length],
  ];
  for (const [label, actual, expected] of countChecks) {
    if (!Number.isInteger(actual) || actual !== expected) {
      throw new Error(
        `content snapshot manifest ${label} mismatch (expected ${expected}, found ${String(actual)})`
      );
    }
  }
  if (manifest.generatedCount !== manifest.sourceUnionCount) {
    throw new Error('content snapshot manifest does not cover every usable source slug');
  }
  if (manifest.curatedCount + manifest.fallbackCount !== manifest.generatedCount) {
    throw new Error('content snapshot manifest curated/fallback counts are incomplete');
  }
  if (manifest.pageSyncCount !== null && manifest.pageSyncCount !== dbSlugs.length) {
    throw new Error('content snapshot manifest page sync count does not match DB source count');
  }
  return { ...manifest, slugs };
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`required content snapshot manifest is missing: ${manifestPath}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (_) {
    throw new Error('content snapshot manifest is invalid JSON');
  }
  return validateManifest(manifest);
}

function verifyCoverage(root, manifest, label) {
  const expected = new Set(manifest.slugs);
  for (const slug of expected) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`content snapshot manifest contains an invalid slug: ${slug}`);
    }
    const snapshot = path.join(root, 'content', slug, 'index.html');
    if (!fs.existsSync(snapshot)) throw new Error(`${label} snapshot missing for ${slug}`);
  }

  const contentDir = path.join(root, 'content');
  if (!fs.existsSync(contentDir)) throw new Error(`${label} content directory is missing`);
  const actual = [];
  for (const entry of fs.readdirSync(contentDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !expected.has(entry.name)) {
      throw new Error(`${label} content directory contains unexpected entry: ${entry.name}`);
    }
    const children = fs.readdirSync(path.join(contentDir, entry.name)).sort();
    if (JSON.stringify(children) !== JSON.stringify(['index.html'])) {
      throw new Error(`${label} snapshot ${entry.name} contains unexpected files`);
    }
    actual.push(entry.name);
  }
  if (actual.length !== expected.size || actual.some((slug) => !expected.has(slug))) {
    throw new Error(
      `${label} content coverage mismatch (expected ${expected.size}, found ${actual.length})`
    );
  }
}

function removeLegacyAnalyticsTags(root) {
  const pending = [root];
  let cleaned = 0;

  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(filePath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const original = fs.readFileSync(filePath, 'utf8');
        if (!original.includes(LEGACY_GA4_MEASUREMENT_ID)) continue;
        const sanitized = original.replace(LEGACY_GA4_BLOCK_RE, '\n');
        if (sanitized.includes(LEGACY_GA4_MEASUREMENT_ID)) {
          throw new Error(`legacy GA4 tag remains in staged snapshot: ${filePath}`);
        }
        fs.writeFileSync(filePath, sanitized, 'utf8');
        cleaned += 1;
      }
    }
  }

  return cleaned;
}

function copyAtomically(manifest) {
  if (src === distDir) throw new Error('prerendered source and destination must differ');
  const parent = path.dirname(distDir);
  const tempDir = path.join(parent, `.prerendered-copy-${process.pid}`);
  const backupDir = path.join(parent, `.prerendered-backup-${process.pid}`);
  fs.mkdirSync(parent, { recursive: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.cpSync(src, tempDir, { recursive: true, force: true });
  const cleanedLegacyTags = removeLegacyAnalyticsTags(tempDir);

  const copiedManifestPath = path.join(tempDir, 'content-manifest.json');
  if (path.resolve(manifestPath) !== path.resolve(path.join(src, 'content-manifest.json'))) {
    fs.copyFileSync(manifestPath, copiedManifestPath);
  }
  validateManifest(JSON.parse(fs.readFileSync(copiedManifestPath, 'utf8')));
  verifyCoverage(tempDir, manifest, 'staged dist');

  let movedExisting = false;
  try {
    if (fs.existsSync(distDir)) {
      fs.renameSync(distDir, backupDir);
      movedExisting = true;
    }
    fs.renameSync(tempDir, distDir);
    if (movedExisting) fs.rmSync(backupDir, { recursive: true, force: true });
    if (cleanedLegacyTags > 0) {
      console.log(`Removed legacy GA4 tag from ${cleanedLegacyTags} staged snapshot(s).`);
    }
  } catch (error) {
    if (!fs.existsSync(distDir) && movedExisting && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, distDir);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

try {
  if (!fs.existsSync(src)) {
    throw new Error(`prerendered source directory is missing: ${src}`);
  }

  const manifest = readManifest();
  verifyCoverage(src, manifest, 'source');
  copyAtomically(manifest);
  verifyCoverage(distDir, manifest, 'dist');
  console.log(`Prerendered copy complete: ${manifest.generatedCount} content snapshot(s) verified.`);
} catch (error) {
  const message = error && typeof error.message === 'string' ? error.message : 'unknown error';
  console.error(`Prerendered copy failed: ${message}`);
  process.exit(1);
}
