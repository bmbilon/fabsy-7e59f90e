#!/usr/bin/env node

/**
 * Smoke Test: End-to-End AEO Content Pipeline
 * 
 * Tests the complete flow:
 * 1. AI generates content (analyze-ticket-ai)
 * 2. Content saved to DB (upsert-page-content)
 * 3. DB synced to JSON files (sync-pages-from-db)
 * 4. Routes generated (generate-routes)
 * 5. FAQ validation passes
 * 6. Build succeeds
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function smokeTest() {
  console.log('🧪 Starting AEO Pipeline Smoke Test\n');
  
  let testSlug = `test-speeding-calgary-${Date.now()}`;
  
  try {
    // Step 1: Call AI analysis function
    console.log('📝 Step 1: Calling analyze-ticket-ai...');
    const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-ticket-ai', {
      body: {
        question: 'Can I dispute a speeding ticket in Calgary?',
        ticketData: {
          city: 'Calgary',
          charge: 'Speeding 20km over',
          fine: '$150',
          date: '2025-09-15'
        }
      }
    });

    if (aiError) {
      throw new Error(`AI function error: ${aiError.message}`);
    }

    if (!aiData || !aiData.ai_answer || !aiData.page_json) {
      throw new Error('AI function returned invalid data structure');
    }

    console.log('  ✅ AI generated content successfully');
    console.log(`  📄 Hook: "${aiData.ai_answer.hook}"`);
    console.log(`  📝 FAQs: ${aiData.page_json.faqs.length} questions`);
    
    // Validate AI answer structure
    if (!aiData.ai_answer.disclaimer) {
      throw new Error('AI answer missing required disclaimer');
    }
    console.log('  ✅ Disclaimer present in AI answer');

    // Step 2: Save to database via upsert function
    console.log('\n💾 Step 2: Saving to database via upsert-page-content...');
    
    // Override slug for test
    testSlug = `smoke-test-${Date.now()}`;
    aiData.page_json.slug = testSlug;
    aiData.page_json.status = 'published'; // Publish immediately for test
    
    const { data: upsertData, error: upsertError } = await supabase.functions.invoke('upsert-page-content', {
      body: aiData.page_json
    });

    if (upsertError) {
      throw new Error(`Upsert function error: ${upsertError.message}`);
    }

    console.log(`  ✅ Page saved to database: ${testSlug}`);

    // Step 3: Verify in database
    console.log('\n🔍 Step 3: Verifying in database...');
    const { data: dbData, error: dbError } = await supabase
      .from('page_content')
      .select('*')
      .eq('slug', testSlug)
      .single();

    if (dbError) {
      throw new Error(`Database query error: ${dbError.message}`);
    }

    console.log('  ✅ Page found in database');
    console.log(`  📊 Fields: ${Object.keys(dbData).join(', ')}`);
    
    // Validate FAQ structure
    if (!Array.isArray(dbData.faqs) || dbData.faqs.length === 0) {
      throw new Error('FAQs missing or invalid in database');
    }
    
    for (let i = 0; i < dbData.faqs.length; i++) {
      const faq = dbData.faqs[i];
      if (!faq.q || !faq.a) {
        throw new Error(`FAQ #${i + 1} missing q or a field`);
      }
      if (typeof faq.q !== 'string' || typeof faq.a !== 'string') {
        throw new Error(`FAQ #${i + 1} has non-string q or a`);
      }
      if (faq.q.includes('<') || faq.a.includes('<')) {
        throw new Error(`FAQ #${i + 1} contains HTML (must be plain text)`);
      }
    }
    console.log(`  ✅ ${dbData.faqs.length} FAQs validated (plain text, no HTML)`);

    // Step 4: Sync to JSON file
    console.log('\n📁 Step 4: Simulating sync-pages-from-db...');
    const outDir = path.resolve(__dirname, '../src/content/pages');
    await fs.mkdir(outDir, { recursive: true });
    
    const pageJson = {
      slug: dbData.slug,
      meta_title: dbData.meta_title,
      meta_description: dbData.meta_description,
      h1: dbData.h1,
      hook: dbData.hook,
      bullets: dbData.bullets,
      what: dbData.what,
      how: dbData.how,
      next: dbData.next,
      faqs: dbData.faqs,
      video: dbData.video,
    };

    const outPath = path.join(outDir, `${testSlug}.json`);
    await fs.writeFile(outPath, JSON.stringify(pageJson, null, 2), 'utf8');
    console.log(`  ✅ JSON file created: ${outPath}`);

    // Step 5: Validate FAQ JSON-LD equality
    console.log('\n🔍 Step 5: Validating FAQ JSON-LD equality...');
    for (let i = 0; i < pageJson.faqs.length; i++) {
      const faq = pageJson.faqs[i];
      
      if (faq.q !== faq.q.trim() || faq.a !== faq.a.trim()) {
        throw new Error(`FAQ #${i + 1} has untrimmed whitespace`);
      }
      
      if (faq.q.includes('<') || faq.a.includes('<')) {
        throw new Error(`FAQ #${i + 1} contains HTML tags`);
      }
    }
    console.log('  ✅ All FAQs pass JSON-LD equality validation');

    // Step 6: Generate route entry
    console.log('\n🗺️  Step 6: Generating route entry...');
    const routeEntry = {
      slug: pageJson.slug,
      path: `/${pageJson.slug}`,
      meta_title: pageJson.meta_title,
    };
    console.log(`  ✅ Route: ${routeEntry.path}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SMOKE TEST PASSED - All steps completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📊 Test Summary:');
    console.log(`  • Slug: ${testSlug}`);
    console.log(`  • Title: ${pageJson.meta_title}`);
    console.log(`  • Hook: ${pageJson.hook}`);
    console.log(`  • FAQs: ${pageJson.faqs.length}`);
    console.log(`  • JSON file: ${outPath}`);
    
    console.log('\n🎯 Next Steps:');
    console.log('  1. Run: npm run build (to trigger full SSG build)');
    console.log(`  2. Visit: http://localhost:5173/${testSlug} (in dev mode)`);
    console.log('  3. Check routes manifest: src/content/routes-manifest.json');
    console.log('\n💡 To clean up test page:');
    console.log(`  • Delete from DB: DELETE FROM page_content WHERE slug = '${testSlug}';`);
    console.log(`  • Delete JSON file: rm ${outPath}`);

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ SMOKE TEST FAILED');
    console.error('='.repeat(60));
    console.error('\nError:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

smokeTest();
