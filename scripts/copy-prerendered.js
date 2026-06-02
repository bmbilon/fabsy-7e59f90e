/**
 * Copy prerendered snapshots into dist/prerendered.
 * Merges ./public/prerendered and ./prerendered (the 26 city/violation AEO pages).
 */
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('./dist/prerendered');
const sources = [path.resolve('./public/prerendered'), path.resolve('./prerendered')];

fs.mkdirSync(distDir, { recursive: true });

let copied = 0;
for (const src of sources) {
  if (!fs.existsSync(src)) { console.warn('skip (missing):', src); continue; }
  fs.cpSync(src, distDir, { recursive: true, force: true });
  copied++;
  console.log('copied', src, '->', distDir);
}
if (!copied) { console.warn('No prerendered sources found.'); process.exit(0); }
console.log('Prerendered merge complete.');
