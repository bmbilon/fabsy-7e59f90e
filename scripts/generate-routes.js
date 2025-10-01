/**
 * Generate src/content/routes-manifest.json from src/content/pages/*.json
 * This runs during prebuild after sync-pages-from-db.js
 */
import fs from 'fs';
import path from 'path';

const pagesDir = path.resolve('./src/content/pages');
const outFile = path.resolve('./src/content/routes-manifest.json');

console.log('📋 Generating routes manifest...');

if (!fs.existsSync(pagesDir)) {
  console.warn('⚠️  No pages directory found at', pagesDir);
  fs.writeFileSync(outFile, JSON.stringify({ routes: [] }, null, 2), 'utf8');
  console.log('✓ Created empty routes manifest');
  process.exit(0);
}

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.warn('⚠️  No JSON files found in', pagesDir);
  fs.writeFileSync(outFile, JSON.stringify({ routes: [] }, null, 2), 'utf8');
  console.log('✓ Created empty routes manifest');
  process.exit(0);
}

const routes = files.map(file => {
  const slug = path.basename(file, '.json');
  const filePath = path.join(pagesDir, file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  return {
    path: `/content/${slug}`,
    slug: slug,
    meta_title: content.meta_title || '',
    meta_description: content.meta_description || '',
    h1: content.h1 || ''
  };
});

const manifest = {
  generated: new Date().toISOString(),
  count: routes.length,
  routes: routes
};

fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`✅ Generated routes manifest: ${routes.length} route(s)`);
routes.forEach(r => console.log(`   ${r.path}`));
