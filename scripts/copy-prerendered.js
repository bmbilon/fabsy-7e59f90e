/**
 * Copy prerendered files to dist folder after build
 * This ensures the prerendered content is available in production
 */
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve('./public/prerendered');
const distDir = path.resolve('./dist/prerendered');

console.log('📋 Copying prerendered files to dist...');

if (!fs.existsSync(publicDir)) {
  console.warn('⚠️  No prerendered directory found at', publicDir);
  process.exit(0);
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const files = fs.readdirSync(publicDir);

files.forEach(file => {
  const src = path.join(publicDir, file);
  const dest = path.join(distDir, file);
  
  fs.copyFileSync(src, dest);
  console.log(`✅ Copied: ${file}`);
});

console.log(`✅ Copied ${files.length} prerendered file(s) to dist`);