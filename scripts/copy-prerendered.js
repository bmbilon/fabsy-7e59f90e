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

// Ensure dist/prerendered exists
fs.mkdirSync(distDir, { recursive: true });

// Prefer Node's built-in recursive copy to preserve directory structure
try {
  // Note: fs.cpSync is available in Node >=16
  fs.cpSync(publicDir, distDir, { recursive: true, force: true });
  console.log('✅ Copied prerendered directory recursively');
} catch (err) {
  console.error('❌ Failed to copy prerendered files:', err);
  process.exit(1);
}
