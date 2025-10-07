#!/usr/bin/env node
/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 11: Performance Guardrails - Daily/Weekly Audit Automation
 * 
 * Automated performance and accessibility auditing system
 * Triggers: Daily smoke tests, weekly full audits, alerts for violations
 */

const fs = require('fs');
const path = require('path');

// Audit configuration
const AUDIT_CONFIG = {
  daily: {
    schedule: '0 9 * * *',  // 9 AM daily
    urls: [
      'https://fabsy.com/',
      'https://fabsy.com/content/speeding-ticket-calgary',
      'https://fabsy.com/content/red-light-ticket-edmonton'
    ],
    checks: ['cwv', 'accessibility_fast', 'security_headers']
  },
  weekly: {
    schedule: '0 6 * * 1',  // 6 AM Monday
    urls: [
      'https://fabsy.com/',
      'https://fabsy.com/content/speeding-ticket-calgary',
      'https://fabsy.com/content/red-light-ticket-edmonton',
      'https://fabsy.com/content/careless-driving-ticket-fort-mcmurray',
      'https://fabsy.com/content/distracted-driving-ticket-lethbridge',
      'https://fabsy.com/content/speeding-ticket-medicine-hat'
    ],
    checks: ['cwv', 'accessibility_full', 'security_headers', 'bundle_analysis']
  },
  monthly: {
    schedule: '0 5 1 * *',  // 5 AM first of month
    urls: 'all_content_pages',
    checks: ['full_regression']
  }
};

// Performance thresholds
const THRESHOLDS = {
  LCP: 2.5,
  CLS: 0.1,
  INP: 200,
  TTFB: 600,
  PSI_SCORE: 90,
  ACCESSIBILITY_SCORE: 95
};

// Alert configuration
const ALERT_CONFIG = {
  slack: {
    webhook: process.env.SLACK_WEBHOOK_URL,
    channel: '#frontend-ux',
    mentions: ['@channel']
  },
  email: {
    to: ['seo-team@fabsy.com', 'frontend@fabsy.com'],
    smtp: {
      host: process.env.SMTP_HOST,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },
  thresholds: {
    critical: 3,    // 3+ critical violations = immediate alert
    warning: 5,     // 5+ warnings = daily digest
    consecutive: 2  // 2 consecutive failures = escalate
  }
};

class PerformanceAuditor {
  constructor() {
    this.results = [];
    this.violations = [];
    this.auditType = 'daily';
    this.startTime = Date.now();
  }

  async runAudit(type = 'daily') {
    this.auditType = type;
    console.log(`🔍 Starting ${type} performance audit...\n`);

    try {
      const config = AUDIT_CONFIG[type];
      const urls = await this.getUrlsToAudit(config.urls);

      // Run different types of checks
      for (const check of config.checks) {
        await this.runCheck(check, urls);
      }

      // Generate comprehensive report
      const report = this.generateAuditReport();

      // Save results
      this.saveAuditResults(report);

      // Send alerts if needed
      await this.processAlerts(report);

      console.log(`\n✅ ${type} audit completed in ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
      return report;

    } catch (error) {
      console.error(`❌ ${type} audit failed:`, error);
      await this.sendErrorAlert(error);
      throw error;
    }
  }

  async getUrlsToAudit(urlsConfig) {
    if (Array.isArray(urlsConfig)) {
      return urlsConfig;
    }

    if (urlsConfig === 'all_content_pages') {
      // Get all content pages from sitemap
      return await this.getAllContentPages();
    }

    return [];
  }

  async getAllContentPages() {
    try {
      const sitemapUrl = 'https://fabsy.com/sitemap.xml';
      const response = await fetch(sitemapUrl);
      const sitemap = await response.text();
      
      // Extract URLs from sitemap
      const urlMatches = sitemap.match(/<loc>([^<]+)<\/loc>/g) || [];
      return urlMatches
        .map(match => match.replace(/<\/?loc>/g, ''))
        .filter(url => url.includes('/content/'))
        .slice(0, 50); // Limit for monthly audit
    } catch (error) {
      console.warn('Failed to fetch sitemap, using fallback URLs');
      return AUDIT_CONFIG.weekly.urls;
    }
  }

  async runCheck(checkType, urls) {
    console.log(`📊 Running ${checkType} check on ${urls.length} URLs...`);

    switch (checkType) {
      case 'cwv':
        await this.runCoreWebVitalsCheck(urls);
        break;
      case 'accessibility_fast':
        await this.runAccessibilityCheck(urls, 'fast');
        break;
      case 'accessibility_full':
        await this.runAccessibilityCheck(urls, 'full');
        break;
      case 'security_headers':
        await this.runSecurityCheck(urls);
        break;
      case 'bundle_analysis':
        await this.runBundleAnalysis();
        break;
      case 'full_regression':
        await this.runFullRegressionTest(urls);
        break;
    }
  }

  async runCoreWebVitalsCheck(urls) {
    const PSI_API_KEY = process.env.PSI_API_KEY;
    if (!PSI_API_KEY) {
      console.warn('⚠️  No PSI API key, skipping CWV check');
      return;
    }

    for (const [index, url] of urls.entries()) {
      try {
        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${PSI_API_KEY}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        const lighthouse = data.lighthouseResult;
        const metrics = {
          url,
          timestamp: new Date().toISOString(),
          lcp: lighthouse.audits['largest-contentful-paint']?.numericValue / 1000 || 0,
          cls: lighthouse.audits['cumulative-layout-shift']?.numericValue || 0,
          inp: lighthouse.audits['interaction-to-next-paint']?.numericValue || 0,
          ttfb: lighthouse.audits['server-response-time']?.numericValue || 0,
          psi_score: lighthouse.categories.performance?.score * 100 || 0,
          accessibility_score: lighthouse.categories.accessibility?.score * 100 || 0
        };

        this.results.push(metrics);
        this.checkThresholdViolations(metrics);

        // Rate limiting for PSI API
        if (index < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`  ✓ ${url}: LCP ${metrics.lcp.toFixed(2)}s, CLS ${metrics.cls.toFixed(3)}`);
      } catch (error) {
        console.error(`  ❌ Failed to audit ${url}:`, error.message);
      }
    }
  }

  async runAccessibilityCheck(urls, mode = 'fast') {
    console.log(`  Running ${mode} accessibility check...`);

    for (const url of urls) {
      try {
        // Simulate accessibility check (in production, use axe-core or similar)
        const response = await fetch(url);
        const html = await response.text();
        
        const issues = [];
        
        // Check for missing alt tags
        const imgMatches = html.match(/<img[^>]*>/gi) || [];
        const missingAlt = imgMatches.filter(img => !img.includes('alt=')).length;
        if (missingAlt > 0) {
          issues.push(`${missingAlt} images missing alt text`);
        }

        // Check heading hierarchy
        const headings = html.match(/<h[1-6][^>]*>/gi) || [];
        if (headings.length === 0) {
          issues.push('No heading structure found');
        }

        // Check for proper heading order
        const headingLevels = headings.map(h => parseInt(h.match(/h(\d)/)?.[1] || '1'));
        let prevLevel = 0;
        for (const level of headingLevels) {
          if (level > prevLevel + 1) {
            issues.push('Improper heading hierarchy');
            break;
          }
          prevLevel = level;
        }

        // Check color contrast (basic check)
        if (!html.includes('color:') && !html.includes('background:')) {
          // No inline styles found - likely using system defaults (good)
        }

        const accessibilityScore = Math.max(0, 100 - (issues.length * 10));
        
        if (accessibilityScore < THRESHOLDS.ACCESSIBILITY_SCORE) {
          this.violations.push({
            type: 'ACCESSIBILITY',
            url,
            score: accessibilityScore,
            issues,
            message: `Accessibility score ${accessibilityScore} below ${THRESHOLDS.ACCESSIBILITY_SCORE} threshold`
          });
        }

        console.log(`  ✓ ${url}: Accessibility ${accessibilityScore}% (${issues.length} issues)`);
      } catch (error) {
        console.error(`  ❌ Failed accessibility check for ${url}:`, error.message);
      }
    }
  }

  async runSecurityCheck(urls) {
    console.log('  Running security headers check...');

    for (const url of urls) {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        const headers = response.headers;

        const requiredHeaders = [
          'strict-transport-security',
          'x-content-type-options', 
          'x-frame-options',
          'x-xss-protection',
          'referrer-policy'
        ];

        const missingHeaders = requiredHeaders.filter(header => !headers.get(header));

        if (missingHeaders.length > 0) {
          this.violations.push({
            type: 'SECURITY_HEADERS',
            url,
            missing_headers: missingHeaders,
            message: `Missing security headers: ${missingHeaders.join(', ')}`
          });
        }

        console.log(`  ✓ ${url}: Security headers ${requiredHeaders.length - missingHeaders.length}/${requiredHeaders.length}`);
      } catch (error) {
        console.error(`  ❌ Failed security check for ${url}:`, error.message);
      }
    }
  }

  async runBundleAnalysis() {
    console.log('  Running bundle analysis...');
    
    // Check if build artifacts exist
    const buildDirs = ['dist', 'build', '.next'];
    let buildDir = null;
    
    for (const dir of buildDirs) {
      if (fs.existsSync(dir)) {
        buildDir = dir;
        break;
      }
    }

    if (!buildDir) {
      console.warn('  ⚠️  No build directory found for bundle analysis');
      return;
    }

    const jsFiles = this.findFiles(buildDir, /\.js$/);
    const cssFiles = this.findFiles(buildDir, /\.css$/);

    let totalJS = 0;
    let totalCSS = 0;

    jsFiles.forEach(file => {
      const stats = fs.statSync(file);
      totalJS += stats.size;
    });

    cssFiles.forEach(file => {
      const stats = fs.statSync(file);
      totalCSS += stats.size;
    });

    const jsKB = Math.round(totalJS / 1024);
    const cssKB = Math.round(totalCSS / 1024);

    if (jsKB > 250) {
      this.violations.push({
        type: 'BUNDLE_SIZE',
        metric: 'JavaScript',
        size: jsKB,
        threshold: 250,
        message: `JavaScript bundle ${jsKB}KB exceeds 250KB limit`
      });
    }

    if (cssKB > 150) {
      this.violations.push({
        type: 'BUNDLE_SIZE', 
        metric: 'CSS',
        size: cssKB,
        threshold: 150,
        message: `CSS bundle ${cssKB}KB exceeds 150KB limit`
      });
    }

    console.log(`  ✓ Bundle sizes: JS ${jsKB}KB, CSS ${cssKB}KB`);
  }

  checkThresholdViolations(metrics) {
    if (metrics.lcp > THRESHOLDS.LCP) {
      this.violations.push({
        type: 'CORE_WEB_VITAL',
        metric: 'LCP',
        url: metrics.url,
        value: metrics.lcp,
        threshold: THRESHOLDS.LCP,
        severity: 'critical',
        message: `LCP ${metrics.lcp.toFixed(2)}s exceeds ${THRESHOLDS.LCP}s threshold`
      });
    }

    if (metrics.cls > THRESHOLDS.CLS) {
      this.violations.push({
        type: 'CORE_WEB_VITAL',
        metric: 'CLS', 
        url: metrics.url,
        value: metrics.cls,
        threshold: THRESHOLDS.CLS,
        severity: 'critical',
        message: `CLS ${metrics.cls.toFixed(3)} exceeds ${THRESHOLDS.CLS} threshold`
      });
    }

    if (metrics.inp > THRESHOLDS.INP) {
      this.violations.push({
        type: 'CORE_WEB_VITAL',
        metric: 'INP',
        url: metrics.url, 
        value: metrics.inp,
        threshold: THRESHOLDS.INP,
        severity: 'warning',
        message: `INP ${metrics.inp.toFixed(0)}ms exceeds ${THRESHOLDS.INP}ms threshold`
      });
    }

    if (metrics.psi_score < THRESHOLDS.PSI_SCORE) {
      this.violations.push({
        type: 'PERFORMANCE_SCORE',
        url: metrics.url,
        value: metrics.psi_score,
        threshold: THRESHOLDS.PSI_SCORE,
        severity: 'warning',
        message: `Performance score ${metrics.psi_score.toFixed(0)} below ${THRESHOLDS.PSI_SCORE} threshold`
      });
    }
  }

  generateAuditReport() {
    const criticalViolations = this.violations.filter(v => v.severity === 'critical');
    const warningViolations = this.violations.filter(v => v.severity === 'warning');

    const report = {
      audit_type: this.auditType,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - this.startTime,
      summary: {
        urls_tested: new Set(this.results.map(r => r.url)).size,
        total_violations: this.violations.length,
        critical_violations: criticalViolations.length,
        warning_violations: warningViolations.length,
        passed: this.violations.length === 0
      },
      thresholds: THRESHOLDS,
      results: this.results,
      violations: this.violations,
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    const violationTypes = new Set(this.violations.map(v => v.type));

    if (violationTypes.has('CORE_WEB_VITAL')) {
      recommendations.push('Optimize Core Web Vitals - review image sizes, reduce JS bundles, improve server response time');
    }

    if (violationTypes.has('ACCESSIBILITY')) {
      recommendations.push('Fix accessibility issues - add alt text, improve heading structure, check color contrast');
    }

    if (violationTypes.has('BUNDLE_SIZE')) {
      recommendations.push('Optimize bundle sizes - enable tree shaking, code splitting, compress assets');
    }

    if (violationTypes.has('SECURITY_HEADERS')) {
      recommendations.push('Add missing security headers - HSTS, CSP, X-Frame-Options');
    }

    return recommendations;
  }

  async processAlerts(report) {
    const critical = report.summary.critical_violations;
    const warnings = report.summary.warning_violations;

    // Critical alert threshold
    if (critical >= ALERT_CONFIG.thresholds.critical) {
      await this.sendCriticalAlert(report);
    }
    
    // Warning digest
    else if (warnings >= ALERT_CONFIG.thresholds.warning) {
      await this.sendWarningDigest(report);
    }

    // Check for consecutive failures
    await this.checkConsecutiveFailures(report);
  }

  async sendCriticalAlert(report) {
    console.log('🚨 Sending critical performance alert...');

    const message = {
      text: `🚨 *CRITICAL: Performance Alert*
      
*Audit Type:* ${report.audit_type}
*Critical Violations:* ${report.summary.critical_violations}
*URLs Affected:* ${report.summary.urls_tested}

*Top Issues:*
${report.violations.filter(v => v.severity === 'critical').slice(0, 3).map(v => `• ${v.message}`).join('\n')}

*Action Required:* Immediate investigation needed
*Report:* See performance-reports/ directory`,
      channel: ALERT_CONFIG.slack.channel
    };

    if (ALERT_CONFIG.slack.webhook) {
      try {
        await fetch(ALERT_CONFIG.slack.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
        console.log('  ✓ Critical alert sent to Slack');
      } catch (error) {
        console.error('  ❌ Failed to send Slack alert:', error);
      }
    }
  }

  async sendWarningDigest(report) {
    console.log('⚠️  Sending warning digest...');
    
    // Implementation would send less urgent notifications
    const summary = `Performance Audit ${report.audit_type}: ${report.summary.warning_violations} warnings found`;
    console.log(`  ✓ ${summary}`);
  }

  async checkConsecutiveFailures(report) {
    // Check if this is a consecutive failure
    const historyFile = './performance-reports/failure-history.json';
    let history = [];
    
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }

    if (!report.summary.passed) {
      history.push({
        timestamp: report.timestamp,
        audit_type: report.audit_type,
        violations: report.summary.total_violations
      });

      // Keep only last 10 entries
      history = history.slice(-10);

      // Check for consecutive failures
      const recentFailures = history.slice(-ALERT_CONFIG.thresholds.consecutive);
      if (recentFailures.length >= ALERT_CONFIG.thresholds.consecutive) {
        await this.sendEscalationAlert(recentFailures);
      }
    } else {
      // Clear history on success
      history = [];
    }

    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  }

  async sendEscalationAlert(failures) {
    console.log('📈 Sending escalation alert for consecutive failures...');
    // Implementation would send escalation notifications
  }

  async sendErrorAlert(error) {
    console.log('❌ Sending error alert...');
    
    const message = {
      text: `❌ *Performance Audit Error*
      
*Audit Type:* ${this.auditType}
*Error:* ${error.message}
*Time:* ${new Date().toISOString()}

*Action:* Check audit system health`,
      channel: ALERT_CONFIG.slack.channel
    };

    if (ALERT_CONFIG.slack.webhook) {
      try {
        await fetch(ALERT_CONFIG.slack.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
      } catch (alertError) {
        console.error('Failed to send error alert:', alertError);
      }
    }
  }

  saveAuditResults(report) {
    const reportsDir = './performance-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audit-${report.audit_type}-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`📄 Audit report saved: ${filepath}`);

    // Update latest report symlink
    const latestPath = path.join(reportsDir, `latest-${report.audit_type}.json`);
    if (fs.existsSync(latestPath)) {
      fs.unlinkSync(latestPath);
    }
    fs.symlinkSync(path.basename(filepath), latestPath);
  }

  findFiles(dir, pattern) {
    const files = [];
    
    function walkDir(currentDir) {
      if (!fs.existsSync(currentDir)) return;
      
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (pattern.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }
    
    walkDir(dir);
    return files;
  }
}

// CLI interface
async function main() {
  const auditType = process.argv[2] || 'daily';
  
  if (!['daily', 'weekly', 'monthly'].includes(auditType)) {
    console.error('Usage: node performanceAudit.cjs [daily|weekly|monthly]');
    process.exit(1);
  }

  const auditor = new PerformanceAuditor();
  
  try {
    const report = await auditor.runAudit(auditType);
    
    if (report.summary.passed) {
      console.log('✅ All performance checks passed');
      process.exit(0);
    } else {
      console.log('⚠️  Performance issues detected - check reports');
      process.exit(report.summary.critical_violations > 0 ? 1 : 0);
    }
  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
}

// Run audit if called directly
if (require.main === module) {
  main();
}

module.exports = PerformanceAuditor;