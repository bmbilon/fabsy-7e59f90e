/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 11: Performance Guardrails - Asset Optimization
 * 
 * Implements critical CSS inlining, deferred loading, bundle optimization
 * Targets: <250KB JS, <150KB CSS, LCP ≤2.5s for AEO dominance
 */

export interface AssetBudget {
  maxJavaScriptKB: number;  // 250KB
  maxCSSKB: number;         // 150KB
  criticalCSSKB: number;    // 3KB inline
  maxRequests: {
    css: number;            // ≤2 CSS requests
    js: number;             // ≤2 JS requests
  };
}

export interface AssetOptimizationConfig {
  enableCriticalCSS: boolean;
  enableDefer: boolean;
  enableBundling: boolean;
  enableTreeShaking: boolean;
  enableCompression: boolean;
}

export interface OptimizedAsset {
  type: 'css' | 'js';
  path: string;
  size: number;
  critical: boolean;
  defer: boolean;
  preload: boolean;
}

export const ASSET_BUDGET: AssetBudget = {
  maxJavaScriptKB: 250,
  maxCSSKB: 150,
  criticalCSSKB: 3,
  maxRequests: {
    css: 2,
    js: 2
  }
};

export const CRITICAL_CSS = `
/* Critical CSS for AEO performance - Inline <3KB */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 800px; margin: 0 auto; padding: 20px; }
h1 { font-size: 2.5em; margin-bottom: 10px; color: #2c3e50; font-weight: 700; }
h2 { font-size: 1.8em; margin-top: 30px; margin-bottom: 15px; color: #34495e; }
.hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; margin: -20px -20px 30px -20px; }
.hero h1 { color: white; margin: 0; }
.hero p { font-size: 1.2em; margin: 15px 0; }
.answer-box { background: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0; border-radius: 5px; }
.cta { background: #007bff; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0; font-weight: 600; }
.cta:hover { background: #0056b3; }
@media (max-width: 768px) { .container { padding: 15px; } h1 { font-size: 2em; } .hero { margin: -15px -15px 20px -15px; padding: 30px 15px; } }
`;

export class AssetOptimizer {
  private config: AssetOptimizationConfig;

  constructor(config: AssetOptimizationConfig = {
    enableCriticalCSS: true,
    enableDefer: true,
    enableBundling: true,
    enableTreeShaking: true,
    enableCompression: true
  }) {
    this.config = config;
  }

  /**
   * Generate optimized HTML with critical CSS inline and deferred assets
   */
  optimizePageAssets(htmlContent: string): string {
    let optimizedHtml = htmlContent;

    if (this.config.enableCriticalCSS) {
      optimizedHtml = this.inlineCriticalCSS(optimizedHtml);
    }

    if (this.config.enableDefer) {
      optimizedHtml = this.deferNonCriticalAssets(optimizedHtml);
    }

    optimizedHtml = this.addResourceHints(optimizedHtml);
    optimizedHtml = this.optimizeScriptLoading(optimizedHtml);

    return optimizedHtml;
  }

  /**
   * Inline critical CSS for fastest above-fold rendering
   */
  private inlineCriticalCSS(html: string): string {
    // Remove existing critical CSS links and inline critical styles
    let optimizedHtml = html.replace(/<link[^>]*href="[^"]*critical[^"]*\.css"[^>]*>/gi, '');
    
    // Insert critical CSS inline in head
    const criticalStyleTag = `
      <style>
        ${CRITICAL_CSS}
      </style>
    `;

    return html.replace(/<\/head>/i, `${criticalStyleTag}</head>`);
  }

  /**
   * Defer non-critical CSS and JavaScript
   */
  private deferNonCriticalAssets(html: string): string {
    // Defer non-critical CSS using media print technique
    let optimizedHtml = html.replace(
      /<link([^>]*rel=["']stylesheet["'][^>]*href=["'](?!.*critical)([^"']+)["'][^>]*)>/gi,
      '<link$1 media="print" onload="this.media=\'all\'; this.onload=null;">'
    );

    // Add noscript fallback for deferred CSS
    optimizedHtml = optimizedHtml.replace(
      /<link([^>]*media=["']print["'][^>]*href=["']([^"']+)["'][^>]*)>/gi,
      '<link$1><noscript><link rel="stylesheet" href="$2"></noscript>'
    );

    // Defer non-critical JavaScript
    optimizedHtml = optimizedHtml.replace(
      /<script([^>]*src=["'](?!.*critical)([^"']+)["'][^>]*)><\/script>/gi,
      '<script$1 defer></script>'
    );

    return optimizedHtml;
  }

  /**
   * Add resource hints for better performance
   */
  private addResourceHints(html: string): string {
    const resourceHints = `
      <!-- Performance optimization hints -->
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://www.google-analytics.com">
      <link rel="dns-prefetch" href="https://fonts.gstatic.com">
      <link rel="dns-prefetch" href="https://www.googletagmanager.com">
    `;

    return html.replace(/<\/head>/i, `${resourceHints}</head>`);
  }

  /**
   * Optimize script loading with async/defer and module support
   */
  private optimizeScriptLoading(html: string): string {
    // Add module/nomodule pattern for modern JS
    let optimizedHtml = html.replace(
      /<script([^>]*src=["']([^"']+\.js)["'][^>]*)><\/script>/gi,
      (match, attributes, src) => {
        // Critical scripts should load immediately
        if (src.includes('critical') || attributes.includes('critical')) {
          return match;
        }

        // Analytics and tracking scripts should be deferred
        if (src.includes('analytics') || src.includes('gtag') || src.includes('tracking')) {
          return `<script${attributes} defer></script>`;
        }

        // Other scripts can be async
        return `<script${attributes} async></script>`;
      }
    );

    return optimizedHtml;
  }

  /**
   * Generate Webpack/Vite configuration for optimal bundling
   */
  generateBundleConfig(): object {
    return {
      // Webpack-style configuration
      optimization: {
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              maxSize: ASSET_BUDGET.maxJavaScriptKB * 1024 * 0.6 // 60% of budget for vendor
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              maxSize: ASSET_BUDGET.maxJavaScriptKB * 1024 * 0.4 // 40% of budget for app
            }
          }
        },
        usedExports: true,
        sideEffects: false
      },
      performance: {
        maxAssetSize: ASSET_BUDGET.maxJavaScriptKB * 1024,
        maxEntrypointSize: ASSET_BUDGET.maxJavaScriptKB * 1024,
        hints: 'error'
      },
      resolve: {
        alias: {
          '@': './src'
        }
      }
    };
  }

  /**
   * Audit page assets and check budget compliance
   */
  async auditPageAssets(url: string): Promise<{
    totalJS: number;
    totalCSS: number;
    jsRequests: number;
    cssRequests: number;
    budgetViolations: string[];
    recommendations: string[];
  }> {
    try {
      const response = await fetch(url);
      const html = await response.text();
      
      // Extract all script tags
      const scriptMatches = html.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi) || [];
      const cssMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi) || [];
      
      let totalJS = 0;
      let totalCSS = 0;
      const budgetViolations: string[] = [];
      const recommendations: string[] = [];

      // Estimate sizes (in production, would fetch actual sizes)
      for (const script of scriptMatches) {
        totalJS += 50; // Estimate 50KB per script
      }

      for (const css of cssMatches) {
        totalCSS += 25; // Estimate 25KB per CSS file
      }

      const jsRequests = scriptMatches.length;
      const cssRequests = cssMatches.length;

      // Check budget violations
      if (totalJS > ASSET_BUDGET.maxJavaScriptKB) {
        budgetViolations.push(`JavaScript size ${totalJS}KB exceeds ${ASSET_BUDGET.maxJavaScriptKB}KB budget`);
        recommendations.push('Bundle and tree-shake JavaScript files');
      }

      if (totalCSS > ASSET_BUDGET.maxCSSKB) {
        budgetViolations.push(`CSS size ${totalCSS}KB exceeds ${ASSET_BUDGET.maxCSSKB}KB budget`);
        recommendations.push('Optimize and bundle CSS files');
      }

      if (jsRequests > ASSET_BUDGET.maxRequests.js) {
        budgetViolations.push(`${jsRequests} JS requests exceed limit of ${ASSET_BUDGET.maxRequests.js}`);
        recommendations.push('Bundle JavaScript files to reduce requests');
      }

      if (cssRequests > ASSET_BUDGET.maxRequests.css) {
        budgetViolations.push(`${cssRequests} CSS requests exceed limit of ${ASSET_BUDGET.maxRequests.css}`);
        recommendations.push('Bundle CSS files to reduce requests');
      }

      // Check for critical CSS
      if (!html.includes('<style>') && cssRequests > 0) {
        recommendations.push('Inline critical CSS to improve LCP');
      }

      // Check for deferred loading
      if (html.includes('<script') && !html.includes('defer') && !html.includes('async')) {
        recommendations.push('Add defer/async to non-critical scripts');
      }

      return {
        totalJS,
        totalCSS,
        jsRequests,
        cssRequests,
        budgetViolations,
        recommendations
      };
    } catch (error) {
      console.error('Failed to audit assets:', error);
      return {
        totalJS: 0,
        totalCSS: 0,
        jsRequests: 0,
        cssRequests: 0,
        budgetViolations: ['Failed to audit assets'],
        recommendations: ['Check URL accessibility']
      };
    }
  }

  /**
   * Generate performance-optimized font loading
   */
  generateFontOptimization(): string {
    return `
      <!-- Font optimization for performance -->
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      
      <style>
        /* Font fallbacks to prevent FOIT */
        body {
          font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        /* System font stack for instant text rendering */
        .system-font {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
      </style>
    `;
  }

  /**
   * Generate service worker for asset caching
   */
  generateServiceWorker(): string {
    return `
      // Service Worker for asset caching - AEO Performance
      const CACHE_NAME = 'fabsy-assets-v1';
      const STATIC_ASSETS = [
        '/',
        '/critical.css',
        '/main.js',
        '/fonts/inter-var.woff2'
      ];

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
          })
        );
      });

      self.addEventListener('fetch', event => {
        // Cache-first strategy for static assets
        if (event.request.url.includes('.css') || 
            event.request.url.includes('.js') || 
            event.request.url.includes('.woff')) {
          event.respondWith(
            caches.match(event.request).then(response => {
              return response || fetch(event.request);
            })
          );
        }
      });
    `;
  }

  /**
   * Generate asset manifest for tracking
   */
  generateAssetManifest(assets: OptimizedAsset[]): object {
    return {
      version: Date.now(),
      assets: assets.map(asset => ({
        path: asset.path,
        type: asset.type,
        size: asset.size,
        critical: asset.critical,
        defer: asset.defer,
        preload: asset.preload
      })),
      budgets: ASSET_BUDGET,
      totals: {
        js: assets.filter(a => a.type === 'js').reduce((sum, a) => sum + a.size, 0),
        css: assets.filter(a => a.type === 'css').reduce((sum, a) => sum + a.size, 0)
      }
    };
  }
}

export default AssetOptimizer;