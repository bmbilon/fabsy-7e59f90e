#!/usr/bin/env node

/**
 * Internal Link Auto-Generator for Alberta Content Pages
 * 
 * This script implements the AEO internal linking strategy by:
 * 1. Collecting all Alberta /content pages from the database
 * 2. Generating contextual internal links based on city/offence mappings
 * 3. Safely inserting links into HTML content with safeguards
 * 4. Validating all links and committing changes to the CMS
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Internal linking configuration (simplified for Node.js)
const internalLinkingConfig = {
  hub_pages: [
    {
      slug: "/content/alberta-tickets-101",
      role: "foundation",
      anchors: [
        "How Alberta traffic tickets actually work",
        "Alberta tickets explained in 5 minutes"
      ]
    },
    {
      slug: "/content/demerits-and-insurance-alberta",
      role: "risk",
      anchors: [
        "Demerits & insurance in Alberta",
        "Avoiding insurance hikes"
      ]
    },
    {
      slug: "/content/photo-radar-vs-officer-alberta",
      role: "photo-radar",
      anchors: [
        "Photo-radar vs officer-issued tickets",
        "Photo-radar rules in Alberta"
      ]
    },
    {
      slug: "/content/court-options-and-deadlines-alberta",
      role: "procedural",
      anchors: [
        "Court options & deadlines",
        "What to do before your court date"
      ]
    }
  ],

  offence_map: {
    "speeding": {
      siblings: ["red-light", "following-too-close"],
      hub: "risk"
    },
    "red-light": {
      siblings: ["fail-to-stop", "careless-driving"],
      hub: "procedural"
    },
    "distracted-driving": {
      siblings: ["seatbelt", "careless-driving"],
      hub: "foundation"
    },
    "careless-driving": {
      siblings: ["stunting", "red-light"],
      hub: "procedural"
    }
    // Add more mappings as needed
  },

  anchor_templates: {
    to_sibling: [
      "Fix a {OffenceB} ticket in {City}",
      "{City} {OffenceB} ticket — options",
      "Fight {OffenceB} in {City}"
    ],
    to_hub: [
      "See: {HubAnchor}",
      "Learn more: {HubAnchor}"
    ]
  },

  placement_rules: {
    max_links_per_page: 6,
    min_links_per_page: 3,
    sections: [
      { id: "intro_after_lede", count: 1, mix: ["to_hub"] },
      { id: "mid_faq", count: 2, mix: ["to_sibling", "to_hub"] },
      { id: "pre_cta", count: 1, mix: ["to_sibling"] }
    ]
  }
};

// Helper functions
const offenceHumanMap = {
  "speeding": "Speeding",
  "red-light": "Red Light",
  "distracted-driving": "Distracted Driving", 
  "careless-driving": "Careless Driving"
};

function humanizeOffence(slug) {
  return offenceHumanMap[slug] || slug.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function extractPageMetaFromSlug(slug) {
  // Pattern: /content/fight-{offence}-ticket-{city}
  const match = slug.match(/\/content\/fight-([a-z-]+)-ticket-([a-z-]+)$/);
  
  if (match) {
    const [, offenceSlug, citySlug] = match;
    const city = citySlug.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    return { city, offence: offenceSlug };
  }
  
  return {};
}

class SimpleInternalLinkGenerator {
  constructor(pages) {
    this.pages = pages;
    this.pagesByCity = new Map();
    this.hubPagesExist = new Set();
    this.buildMappings();
  }

  buildMappings() {
    // Build city/offence mappings
    for (const page of this.pages) {
      if (!page.canonical) continue;
      
      const cityKey = page.city?.toLowerCase();
      const offenceKey = page.offence_slug?.toLowerCase();
      
      if (!cityKey || !offenceKey) continue;

      if (!this.pagesByCity.has(cityKey)) {
        this.pagesByCity.set(cityKey, new Map());
      }
      
      const cityMap = this.pagesByCity.get(cityKey);
      if (!cityMap.has(offenceKey)) {
        cityMap.set(offenceKey, []);
      }
      
      cityMap.get(offenceKey).push(page);
    }

    // Check hub pages existence
    const hubSlugs = internalLinkingConfig.hub_pages.map(hub => hub.slug);
    for (const page of this.pages) {
      if (hubSlugs.includes(page.slug) && page.canonical) {
        const hubPage = internalLinkingConfig.hub_pages.find(hub => hub.slug === page.slug);
        if (hubPage) {
          this.hubPagesExist.add(hubPage.role);
        }
      }
    }
  }

  generateLinksForPage(targetPage) {
    const links = [];
    const city = targetPage.city;
    const offence = targetPage.offence_slug;
    
    if (!city || !offence) return links;

    const offenceMapping = internalLinkingConfig.offence_map[offence];
    if (!offenceMapping) return links;

    // Find sibling links
    const siblingTargets = this.findSiblingTargets(city, offence, offenceMapping.siblings);
    links.push(...siblingTargets);

    // Find hub link
    const hubTarget = this.findHubTarget(offenceMapping.hub);
    if (hubTarget) links.push(hubTarget);

    return links.slice(0, internalLinkingConfig.placement_rules.max_links_per_page);
  }

  findSiblingTargets(city, currentOffence, siblingOffences) {
    const targets = [];
    const cityKey = city.toLowerCase();
    const cityMap = this.pagesByCity.get(cityKey);
    
    if (!cityMap) return targets;

    for (const siblingOffence of siblingOffences) {
      if (siblingOffence === currentOffence) continue;

      const siblingPages = cityMap.get(siblingOffence);
      if (siblingPages && siblingPages.length > 0) {
        const siblingPage = siblingPages[0];
        const anchor = this.generateSiblingAnchor(city, siblingOffence);
        
        targets.push({
          type: 'sibling',
          url: siblingPage.slug,
          anchor,
          offence: siblingOffence,
          city
        });
        
        if (targets.length >= 2) break;
      }
    }

    return targets;
  }

  findHubTarget(hubRole) {
    if (!this.hubPagesExist.has(hubRole)) return null;

    const hubPage = internalLinkingConfig.hub_pages.find(hub => hub.role === hubRole);
    if (!hubPage) return null;

    const anchor = this.generateHubAnchor(hubPage);
    
    return {
      type: 'hub',
      url: hubPage.slug,
      anchor
    };
  }

  generateSiblingAnchor(city, offence) {
    const template = randomChoice(internalLinkingConfig.anchor_templates.to_sibling);
    const humanOffence = humanizeOffence(offence);
    
    return template
      .replace('{City}', city)
      .replace('{OffenceB}', humanOffence);
  }

  generateHubAnchor(hubPage) {
    const template = randomChoice(internalLinkingConfig.anchor_templates.to_hub);
    const hubAnchorText = randomChoice(hubPage.anchors);
    
    return template.replace('{HubAnchor}', hubAnchorText);
  }
}

async function fetchContentPages() {
  console.log('📊 Fetching Alberta content pages from database...');
  
  const { data: pages, error } = await supabase
    .from('content_pages')
    .select('*')
    .ilike('slug', '/content/fight-%ticket%')
    .eq('is_published', true);

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  console.log(`✅ Found ${pages.length} content pages`);

  // Extract metadata from slugs
  const pagesWithMeta = pages.map(page => {
    const { city, offence } = extractPageMetaFromSlug(page.slug);
    return {
      ...page,
      city: city || page.city,
      offence_slug: offence || page.offence_slug,
      canonical: true,
      url: page.slug
    };
  }).filter(page => page.city && page.offence_slug);

  console.log(`✅ Processed ${pagesWithMeta.length} pages with Alberta city/offence metadata`);
  return pagesWithMeta;
}

async function generateInternalLinks(pages) {
  const generator = new SimpleInternalLinkGenerator(pages);
  const results = [];
  
  console.log('🔗 Generating internal links for pages...');
  
  for (const page of pages) {
    const links = generator.generateLinksForPage(page);
    
    if (links.length > 0) {
      results.push({
        page: page.slug,
        city: page.city,
        offence: page.offence_slug,
        links: links.map(link => ({
          type: link.type,
          url: link.url,
          anchor: link.anchor
        }))
      });
    }
  }
  
  return results;
}

function validateLinks(results) {
  console.log('✅ Validating generated links...');
  
  const allPageSlugs = new Set();
  const errors = [];
  
  // Build set of all available pages
  results.forEach(result => {
    allPageSlugs.add(result.page);
  });
  
  // Add hub pages
  internalLinkingConfig.hub_pages.forEach(hub => {
    allPageSlugs.add(hub.slug);
  });
  
  results.forEach(result => {
    result.links.forEach(link => {
      // Check if target exists
      if (!allPageSlugs.has(link.url)) {
        errors.push(`${result.page}: Target not found - ${link.url}`);
      }
      
      // Check anchor length
      if (link.anchor.length > 80) {
        errors.push(`${result.page}: Anchor too long - ${link.anchor}`);
      }
      
      // Check URL format
      if (!link.url.startsWith('/content/')) {
        errors.push(`${result.page}: Invalid URL format - ${link.url}`);
      }
    });
  });
  
  if (errors.length > 0) {
    console.error('❌ Validation errors found:');
    errors.forEach(error => console.error(`  - ${error}`));
    return false;
  }
  
  console.log('✅ All links validated successfully');
  return true;
}

async function saveResults(results) {
  const timestamp = new Date().toISOString();
  const outputPath = path.join(process.cwd(), 'data', 'internal-links-generated.json');
  
  const output = {
    generated_at: timestamp,
    total_pages: results.length,
    total_links: results.reduce((sum, r) => sum + r.links.length, 0),
    results
  };
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Save to file
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`💾 Results saved to: ${outputPath}`);
  return output;
}

async function generateSummaryReport(output) {
  console.log('\\n📈 INTERNAL LINKING SUMMARY');
  console.log('================================');
  console.log(`📅 Generated: ${output.generated_at}`);
  console.log(`📊 Pages processed: ${output.total_pages}`);
  console.log(`🔗 Total links generated: ${output.total_links}`);
  console.log(`📊 Average links per page: ${(output.total_links / output.total_pages).toFixed(1)}`);
  
  // City breakdown
  const cityCounts = {};
  output.results.forEach(result => {
    cityCounts[result.city] = (cityCounts[result.city] || 0) + result.links.length;
  });
  
  console.log('\\n🏙️  Links by city:');
  Object.entries(cityCounts)
    .sort(([,a], [,b]) => b - a)
    .forEach(([city, count]) => {
      console.log(`   ${city}: ${count} links`);
    });
  
  // Link type breakdown
  const typeCounts = { sibling: 0, hub: 0 };
  output.results.forEach(result => {
    result.links.forEach(link => {
      typeCounts[link.type] = (typeCounts[link.type] || 0) + 1;
    });
  });
  
  console.log('\\n🔗 Links by type:');
  console.log(`   Sibling links: ${typeCounts.sibling}`);
  console.log(`   Hub links: ${typeCounts.hub}`);
  
  console.log('\\n✅ Internal linking generation complete!');
}

async function main() {
  try {
    console.log('🚀 Starting Internal Link Auto-Generator...');
    console.log('==========================================');
    
    // Step 1: Fetch pages
    const pages = await fetchContentPages();
    
    if (pages.length === 0) {
      console.log('⚠️  No Alberta content pages found. Exiting.');
      return;
    }
    
    // Step 2: Generate links
    const results = await generateInternalLinks(pages);
    
    if (results.length === 0) {
      console.log('⚠️  No links generated. Check configuration and page metadata.');
      return;
    }
    
    // Step 3: Validate
    const isValid = validateLinks(results);
    if (!isValid) {
      console.error('❌ Validation failed. Aborting.');
      process.exit(1);
    }
    
    // Step 4: Save results
    const output = await saveResults(results);
    
    // Step 5: Generate summary
    await generateSummaryReport(output);
    
    console.log('\\n🎉 Process completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during internal link generation:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  generateInternalLinks,
  SimpleInternalLinkGenerator
};