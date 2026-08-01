/**
 * Copy prerendered snapshots into dist/prerendered.
 */
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('./dist/prerendered');
const src = path.resolve('./public/prerendered');

fs.mkdirSync(distDir, { recursive: true });

if (!fs.existsSync(src)) { console.warn('No prerendered source found:', src); process.exit(0); }
fs.cpSync(src, distDir, { recursive: true, force: true });
console.log('copied', src, '->', distDir);
console.log('Prerendered merge complete.');
