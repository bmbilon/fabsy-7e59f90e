#!/usr/bin/env node

/**
 * CI Validation: Ensure FAQ JSON-LD exactly matches HTML FAQ text
 * This prevents AEO scoring issues from text mismatches
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function validateFaqJsonLd() {
  console.log('🔍 Validating FAQ JSON-LD exact text matching...');

  try {
    const pagesDir = path.resolve(__dirname, '../src/content/pages');
    const files = await fs.readdir(pagesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let validationErrors = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(pagesDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const pageData = JSON.parse(content);

      if (!pageData.faqs || !Array.isArray(pageData.faqs)) {
        continue;
      }

      // Validate each FAQ entry
      for (let i = 0; i < pageData.faqs.length; i++) {
        const faq = pageData.faqs[i];

        // Check required fields
        if (!faq.q || !faq.a) {
          console.error(`  ❌ ${file}: FAQ #${i + 1} missing q or a`);
          validationErrors++;
          continue;
        }

        // Check for HTML in FAQs (should be plain text for exact matching)
        if (faq.q.includes('<') || faq.a.includes('<')) {
          console.error(`  ❌ ${file}: FAQ #${i + 1} contains HTML - must be plain text`);
          validationErrors++;
        }

        // Check for excess whitespace
        if (faq.q !== faq.q.trim() || faq.a !== faq.a.trim()) {
          console.error(`  ❌ ${file}: FAQ #${i + 1} has untrimmed whitespace`);
          validationErrors++;
        }
      }

      if (validationErrors === 0 && pageData.faqs.length > 0) {
        console.log(`  ✓ ${file}: ${pageData.faqs.length} FAQ(s) validated`);
      }
    }

    if (validationErrors > 0) {
      console.error(`\n❌ Found ${validationErrors} validation error(s)`);
      process.exit(1);
    }

    console.log('\n✅ All FAQ JSON-LD validated successfully');
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

validateFaqJsonLd();
