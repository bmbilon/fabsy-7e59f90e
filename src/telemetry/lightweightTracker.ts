/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 12: Conversion Layer & Form Telemetry - Lightweight Tracker
 * 
 * <1KB privacy-safe tracking module for user engagement signals
 * No cookies, no 3rd-party trackers, minimal CLS impact
 */

export interface TelemetryEvent {
  event: string;
  path: string;
  ts: number;
  ua?: string;
  city?: string;
  offence?: string;
  session_id?: string;
}

export interface TelemetryConfig {
  endpoint: string;
  enabled: boolean;
  debug: boolean;
  sessionDuration: number; // minutes
}

export const DEFAULT_CONFIG: TelemetryConfig = {
  endpoint: '/api/telemetry',
  enabled: true,
  debug: false,
  sessionDuration: 30
};

export class LightweightTelemetry {
  private config: TelemetryConfig;
  private sessionId: string;
  private eventQueue: TelemetryEvent[] = [];
  private scrollTracked = false;
  private formStartTracked = new Set<string>();

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
    
    if (this.config.enabled) {
      this.init();
    }
  }

  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  private init(): void {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
    } else {
      this.setupEventListeners();
    }
  }

  private setupEventListeners(): void {
    // Scroll depth tracking (50% threshold)
    this.setupScrollTracking();
    
    // CTA click tracking
    this.setupClickTracking();
    
    // Form interaction tracking
    this.setupFormTracking();
    
    // FAQ interaction tracking
    this.setupFAQTracking();
    
    // Page visibility tracking
    this.setupVisibilityTracking();
  }

  private setupScrollTracking(): void {
    let ticking = false;
    
    const trackScroll = () => {
      if (!this.scrollTracked) {
        const scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight);
        
        if (scrollPercent >= 0.5) {
          this.scrollTracked = true;
          this.track('scroll_depth_50');
        }
      }
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(trackScroll);
        ticking = true;
      }
    }, { passive: true });
  }

  private setupClickTracking(): void {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      // Primary CTA buttons
      if (target.closest('.btn-primary, .answer-box a, .cta')) {
        this.track('cta_primary_click', {
          element: target.tagName.toLowerCase(),
          text: target.textContent?.trim().substring(0, 50) || '',
          position: this.getElementPosition(target)
        });
      }
      
      // Secondary CTAs
      if (target.closest('.btn-secondary, .soft-cta')) {
        this.track('cta_secondary_click', {
          element: target.tagName.toLowerCase(),
          text: target.textContent?.trim().substring(0, 50) || ''
        });
      }
    }, { passive: true });
  }

  private setupFormTracking(): void {
    // Form start tracking (focus on first input)
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      const form = target.closest('form');
      
      if (form) {
        const formId = form.id || 'unnamed-form';
        
        if (!this.formStartTracked.has(formId)) {
          this.formStartTracked.add(formId);
          this.track('form_start', {
            form_id: formId,
            field: target.getAttribute('name') || target.getAttribute('id') || 'unknown'
          });
        }
      }
    }, { passive: true });

    // Form submit tracking
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      const formId = form.id || 'unnamed-form';
      
      this.track('form_submit', {
        form_id: formId,
        method: form.method || 'get',
        action: form.action || window.location.href
      });
    }, { passive: true });

    // Form field interactions
    document.addEventListener('change', (event) => {
      const target = event.target as HTMLElement;
      const form = target.closest('form');
      
      if (form && (target.tagName === 'SELECT' || target.tagName === 'INPUT')) {
        this.track('form_field_complete', {
          form_id: form.id || 'unnamed-form',
          field: target.getAttribute('name') || target.getAttribute('id') || 'unknown',
          field_type: target.getAttribute('type') || target.tagName.toLowerCase()
        });
      }
    }, { passive: true });
  }

  private setupFAQTracking(): void {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const faqItem = target.closest('.faq-item, [data-faq], details');
      
      if (faqItem) {
        const question = faqItem.querySelector('h3, summary, .faq-question')?.textContent?.trim();
        
        this.track('faq_toggle', {
          question: question?.substring(0, 100) || 'unknown',
          expanded: faqItem.hasAttribute('open') || faqItem.classList.contains('expanded')
        });
      }
    }, { passive: true });
  }

  private setupVisibilityTracking(): void {
    let startTime = Date.now();
    
    const trackVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const dwellTime = Date.now() - startTime;
        
        if (dwellTime > 10000) { // 10+ seconds
          this.track('page_dwell', {
            dwell_time: Math.round(dwellTime / 1000),
            dwell_category: this.categorizeDwellTime(dwellTime)
          });
        }
      } else {
        startTime = Date.now();
      }
    };

    document.addEventListener('visibilitychange', trackVisibility, { passive: true });
    
    // Backup for page unload
    window.addEventListener('beforeunload', () => {
      const dwellTime = Date.now() - startTime;
      if (dwellTime > 5000) {
        this.track('page_exit', {
          dwell_time: Math.round(dwellTime / 1000)
        });
      }
    }, { passive: true });
  }

  private categorizeDwellTime(ms: number): string {
    if (ms < 15000) return 'brief';      // <15s
    if (ms < 60000) return 'engaged';    // 15-60s  
    if (ms < 300000) return 'deep';      // 1-5min
    return 'extended';                   // 5min+
  }

  private getElementPosition(element: HTMLElement): string {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    if (rect.top < viewportHeight * 0.33) return 'above-fold';
    if (rect.top < viewportHeight * 0.66) return 'mid-fold';
    return 'below-fold';
  }

  private extractPageContext(): { city?: string; offence?: string } {
    const path = window.location.pathname;
    const context: { city?: string; offence?: string } = {};
    
    // Extract city and offence from URL pattern: /content/{offence}-ticket-{city}
    const match = path.match(/\/content\/([^-]+)-ticket-([^\/]+)/);
    if (match) {
      context.offence = match[1];
      context.city = match[2].replace(/-/g, ' ');
    }
    
    return context;
  }

  public track(event: string, data: Record<string, any> = {}): void {
    if (!this.config.enabled) return;

    const pageContext = this.extractPageContext();
    
    const telemetryEvent: TelemetryEvent = {
      event,
      path: window.location.pathname,
      ts: Date.now(),
      session_id: this.sessionId,
      ...pageContext,
      ...data
    };

    if (this.config.debug) {
      console.log('📊 Telemetry:', telemetryEvent);
    }

    this.eventQueue.push(telemetryEvent);
    this.flushEvents();
  }

  private async flushEvents(): void {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        keepalive: true,
        body: JSON.stringify({
          events: events,
          user_agent: navigator.userAgent,
          referrer: document.referrer,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        })
      });
    } catch (error) {
      if (this.config.debug) {
        console.warn('📊 Telemetry send failed:', error);
      }
      
      // Re-queue failed events (with limit to prevent memory issues)
      if (this.eventQueue.length < 50) {
        this.eventQueue.unshift(...events);
      }
    }
  }

  // Manual tracking methods
  public trackCustomEvent(event: string, data: Record<string, any> = {}): void {
    this.track(event, data);
  }

  public trackFormStep(step: string, formId: string = 'ticket-form'): void {
    this.track('form_step', { step, form_id: formId });
  }

  public trackConversion(type: string, value?: number): void {
    this.track('conversion', { type, value });
  }
}

/**
 * Generate inline tracking script for HTML injection
 * This creates the <1KB inline module for maximum performance
 */
export function generateInlineTracker(config: Partial<TelemetryConfig> = {}): string {
  const configJson = JSON.stringify({ ...DEFAULT_CONFIG, ...config });
  
  return `
<script>
(function(){
  const config = ${configJson};
  if (!config.enabled) return;
  
  let sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2,9);
  let scrollTracked = false;
  let formStartTracked = new Set();
  let eventQueue = [];
  
  const send = async (events) => {
    try {
      await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          events: Array.isArray(events) ? events : [events],
          user_agent: navigator.userAgent,
          referrer: document.referrer
        })
      });
    } catch (e) {
      if (config.debug) console.warn('📊 Send failed:', e);
    }
  };
  
  const track = (event, data = {}) => {
    const path = location.pathname;
    const match = path.match(/\\/content\\/([^-]+)-ticket-([^\\/]+)/);
    const pageContext = match ? { offence: match[1], city: match[2].replace(/-/g, ' ') } : {};
    
    const telemetryEvent = {
      event,
      path,
      ts: Date.now(),
      session_id: sessionId,
      ...pageContext,
      ...data
    };
    
    if (config.debug) console.log('📊', telemetryEvent);
    send(telemetryEvent);
  };
  
  // Scroll tracking
  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        if (!scrollTracked && window.scrollY / (document.body.scrollHeight - window.innerHeight) >= 0.5) {
          scrollTracked = true;
          track('scroll_depth_50');
        }
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }, { passive: true });
  
  // Click tracking
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.closest('.btn-primary, .answer-box a, .cta')) {
      track('cta_primary_click', {
        text: target.textContent?.trim().substr(0,50) || '',
        position: target.getBoundingClientRect().top < window.innerHeight * 0.5 ? 'above-fold' : 'below-fold'
      });
    }
    if (target.closest('.faq-item, [data-faq], details')) {
      track('faq_toggle');
    }
  }, { passive: true });
  
  // Form tracking
  document.addEventListener('focusin', (e) => {
    const form = e.target.closest('form');
    if (form) {
      const formId = form.id || 'unnamed';
      if (!formStartTracked.has(formId)) {
        formStartTracked.add(formId);
        track('form_start', { form_id: formId });
      }
    }
  }, { passive: true });
  
  document.addEventListener('submit', (e) => {
    const form = e.target;
    track('form_submit', { form_id: form.id || 'unnamed' });
  }, { passive: true });
  
  // Page visibility
  let startTime = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const dwell = Date.now() - startTime;
      if (dwell > 10000) {
        track('page_dwell', { dwell_time: Math.round(dwell / 1000) });
      }
    } else {
      startTime = Date.now();
    }
  }, { passive: true });
  
  // Expose global tracker for manual events
  window.fabsyTracker = { track };
})();
</script>`.trim();
}

export default LightweightTelemetry;