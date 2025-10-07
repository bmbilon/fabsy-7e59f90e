#!/usr/bin/env node
/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 10: Internal Linking Strategy for City Expansion
 * 
 * AEO-EXP-003: Add internal links to new cities
 * Success criteria: Each new city page receives ≥3 internal links from existing landed pages
 */

const fs = require('fs');
const path = require('path');

// New city targets
const newCities = [
  { name: "Grande Prairie", slug: "grande-prairie", offences: ["speeding", "red-light", "distracted-driving"], region: "northern" },
  { name: "Spruce Grove", slug: "spruce-grove", offences: ["speeding", "seatbelt", "no-insurance"], region: "central" },
  { name: "Wetaskiwin", slug: "wetaskiwin", offences: ["speeding", "fail-to-yield", "careless-driving"], region: "central" },
  { name: "Camrose", slug: "camrose", offences: ["speeding", "fail-to-stop", "following-too-close"], region: "central" },
  { name: "Cold Lake", slug: "cold-lake", offences: ["speeding", "red-light", "distracted-driving"], region: "northern" },
  { name: "Canmore", slug: "canmore", offences: ["speeding", "stunting", "seatbelt"], region: "southern" },
  { name: "High River", slug: "high-river", offences: ["speeding", "no-insurance", "red-light"], region: "southern" },
  { name: "Okotoks", slug: "okotoks", offences: ["careless-driving", "following-too-close"], region: "southern" },
  { name: "Lloydminster", slug: "lloydminster", offences: ["speeding", "seatbelt", "red-light"], region: "central" },
  { name: "Strathmore", slug: "strathmore", offences: ["speeding", "fail-to-yield", "distracted-driving"], region: "southern" }
];

// Existing landed pages
const existingPages = [
  { name: "Calgary", slug: "calgary", offences: ["speeding", "careless-driving", "red-light", "distracted-driving"], region: "southern", is_major: true },
  { name: "Edmonton", slug: "edmonton", offences: ["speeding", "careless-driving", "red-light", "distracted-driving"], region: "central", is_major: true },
  { name: "Fort McMurray", slug: "fort-mcmurray", offences: ["careless-driving", "speeding"], region: "northern", is_major: false },
  { name: "Lethbridge", slug: "lethbridge", offences: ["careless-driving", "speeding"], region: "southern", is_major: false },
  { name: "Medicine Hat", slug: "medicine-hat", offences: ["careless-driving", "speeding"], region: "southern", is_major: false }
];

// Generate internal linking opportunities
function generateLinkingOpportunities() {
  const opportunities = [];
  
  newCities.forEach(newCity => {
    newCity.offences.forEach(newOffence => {
      const newPageUrl = `/content/${newOffence}-ticket-${newCity.slug}`;
      const links = [];
      
      // Strategy 1: Same offence, different cities
      existingPages.forEach(existingCity => {
        if (existingCity.offences.includes(newOffence)) {
          links.push({
            strategy: "same_offence",
            from_url: `/content/${newOffence}-ticket-${existingCity.slug}`,
            from_city: existingCity.name,
            to_url: newPageUrl,
            to_city: newCity.name,
            anchor_text: `${newOffence} ticket in ${newCity.name}`,
            priority: existingCity.is_major ? "high" : "medium"
          });
        }
      });
      
      // Strategy 2: Hub pages linking to smaller cities
      existingPages
        .filter(city => city.is_major && city.offences.includes(newOffence))
        .forEach(hubCity => {
          links.push({
            strategy: "hub_to_satellite",
            from_url: `/content/${newOffence}-ticket-${hubCity.slug}`,
            from_city: hubCity.name,
            to_url: newPageUrl,
            to_city: newCity.name,
            anchor_text: `${newOffence} tickets in ${newCity.name}`,
            priority: "high"
          });
        });
      
      // Take top 3-4 links per page
      const sortedLinks = links
        .sort((a, b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
        .slice(0, 4);
      
      opportunities.push({
        target_page: newPageUrl,
        target_city: newCity.name,
        target_offence: newOffence,
        links: sortedLinks,
        total_links: sortedLinks.length
      });
    });
  });
  
  return opportunities;
}

// Main execution
function createInternalLinkingStrategy() {
  console.log('🔗 Creating internal linking strategy for Alberta city expansion...\n');
  
  const outputDir = './internal-linking';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const opportunities = generateLinkingOpportunities();
  
  // Calculate statistics
  const totalLinks = opportunities.reduce((sum, opp) => sum + opp.total_links, 0);
  const pagesMeetingCriteria = opportunities.filter(o => o.total_links >= 3).length;
  
  const stats = {
    total_new_pages: opportunities.length,
    total_links_created: totalLinks,
    avg_links_per_page: (totalLinks / opportunities.length).toFixed(1),
    pages_meeting_criteria: pagesMeetingCriteria,
    success_rate: `${((pagesMeetingCriteria / opportunities.length) * 100).toFixed(1)}%`
  };
  
  // Create linking plan
  const linkingPlan = {
    created: new Date().toISOString(),
    task_id: "AEO-EXP-003",
    statistics: stats,
    linking_opportunities: opportunities,
    success_criteria: "Each new city page receives ≥3 internal links from existing landed pages"
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'internal-linking-plan.json'),
    JSON.stringify(linkingPlan, null, 2)
  );
  
  // Create CSS for link styling
  const linkingCSS = `
/* Internal linking styles for Alberta city expansion */
.related-cities, .service-areas {
  margin: 20px 0;
  padding: 15px;
  border-radius: 5px;
  background-color: #f8f9fa;
  border-left: 3px solid #28a745;
}

.related-cities a, .service-areas a {
  color: #007bff;
  text-decoration: none;
  font-weight: 500;
}

.related-cities a:hover, .service-areas a:hover {
  color: #0056b3;
  text-decoration: underline;
}
`;
  
  fs.writeFileSync(path.join(outputDir, 'linking-styles.css'), linkingCSS);
  
  // Create implementation guide
  const guide = `# Alberta City Expansion - Internal Linking Guide

## Statistics
- **Total New Pages:** ${stats.total_new_pages}
- **Total Links Created:** ${stats.total_links_created}
- **Average Links per Page:** ${stats.avg_links_per_page}
- **Success Rate:** ${stats.success_rate} (${stats.pages_meeting_criteria}/${opportunities.length} pages meet ≥3 link criteria)

## Implementation
1. Add CSS from linking-styles.css to main stylesheet
2. For each link in internal-linking-plan.json, add HTML snippet to source page
3. Validate each new city page has ≥3 incoming links

## Link Examples
- Same offence: "Calgary speeding → Grande Prairie speeding" 
- Hub to satellite: "Edmonton red-light → Cold Lake red-light"
`;
  
  fs.writeFileSync(path.join(outputDir, 'implementation-guide.md'), guide);
  
  // Console output
  console.log('✅ Internal linking strategy created!');
  console.log(`🎯 ${stats.total_links_created} links planned across ${stats.total_new_pages} pages`);
  console.log(`📊 ${stats.success_rate} success rate (${stats.pages_meeting_criteria}/${opportunities.length} pages meet criteria)`);
  console.log(`📁 Configuration files created in: ${outputDir}/`);
  
  return {
    task_completed: "AEO-EXP-003",
    success_criteria_met: pagesMeetingCriteria === opportunities.length,
    statistics: stats
  };
}

// Run the strategy creation
if (require.main === module) {
  createInternalLinkingStrategy();
}

module.exports = { createInternalLinkingStrategy };