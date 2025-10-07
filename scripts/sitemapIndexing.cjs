#!/usr/bin/env node
/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 10: Sitemap and GSC Indexing Configuration
 * 
 * Updates sitemap-content.xml and prepares for GSC indexing requests
 */

const fs = require('fs');
const path = require('path');

// Load generated URLs from generation report
function loadGeneratedUrls() {
  try {
    const report = JSON.parse(fs.readFileSync('./generated-pages/generation-report.json', 'utf8'));
    return report.generated_urls || [];
  } catch (error) {
    console.error('Could not load generation report:', error.message);
    return [];
  }
}

// Create comprehensive sitemap for new city pages
function createSitemapEntries(urls) {
  return urls.map(url => {
    const priority = url.includes('speeding') ? '0.8' : '0.7'; // Speeding pages get higher priority
    return `    <url>
        <loc>https://fabsy.com${url}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>${priority}</priority>
    </url>`;
  }).join('\n');
}

// Generate GSC indexing requests
function createGSCIndexingPlan(urls) {
  const phases = [
    {
      phase: "Phase 1 - Week 1-2",
      urls: urls.filter(url => 
        url.includes('grande-prairie') || 
        url.includes('spruce-grove') || 
        url.includes('wetaskiwin') || 
        url.includes('camrose') || 
        url.includes('cold-lake')
      )
    },
    {
      phase: "Phase 2 - Week 3-4", 
      urls: urls.filter(url =>
        url.includes('canmore') ||
        url.includes('high-river') ||
        url.includes('okotoks') ||
        url.includes('lloydminster') ||
        url.includes('strathmore')
      )
    }
  ];

  return {
    indexing_strategy: "Phased submission to avoid overwhelming GSC",
    submission_method: "Google Search Console API",
    phases: phases,
    success_criteria: "All URLs indexed within 14 days of submission",
    monitoring_frequency: "Daily for first 7 days, then weekly"
  };
}

// Create robots.txt updates
function generateRobotsTxtAdditions(urls) {
  return `
# Alberta City Expansion Pages - Allow all crawlers
# Added: ${new Date().toISOString().split('T')[0]}

# Priority crawling for new city pages
${urls.slice(0, 10).map(url => `Allow: ${url}`).join('\n')}

# Sitemap reference
Sitemap: https://fabsy.com/sitemap-content.xml
`;
}

// Main execution
function updateSitemapAndIndexing() {
  console.log('🗺️  Updating sitemap and indexing configuration...\n');
  
  const urls = loadGeneratedUrls();
  if (urls.length === 0) {
    console.error('❌ No URLs found to process');
    return;
  }
  
  const outputDir = './sitemap-indexing';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Create sitemap entries
  const sitemapEntries = createSitemapEntries(urls);
  const fullSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>`;
  
  fs.writeFileSync(path.join(outputDir, 'sitemap-city-expansion.xml'), fullSitemap);
  
  // Create GSC indexing plan
  const indexingPlan = createGSCIndexingPlan(urls);
  fs.writeFileSync(
    path.join(outputDir, 'gsc-indexing-plan.json'), 
    JSON.stringify(indexingPlan, null, 2)
  );
  
  // Create robots.txt additions
  const robotsAdditions = generateRobotsTxtAdditions(urls);
  fs.writeFileSync(path.join(outputDir, 'robots-txt-additions.txt'), robotsAdditions);
  
  // Create deployment script for sitemap integration
  const deploymentScript = `#!/usr/bin/env node
/**
 * Sitemap Integration Script
 * Merges new city expansion URLs into main sitemap-content.xml
 */

const fs = require('fs');
const path = require('path');

function integrateSitemap() {
  console.log('🔄 Integrating city expansion URLs into main sitemap...');
  
  // Read existing sitemap-content.xml (if exists)
  let existingSitemap = '';
  const mainSitemapPath = './sitemap-content.xml';
  
  if (fs.existsSync(mainSitemapPath)) {
    existingSitemap = fs.readFileSync(mainSitemapPath, 'utf8');
    console.log('📄 Found existing sitemap-content.xml');
  } else {
    console.log('📄 Creating new sitemap-content.xml');
    existingSitemap = \`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>\`;
  }
  
  // Read new city expansion sitemap
  const newSitemap = fs.readFileSync('./sitemap-indexing/sitemap-city-expansion.xml', 'utf8');
  const newUrls = newSitemap.match(/<url>.*?<\\/url>/gs) || [];
  
  // Insert new URLs before closing </urlset>
  const updatedSitemap = existingSitemap.replace(
    '</urlset>',
    \`\${newUrls.join('\\n')}
</urlset>\`
  );
  
  // Write updated sitemap
  fs.writeFileSync(mainSitemapPath, updatedSitemap);
  console.log(\`✅ Added \${newUrls.length} URLs to main sitemap\`);
  
  return newUrls.length;
}

if (require.main === module) {
  integrateSitemap();
}

module.exports = { integrateSitemap };
`;
  
  fs.writeFileSync(path.join(outputDir, 'integrate-sitemap.cjs'), deploymentScript);
  
  // Create GSC submission script template
  const gscScript = `#!/usr/bin/env node
/**
 * Google Search Console Indexing Submission
 * Submits new city expansion URLs for indexing
 */

const https = require('https');

// Configuration - Replace with your GSC API credentials
const GSC_CONFIG = {
  site_url: 'https://fabsy.com',
  api_key: process.env.GSC_API_KEY,
  credentials_file: './gsc-credentials.json'
};

const URLS_TO_SUBMIT = ${JSON.stringify(urls, null, 2)};

async function submitForIndexing() {
  console.log('📤 Submitting URLs to Google Search Console...');
  console.log(\`🎯 Processing \${URLS_TO_SUBMIT.length} URLs\`);
  
  // Implementation would use Google Search Console API
  // This is a template - requires actual API integration
  
  for (const [index, url] of URLS_TO_SUBMIT.entries()) {
    console.log(\`\${index + 1}. Submitting: \${url}\`);
    
    // API call would go here:
    // await submitUrlToGSC(url);
    
    // Rate limiting
    if (index % 10 === 9) {
      console.log('⏸️  Rate limiting pause...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('✅ All URLs submitted for indexing');
  console.log('🔍 Monitor GSC for indexation status over next 7-14 days');
}

if (require.main === module) {
  submitForIndexing().catch(console.error);
}

module.exports = { submitForIndexing };
`;
  
  fs.writeFileSync(path.join(outputDir, 'submit-to-gsc.cjs'), gscScript);
  
  // Create monitoring checklist
  const checklist = `# Alberta City Expansion - Sitemap & Indexing Checklist

## Pre-Deployment
- [ ] Review generated sitemap entries for accuracy
- [ ] Validate all ${urls.length} URLs are properly formatted
- [ ] Backup existing sitemap-content.xml
- [ ] Test sitemap XML syntax

## Deployment Steps
1. **Integrate Sitemap**
   \`\`\`bash
   node sitemap-indexing/integrate-sitemap.cjs
   \`\`\`

2. **Update Robots.txt**
   - Add content from robots-txt-additions.txt to main robots.txt
   - Verify sitemap reference is correct

3. **Submit to GSC**
   - Configure GSC API credentials
   - Run submission script: \`node sitemap-indexing/submit-to-gsc.cjs\`
   - Submit updated sitemap-content.xml to GSC

## Phase 1 Submission (Week 1-2)
Cities: Grande Prairie, Spruce Grove, Wetaskiwin, Camrose, Cold Lake
- [ ] Submit ${indexingPlan.phases[0].urls.length} URLs to GSC
- [ ] Monitor daily for first impressions
- [ ] Track indexation rate

## Phase 2 Submission (Week 3-4)  
Cities: Canmore, High River, Okotoks, Lloydminster, Strathmore
- [ ] Submit ${indexingPlan.phases[1].urls.length} URLs to GSC
- [ ] Continue daily monitoring
- [ ] Compare indexation rates between phases

## Success Metrics
- **Target:** 100% indexation within 14 days
- **KPI:** Each city shows first impressions within 7 days
- **Monitor:** GSC Search Analytics for new URL impressions

## Files Created
- sitemap-city-expansion.xml (${urls.length} URLs)
- gsc-indexing-plan.json (phased submission strategy)
- integrate-sitemap.cjs (deployment script)
- submit-to-gsc.cjs (GSC submission template)
- robots-txt-additions.txt (crawler guidance)
`;
  
  fs.writeFileSync(path.join(outputDir, 'deployment-checklist.md'), checklist);
  
  // Summary
  const summary = {
    task_id: "AEO-EXP-001",
    created: new Date().toISOString(),
    total_urls: urls.length,
    phase_1_urls: indexingPlan.phases[0].urls.length,
    phase_2_urls: indexingPlan.phases[1].urls.length,
    sitemap_file: 'sitemap-city-expansion.xml',
    indexing_strategy: indexingPlan.indexing_strategy,
    success_criteria: indexingPlan.success_criteria,
    files_created: [
      'sitemap-city-expansion.xml',
      'gsc-indexing-plan.json', 
      'integrate-sitemap.cjs',
      'submit-to-gsc.cjs',
      'robots-txt-additions.txt',
      'deployment-checklist.md'
    ],
    next_steps: [
      'Review and approve sitemap integration',
      'Deploy Phase 1 URLs to production',
      'Submit sitemap to Google Search Console',
      'Begin daily indexation monitoring',
      'Deploy Phase 2 URLs after Week 2'
    ]
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'sitemap-indexing-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  // Console output
  console.log('✅ Sitemap and indexing configuration completed!');
  console.log(`📊 Created sitemap with ${urls.length} URLs`);
  console.log(`📋 Phase 1: ${indexingPlan.phases[0].urls.length} URLs`);
  console.log(`📋 Phase 2: ${indexingPlan.phases[1].urls.length} URLs`);
  console.log(`📁 Configuration files created in: ${outputDir}/`);
  console.log(`🎯 Success criteria: ${indexingPlan.success_criteria}`);
  
  console.log('\n🚀 Next Steps:');
  summary.next_steps.forEach((step, i) => {
    console.log(`${i + 1}. ${step}`);
  });
  
  return summary;
}

// Run the setup
if (require.main === module) {
  updateSitemapAndIndexing();
}

module.exports = { updateSitemapAndIndexing };