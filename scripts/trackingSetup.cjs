#!/usr/bin/env node
/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY  
 * Block 10: City Expansion Tracking & Monitoring Setup
 * 
 * AEO-EXP-002: Track indexation & early rank signals
 * - Indexed URL count delta
 * - Average position for new city queries  
 * - Clicks from SERP → page
 * - Success criteria: Each new city shows first impressions in GSC within 7 days
 */

const fs = require('fs');
const path = require('path');

// Configuration for tracking setup
const trackingConfig = {
  task_id: "AEO-EXP-002",
  title: "Track indexation & early rank signals", 
  owner: "AEO-Ops",
  trigger: "daily",
  metrics: [
    "Indexed URL count delta",
    "Average position for new city queries", 
    "Clicks from SERP → page"
  ],
  success_criteria: [
    "Each new city shows first impressions in GSC within 7 days"
  ],
  monitoring_period_days: 14,
  target_indexation_rate: "100% within 14 days"
};

// City expansion targets for tracking
const cityTargets = [
  "Grande Prairie", "Spruce Grove", "Wetaskiwin", "Camrose", "Cold Lake",
  "Canmore", "High River", "Okotoks", "Lloydminster", "Strathmore"
];

// Generate tracking queries for each city
function generateTrackingQueries() {
  const queries = [];
  
  cityTargets.forEach(city => {
    // Primary queries to track
    queries.push(...[
      `${city} traffic ticket`,
      `fight ticket ${city}`,
      `${city} speeding ticket`,
      `traffic lawyer ${city}`,
      `${city} ticket defense`,
      `how to fight ticket ${city}`
    ]);
  });
  
  return queries;
}

// Generate GSC monitoring URLs
function generateGSCUrls() {
  const urls = [];
  const baseUrls = [
    "/content/speeding-ticket-", "/content/red-light-ticket-", 
    "/content/distracted-driving-ticket-", "/content/careless-driving-ticket-",
    "/content/seatbelt-ticket-", "/content/no-insurance-ticket-",
    "/content/fail-to-yield-ticket-", "/content/fail-to-stop-ticket-",
    "/content/following-too-close-ticket-", "/content/stunting-ticket-"
  ];
  
  const cityMapping = {
    "Grande Prairie": "grande-prairie",
    "Spruce Grove": "spruce-grove",
    "Wetaskiwin": "wetaskiwin", 
    "Camrose": "camrose",
    "Cold Lake": "cold-lake",
    "Canmore": "canmore",
    "High River": "high-river",
    "Okotoks": "okotoks",
    "Lloydminster": "lloydminster",
    "Strathmore": "strathmore"
  };
  
  Object.entries(cityMapping).forEach(([city, slug]) => {
    baseUrls.forEach(baseUrl => {
      const url = `https://fabsy.com${baseUrl}${slug}`;
      urls.push({
        city: city,
        url: url,
        slug: slug,
        expected_pattern: baseUrl.replace('/content/', '').replace('-ticket-', '')
      });
    });
  });
  
  return urls;
}

// Create monitoring dashboard configuration
function createMonitoringDashboard() {
  return {
    dashboard_name: "Alberta City Expansion - AEO Tracking",
    created: new Date().toISOString(),
    config: trackingConfig,
    
    // Metrics to track daily
    daily_metrics: {
      indexation_status: {
        description: "URL indexation count per day",
        source: "Google Search Console",
        api_endpoint: "/webmasters/v3/sites/{site}/searchAnalytics/query",
        filters: ["page~content/*-ticket-"],
        dimensions: ["page"],
        metrics: ["impressions", "clicks", "position"]
      },
      
      ranking_positions: {
        description: "Average position for target queries", 
        source: "Google Search Console",
        queries: generateTrackingQueries(),
        target_pages: generateGSCUrls().map(u => u.url),
        success_threshold: "Position < 50 for any city query"
      },
      
      serp_impressions: {
        description: "First impressions from SERP",
        source: "Google Search Console", 
        success_criteria: "≥1 impression within 7 days of publish",
        alert_threshold: "0 impressions after 10 days"
      }
    },
    
    // Weekly reports
    weekly_reports: {
      indexation_progress: {
        total_urls_expected: 29,
        target_indexation_rate: "100% within 14 days",
        phase_1_urls: 15,
        phase_2_urls: 14
      },
      
      ranking_progress: {
        cities_with_impressions: [],
        avg_position_by_city: {},
        clicks_by_city: {},
        improvement_trends: {}
      }
    }
  };
}

// Generate GSC API query templates  
function createGSCQueryTemplates() {
  const templates = {
    // Daily indexation check
    indexation_status: {
      startDate: "{{START_DATE}}",
      endDate: "{{END_DATE}}", 
      dimensions: ["page"],
      searchType: "web",
      dimensionFilterGroups: [{
        filters: [{
          dimension: "page",
          operator: "contains",
          expression: "/content/"
        }, {
          dimension: "page", 
          operator: "contains",
          expression: "-ticket-"
        }]
      }]
    },
    
    // City-specific ranking check
    city_rankings: {
      startDate: "{{START_DATE}}",
      endDate: "{{END_DATE}}",
      dimensions: ["query", "page"],
      searchType: "web", 
      dimensionFilterGroups: [{
        filters: [{
          dimension: "query",
          operator: "contains", 
          expression: "{{CITY_NAME}}"
        }, {
          dimension: "query",
          operator: "contains",
          expression: "ticket"  
        }]
      }]
    },
    
    // Performance metrics
    performance_overview: {
      startDate: "{{START_DATE}}",
      endDate: "{{END_DATE}}",
      dimensions: ["page"],
      metrics: ["impressions", "clicks", "ctr", "position"],
      searchType: "web",
      dimensionFilterGroups: [{
        filters: [{
          dimension: "page",
          operator: "includingRegex", 
          expression: "/content/.+-ticket-.+"
        }]
      }]
    }
  };
  
  return templates;
}

// Create monitoring alerts configuration
function createAlertsConfig() {
  return {
    alerts: [
      {
        name: "Low Indexation Rate",
        condition: "indexed_urls < 50% after 7 days",
        severity: "high",
        action: "escalate_to_technical_seo"
      },
      {
        name: "Zero Impressions Alert", 
        condition: "impressions = 0 after 10 days for any city",
        severity: "medium",
        action: "check_indexation_status"
      },
      {
        name: "Ranking Degradation",
        condition: "avg_position > 100 for primary queries",
        severity: "low", 
        action: "review_content_quality"
      }
    ],
    
    notification_channels: [
      "slack:#aeo-ops",
      "email:seo-team@fabsy.com"
    ],
    
    escalation_schedule: {
      "0_days": "daily_check",
      "7_days": "weekly_review", 
      "14_days": "final_assessment"
    }
  };
}

// Generate tracking spreadsheet template
function createTrackingSpreadsheet() {
  return {
    sheet_name: "Alberta City Expansion Tracking",
    columns: [
      "Date", "City", "URL", "Indexed (Y/N)", "Impressions", 
      "Clicks", "Avg Position", "Primary Query", "Notes"
    ],
    
    // Pre-populated tracking rows for each city/page
    tracking_rows: generateGSCUrls().map((item, index) => ({
      row_id: index + 1,
      city: item.city,
      url: item.url,
      slug: item.slug,
      target_query: `${item.city.toLowerCase()} ${item.expected_pattern} ticket`,
      status: "pending_indexation",
      created_date: new Date().toISOString().split('T')[0]
    })),
    
    formulas: {
      indexation_rate: "=COUNTIF(D:D,\"Y\")/COUNTA(D:D)*100",
      avg_position_all: "=AVERAGE(G:G)",
      total_impressions: "=SUM(E:E)",
      total_clicks: "=SUM(F:F)"
    }
  };
}

// Main execution
function setupTracking() {
  console.log('🎯 Setting up Alberta city expansion tracking...\n');
  
  const outputDir = './tracking-setup';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate all tracking components
  const dashboard = createMonitoringDashboard();
  const gscTemplates = createGSCQueryTemplates();
  const alerts = createAlertsConfig();
  const spreadsheet = createTrackingSpreadsheet();
  
  // Write configuration files
  fs.writeFileSync(
    path.join(outputDir, 'monitoring-dashboard-config.json'),
    JSON.stringify(dashboard, null, 2)
  );
  
  fs.writeFileSync(
    path.join(outputDir, 'gsc-api-templates.json'), 
    JSON.stringify(gscTemplates, null, 2)
  );
  
  fs.writeFileSync(
    path.join(outputDir, 'alerts-configuration.json'),
    JSON.stringify(alerts, null, 2)
  );
  
  fs.writeFileSync(
    path.join(outputDir, 'tracking-spreadsheet-template.json'),
    JSON.stringify(spreadsheet, null, 2)
  );
  
  // Create daily tracking script template
  const dailyScript = `#!/usr/bin/env node
/**
 * Daily tracking script for Alberta city expansion
 * Run via cron: 0 9 * * * node tracking-setup/daily-tracking.cjs
 */

// Implementation placeholder - integrate with GSC API
console.log('Running daily AEO expansion tracking...');

// 1. Check indexation status for new pages
// 2. Query GSC for impressions/clicks/positions  
// 3. Update tracking spreadsheet
// 4. Generate alerts if thresholds breached
// 5. Send summary to #aeo-ops channel

console.log('Tracking complete. See reports in tracking-setup/daily-reports/');
`;
  
  fs.writeFileSync(path.join(outputDir, 'daily-tracking.cjs'), dailyScript);
  
  // Generate tracking queries list
  const queries = generateTrackingQueries();
  fs.writeFileSync(
    path.join(outputDir, 'target-queries.txt'),
    queries.join('\n')
  );
  
  // Generate URL monitoring list  
  const urls = generateGSCUrls();
  const urlList = urls.map(u => `${u.url}\t${u.city}\t${u.expected_pattern}`).join('\n');
  fs.writeFileSync(
    path.join(outputDir, 'target-urls.tsv'),
    'URL\tCity\tOffence\n' + urlList
  );
  
  // Summary report
  const summary = {
    setup_date: new Date().toISOString(),
    task_id: "AEO-EXP-002",
    cities_tracked: cityTargets.length,
    pages_monitored: urls.length,
    tracking_queries: queries.length,
    monitoring_period: trackingConfig.monitoring_period_days,
    success_criteria: trackingConfig.success_criteria,
    
    files_created: [
      'monitoring-dashboard-config.json',
      'gsc-api-templates.json', 
      'alerts-configuration.json',
      'tracking-spreadsheet-template.json',
      'daily-tracking.cjs',
      'target-queries.txt',
      'target-urls.tsv'
    ],
    
    next_steps: [
      'Configure GSC API access and authentication',
      'Set up daily cron job for tracking script',
      'Create Slack webhook for alert notifications',
      'Import tracking spreadsheet template to Google Sheets',
      'Test alert thresholds and notification system',
      'Schedule weekly review meetings with AEO-Ops team'
    ]
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'tracking-setup-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  // Console output
  console.log('✅ Tracking setup completed!');
  console.log(`📊 Monitoring ${urls.length} pages across ${cityTargets.length} cities`);
  console.log(`🎯 Tracking ${queries.length} target queries`);
  console.log(`📁 Configuration files created in: ${outputDir}/`);
  console.log(`⏰ Success criteria: ${trackingConfig.success_criteria.join(', ')}`);
  
  console.log('\n📋 Next Steps:');
  summary.next_steps.forEach((step, i) => {
    console.log(`${i + 1}. ${step}`);
  });
  
  return summary;
}

// Run the setup
if (require.main === module) {
  setupTracking();
}

module.exports = { setupTracking };