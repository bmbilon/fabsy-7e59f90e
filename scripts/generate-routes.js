#!/usr/bin/env node

/**
 * Generate route definitions from page JSON files
 * This creates the routing configuration for SSG
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateRoutes() {
  console.log('🔄 Generating routes from page content...');

  try {
    const pagesDir = path.resolve(__dirname, '../src/content/pages');
    const files = await fs.readdir(pagesDir);
    
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      console.log('⚠️  No page JSON files found');
      return;
    }

    const routes = [];
    
    for (const file of jsonFiles) {
      const filePath = path.join(pagesDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const pageData = JSON.parse(content);
      
      if (pageData.slug) {
        routes.push({
          slug: pageData.slug,
          path: `/${pageData.slug}`,
          meta_title: pageData.meta_title,
        });
      }
    }

    // Write routes manifest
    const manifestPath = path.resolve(__dirname, '../src/content/routes-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(routes, null, 2), 'utf8');
    
    console.log(`✅ Generated ${routes.length} route(s)`);
    console.log(`  Routes: ${routes.map(r => r.path).join(', ')}`);
  } catch (error) {
    console.error('❌ Route generation failed:', error.message);
    process.exit(1);
  }
}

generateRoutes();
