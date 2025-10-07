/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 11: Performance Guardrails - Core Web Vitals Monitor
 * 
 * Monitors LCP ≤2.5s, CLS <0.1, INP ≤200ms, TTFB <0.6s for AEO dominance
 */

export interface CWVTargets {
  LCP: number;      // ≤ 2.5s (mobile 75th percentile)
  CLS: number;      // < 0.1
  INP: number;      // ≤ 200ms
  TTFB: number;     // < 0.6s
  TTI: number;      // < 2.5s
}

export interface PerformanceMetrics {
  url: string;
  timestamp: string;
  device: 'mobile' | 'desktop';
  lcp: number;
  cls: number;
  inp: number;
  ttfb: number;
  tti: number;
  psi_score: number;
  field_data?: CrUXMetrics;
}

export interface CrUXMetrics {
  lcp_p75: number;
  cls_p75: number;
  inp_p75: number;
  ttfb_p75: number;
}

export interface PerformanceAlert {
  id: string;
  type: 'LCP' | 'CLS' | 'INP' | 'JS_BLOAT' | 'IMAGE_WEIGHT';
  condition: string;
  triggered_at: string;
  url: string;
  current_value: number;
  threshold: number;
  action: string[];
}

// Performance targets for AEO dominance
export const CWV_TARGETS: CWVTargets = {
  LCP: 2.5,    // seconds
  CLS: 0.1,    // layout shift score
  INP: 200,    // milliseconds
  TTFB: 0.6,   // seconds
  TTI: 2.5     // seconds
};

// Critical pages for daily monitoring
export const CRITICAL_PAGES = [
  '/',
  '/content/speeding-ticket-calgary',
  '/content/red-light-ticket-edmonton',
  '/content/careless-driving-ticket-fort-mcmurray'
];

export class CWVMonitor {
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async measurePage(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<PerformanceMetrics> {
    const fullUrl = url.startsWith('http') ? url : `https://fabsy.com${url}`;
    const apiUrl = `${this.baseUrl}?url=${encodeURIComponent(fullUrl)}&strategy=${strategy}&key=${this.apiKey}`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`PSI API error: ${data.error?.message || 'Unknown error'}`);
      }

      const lighthouse = data.lighthouseResult;
      const loadingExperience = data.loadingExperience;

      return {
        url: fullUrl,
        timestamp: new Date().toISOString(),
        device: strategy,
        lcp: lighthouse.audits['largest-contentful-paint']?.numericValue / 1000 || 0,
        cls: lighthouse.audits['cumulative-layout-shift']?.numericValue || 0,
        inp: lighthouse.audits['interaction-to-next-paint']?.numericValue || 0,
        ttfb: lighthouse.audits['server-response-time']?.numericValue / 1000 || 0,
        tti: lighthouse.audits['interactive']?.numericValue / 1000 || 0,
        psi_score: lighthouse.categories.performance?.score * 100 || 0,
        field_data: loadingExperience?.metrics ? {
          lcp_p75: loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile / 1000,
          cls_p75: loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
          inp_p75: loadingExperience.metrics.INTERACTION_TO_NEXT_PAINT?.percentile,
          ttfb_p75: loadingExperience.metrics.FIRST_CONTENTFUL_PAINT_MS?.percentile / 1000
        } : undefined
      };
    } catch (error) {
      console.error(`Failed to measure ${url}:`, error);
      throw error;
    }
  }

  async measureCriticalPages(): Promise<PerformanceMetrics[]> {
    const results: PerformanceMetrics[] = [];
    
    for (const page of CRITICAL_PAGES) {
      try {
        const metrics = await this.measurePage(page, 'mobile');
        results.push(metrics);
        
        // Rate limiting - PSI API has quotas
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to measure ${page}:`, error);
      }
    }
    
    return results;
  }

  evaluateMetrics(metrics: PerformanceMetrics): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const timestamp = new Date().toISOString();

    // LCP violation
    if (metrics.lcp > CWV_TARGETS.LCP) {
      alerts.push({
        id: `ALERT-LCP-${Date.now()}`,
        type: 'LCP',
        condition: `LCP > ${CWV_TARGETS.LCP}s`,
        triggered_at: timestamp,
        url: metrics.url,
        current_value: metrics.lcp,
        threshold: CWV_TARGETS.LCP,
        action: ['open_incident: PERF-LCP', 'notify:#frontend-ux']
      });
    }

    // CLS violation
    if (metrics.cls > CWV_TARGETS.CLS) {
      alerts.push({
        id: `ALERT-CLS-${Date.now()}`,
        type: 'CLS',
        condition: `CLS > ${CWV_TARGETS.CLS}`,
        triggered_at: timestamp,
        url: metrics.url,
        current_value: metrics.cls,
        threshold: CWV_TARGETS.CLS,
        action: ['open_incident: PERF-CLS', 'notify:#frontend-ux']
      });
    }

    // INP violation
    if (metrics.inp > CWV_TARGETS.INP) {
      alerts.push({
        id: `ALERT-INP-${Date.now()}`,
        type: 'INP',
        condition: `INP > ${CWV_TARGETS.INP}ms`,
        triggered_at: timestamp,
        url: metrics.url,
        current_value: metrics.inp,
        threshold: CWV_TARGETS.INP,
        action: ['open_incident: PERF-INP', 'notify:#frontend-ux']
      });
    }

    return alerts;
  }

  async getCrUXData(url: string): Promise<CrUXMetrics | null> {
    try {
      const cruxUrl = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${this.apiKey}`;
      const response = await fetch(cruxUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.startsWith('http') ? url : `https://fabsy.com${url}`,
          formFactor: 'PHONE'
        })
      });

      if (!response.ok) return null;
      
      const data = await response.json();
      const metrics = data.record?.metrics;
      
      if (!metrics) return null;

      return {
        lcp_p75: metrics.largest_contentful_paint?.percentiles?.p75 / 1000 || 0,
        cls_p75: metrics.cumulative_layout_shift?.percentiles?.p75 || 0,
        inp_p75: metrics.interaction_to_next_paint?.percentiles?.p75 || 0,
        ttfb_p75: metrics.first_contentful_paint?.percentiles?.p75 / 1000 || 0
      };
    } catch (error) {
      console.error('Failed to fetch CrUX data:', error);
      return null;
    }
  }

  generateReport(metrics: PerformanceMetrics[]): string {
    const passing = metrics.filter(m => 
      m.lcp <= CWV_TARGETS.LCP && 
      m.cls <= CWV_TARGETS.CLS && 
      m.inp <= CWV_TARGETS.INP
    );

    const report = `
# Core Web Vitals Report - ${new Date().toISOString().split('T')[0]}

## Summary
- **Pages Tested:** ${metrics.length}
- **Passing CWV:** ${passing.length}/${metrics.length} (${((passing.length/metrics.length)*100).toFixed(1)}%)
- **Average PSI Score:** ${(metrics.reduce((sum, m) => sum + m.psi_score, 0) / metrics.length).toFixed(1)}

## Performance Metrics

${metrics.map(m => `
### ${m.url}
- **LCP:** ${m.lcp.toFixed(2)}s ${m.lcp <= CWV_TARGETS.LCP ? '✅' : '❌'}
- **CLS:** ${m.cls.toFixed(3)} ${m.cls <= CWV_TARGETS.CLS ? '✅' : '❌'} 
- **INP:** ${m.inp.toFixed(0)}ms ${m.inp <= CWV_TARGETS.INP ? '✅' : '❌'}
- **TTFB:** ${m.ttfb.toFixed(2)}s ${m.ttfb <= CWV_TARGETS.TTFB ? '✅' : '❌'}
- **PSI Score:** ${m.psi_score.toFixed(0)}/100
${m.field_data ? `- **Field LCP (75th):** ${m.field_data.lcp_p75?.toFixed(2)}s` : ''}
`).join('')}

## Recommendations
${passing.length < metrics.length ? `
### Critical Issues
${metrics.filter(m => m.lcp > CWV_TARGETS.LCP).map(m => `- **${m.url}:** LCP ${m.lcp.toFixed(2)}s > ${CWV_TARGETS.LCP}s - Optimize images, reduce server response time`).join('\n')}
${metrics.filter(m => m.cls > CWV_TARGETS.CLS).map(m => `- **${m.url}:** CLS ${m.cls.toFixed(3)} > ${CWV_TARGETS.CLS} - Add size attributes to images, avoid dynamic content insertion`).join('\n')}
${metrics.filter(m => m.inp > CWV_TARGETS.INP).map(m => `- **${m.url}:** INP ${m.inp.toFixed(0)}ms > ${CWV_TARGETS.INP}ms - Reduce JavaScript execution time, debounce interactions`).join('\n')}
` : '✅ All pages meeting CWV targets'}
`;

    return report.trim();
  }
}

export default CWVMonitor;