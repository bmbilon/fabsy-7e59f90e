/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 12: Conversion Layer & Form Telemetry - API Endpoint
 * 
 * Edge KV storage for telemetry events with 30-day retention
 * Handles batch event ingestion and real-time aggregation
 */

export interface TelemetryPayload {
  events: TelemetryEvent[];
  user_agent?: string;
  referrer?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface TelemetryEvent {
  event: string;
  path: string;
  ts: number;
  session_id?: string;
  city?: string;
  offence?: string;
  [key: string]: any;
}

export interface StoredEvent extends TelemetryEvent {
  id: string;
  user_agent?: string;
  referrer?: string;
  viewport?: string;
  processed: boolean;
  created_at: string;
}

export interface DailyMetrics {
  date: string;
  path: string;
  city?: string;
  offence?: string;
  sessions: number;
  scroll_depth_50: number;
  cta_primary_click: number;
  cta_secondary_click: number;
  form_start: number;
  form_submit: number;
  faq_toggle: number;
  page_dwell_avg: number;
  conversion_rate: number;
}

export class TelemetryAPI {
  private kvNamespace: string;
  private retention_days = 30;

  constructor(kvNamespace: string = 'FABSY_TELEMETRY') {
    this.kvNamespace = kvNamespace;
  }

  /**
   * Handle incoming telemetry POST requests
   */
  async handleTelemetryRequest(request: Request): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }), 
        { status: 405, headers: corsHeaders }
      );
    }

    try {
      const payload: TelemetryPayload = await request.json();
      
      if (!payload.events || !Array.isArray(payload.events)) {
        return new Response(
          JSON.stringify({ error: 'Events array required' }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Process events
      const processed = await this.processEvents(payload, request);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: processed.length,
          message: 'Events received'
        }),
        { status: 200, headers: corsHeaders }
      );

    } catch (error) {
      console.error('Telemetry API error:', error);
      
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  /**
   * Process and store telemetry events
   */
  async processEvents(payload: TelemetryPayload, request: Request): Promise<StoredEvent[]> {
    const processed: StoredEvent[] = [];
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                    request.headers.get('X-Forwarded-For') || 
                    'unknown';

    for (const event of payload.events) {
      try {
        const storedEvent: StoredEvent = {
          ...event,
          id: this.generateEventId(),
          user_agent: payload.user_agent,
          referrer: payload.referrer,
          viewport: payload.viewport ? JSON.stringify(payload.viewport) : undefined,
          processed: false,
          created_at: new Date().toISOString()
        };

        // Store in KV with expiration
        await this.storeEvent(storedEvent);
        
        // Add to real-time aggregation queue
        await this.queueForAggregation(storedEvent);
        
        processed.push(storedEvent);

      } catch (error) {
        console.error('Failed to process event:', error);
        // Continue processing other events
      }
    }

    return processed;
  }

  /**
   * Store individual event in KV storage
   */
  async storeEvent(event: StoredEvent): Promise<void> {
    const key = `event:${event.id}`;
    const expirationTtl = this.retention_days * 24 * 60 * 60; // seconds
    
    // Store in KV (pseudo-code - adapt for your KV implementation)
    await this.kvPut(key, JSON.stringify(event), { expirationTtl });
    
    // Also store in daily partition for efficient querying
    const dateKey = `daily:${event.created_at.split('T')[0]}:${event.path}`;
    await this.kvPut(dateKey, JSON.stringify(event), { expirationTtl });
  }

  /**
   * Queue event for real-time aggregation
   */
  async queueForAggregation(event: StoredEvent): Promise<void> {
    const aggregationKey = `queue:${Date.now()}:${event.id}`;
    
    // Store in aggregation queue (processed by scheduled worker)
    await this.kvPut(aggregationKey, JSON.stringify(event), { 
      expirationTtl: 3600 // 1 hour TTL for queue items
    });
  }

  /**
   * Aggregate daily metrics from raw events
   */
  async aggregateDailyMetrics(date: string): Promise<DailyMetrics[]> {
    const dateKey = `daily:${date}`;
    const events = await this.getEventsByPrefix(dateKey);
    
    // Group events by path and city/offence
    const groups = new Map<string, TelemetryEvent[]>();
    
    for (const event of events) {
      const groupKey = `${event.path}:${event.city || 'unknown'}:${event.offence || 'unknown'}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(event);
    }

    // Calculate metrics for each group
    const metrics: DailyMetrics[] = [];
    
    for (const [groupKey, groupEvents] of groups) {
      const [path, city, offence] = groupKey.split(':');
      const sessionIds = new Set(groupEvents.map(e => e.session_id).filter(Boolean));
      
      const eventCounts = {
        scroll_depth_50: groupEvents.filter(e => e.event === 'scroll_depth_50').length,
        cta_primary_click: groupEvents.filter(e => e.event === 'cta_primary_click').length,
        cta_secondary_click: groupEvents.filter(e => e.event === 'cta_secondary_click').length,
        form_start: groupEvents.filter(e => e.event === 'form_start').length,
        form_submit: groupEvents.filter(e => e.event === 'form_submit').length,
        faq_toggle: groupEvents.filter(e => e.event === 'faq_toggle').length,
      };

      // Calculate average dwell time
      const dwellEvents = groupEvents.filter(e => e.event === 'page_dwell' && e.dwell_time);
      const avgDwell = dwellEvents.length > 0 
        ? dwellEvents.reduce((sum, e) => sum + (e.dwell_time || 0), 0) / dwellEvents.length 
        : 0;

      const dailyMetric: DailyMetrics = {
        date,
        path,
        city: city !== 'unknown' ? city : undefined,
        offence: offence !== 'unknown' ? offence : undefined,
        sessions: sessionIds.size,
        ...eventCounts,
        page_dwell_avg: Math.round(avgDwell),
        conversion_rate: eventCounts.form_start > 0 
          ? eventCounts.form_submit / eventCounts.form_start 
          : 0
      };

      metrics.push(dailyMetric);
    }

    return metrics;
  }

  /**
   * Get conversion funnel metrics
   */
  async getConversionFunnel(dateRange: { start: string; end: string }, path?: string): Promise<{
    sessions: number;
    scroll_engagement: number;
    cta_clicks: number;
    form_starts: number;
    form_completions: number;
    conversion_rates: {
      scroll_rate: number;
      cta_rate: number;
      form_start_rate: number;
      form_complete_rate: number;
    };
  }> {
    const metrics = await this.getMetricsForDateRange(dateRange, path);
    
    const totals = metrics.reduce((acc, metric) => ({
      sessions: acc.sessions + metric.sessions,
      scroll_depth_50: acc.scroll_depth_50 + metric.scroll_depth_50,
      cta_primary_click: acc.cta_primary_click + metric.cta_primary_click,
      form_start: acc.form_start + metric.form_start,
      form_submit: acc.form_submit + metric.form_submit
    }), {
      sessions: 0,
      scroll_depth_50: 0,
      cta_primary_click: 0,
      form_start: 0,
      form_submit: 0
    });

    return {
      sessions: totals.sessions,
      scroll_engagement: totals.scroll_depth_50,
      cta_clicks: totals.cta_primary_click,
      form_starts: totals.form_start,
      form_completions: totals.form_submit,
      conversion_rates: {
        scroll_rate: totals.sessions > 0 ? totals.scroll_depth_50 / totals.sessions : 0,
        cta_rate: totals.sessions > 0 ? totals.cta_primary_click / totals.sessions : 0,
        form_start_rate: totals.sessions > 0 ? totals.form_start / totals.sessions : 0,
        form_complete_rate: totals.form_start > 0 ? totals.form_submit / totals.form_start : 0
      }
    };
  }

  /**
   * Get metrics for CTA performance by city
   */
  async getCTAPerformanceByCity(dateRange: { start: string; end: string }): Promise<Array<{
    city: string;
    offence: string;
    sessions: number;
    cta_clicks: number;
    cta_ctr: number;
    form_starts: number;
    form_completions: number;
    conversion_rate: number;
  }>> {
    const metrics = await this.getMetricsForDateRange(dateRange);
    
    const cityMetrics = new Map<string, any>();
    
    for (const metric of metrics) {
      if (!metric.city) continue;
      
      const key = `${metric.city}:${metric.offence || 'unknown'}`;
      if (!cityMetrics.has(key)) {
        cityMetrics.set(key, {
          city: metric.city,
          offence: metric.offence || 'unknown',
          sessions: 0,
          cta_clicks: 0,
          form_starts: 0,
          form_completions: 0
        });
      }
      
      const cityData = cityMetrics.get(key);
      cityData.sessions += metric.sessions;
      cityData.cta_clicks += metric.cta_primary_click;
      cityData.form_starts += metric.form_start;
      cityData.form_completions += metric.form_submit;
    }
    
    return Array.from(cityMetrics.values()).map(data => ({
      ...data,
      cta_ctr: data.sessions > 0 ? data.cta_clicks / data.sessions : 0,
      conversion_rate: data.form_starts > 0 ? data.form_completions / data.form_starts : 0
    }));
  }

  /**
   * Check alert conditions and trigger notifications
   */
  async checkAlertConditions(): Promise<Array<{
    id: string;
    condition: string;
    triggered: boolean;
    value: number;
    threshold: number;
  }>> {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const funnel = await this.getConversionFunnel({ start: sevenDaysAgo, end: today });
    const alerts = [];
    
    // Form completion rate alert
    const formCompleteRate = funnel.conversion_rates.form_complete_rate;
    alerts.push({
      id: 'ALERT-FORM-DROP',
      condition: 'form_complete_rate < 0.25 for 7d',
      triggered: formCompleteRate < 0.25,
      value: formCompleteRate,
      threshold: 0.25
    });
    
    // CTA CTR alert
    const ctaRate = funnel.conversion_rates.cta_rate;
    alerts.push({
      id: 'ALERT-CTA-DROP',
      condition: 'cta_ctr < 0.03',
      triggered: ctaRate < 0.03,
      value: ctaRate,
      threshold: 0.03
    });
    
    return alerts;
  }

  // Helper methods (KV abstraction)
  
  private generateEventId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  private async kvPut(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    // Pseudo-implementation - replace with your KV provider
    // Examples: Cloudflare KV, Redis, DynamoDB, etc.
    console.log(`KV PUT: ${key} = ${value.substring(0, 100)}...`);
  }

  private async kvGet(key: string): Promise<string | null> {
    // Pseudo-implementation
    console.log(`KV GET: ${key}`);
    return null;
  }

  private async getEventsByPrefix(prefix: string): Promise<TelemetryEvent[]> {
    // Pseudo-implementation - get all events with key prefix
    console.log(`KV LIST: ${prefix}*`);
    return [];
  }

  private async getMetricsForDateRange(
    dateRange: { start: string; end: string }, 
    path?: string
  ): Promise<DailyMetrics[]> {
    // Pseudo-implementation - query aggregated daily metrics
    const metrics: DailyMetrics[] = [];
    
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    
    for (let date = startDate; date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateString = date.toISOString().split('T')[0];
      const dailyMetrics = await this.aggregateDailyMetrics(dateString);
      
      const filteredMetrics = path 
        ? dailyMetrics.filter(m => m.path === path)
        : dailyMetrics;
        
      metrics.push(...filteredMetrics);
    }
    
    return metrics;
  }
}

/**
 * Cloudflare Worker implementation
 */
export function generateTelemetryWorker(): string {
  return `
// Cloudflare Worker for Fabsy Telemetry API
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  if (url.pathname === '/api/telemetry') {
    return handleTelemetry(request);
  }
  
  return new Response('Not Found', { status: 404 });
}

async function handleTelemetry(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), 
      { status: 405, headers: corsHeaders });
  }

  try {
    const payload = await request.json();
    
    if (!payload.events || !Array.isArray(payload.events)) {
      return new Response(JSON.stringify({ error: 'Events array required' }),
        { status: 400, headers: corsHeaders });
    }

    // Store events in KV with 30-day expiration
    const promises = payload.events.map(async (event) => {
      const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      const key = \`event:\${eventId}\`;
      
      const storedEvent = {
        ...event,
        id: eventId,
        user_agent: payload.user_agent,
        referrer: payload.referrer,
        viewport: payload.viewport,
        created_at: new Date().toISOString()
      };
      
      await FABSY_TELEMETRY.put(key, JSON.stringify(storedEvent), {
        expirationTtl: 30 * 24 * 60 * 60 // 30 days
      });
    });
    
    await Promise.all(promises);
    
    return new Response(JSON.stringify({ 
      success: true, 
      processed: payload.events.length 
    }), { headers: corsHeaders });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), { status: 500, headers: corsHeaders });
  }
}

// Scheduled aggregation (runs daily)
addEventListener('scheduled', event => {
  event.waitUntil(aggregateMetrics());
});

async function aggregateMetrics() {
  const today = new Date().toISOString().split('T')[0];
  console.log('Running daily aggregation for:', today);
  
  // Implementation would aggregate events into daily metrics
  // and store them for dashboard consumption
}
`;
}

export default TelemetryAPI;