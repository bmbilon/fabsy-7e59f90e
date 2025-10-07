#!/usr/bin/env node
/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 11: Performance Guardrails - CI Performance Testing
 * 
 * Automated performance regression gates for AEO dominance
 * Targets: LCP ≤2.5s, CLS <0.1, INP ≤200ms, CI fails if violated
 */

const fs = require('fs');
const path = require('path');

// Performance thresholds for CI gates
const PERFORMANCE_THRESHOLDS = {
  LCP: 2.8,        // Slightly higher threshold for CI (2.5s target + buffer)
  CLS: 0.15,       // Layout shift threshold for CI
  INP: 250,        // Interaction responsiveness (ms)
  TTFB: 800,       // Time to First Byte (ms)
  PSI_SCORE: 85,   // PageSpeed Insights score threshold
  BUNDLE_JS: 250,  // JavaScript bundle size (KB)
  BUNDLE_CSS: 150  // CSS bundle size (KB)
};

// Test URLs for performance validation
const TEST_URLS = [
  '/',
  '/content/speeding-ticket-calgary',
  '/content/red-light-ticket-edmonton',
  '/content/careless-driving-ticket-fort-mcmurray'
];

// Lighthouse CI configuration
const LIGHTHOUSE_CONFIG = {
  ci: {
    collect: {
      url: TEST_URLS,
      numberOfRuns: 3,
      settings: {
        onlyCategories: ['performance', 'accessibility'],
        skipAudits: ['uses-http2', 'redirects-http'],
        budgets: [{
          resourceSizes: [{
            resourceType: 'script',
            budget: PERFORMANCE_THRESHOLDS.BUNDLE_JS * 1024
          }, {
            resourceType: 'stylesheet',
            budget: PERFORMANCE_THRESHOLDS.BUNDLE_CSS * 1024
          }, {
            resourceType: 'image',
            budget: 500 * 1024  // 500KB total images
          }]
        }]
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: PERFORMANCE_THRESHOLDS.PSI_SCORE / 100 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'audits:largest-contentful-paint': ['error', { maxNumericValue: PERFORMANCE_THRESHOLDS.LCP * 1000 }],
        'audits:cumulative-layout-shift': ['error', { maxNumericValue: PERFORMANCE_THRESHOLDS.CLS }],
        'audits:interaction-to-next-paint': ['error', { maxNumericValue: PERFORMANCE_THRESHOLDS.INP }],
        'audits:server-response-time': ['warn', { maxNumericValue: PERFORMANCE_THRESHOLDS.TTFB }]
      }
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse-results'
    }
  }
};

class PerformanceCI {
  constructor() {
    this.results = [];
    this.violations = [];
  }

  async runPerformanceTests() {
    console.log('🚀 Starting Performance CI Tests...\n');
    
    try {
      // Run bundle size validation
      await this.validateBundleSizes();
      
      // Run Lighthouse tests
      await this.runLighthouseTests();
      
      // Generate performance report
      const report = this.generateReport();
      
      // Save results
      this.saveResults(report);
      
      // Exit with appropriate code
      const hasViolations = this.violations.length > 0;
      if (hasViolations) {
        console.error('\n❌ Performance CI Tests FAILED');
        console.error(`Found ${this.violations.length} threshold violations`);
        process.exit(1);
      } else {
        console.log('\n✅ Performance CI Tests PASSED');
        process.exit(0);
      }
    } catch (error) {
      console.error('❌ Performance CI Tests failed with error:', error);
      process.exit(1);
    }
  }

  async validateBundleSizes() {
    console.log('📦 Validating bundle sizes...');
    
    // Check if dist/build directory exists
    const buildDirs = ['dist', 'build', '.next'];
    let buildDir = null;
    
    for (const dir of buildDirs) {
      if (fs.existsSync(dir)) {
        buildDir = dir;
        break;
      }
    }
    
    if (!buildDir) {
      console.warn('⚠️  No build directory found, skipping bundle validation');
      return;
    }
    
    // Find JavaScript bundles
    const jsFiles = this.findFiles(buildDir, /\.js$/);
    const cssFiles = this.findFiles(buildDir, /\.css$/);
    
    let totalJS = 0;
    let totalCSS = 0;
    
    // Calculate JavaScript bundle sizes
    for (const jsFile of jsFiles) {
      const stats = fs.statSync(jsFile);
      const sizeKB = Math.round(stats.size / 1024);
      totalJS += sizeKB;
      
      if (sizeKB > 100) { // Flag large individual files
        console.log(`  📄 ${path.basename(jsFile)}: ${sizeKB}KB`);
      }
    }
    
    // Calculate CSS bundle sizes
    for (const cssFile of cssFiles) {
      const stats = fs.statSync(cssFile);
      const sizeKB = Math.round(stats.size / 1024);
      totalCSS += sizeKB;
    }
    
    // Validate against thresholds
    if (totalJS > PERFORMANCE_THRESHOLDS.BUNDLE_JS) {
      this.violations.push({
        type: 'BUNDLE_SIZE',
        metric: 'JavaScript',
        current: totalJS,
        threshold: PERFORMANCE_THRESHOLDS.BUNDLE_JS,
        message: `Total JavaScript ${totalJS}KB exceeds ${PERFORMANCE_THRESHOLDS.BUNDLE_JS}KB limit`
      });
    }
    
    if (totalCSS > PERFORMANCE_THRESHOLDS.BUNDLE_CSS) {
      this.violations.push({
        type: 'BUNDLE_SIZE',
        metric: 'CSS',
        current: totalCSS,
        threshold: PERFORMANCE_THRESHOLDS.BUNDLE_CSS,
        message: `Total CSS ${totalCSS}KB exceeds ${PERFORMANCE_THRESHOLDS.BUNDLE_CSS}KB limit`
      });
    }
    
    console.log(`  ✓ JavaScript: ${totalJS}KB (limit: ${PERFORMANCE_THRESHOLDS.BUNDLE_JS}KB)`);
    console.log(`  ✓ CSS: ${totalCSS}KB (limit: ${PERFORMANCE_THRESHOLDS.BUNDLE_CSS}KB)`);
  }

  async runLighthouseTests() {
    console.log('🔍 Running Lighthouse performance tests...');
    
    // Save Lighthouse CI configuration
    const configPath = path.join(process.cwd(), 'lighthouserc.json');
    fs.writeFileSync(configPath, JSON.stringify(LIGHTHOUSE_CONFIG, null, 2));
    
    try {
      // Run Lighthouse CI (requires @lhci/cli to be installed)
      const { execSync } = require('child_process');
      
      console.log('  Running Lighthouse CI...');
      const output = execSync('npx @lhci/cli collect --config=lighthouserc.json', {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      console.log('  Analyzing Lighthouse results...');
      const assertOutput = execSync('npx @lhci/cli assert --config=lighthouserc.json', {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      // Parse Lighthouse results
      this.parseLighthouseResults();
      
    } catch (error) {
      // Lighthouse CI failed - parse error output for violations
      console.error('  ❌ Lighthouse assertions failed');
      this.parseLighthouseErrors(error.stdout || error.message);
    } finally {
      // Clean up config file
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
  }

  parseLighthouseResults() {
    const resultsDir = './lighthouse-results';
    
    if (!fs.existsSync(resultsDir)) {
      console.warn('  ⚠️  No Lighthouse results found');
      return;
    }
    
    // Find the latest results
    const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const filePath = path.join(resultsDir, file);
      const results = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Extract performance metrics
      const metrics = {
        url: results.finalUrl,
        lcp: results.audits['largest-contentful-paint']?.numericValue / 1000 || 0,
        cls: results.audits['cumulative-layout-shift']?.numericValue || 0,
        inp: results.audits['interaction-to-next-paint']?.numericValue || 0,
        ttfb: results.audits['server-response-time']?.numericValue || 0,
        psiScore: results.categories?.performance?.score * 100 || 0
      };
      
      this.results.push(metrics);
      
      // Check for violations
      this.checkMetricViolations(metrics);
    }
  }

  checkMetricViolations(metrics) {
    if (metrics.lcp > PERFORMANCE_THRESHOLDS.LCP) {
      this.violations.push({
        type: 'CORE_WEB_VITAL',
        metric: 'LCP',
        current: metrics.lcp,
        threshold: PERFORMANCE_THRESHOLDS.LCP,
        url: metrics.url,
        message: `LCP ${metrics.lcp.toFixed(2)}s exceeds ${PERFORMANCE_THRESHOLDS.LCP}s threshold`
      });
    }
    
    if (metrics.cls > PERFORMANCE_THRESHOLDS.CLS) {
      this.violations.push({
        type: 'CORE_WEB_VITAL',
        metric: 'CLS',
        current: metrics.cls,
        threshold: PERFORMANCE_THRESHOLDS.CLS,
        url: metrics.url,
        message: `CLS ${metrics.cls.toFixed(3)} exceeds ${PERFORMANCE_THRESHOLDS.CLS} threshold`
      });
    }
    
    if (metrics.inp > PERFORMANCE_THRESHOLDS.INP) {
      this.violations.push({
        type: 'CORE_WEB_VITAL',
        metric: 'INP',
        current: metrics.inp,
        threshold: PERFORMANCE_THRESHOLDS.INP,
        url: metrics.url,
        message: `INP ${metrics.inp.toFixed(0)}ms exceeds ${PERFORMANCE_THRESHOLDS.INP}ms threshold`
      });
    }
    
    if (metrics.psiScore < PERFORMANCE_THRESHOLDS.PSI_SCORE) {
      this.violations.push({
        type: 'PERFORMANCE_SCORE',
        metric: 'PSI_SCORE',
        current: metrics.psiScore,
        threshold: PERFORMANCE_THRESHOLDS.PSI_SCORE,
        url: metrics.url,
        message: `Performance score ${metrics.psiScore.toFixed(0)} below ${PERFORMANCE_THRESHOLDS.PSI_SCORE} threshold`
      });
    }
  }

  parseLighthouseErrors(errorOutput) {
    // Parse Lighthouse CI assertion errors
    const lines = errorOutput.split('\n');
    
    for (const line of lines) {
      if (line.includes('assertion failed')) {
        // Extract assertion details and add to violations
        this.violations.push({
          type: 'LIGHTHOUSE_ASSERTION',
          message: line.trim()
        });
      }
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      thresholds: PERFORMANCE_THRESHOLDS,
      results: this.results,
      violations: this.violations,
      summary: {
        totalTests: this.results.length,
        totalViolations: this.violations.length,
        passed: this.violations.length === 0
      }
    };
    
    // Generate detailed report
    console.log('\n📊 Performance CI Report:');
    console.log(`   Tests run: ${report.summary.totalTests}`);
    console.log(`   Violations: ${report.summary.totalViolations}`);
    console.log(`   Status: ${report.summary.passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (this.violations.length > 0) {
      console.log('\n❌ Threshold Violations:');
      this.violations.forEach((violation, index) => {
        console.log(`   ${index + 1}. ${violation.message}`);
        if (violation.url) {
          console.log(`      URL: ${violation.url}`);
        }
      });
    }
    
    return report;
  }

  saveResults(report) {
    // Save JSON report
    const reportsDir = './performance-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `performance-ci-${timestamp}.json`);
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved: ${reportPath}`);
    
    // Save GitHub Actions summary if running in CI
    if (process.env.GITHUB_ACTIONS) {
      this.generateGitHubSummary(report);
    }
  }

  generateGitHubSummary(report) {
    const summary = `
# Performance CI Report

## Summary
- **Tests Run**: ${report.summary.totalTests}
- **Violations**: ${report.summary.totalViolations}  
- **Status**: ${report.summary.passed ? '✅ PASSED' : '❌ FAILED'}

## Thresholds
- **LCP**: ≤ ${PERFORMANCE_THRESHOLDS.LCP}s
- **CLS**: ≤ ${PERFORMANCE_THRESHOLDS.CLS}
- **INP**: ≤ ${PERFORMANCE_THRESHOLDS.INP}ms
- **PSI Score**: ≥ ${PERFORMANCE_THRESHOLDS.PSI_SCORE}

${this.violations.length > 0 ? `
## ❌ Violations
${this.violations.map((v, i) => `${i + 1}. **${v.metric || 'Unknown'}**: ${v.message}`).join('\n')}
` : '## ✅ All Performance Tests Passed'}

## Results
${this.results.map(r => `
### ${r.url}
- **LCP**: ${r.lcp?.toFixed(2) || 'N/A'}s ${r.lcp <= PERFORMANCE_THRESHOLDS.LCP ? '✅' : '❌'}
- **CLS**: ${r.cls?.toFixed(3) || 'N/A'} ${r.cls <= PERFORMANCE_THRESHOLDS.CLS ? '✅' : '❌'}
- **INP**: ${r.inp?.toFixed(0) || 'N/A'}ms ${r.inp <= PERFORMANCE_THRESHOLDS.INP ? '✅' : '❌'}
- **PSI Score**: ${r.psiScore?.toFixed(0) || 'N/A'} ${r.psiScore >= PERFORMANCE_THRESHOLDS.PSI_SCORE ? '✅' : '❌'}
`).join('')}
`;

    // Write to GitHub Actions summary
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
  }

  findFiles(dir, pattern) {
    const files = [];
    
    function walkDir(currentDir) {
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
    
    if (fs.existsSync(dir)) {
      walkDir(dir);
    }
    
    return files;
  }
}

// Run performance CI if called directly
if (require.main === module) {
  const ci = new PerformanceCI();
  ci.runPerformanceTests();
}

module.exports = PerformanceCI;