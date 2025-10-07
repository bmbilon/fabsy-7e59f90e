/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 11: Performance Guardrails - Caching & CDN Configuration
 * 
 * Implements cache-first static assets, stale-while-revalidate HTML
 * Targets: TTFB <0.6s, HTTP/2+ only, Brotli compression for AEO dominance
 */

export interface CacheConfiguration {
  staticAssets: CacheRule;
  htmlPages: CacheRule;
  apiResponses: CacheRule;
  images: CacheRule;
  fonts: CacheRule;
}

export interface CacheRule {
  maxAge: number;          // seconds
  staleWhileRevalidate?: number;
  mustRevalidate?: boolean;
  public: boolean;
  immutable?: boolean;
  vary?: string[];
}

export interface CDNConfig {
  enableCompression: boolean;
  compressionLevel: 'gzip' | 'brotli' | 'both';
  minifyHTML: boolean;
  minifyCSS: boolean;
  minifyJS: boolean;
  http2Push?: string[];
  edgeFunctions: EdgeFunction[];
}

export interface EdgeFunction {
  name: string;
  trigger: 'request' | 'response';
  code: string;
}

// Cache configuration for different asset types
export const CACHE_CONFIG: CacheConfiguration = {
  staticAssets: {
    maxAge: 31536000,      // 1 year
    public: true,
    immutable: true,
    vary: ['Accept-Encoding']
  },
  htmlPages: {
    maxAge: 86400,         // 24 hours
    staleWhileRevalidate: 604800, // 7 days
    public: true,
    vary: ['Accept-Encoding', 'User-Agent']
  },
  apiResponses: {
    maxAge: 300,           // 5 minutes
    staleWhileRevalidate: 3600, // 1 hour
    public: false,
    mustRevalidate: true
  },
  images: {
    maxAge: 2592000,       // 30 days
    public: true,
    vary: ['Accept', 'Accept-Encoding']
  },
  fonts: {
    maxAge: 31536000,      // 1 year
    public: true,
    immutable: true,
    vary: ['Accept-Encoding']
  }
};

export class CachingOptimizer {
  private cdnConfig: CDNConfig;

  constructor(cdnConfig: CDNConfig = {
    enableCompression: true,
    compressionLevel: 'both',
    minifyHTML: true,
    minifyCSS: true,
    minifyJS: true,
    edgeFunctions: []
  }) {
    this.cdnConfig = cdnConfig;
  }

  /**
   * Generate cache headers for different content types
   */
  generateCacheHeaders(contentType: string, filePath: string): Record<string, string> {
    let rule: CacheRule;
    
    // Determine cache rule based on content type and path
    if (contentType.includes('text/html')) {
      rule = CACHE_CONFIG.htmlPages;
    } else if (contentType.includes('image/')) {
      rule = CACHE_CONFIG.images;
    } else if (contentType.includes('font/') || filePath.includes('.woff')) {
      rule = CACHE_CONFIG.fonts;
    } else if (contentType.includes('application/json')) {
      rule = CACHE_CONFIG.apiResponses;
    } else {
      rule = CACHE_CONFIG.staticAssets;
    }

    const headers: Record<string, string> = {};

    // Build Cache-Control header
    const cacheDirectives: string[] = [];
    
    if (rule.public) {
      cacheDirectives.push('public');
    } else {
      cacheDirectives.push('private');
    }

    cacheDirectives.push(`max-age=${rule.maxAge}`);

    if (rule.staleWhileRevalidate) {
      cacheDirectives.push(`stale-while-revalidate=${rule.staleWhileRevalidate}`);
    }

    if (rule.mustRevalidate) {
      cacheDirectives.push('must-revalidate');
    }

    if (rule.immutable) {
      cacheDirectives.push('immutable');
    }

    headers['Cache-Control'] = cacheDirectives.join(', ');

    // Add Vary header
    if (rule.vary && rule.vary.length > 0) {
      headers['Vary'] = rule.vary.join(', ');
    }

    // Add compression headers
    if (this.cdnConfig.enableCompression) {
      if (this.cdnConfig.compressionLevel === 'brotli') {
        headers['Content-Encoding'] = 'br';
      } else if (this.cdnConfig.compressionLevel === 'gzip') {
        headers['Content-Encoding'] = 'gzip';
      } else {
        headers['Content-Encoding'] = 'br, gzip';
      }
    }

    // Security and performance headers
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['X-Frame-Options'] = 'DENY';
    headers['X-XSS-Protection'] = '1; mode=block';
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    
    // HSTS for HTTPS
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';

    return headers;
  }

  /**
   * Generate Cloudflare Worker for edge optimization
   */
  generateCloudflareWorker(): string {
    return `
      // Cloudflare Worker for AEO Performance Optimization
      addEventListener('fetch', event => {
        event.respondWith(handleRequest(event.request));
      });

      async function handleRequest(request) {
        const url = new URL(request.url);
        const cache = caches.default;
        
        // Check cache first
        let response = await cache.match(request);
        
        if (!response) {
          // Fetch from origin
          response = await fetch(request);
          
          // Clone response for caching
          const responseClone = response.clone();
          
          // Apply optimizations
          response = await optimizeResponse(responseClone, url);
          
          // Cache the optimized response
          const cacheKey = new Request(url.toString(), request);
          event.waitUntil(cache.put(cacheKey, response.clone()));
        }
        
        return response;
      }

      async function optimizeResponse(response, url) {
        const contentType = response.headers.get('content-type') || '';
        
        // HTML optimization
        if (contentType.includes('text/html')) {
          let html = await response.text();
          
          // Strip query params from canonical URLs
          html = html.replace(/(<link[^>]*rel="canonical"[^>]*href="[^"?]+)\\?[^"]*"/gi, '$1"');
          
          // Minify HTML if enabled
          if (${this.cdnConfig.minifyHTML}) {
            html = minifyHTML(html);
          }
          
          // Apply cache headers
          const headers = ${JSON.stringify(this.generateCacheHeaders('text/html', url.pathname))};
          
          return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: { ...response.headers, ...headers }
          });
        }
        
        // Static asset optimization
        const headers = ${JSON.stringify(this.generateCacheHeaders(contentType, url.pathname))};
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: { ...response.headers, ...headers }
        });
      }

      function minifyHTML(html) {
        return html
          .replace(/\\s+/g, ' ')                    // Collapse whitespace
          .replace(/<!--[^>]*-->/g, '')            // Remove comments
          .replace(/\\s*>\\s*/g, '>')              // Remove space around tags
          .replace(/\\s*<\\s*/g, '<')              // Remove space around tags
          .trim();
      }
    `;
  }

  /**
   * Generate Nginx configuration for high-performance caching
   */
  generateNginxConfig(): string {
    return `
      # Nginx configuration for AEO Performance Optimization
      
      # Compression
      gzip on;
      gzip_vary on;
      gzip_min_length 1024;
      gzip_comp_level 6;
      gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/json
        application/xml+rss
        application/atom+xml
        image/svg+xml;
      
      # Brotli compression (if module available)
      brotli on;
      brotli_comp_level 4;
      brotli_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/json
        application/xml+rss
        application/atom+xml
        image/svg+xml;

      # HTTP/2 and HTTP/3 optimization
      http2_push_preload on;
      
      # Cache static assets
      location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Vary "Accept-Encoding";
        
        # Security headers
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;
        add_header X-XSS-Protection "1; mode=block";
      }
      
      # Cache HTML pages with stale-while-revalidate
      location / {
        expires 24h;
        add_header Cache-Control "public, max-age=86400, stale-while-revalidate=604800";
        add_header Vary "Accept-Encoding, User-Agent";
        
        # Security headers
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;
        add_header X-XSS-Protection "1; mode=block";
        add_header Referrer-Policy "strict-origin-when-cross-origin";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";
      }
      
      # API responses with shorter cache
      location /api/ {
        expires 5m;
        add_header Cache-Control "private, max-age=300, stale-while-revalidate=3600, must-revalidate";
      }
      
      # Force HTTPS and HTTP/2
      server {
        listen 80;
        return 301 https://$server_name$request_uri;
      }
      
      server {
        listen 443 ssl http2;
        
        # SSL configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        
        # HTTP/2 push for critical resources
        location = / {
          http2_push /critical.css;
          http2_push /main.js;
        }
      }
    `;
  }

  /**
   * Generate cache validation and purging functions
   */
  generateCacheValidation(): string {
    return `
      /**
       * Cache validation and purging utilities
       */
      
      class CacheValidator {
        constructor(cacheApiKey) {
          this.apiKey = cacheApiKey;
        }
        
        // Validate cache hit rates
        async validateCachePerformance() {
          const metrics = await this.getCacheMetrics();
          
          return {
            hitRate: metrics.hits / (metrics.hits + metrics.misses),
            ttfbImprovement: metrics.cachedTTFB / metrics.originTTFB,
            bandwidthSaved: metrics.cachedBytes / metrics.totalBytes,
            recommendations: this.generateCacheRecommendations(metrics)
          };
        }
        
        // Purge cache for updated content
        async purgeCache(patterns) {
          const purgeRequests = patterns.map(pattern => ({
            url: pattern,
            method: 'PURGE'
          }));
          
          const results = await Promise.allSettled(
            purgeRequests.map(req => fetch(req.url, { method: req.method }))
          );
          
          return results.map((result, index) => ({
            pattern: patterns[index],
            success: result.status === 'fulfilled' && result.value.ok,
            error: result.status === 'rejected' ? result.reason : null
          }));
        }
        
        // Warm cache for critical pages
        async warmCache(urls) {
          console.log(\`Warming cache for \${urls.length} URLs...\`);
          
          const warmRequests = urls.map(url => 
            fetch(url, { 
              method: 'GET',
              headers: { 'Cache-Control': 'no-cache' }
            })
          );
          
          const results = await Promise.allSettled(warmRequests);
          
          return results.map((result, index) => ({
            url: urls[index],
            success: result.status === 'fulfilled' && result.value.ok,
            ttfb: result.status === 'fulfilled' ? 
              result.value.headers.get('server-timing') : null
          }));
        }
        
        generateCacheRecommendations(metrics) {
          const recommendations = [];
          
          if (metrics.hitRate < 0.8) {
            recommendations.push('Cache hit rate below 80% - review cache rules');
          }
          
          if (metrics.ttfbImprovement < 0.3) {
            recommendations.push('TTFB improvement below 30% - optimize cache TTL');
          }
          
          if (metrics.errorRate > 0.01) {
            recommendations.push('Cache error rate above 1% - check origin health');
          }
          
          return recommendations;
        }
      }
    `;
  }

  /**
   * Generate service worker for client-side caching
   */
  generateServiceWorkerCache(): string {
    return `
      // Service Worker for AEO client-side caching
      const CACHE_NAME = 'fabsy-v${Date.now()}';
      const STATIC_ASSETS = [
        '/',
        '/critical.css',
        '/main.js',
        '/fonts/inter-var.woff2'
      ];

      // Cache strategies
      const CACHE_STRATEGIES = {
        static: 'cache-first',
        api: 'network-first', 
        pages: 'stale-while-revalidate',
        images: 'cache-first'
      };

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
          })
        );
        self.skipWaiting();
      });

      self.addEventListener('activate', event => {
        event.waitUntil(
          caches.keys().then(cacheNames => {
            return Promise.all(
              cacheNames.map(cacheName => {
                if (cacheName !== CACHE_NAME) {
                  return caches.delete(cacheName);
                }
              })
            );
          })
        );
      });

      self.addEventListener('fetch', event => {
        const url = new URL(event.request.url);
        
        // API requests - network first
        if (url.pathname.startsWith('/api/')) {
          event.respondWith(networkFirstStrategy(event.request));
          return;
        }
        
        // Static assets - cache first
        if (isStaticAsset(url.pathname)) {
          event.respondWith(cacheFirstStrategy(event.request));
          return;
        }
        
        // HTML pages - stale while revalidate
        if (event.request.mode === 'navigate') {
          event.respondWith(staleWhileRevalidateStrategy(event.request));
          return;
        }
      });

      async function cacheFirstStrategy(request) {
        const cached = await caches.match(request);
        if (cached) return cached;
        
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        return response;
      }

      async function networkFirstStrategy(request) {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
          return response;
        } catch (error) {
          return await caches.match(request) || new Response('Offline', { status: 503 });
        }
      }

      async function staleWhileRevalidateStrategy(request) {
        const cached = await caches.match(request);
        const fetchPromise = fetch(request).then(response => {
          const cache = caches.open(CACHE_NAME);
          cache.then(c => c.put(request, response.clone()));
          return response;
        });
        
        return cached || await fetchPromise;
      }

      function isStaticAsset(pathname) {
        return /\\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2)$/.test(pathname);
      }
    `;
  }

  /**
   * Audit caching configuration and performance
   */
  async auditCaching(url: string): Promise<{
    ttfb: number;
    cacheHit: boolean;
    compressionRatio: number;
    http2: boolean;
    securityHeaders: string[];
    recommendations: string[];
  }> {
    try {
      const start = Date.now();
      const response = await fetch(url);
      const ttfb = Date.now() - start;
      
      const cacheHit = response.headers.get('cf-cache-status') === 'HIT' || 
                      response.headers.get('x-cache') === 'HIT';
      
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      const compressionRatio = contentLength > 0 ? 
        (contentLength / (await response.blob()).size) : 1;
      
      const http2 = response.headers.get(':status') !== null; // HTTP/2 pseudo-header
      
      const securityHeaders = [
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'referrer-policy'
      ].filter(header => response.headers.get(header));
      
      const recommendations = [];
      
      if (ttfb > 600) {
        recommendations.push(`TTFB ${ttfb}ms exceeds 600ms target - optimize caching`);
      }
      
      if (!cacheHit && !url.includes('/api/')) {
        recommendations.push('Static content not cached - review cache rules');
      }
      
      if (compressionRatio < 0.7) {
        recommendations.push('Low compression ratio - enable Brotli/Gzip');
      }
      
      if (!http2) {
        recommendations.push('Enable HTTP/2 for better performance');
      }
      
      if (securityHeaders.length < 5) {
        recommendations.push('Missing security headers - add HSTS, CSP, etc.');
      }
      
      return {
        ttfb,
        cacheHit,
        compressionRatio,
        http2,
        securityHeaders,
        recommendations
      };
    } catch (error) {
      return {
        ttfb: 0,
        cacheHit: false,
        compressionRatio: 0,
        http2: false,
        securityHeaders: [],
        recommendations: [`Failed to audit caching: ${error}`]
      };
    }
  }
}

export default CachingOptimizer;