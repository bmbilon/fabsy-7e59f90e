/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 11: Performance Guardrails - Image Optimization
 * 
 * Implements WebP/AVIF compression, lazy loading, responsive srcset
 * Target: ≤120KB compressed images, LCP optimization for AEO dominance
 */

export interface ImageOptimizationRules {
  maxHeroImageSize: number;    // 120KB for above-fold images
  supportedFormats: string[];  // ['webp', 'avif', 'jpeg', 'png']
  lazyLoadThreshold: number;   // 800px from viewport
  responsiveBreakpoints: number[];
  maxWidth: number;            // 1200px
}

export interface OptimizedImageConfig {
  src: string;
  alt: string;
  width: number;
  height: number;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
  sizes?: string;
  className?: string;
}

export const IMAGE_RULES: ImageOptimizationRules = {
  maxHeroImageSize: 122880, // 120KB in bytes
  supportedFormats: ['avif', 'webp', 'jpeg', 'png'],
  lazyLoadThreshold: 800,
  responsiveBreakpoints: [320, 640, 768, 1024, 1200],
  maxWidth: 1200
};

export class ImageOptimizer {
  private cdnBase: string;
  
  constructor(cdnBase: string = '') {
    this.cdnBase = cdnBase;
  }

  /**
   * Generate optimized image component with WebP/AVIF support and responsive srcset
   */
  generateOptimizedImage(config: OptimizedImageConfig): string {
    const { src, alt, width, height, loading = 'lazy', priority = false, sizes, className } = config;
    
    // Critical images should not be lazy loaded
    const actualLoading = priority ? 'eager' : loading;
    
    // Generate responsive srcset
    const srcset = this.generateSrcset(src, width);
    const webpSrcset = this.generateSrcset(src, width, 'webp');
    const avifSrcset = this.generateSrcset(src, width, 'avif');
    
    // Default sizes attribute for responsive images
    const actualSizes = sizes || this.generateSizesAttribute(width);
    
    return `
      <picture>
        ${avifSrcset ? `<source type="image/avif" srcset="${avifSrcset}" sizes="${actualSizes}">` : ''}
        ${webpSrcset ? `<source type="image/webp" srcset="${webpSrcset}" sizes="${actualSizes}">` : ''}
        <img 
          src="${this.optimizeUrl(src, width, 'jpeg')}"
          srcset="${srcset}"
          sizes="${actualSizes}"
          alt="${alt}"
          width="${width}"
          height="${height}"
          loading="${actualLoading}"
          ${priority ? 'fetchpriority="high"' : ''}
          ${className ? `class="${className}"` : ''}
          style="max-width: 100%; height: auto;"
        >
      </picture>
    `.trim();
  }

  /**
   * Generate responsive srcset for different breakpoints
   */
  private generateSrcset(src: string, originalWidth: number, format?: string): string {
    const breakpoints = IMAGE_RULES.responsiveBreakpoints.filter(bp => bp <= originalWidth);
    
    return breakpoints
      .map(width => `${this.optimizeUrl(src, width, format)} ${width}w`)
      .join(', ');
  }

  /**
   * Generate sizes attribute based on image width
   */
  private generateSizesAttribute(width: number): string {
    if (width >= 1200) {
      return '(max-width: 320px) 320px, (max-width: 640px) 640px, (max-width: 768px) 768px, (max-width: 1024px) 1024px, 1200px';
    } else if (width >= 768) {
      return '(max-width: 320px) 320px, (max-width: 640px) 640px, (max-width: 768px) 768px, 768px';
    } else {
      return `(max-width: ${width}px) ${width}px, ${width}px`;
    }
  }

  /**
   * Optimize image URL with CDN parameters
   */
  private optimizeUrl(src: string, width: number, format?: string): string {
    if (!this.cdnBase) {
      return src; // Return original if no CDN configured
    }

    const params = new URLSearchParams({
      w: width.toString(),
      q: '85', // Quality 85% for good balance of size/quality
      f: format || 'auto',
      fit: 'crop',
      auto: 'format,compress'
    });

    return `${this.cdnBase}${src}?${params.toString()}`;
  }

  /**
   * Validate image file size for hero images
   */
  async validateImageSize(imageUrl: string): Promise<{ valid: boolean; size: number; message: string }> {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      
      if (!contentLength) {
        return { valid: false, size: 0, message: 'Could not determine image size' };
      }

      const size = parseInt(contentLength, 10);
      const valid = size <= IMAGE_RULES.maxHeroImageSize;

      return {
        valid,
        size,
        message: valid 
          ? `Image size ${(size / 1024).toFixed(1)}KB is within 120KB limit`
          : `Image size ${(size / 1024).toFixed(1)}KB exceeds 120KB limit - consider compression`
      };
    } catch (error) {
      return { valid: false, size: 0, message: `Failed to validate image: ${error}` };
    }
  }

  /**
   * Generate lazy loading intersection observer script
   */
  generateLazyLoadScript(): string {
    return `
      <script>
        // Lazy loading with Intersection Observer for better performance
        if ('IntersectionObserver' in window) {
          const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                  img.src = img.dataset.src;
                  img.removeAttribute('data-src');
                }
                if (img.dataset.srcset) {
                  img.srcset = img.dataset.srcset;
                  img.removeAttribute('data-srcset');
                }
                img.classList.remove('lazy');
                observer.unobserve(img);
              }
            });
          }, {
            rootMargin: '${IMAGE_RULES.lazyLoadThreshold}px 0px'
          });

          // Observe all lazy images
          document.querySelectorAll('img.lazy').forEach(img => {
            imageObserver.observe(img);
          });
        }
      </script>
    `.trim();
  }

  /**
   * Generate critical CSS for image optimization
   */
  generateImageCSS(): string {
    return `
      /* Image optimization styles for AEO performance */
      img {
        max-width: 100%;
        height: auto;
        display: block;
      }

      /* Lazy loading placeholder */
      img.lazy {
        background: #f0f0f0 url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23f0f0f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-family="sans-serif" font-size="12">Loading...</text></svg>') center/contain no-repeat;
        transition: opacity 0.3s ease;
      }

      img.lazy.loaded {
        opacity: 1;
      }

      /* Prevent CLS for images */
      picture, img {
        display: block;
        width: 100%;
      }

      /* Hero image optimization */
      .hero-image {
        aspect-ratio: 16/9;
        object-fit: cover;
        width: 100%;
        background: #f8f9fa;
      }

      /* Answer box image styling */
      .answer-box img {
        max-width: 300px;
        height: auto;
        border-radius: 8px;
      }

      /* Responsive image containers */
      @media (max-width: 768px) {
        .hero-image {
          aspect-ratio: 4/3;
        }
      }

      /* Avoid layout shift during image load */
      [width][height] {
        aspect-ratio: attr(width) / attr(height);
      }
    `.trim();
  }

  /**
   * Update existing HTML pages with optimized images
   */
  optimizePageImages(htmlContent: string): string {
    // Replace regular img tags with optimized picture elements
    return htmlContent.replace(
      /<img\s+([^>]*src=["']([^"']+)["'][^>]*?)>/gi,
      (match, attributes, src) => {
        // Extract attributes
        const alt = (attributes.match(/alt=["']([^"']*)["']/i) || [])[1] || '';
        const width = parseInt((attributes.match(/width=["']?(\d+)["']?/i) || [])[1] || '800', 10);
        const height = parseInt((attributes.match(/height=["']?(\d+)["']?/i) || [])[1] || '600', 10);
        const className = (attributes.match(/class=["']([^"']*)["']/i) || [])[1] || '';
        
        // Determine if this is a hero/above-fold image
        const isHero = className.includes('hero') || className.includes('above-fold');
        
        return this.generateOptimizedImage({
          src,
          alt,
          width,
          height,
          loading: isHero ? 'eager' : 'lazy',
          priority: isHero,
          className: className || undefined
        });
      }
    );
  }

  /**
   * Generate image performance report
   */
  async auditPageImages(url: string): Promise<{
    totalImages: number;
    oversizedImages: number;
    unoptimizedImages: number;
    missingAlt: number;
    recommendations: string[];
  }> {
    try {
      const response = await fetch(url);
      const html = await response.text();
      
      // Parse images from HTML
      const imgMatches = html.match(/<img[^>]*>/gi) || [];
      const totalImages = imgMatches.length;
      
      let oversizedImages = 0;
      let unoptimizedImages = 0;
      let missingAlt = 0;
      const recommendations: string[] = [];
      
      for (const imgTag of imgMatches) {
        // Check for alt text
        if (!imgTag.includes('alt=')) {
          missingAlt++;
        }
        
        // Check for modern formats
        if (!imgTag.includes('webp') && !imgTag.includes('avif')) {
          unoptimizedImages++;
        }
        
        // Extract src for size check
        const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
        if (srcMatch) {
          const validation = await this.validateImageSize(srcMatch[1]);
          if (!validation.valid) {
            oversizedImages++;
          }
        }
      }

      if (missingAlt > 0) {
        recommendations.push(`Add alt attributes to ${missingAlt} images for accessibility and SEO`);
      }
      
      if (unoptimizedImages > 0) {
        recommendations.push(`Convert ${unoptimizedImages} images to WebP/AVIF format for better compression`);
      }
      
      if (oversizedImages > 0) {
        recommendations.push(`Optimize ${oversizedImages} images that exceed 120KB size limit`);
      }

      return {
        totalImages,
        oversizedImages,
        unoptimizedImages,
        missingAlt,
        recommendations
      };
    } catch (error) {
      console.error('Failed to audit images:', error);
      return {
        totalImages: 0,
        oversizedImages: 0,
        unoptimizedImages: 0,
        missingAlt: 0,
        recommendations: ['Failed to audit images - check URL accessibility']
      };
    }
  }
}

export default ImageOptimizer;