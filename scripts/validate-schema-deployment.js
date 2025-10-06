#!/usr/bin/env node

/**
 * Schema Validation Script for Alberta Pages
 * Checks LocalBusiness, Service, and FAQ schema deployment
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const HIGH_PRIORITY_PAGES = [
  // Climbing/High-potential pages
  'fight-red-light-ticket-calgary',
  'fight-red-light-ticket-edmonton', 
  'fight-speeding-ticket-calgary',
  'fight-speeding-ticket-edmonton',
  'fight-careless-ticket-calgary',
  'fight-careless-ticket-edmonton',
  'fight-distracted-ticket-calgary',
  'fight-distracted-ticket-edmonton',
  // Major cities
  'fight-speeding-ticket-lethbridge',
  'fight-red-light-ticket-medicine-hat',
  'fight-careless-ticket-red-deer'
];

const BASE_URL = 'https://fabsy.ca';

async function validatePageSchema(slug) {
  try {
    const url = `${BASE_URL}/content/${slug}`;
    console.log(`🔍 Checking: ${slug}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Extract JSON-LD scripts
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
    const schemas = [];
    let match;
    
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const schemaData = JSON.parse(match[1]);
        schemas.push(schemaData);
      } catch (e) {
        console.warn(`  ⚠️  Invalid JSON-LD in ${slug}: ${e.message}`);
      }
    }
    
    // Check for specific schema types
    const results = {
      slug,
      url,
      totalSchemas: schemas.length,
      hasLocalBusiness: false,
      hasService: false,
      hasFAQPage: false,
      hasArticle: false,
      hasHowTo: false,
      cityDetected: null,
      violationDetected: null,
      issues: []
    };
    
    for (const schema of schemas) {
      const type = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
      
      if (type.includes('LocalBusiness')) {
        results.hasLocalBusiness = true;
        results.cityDetected = schema.name?.match(/- ([^,]+)$/)?.[1] || null;
      }
      
      if (type.includes('Service')) {
        results.hasService = true;
      }
      
      if (type.includes('FAQPage')) {
        results.hasFAQPage = true;
      }
      
      if (type.includes('Article')) {
        results.hasArticle = true;
      }
      
      if (type.includes('HowTo')) {
        results.hasHowTo = true;
      }
      
      // Extract violation from service name or schema
      if (schema.serviceType && !results.violationDetected) {
        results.violationDetected = schema.serviceType;
      }
    }
    
    // Quality checks
    if (!results.hasLocalBusiness && results.cityDetected) {
      results.issues.push('Missing LocalBusiness schema despite city detection');
    }
    
    if (results.totalSchemas < 3) {
      results.issues.push(`Low schema count: ${results.totalSchemas} (expected 4-6)`);
    }
    
    if (!results.hasFAQPage) {
      results.issues.push('Missing FAQPage schema');
    }
    
    return results;
    
  } catch (error) {
    return {
      slug,
      url: `${BASE_URL}/content/${slug}`,
      error: error.message,
      totalSchemas: 0,
      hasLocalBusiness: false,
      hasService: false,
      hasFAQPage: false,
      hasArticle: false,
      hasHowTo: false,
      cityDetected: null,
      violationDetected: null,
      issues: [`Fetch error: ${error.message}`]
    };
  }
}

async function main() {
  console.log('🚀 Starting Alberta Schema Validation\n');
  console.log(`📊 Checking ${HIGH_PRIORITY_PAGES.length} high-priority pages...\n`);
  
  const results = [];
  const batchSize = 5; // Avoid rate limiting
  
  for (let i = 0; i < HIGH_PRIORITY_PAGES.length; i += batchSize) {
    const batch = HIGH_PRIORITY_PAGES.slice(i, i + batchSize);
    const batchPromises = batch.map(slug => validatePageSchema(slug));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Brief pause between batches
    if (i + batchSize < HIGH_PRIORITY_PAGES.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Analysis
  console.log('\n📈 SCHEMA DEPLOYMENT ANALYSIS\n');
  console.log('='.repeat(60));
  
  const summary = {
    totalPages: results.length,
    withLocalBusiness: results.filter(r => r.hasLocalBusiness).length,
    withService: results.filter(r => r.hasService).length,
    withFAQPage: results.filter(r => r.hasFAQPage).length,
    withArticle: results.filter(r => r.hasArticle).length,
    withHowTo: results.filter(r => r.hasHowTo).length,
    withErrors: results.filter(r => r.error).length,
    withIssues: results.filter(r => r.issues.length > 0).length
  };
  
  // Summary stats
  console.log(`📋 Coverage Summary:`);
  console.log(`   LocalBusiness Schema: ${summary.withLocalBusiness}/${summary.totalPages} (${Math.round(summary.withLocalBusiness/summary.totalPages*100)}%)`);
  console.log(`   Service Schema:       ${summary.withService}/${summary.totalPages} (${Math.round(summary.withService/summary.totalPages*100)}%)`);
  console.log(`   FAQPage Schema:       ${summary.withFAQPage}/${summary.totalPages} (${Math.round(summary.withFAQPage/summary.totalPages*100)}%)`);
  console.log(`   Article Schema:       ${summary.withArticle}/${summary.totalPages} (${Math.round(summary.withArticle/summary.totalPages*100)}%)`);
  console.log(`   HowTo Schema:         ${summary.withHowTo}/${summary.totalPages} (${Math.round(summary.withHowTo/summary.totalPages*100)}%)`);
  
  if (summary.withErrors > 0) {
    console.log(`\n❌ Pages with errors: ${summary.withErrors}`);
    results.filter(r => r.error).forEach(r => {
      console.log(`   - ${r.slug}: ${r.error}`);
    });
  }
  
  if (summary.withIssues > 0) {
    console.log(`\n⚠️  Pages with issues: ${summary.withIssues}`);
    results.filter(r => r.issues.length > 0).forEach(r => {
      console.log(`   - ${r.slug}:`);
      r.issues.forEach(issue => console.log(`     • ${issue}`));
    });
  }
  
  // Success showcase
  const successPages = results.filter(r => 
    !r.error && 
    r.hasLocalBusiness && 
    r.hasService && 
    r.hasFAQPage && 
    r.issues.length === 0
  );
  
  if (successPages.length > 0) {
    console.log(`\n✅ Perfect schema deployment (${successPages.length} pages):`);
    successPages.slice(0, 5).forEach(r => {
      console.log(`   - ${r.slug} (${r.cityDetected}) - ${r.totalSchemas} schemas`);
    });
    if (successPages.length > 5) {
      console.log(`   ... and ${successPages.length - 5} more`);
    }
  }
  
  // Priority recommendations
  console.log('\n🎯 PRIORITY ACTIONS:');
  
  if (summary.withLocalBusiness < summary.totalPages) {
    console.log(`   1. Deploy LocalBusiness schema to ${summary.totalPages - summary.withLocalBusiness} remaining pages`);
  }
  
  if (summary.withFAQPage < summary.totalPages) {
    console.log(`   2. Add FAQ schema to ${summary.totalPages - summary.withFAQPage} pages missing it`);
  }
  
  if (summary.withErrors > 0) {
    console.log(`   3. Fix ${summary.withErrors} pages with fetch/parsing errors`);
  }
  
  console.log('\n🚀 Schema deployment analysis complete!');
  
  return {
    summary,
    results,
    timestamp: new Date().toISOString()
  };
}

// Export for use as module or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { validatePageSchema, HIGH_PRIORITY_PAGES };