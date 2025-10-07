#!/usr/bin/env node
/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 10: Alberta "Next 10" City Targets + Prebuilt Pages
 * 
 * Script to generate HTML landing pages for all city/offence combinations
 */

const fs = require('fs');
const path = require('path');

// Import our TypeScript modules (we'll compile them first)
// For now, we'll define the data inline for the script to work

const cityExpansionTargets = [
  {
    name: "Grande Prairie",
    slug: "grande-prairie",
    offences: ["speeding", "red-light", "distracted-driving"]
  },
  {
    name: "Spruce Grove",
    slug: "spruce-grove", 
    offences: ["speeding", "seatbelt", "no-insurance"]
  },
  {
    name: "Wetaskiwin",
    slug: "wetaskiwin",
    offences: ["speeding", "fail-to-yield", "careless-driving"]
  },
  {
    name: "Camrose",
    slug: "camrose",
    offences: ["speeding", "fail-to-stop", "following-too-close"]
  },
  {
    name: "Cold Lake",
    slug: "cold-lake",
    offences: ["speeding", "red-light", "distracted-driving"]
  },
  {
    name: "Canmore",
    slug: "canmore",
    offences: ["speeding", "stunting", "seatbelt"]
  },
  {
    name: "High River",
    slug: "high-river",
    offences: ["speeding", "no-insurance", "red-light"]
  },
  {
    name: "Okotoks",
    slug: "okotoks",
    offences: ["careless-driving", "following-too-close"]
  },
  {
    name: "Lloydminster",
    slug: "lloydminster",
    offences: ["speeding", "seatbelt", "red-light"]
  },
  {
    name: "Strathmore",
    slug: "strathmore",
    offences: ["speeding", "fail-to-yield", "distracted-driving"]
  }
];

// Offence humanization mapping
const offenceHumanMap = {
  "speeding": "Speeding",
  "red-light": "Red Light",
  "careless-driving": "Careless Driving",
  "distracted-driving": "Distracted Driving",
  "following-too-close": "Following Too Close",
  "fail-to-stop": "Fail to Stop",
  "fail-to-yield": "Fail to Yield",
  "seatbelt": "Seatbelt",
  "stunting": "Stunting",
  "no-insurance": "No Insurance"
};

function humanizeOffence(offenceSlug) {
  return offenceHumanMap[offenceSlug] || offenceSlug.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

// Replace tokens in template strings
function replaceTokens(template, tokens) {
  return template
    .replace(/{City}/g, tokens.City)
    .replace(/{Offence}/g, tokens.Offence)
    .replace(/{offence}/g, tokens.offence);
}

// Generate FAQ schema
function generateFAQSchema(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(faq => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a
      }
    }))
  };
}

// HTML template for AEO-optimized pages
function generatePageHTML(tokens) {
  const title = replaceTokens("{Offence} Ticket in {City} — Can You Fight It? | Fabsy", tokens);
  const h1 = replaceTokens("Got a {Offence} Ticket in {City}?", tokens);
  const metaDescription = replaceTokens("{Offence} ticket in {City}? In many cases, Fabsy can keep demerits off your record and help you avoid insurance hikes. Zero-risk: you only pay if we win. Start a free analysis in 60 seconds.", tokens);
  const contentSnippet = replaceTokens("Short answer: Yes — many {City} {offence} tickets can be fixed before your court date. Upload your ticket, we pull your court file, then confirm options to protect your record.", tokens);
  
  // Generic FAQs with token replacement
  const faqs = [
    {
      q: replaceTokens("Can I fight a {offence} ticket in {City}?", tokens),
      a: "Often, yes. Many cases can be resolved to avoid a conviction that affects your record or insurance."
    },
    {
      q: replaceTokens("Do I have to go to court for a {offence} ticket in {City}?", tokens),
      a: "Not always. Depending on the courthouse and offence, resolutions can be reached without you attending."
    },
    {
      q: replaceTokens("How many demerits for {offence} in {City}?", tokens),
      a: "Demerits depend on the specific charge. Our goal is to resolve your ticket to keep demerits off your abstract."
    }
  ];

  const faqSchema = generateFAQSchema(faqs.slice(0, 2));

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${metaDescription}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://fabsy.com/content/${tokens.offence}-ticket-${tokens.City.toLowerCase().replace(/\s+/g, '-')}">
    
    <!-- Schema.org FAQ markup -->
    <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 8)}
    </script>
    
    <!-- Schema.org Local Business markup -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "LegalService",
        "name": "Fabsy",
        "description": "Alberta traffic ticket resolution service",
        "areaServed": {
            "@type": "City",
            "name": "${tokens.City}",
            "addressRegion": "Alberta",
            "addressCountry": "Canada"
        },
        "serviceType": "Traffic Ticket Defense",
        "priceRange": "$$"
    }
    </script>
    
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 0; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { font-size: 2.5em; margin-bottom: 10px; color: #2c3e50; }
        h2 { font-size: 1.8em; margin-top: 30px; margin-bottom: 15px; color: #34495e; }
        .answer-box { background: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0; border-radius: 5px; }
        .cta { background: #007bff; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0; font-weight: 600; }
        .cta:hover { background: #0056b3; }
        .faq { margin: 20px 0; }
        .faq h3 { color: #2c3e50; margin-bottom: 10px; }
        .faq p { margin-bottom: 15px; }
        .legal-disclaimer { background: #f1f1f1; padding: 15px; margin: 30px 0; font-size: 0.9em; border-radius: 5px; }
        .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; margin: -20px -20px 30px -20px; }
        .hero h1 { color: white; margin: 0; }
        .hero p { font-size: 1.2em; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="hero">
        <div class="container">
            <h1>${h1}</h1>
            <p>Alberta traffic ticket experts — zero-risk, pay only if we win</p>
        </div>
    </div>
    
    <div class="container">
        <!-- Answer Box Module (Block 6 component) -->
        <div class="answer-box">
            <h2>Can I fight a ${tokens.offence} ticket in ${tokens.City}?</h2>
            <p>${contentSnippet}</p>
            <a href="#analysis" class="cta">Get a free analysis →</a>
        </div>
        
        <h2>What to do next (60-second answer)</h2>
        <p>If you've been ticketed for ${tokens.offence} in ${tokens.City}, we can help. Our Alberta-based team resolves tickets daily — no court visit, no surprises.</p>
        <p>The process is simple:</p>
        <ul>
            <li><strong>Upload your ticket</strong> — we analyze the charge and court file</li>
            <li><strong>Get your options</strong> — we outline resolution paths within 24 hours</li>
            <li><strong>We handle everything</strong> — no court appearances, no legal fees unless we win</li>
        </ul>
        
        <h2>${tokens.City} ${tokens.offence} penalties & demerits</h2>
        <p>A ${tokens.offence} conviction in ${tokens.City} can result in:</p>
        <ul>
            <li>Fines ranging from $200 to $400+ (depending on specifics)</li>
            <li>Demerit points on your driving record</li>
            <li>Insurance premium increases</li>
            <li>Potential license suspension (for repeat offences)</li>
        </ul>
        <p><em>Our goal is to resolve your case to avoid these consequences entirely.</em></p>
        
        <h2>Your options before court day</h2>
        <p>For most ${tokens.City} ${tokens.offence} tickets, you have several options:</p>
        <ol>
            <li><strong>Early resolution</strong> — negotiate with the prosecutor before trial</li>
            <li><strong>Guilty plea with representation</strong> — minimize penalties and protect your record</li>
            <li><strong>Trial defense</strong> — challenge the charge in court (if viable defenses exist)</li>
        </ol>
        <p>We evaluate which path offers the best outcome for your specific situation.</p>
        
        <h2>Frequently asked questions — ${tokens.City} ${tokens.offence}</h2>
        <div class="faq">
            ${faqs.map(faq => `
            <h3>${faq.q}</h3>
            <p>${faq.a}</p>
            `).join('')}
        </div>
        
        <div class="legal-disclaimer">
            <strong>Legal Disclaimer:</strong> This page provides general information only and is not legal advice. Outcomes vary by offence and courthouse. Fabsy is not a law firm but works with qualified legal professionals to resolve traffic matters.
        </div>
        
        <p><a href="#analysis" class="cta">Check your options (no obligation)</a></p>
    </div>
    
    <!-- Footer placeholder -->
    <footer style="background: #2c3e50; color: white; text-align: center; padding: 20px; margin-top: 50px;">
        <p>&copy; 2024 Fabsy. Alberta traffic ticket experts.</p>
    </footer>
</body>
</html>`;
}

// Main execution
function generateAllPages() {
  let totalPages = 0;
  let generatedUrls = [];
  
  console.log('🚀 Generating Alberta city expansion pages...\n');
  
  // Ensure output directory exists
  const outputDir = './generated-pages';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate pages for each city/offence combination
  cityExpansionTargets.forEach(city => {
    console.log(`📍 Generating pages for ${city.name}...`);
    
    city.offences.forEach(offence => {
      const tokens = {
        City: city.name,
        Offence: humanizeOffence(offence),
        offence: offence
      };
      
      const html = generatePageHTML(tokens);
      const fileName = `${offence}-ticket-${city.slug}.html`;
      const filePath = path.join(outputDir, fileName);
      const url = `/content/${offence}-ticket-${city.slug}`;
      
      fs.writeFileSync(filePath, html);
      generatedUrls.push(url);
      totalPages++;
      
      console.log(`  ✅ ${fileName}`);
    });
  });
  
  // Generate sitemap entries
  const sitemapEntries = generatedUrls.map(url => 
    `    <url>
        <loc>https://fabsy.com${url}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
    </url>`
  ).join('\n');
  
  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>`;
  
  fs.writeFileSync(path.join(outputDir, 'sitemap-new-cities.xml'), sitemapContent);
  
  // Generate summary report
  const summaryReport = {
    generation_date: new Date().toISOString(),
    total_cities: cityExpansionTargets.length,
    total_pages: totalPages,
    phase_1_cities: 5,
    phase_2_cities: 5,
    generated_urls: generatedUrls,
    next_steps: [
      "Review generated HTML pages in ./generated-pages/",
      "Add sitemap entries to main sitemap-content.xml",
      "Deploy pages to production",
      "Submit to Google Search Console for indexing",
      "Monitor indexation and ranking progress"
    ]
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'generation-report.json'), 
    JSON.stringify(summaryReport, null, 2)
  );
  
  // Console output
  console.log(`\n✨ Generation Complete!`);
  console.log(`📊 Generated ${totalPages} pages across ${cityExpansionTargets.length} cities`);
  console.log(`📁 Files created in: ${outputDir}/`);
  console.log(`🗺️  Sitemap: sitemap-new-cities.xml`);
  console.log(`📋 Report: generation-report.json`);
  console.log(`\n🎯 Target URLs created:`);
  generatedUrls.slice(0, 5).forEach(url => console.log(`   • https://fabsy.com${url}`));
  if (generatedUrls.length > 5) {
    console.log(`   ... and ${generatedUrls.length - 5} more`);
  }
  
  return summaryReport;
}

// Run the script
if (require.main === module) {
  generateAllPages();
}

module.exports = { generateAllPages };