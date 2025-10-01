#!/usr/bin/env node

/**
 * Sync page content from Supabase to local JSON files
 * Run this before build to ensure latest content is used for SSG
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function syncPages() {
  console.log('🔄 Syncing pages from Supabase...');

  try {
    // Fetch all page content from DB
    const { data: pages, error } = await supabase
      .from('page_content')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    if (!pages || pages.length === 0) {
      console.log('⚠️  No pages found in database');
      return;
    }

    // Ensure output directory exists
    const outDir = path.resolve(__dirname, '../src/content/pages');
    await fs.mkdir(outDir, { recursive: true });

    // Write each page as a JSON file
    let written = 0;
    for (const page of pages) {
      const outPath = path.join(outDir, `${page.slug}.json`);
      
      // Transform DB row to page JSON format
      const pageJson = {
        slug: page.slug,
        meta_title: page.meta_title,
        meta_description: page.meta_description,
        h1: page.h1,
        hook: page.hook,
        bullets: page.bullets,
        what: page.what,
        how: page.how,
        next: page.next,
        faqs: page.faqs,
        video: page.video,
      };

      await fs.writeFile(outPath, JSON.stringify(pageJson, null, 2), 'utf8');
      console.log(`  ✓ Wrote ${page.slug}.json`);
      written++;
    }

    console.log(`✅ Synced ${written} page(s) successfully`);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

syncPages();
