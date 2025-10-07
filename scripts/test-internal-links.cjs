#!/usr/bin/env node

/**
 * Test Internal Link Generator with Mock Data
 * 
 * This script tests the internal linking functionality using mock Alberta content pages
 * to demonstrate how the system works without requiring database access.
 */

const fs = require('fs').promises;
const path = require('path');

// Mock data representing Alberta content pages
const mockPages = [
  {
    slug: "/content/fight-speeding-ticket-calgary",
    title: "Fight Speeding Ticket Calgary",
    city: "Calgary",
    offence_slug: "speeding",
    canonical: true,
    content: "Content for Calgary speeding ticket page..."
  },
  {
    slug: "/content/fight-red-light-ticket-calgary",
    title: "Fight Red Light Ticket Calgary", 
    city: "Calgary",
    offence_slug: "red-light",
    canonical: true,
    content: "Content for Calgary red light ticket page..."
  },
  {
    slug: "/content/fight-careless-driving-ticket-calgary",
    title: "Fight Careless Driving Ticket Calgary",
    city: "Calgary", 
    offence_slug: "careless-driving",
    canonical: true,
    content: "Content for Calgary careless driving ticket page..."
  },
  {
    slug: "/content/fight-speeding-ticket-edmonton",
    title: "Fight Speeding Ticket Edmonton",
    city: "Edmonton",
    offence_slug: "speeding", 
    canonical: true,
    content: "Content for Edmonton speeding ticket page..."
  },
  {
    slug: "/content/fight-distracted-driving-ticket-calgary",
    title: "Fight Distracted Driving Ticket Calgary",
    city: "Calgary",
    offence_slug: "distracted-driving",
    canonical: true,
    content: "Content for Calgary distracted driving ticket page..."
  },
  // Hub pages
  {
    slug: "/content/alberta-tickets-101",
    title: "Alberta Traffic Tickets 101",
    canonical: true,
    content: "Complete guide to Alberta traffic tickets..."
  },
  {
    slug: "/content/demerits-and-insurance-alberta", 
    title: "Demerits & Insurance Alberta",
    canonical: true,
    content: "How demerit points affect insurance..."
  }
];

// Internal linking configuration (simplified)
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
    }
  ],

  offence_map: {
    "speeding": {
      siblings: ["red-light", "following-too-close"],
      hub: "risk"
    },
    "red-light": {
      siblings: ["careless-driving", "speeding"],
      hub: "foundation"  
    },
    "distracted-driving": {
      siblings: ["careless-driving", "speeding"],
      hub: "foundation"
    },
    "careless-driving": {
      siblings: ["red-light", "speeding"],
      hub: "risk"
    }
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

    return links;
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

async function testInternalLinking() {
  console.log('🧪 Testing Internal Link Generator with Mock Data');
  console.log('================================================');
  
  const generator = new SimpleInternalLinkGenerator(mockPages);
  const results = [];
  
  // Process only city/offence pages (not hub pages)
  const cityOffencePages = mockPages.filter(p => p.city && p.offence_slug);
  
  console.log(`\\n📊 Processing ${cityOffencePages.length} city/offence pages...`);
  
  for (const page of cityOffencePages) {
    const links = generator.generateLinksForPage(page);
    
    console.log(`\\n🔗 ${page.title} (${page.city} - ${page.offence_slug}):`);
    
    if (links.length > 0) {
      links.forEach((link, index) => {
        console.log(`   ${index + 1}. [${link.type}] "${link.anchor}" → ${link.url}`);
      });
      
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
    } else {
      console.log('   No links generated');
    }
  }
  
  // Generate summary
  console.log('\\n📈 SUMMARY');
  console.log('==========');
  console.log(`Pages processed: ${cityOffencePages.length}`);
  console.log(`Pages with links: ${results.length}`);
  console.log(`Total links generated: ${results.reduce((sum, r) => sum + r.links.length, 0)}`);
  
  // Link type breakdown
  const typeCounts = { sibling: 0, hub: 0 };
  results.forEach(result => {
    result.links.forEach(link => {
      typeCounts[link.type] = (typeCounts[link.type] || 0) + 1;
    });
  });
  
  console.log(`Sibling links: ${typeCounts.sibling}`);
  console.log(`Hub links: ${typeCounts.hub}`);
  
  // Save results
  const outputPath = path.join(process.cwd(), 'data', 'test-internal-links.json');
  
  const output = {
    generated_at: new Date().toISOString(),
    mock_data_used: true,
    total_pages: results.length,
    total_links: results.reduce((sum, r) => sum + r.links.length, 0),
    results
  };
  
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`\\n💾 Test results saved to: ${outputPath}`);
  console.log('\\n✅ Internal linking test completed successfully!');
}

// Example of what the generated links would look like in HTML
function generateExampleHTML() {
  console.log('\\n📝 Example HTML Output:');
  console.log('========================');
  
  const examples = [
    {
      anchor: "Fix a Red Light ticket in Calgary",
      url: "/content/fight-red-light-ticket-calgary",
      section: "intro_after_lede"
    },
    {
      anchor: "Learn more: Avoiding insurance hikes", 
      url: "/content/demerits-and-insurance-alberta",
      section: "mid_faq"
    }
  ];
  
  examples.forEach(example => {
    console.log(`\\n<!-- Inserted in ${example.section} -->`);
    console.log(`<p data-section="internal-link">`);
    console.log(`  <a href="${example.url}" data-internal-link="auto-generated">`);
    console.log(`    ${example.anchor}`);
    console.log(`  </a>`);
    console.log(`</p>`);
  });
}

async function main() {
  try {
    await testInternalLinking();
    generateExampleHTML();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  testInternalLinking,
  SimpleInternalLinkGenerator
};