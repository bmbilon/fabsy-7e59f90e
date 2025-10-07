/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 12: Conversion Layer & Form Telemetry - Metrics Aggregation
 * 
 * Daily aggregation of telemetry data, trend analysis, performance insights,
 * and automated data retention with KV storage optimization
 */

interface RawTelemetryEvent {
  id: string;
  timestamp: number;
  event_type: string;
  session_id: string;
  user_id?: string;
  city?: string;
  offence?: string;
  properties: Record<string, any>;
  ip_address: string;
  user_agent: string;
}

interface DailyMetrics {
  date: string;
  sessions: {
    total: number;
    unique: number;
    bounce_rate: number;
    avg_session_duration: number;
  };
  engagement: {
    scroll_50_pct: number;
    scroll_75_pct: number;
    avg_dwell_time: number;
    page_views: number;
  };
  cta_performance: {
    total_clicks: number;
    unique_clicks: number;
    ctr: number;
    conversion_rate: number;
  };
  form_metrics: {
    starts: number;
    completions: number;
    completion_rate: number;
    avg_completion_time: number;
    dropout_points: Record<string, number>;
  };
  city_breakdown: Record<string, {
    sessions: number;
    cta_clicks: number;
    form_completions: number;
    ctr: number;
  }>;
  offence_breakdown: Record<string, {
    sessions: number;
    cta_clicks: number;
    form_completions: number;
  }>;
  performance_score: number;
  alerts_triggered: number;
}

interface TrendAnalysis {
  period: string;
  metrics: {
    sessions_trend: number;
    cta_ctr_trend: number;
    form_completion_trend: number;
    engagement_trend: number;
  };
  insights: string[];
  recommendations: string[];
  anomalies: Array<{
    metric: string;
    date: string;
    deviation: number;
    severity: 'low' | 'medium' | 'high';
  }>;
}

interface AggregationConfig {
  kvNamespace: string;
  retentionDays: number;
  aggregationSchedule: 'hourly' | 'daily';
  alertThresholds: {
    ctr_drop: number;
    form_completion_drop: number;
    bounce_rate_spike: number;
  };
}

class MetricsAggregator {
  private config: AggregationConfig;
  private kvStore: any; // KV store interface

  constructor(config: AggregationConfig, kvStore?: any) {
    this.config = config;
    this.kvStore = kvStore;
  }

  /**
   * Main aggregation function - processes raw events into daily metrics
   */
  async aggregateDaily(date: string = new Date().toISOString().split('T')[0]): Promise<DailyMetrics> {
    const events = await this.getRawEvents(date);
    const metrics = await this.processEvents(events, date);
    
    // Store aggregated metrics
    await this.storeAggregatedMetrics(date, metrics);
    
    // Cleanup old raw events if needed
    await this.cleanupOldData(date);
    
    return metrics;
  }

  /**
   * Process raw events into aggregated metrics
   */
  private async processEvents(events: RawTelemetryEvent[], date: string): Promise<DailyMetrics> {
    const sessions = this.aggregateSessions(events);
    const engagement = this.aggregateEngagement(events);
    const ctaPerformance = this.aggregateCTAPerformance(events);
    const formMetrics = this.aggregateFormMetrics(events);
    const cityBreakdown = this.aggregateByCities(events);
    const offenceBreakdown = this.aggregateByOffences(events);
    
    const performanceScore = this.calculatePerformanceScore({
      ctr: ctaPerformance.ctr,
      form_completion_rate: formMetrics.completion_rate,
      bounce_rate: sessions.bounce_rate,
      engagement_rate: engagement.scroll_50_pct / Math.max(sessions.total, 1)
    });

    return {
      date,
      sessions,
      engagement,
      cta_performance: ctaPerformance,
      form_metrics: formMetrics,
      city_breakdown: cityBreakdown,
      offence_breakdown: offenceBreakdown,
      performance_score: performanceScore,
      alerts_triggered: 0 // This would be updated by alert system
    };
  }

  private aggregateSessions(events: RawTelemetryEvent[]): DailyMetrics['sessions'] {
    const sessionIds = new Set<string>();
    const uniqueUsers = new Set<string>();
    const sessionDurations = new Map<string, { start: number; end: number }>();
    let bounces = 0;

    events.forEach(event => {
      sessionIds.add(event.session_id);
      if (event.user_id) uniqueUsers.add(event.user_id);

      // Track session duration
      const session = sessionDurations.get(event.session_id) || { start: event.timestamp, end: event.timestamp };
      session.start = Math.min(session.start, event.timestamp);
      session.end = Math.max(session.end, event.timestamp);
      sessionDurations.set(event.session_id, session);

      // Count bounces (single page view sessions)
      if (event.event_type === 'page_view') {
        const pageViews = events.filter(e => e.session_id === event.session_id && e.event_type === 'page_view').length;
        if (pageViews === 1) bounces++;
      }
    });

    const totalSessions = sessionIds.size;
    const avgDuration = Array.from(sessionDurations.values())
      .reduce((sum, session) => sum + (session.end - session.start), 0) / Math.max(totalSessions, 1);

    return {
      total: totalSessions,
      unique: uniqueUsers.size,
      bounce_rate: totalSessions > 0 ? bounces / totalSessions : 0,
      avg_session_duration: avgDuration
    };
  }

  private aggregateEngagement(events: RawTelemetryEvent[]): DailyMetrics['engagement'] {
    const scrollEvents = events.filter(e => e.event_type === 'scroll');
    const pageViews = events.filter(e => e.event_type === 'page_view').length;
    
    const scroll50 = scrollEvents.filter(e => e.properties.percentage >= 50).length;
    const scroll75 = scrollEvents.filter(e => e.properties.percentage >= 75).length;
    
    // Calculate average dwell time
    const dwellTimes: number[] = [];
    const sessionDwellMap = new Map<string, number>();
    
    events.forEach(event => {
      if (event.event_type === 'page_unload') {
        const dwellTime = event.properties.dwell_time || 0;
        dwellTimes.push(dwellTime);
        sessionDwellMap.set(event.session_id, dwellTime);
      }
    });

    const avgDwellTime = dwellTimes.length > 0 ? 
      dwellTimes.reduce((sum, time) => sum + time, 0) / dwellTimes.length : 0;

    return {
      scroll_50_pct: scroll50,
      scroll_75_pct: scroll75,
      avg_dwell_time: avgDwellTime,
      page_views: pageViews
    };
  }

  private aggregateCTAPerformance(events: RawTelemetryEvent[]): DailyMetrics['cta_performance'] {
    const ctaClicks = events.filter(e => e.event_type === 'cta_click');
    const uniqueClicks = new Set(ctaClicks.map(e => e.session_id)).size;
    const totalSessions = new Set(events.map(e => e.session_id)).size;
    
    // Calculate conversion rate (CTA clicks that led to form starts)
    const formStarts = events.filter(e => e.event_type === 'form_start');
    const ctaToFormConversions = formStarts.filter(formEvent => {
      // Check if there was a CTA click in the same session before the form start
      const sessionCTAClick = ctaClicks.find(ctaEvent => 
        ctaEvent.session_id === formEvent.session_id && 
        ctaEvent.timestamp < formEvent.timestamp
      );
      return !!sessionCTAClick;
    }).length;

    return {
      total_clicks: ctaClicks.length,
      unique_clicks: uniqueClicks,
      ctr: totalSessions > 0 ? uniqueClicks / totalSessions : 0,
      conversion_rate: uniqueClicks > 0 ? ctaToFormConversions / uniqueClicks : 0
    };
  }

  private aggregateFormMetrics(events: RawTelemetryEvent[]): DailyMetrics['form_metrics'] {
    const formStarts = events.filter(e => e.event_type === 'form_start');
    const formSubmits = events.filter(e => e.event_type === 'form_submit');
    
    // Calculate completion times
    const completionTimes: number[] = [];
    formSubmits.forEach(submitEvent => {
      const startEvent = formStarts.find(start => start.session_id === submitEvent.session_id);
      if (startEvent) {
        completionTimes.push(submitEvent.timestamp - startEvent.timestamp);
      }
    });

    const avgCompletionTime = completionTimes.length > 0 ?
      completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length : 0;

    // Analyze dropout points
    const fieldEvents = events.filter(e => e.event_type === 'field_focus' || e.event_type === 'field_error');
    const dropoutPoints: Record<string, number> = {};
    
    fieldEvents.forEach(event => {
      if (event.event_type === 'field_error') {
        const fieldName = event.properties.fieldName;
        dropoutPoints[fieldName] = (dropoutPoints[fieldName] || 0) + 1;
      }
    });

    return {
      starts: formStarts.length,
      completions: formSubmits.length,
      completion_rate: formStarts.length > 0 ? formSubmits.length / formStarts.length : 0,
      avg_completion_time: avgCompletionTime,
      dropout_points: dropoutPoints
    };
  }

  private aggregateByCities(events: RawTelemetryEvent[]): Record<string, any> {
    const cityStats: Record<string, any> = {};
    
    events.forEach(event => {
      const city = event.city || 'Unknown';
      if (!cityStats[city]) {
        cityStats[city] = {
          sessions: new Set<string>(),
          cta_clicks: 0,
          form_completions: 0
        };
      }

      cityStats[city].sessions.add(event.session_id);
      
      if (event.event_type === 'cta_click') {
        cityStats[city].cta_clicks++;
      }
      if (event.event_type === 'form_submit') {
        cityStats[city].form_completions++;
      }
    });

    // Convert Sets to counts and calculate CTR
    Object.keys(cityStats).forEach(city => {
      const sessions = cityStats[city].sessions.size;
      cityStats[city] = {
        sessions,
        cta_clicks: cityStats[city].cta_clicks,
        form_completions: cityStats[city].form_completions,
        ctr: sessions > 0 ? cityStats[city].cta_clicks / sessions : 0
      };
    });

    return cityStats;
  }

  private aggregateByOffences(events: RawTelemetryEvent[]): Record<string, any> {
    const offenceStats: Record<string, any> = {};
    
    events.forEach(event => {
      const offence = event.offence || 'Unknown';
      if (!offenceStats[offence]) {
        offenceStats[offence] = {
          sessions: new Set<string>(),
          cta_clicks: 0,
          form_completions: 0
        };
      }

      offenceStats[offence].sessions.add(event.session_id);
      
      if (event.event_type === 'cta_click') {
        offenceStats[offence].cta_clicks++;
      }
      if (event.event_type === 'form_submit') {
        offenceStats[offence].form_completions++;
      }
    });

    // Convert Sets to counts
    Object.keys(offenceStats).forEach(offence => {
      offenceStats[offence] = {
        sessions: offenceStats[offence].sessions.size,
        cta_clicks: offenceStats[offence].cta_clicks,
        form_completions: offenceStats[offence].form_completions
      };
    });

    return offenceStats;
  }

  private calculatePerformanceScore(metrics: {
    ctr: number;
    form_completion_rate: number;
    bounce_rate: number;
    engagement_rate: number;
  }): number {
    // Weighted scoring algorithm
    const weights = {
      ctr: 0.25,
      form_completion: 0.35,
      bounce_rate: 0.20,
      engagement: 0.20
    };

    let score = 0;
    
    // CTR score (target: 4%)
    score += Math.min(metrics.ctr / 0.04, 1) * weights.ctr * 100;
    
    // Form completion score (target: 35%)
    score += Math.min(metrics.form_completion_rate / 0.35, 1) * weights.form_completion * 100;
    
    // Bounce rate score (inverse - lower is better, target: <60%)
    score += Math.max(0, (0.6 - metrics.bounce_rate) / 0.6) * weights.bounce_rate * 100;
    
    // Engagement score (target: 70%)
    score += Math.min(metrics.engagement_rate / 0.7, 1) * weights.engagement * 100;

    return Math.round(score);
  }

  /**
   * Generate trend analysis for a given period
   */
  async generateTrendAnalysis(days: number = 7): Promise<TrendAnalysis> {
    const endDate = new Date();
    const metrics: DailyMetrics[] = [];
    
    // Collect metrics for the specified period
    for (let i = 0; i < days; i++) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      const dayMetrics = await this.getAggregatedMetrics(dateString);
      if (dayMetrics) metrics.push(dayMetrics);
    }

    if (metrics.length < 2) {
      return {
        period: `${days} days`,
        metrics: { sessions_trend: 0, cta_ctr_trend: 0, form_completion_trend: 0, engagement_trend: 0 },
        insights: ['Insufficient data for trend analysis'],
        recommendations: [],
        anomalies: []
      };
    }

    // Calculate trends
    const trends = this.calculateTrends(metrics);
    const insights = this.generateInsights(metrics, trends);
    const recommendations = this.generateRecommendations(trends);
    const anomalies = this.detectAnomalies(metrics);

    return {
      period: `${days} days`,
      metrics: trends,
      insights,
      recommendations,
      anomalies
    };
  }

  private calculateTrends(metrics: DailyMetrics[]): TrendAnalysis['metrics'] {
    const first = metrics[metrics.length - 1]; // Oldest
    const last = metrics[0]; // Most recent

    return {
      sessions_trend: this.calculatePercentageChange(first.sessions.total, last.sessions.total),
      cta_ctr_trend: this.calculatePercentageChange(first.cta_performance.ctr, last.cta_performance.ctr),
      form_completion_trend: this.calculatePercentageChange(
        first.form_metrics.completion_rate,
        last.form_metrics.completion_rate
      ),
      engagement_trend: this.calculatePercentageChange(
        first.engagement.scroll_50_pct / Math.max(first.sessions.total, 1),
        last.engagement.scroll_50_pct / Math.max(last.sessions.total, 1)
      )
    };
  }

  private calculatePercentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }

  private generateInsights(metrics: DailyMetrics[], trends: TrendAnalysis['metrics']): string[] {
    const insights: string[] = [];
    
    if (trends.sessions_trend > 10) {
      insights.push('Sessions are trending upward significantly (+' + trends.sessions_trend.toFixed(1) + '%)');
    } else if (trends.sessions_trend < -10) {
      insights.push('Sessions are declining (-' + Math.abs(trends.sessions_trend).toFixed(1) + '%)');
    }

    if (trends.cta_ctr_trend > 5) {
      insights.push('CTA performance is improving (+' + trends.cta_ctr_trend.toFixed(1) + '%)');
    } else if (trends.cta_ctr_trend < -5) {
      insights.push('CTA click-through rate is declining (-' + Math.abs(trends.cta_ctr_trend).toFixed(1) + '%)');
    }

    if (trends.form_completion_trend > 5) {
      insights.push('Form completion rate is improving (+' + trends.form_completion_trend.toFixed(1) + '%)');
    } else if (trends.form_completion_trend < -5) {
      insights.push('Form abandonment is increasing (-' + Math.abs(trends.form_completion_trend).toFixed(1) + '%)');
    }

    // Analyze city performance
    const latestMetrics = metrics[0];
    const topCities = Object.entries(latestMetrics.city_breakdown)
      .sort(([, a], [, b]) => b.ctr - a.ctr)
      .slice(0, 3);
    
    if (topCities.length > 0) {
      insights.push(`Top performing cities: ${topCities.map(([city, data]) => 
        `${city} (${(data.ctr * 100).toFixed(1)}% CTR)`).join(', ')}`);
    }

    return insights;
  }

  private generateRecommendations(trends: TrendAnalysis['metrics']): string[] {
    const recommendations: string[] = [];

    if (trends.cta_ctr_trend < -5) {
      recommendations.push('Review and A/B test CTA button copy and placement');
      recommendations.push('Analyze top-performing pages and replicate successful elements');
    }

    if (trends.form_completion_trend < -5) {
      recommendations.push('Simplify form fields and reduce required information');
      recommendations.push('Implement progressive form disclosure');
      recommendations.push('Add form validation and progress indicators');
    }

    if (trends.engagement_trend < -10) {
      recommendations.push('Review page loading speed and content quality');
      recommendations.push('Optimize mobile experience and responsive design');
    }

    if (trends.sessions_trend > 20) {
      recommendations.push('Scale infrastructure to handle increased traffic');
      recommendations.push('Capitalize on growth by optimizing conversion funnels');
    }

    return recommendations;
  }

  private detectAnomalies(metrics: DailyMetrics[]): TrendAnalysis['anomalies'] {
    const anomalies: TrendAnalysis['anomalies'] = [];
    
    // Calculate baseline averages
    const avgCTR = metrics.reduce((sum, m) => sum + m.cta_performance.ctr, 0) / metrics.length;
    const avgFormCompletion = metrics.reduce((sum, m) => sum + m.form_metrics.completion_rate, 0) / metrics.length;
    const avgBounceRate = metrics.reduce((sum, m) => sum + m.sessions.bounce_rate, 0) / metrics.length;

    metrics.forEach(dayMetrics => {
      // Check for significant deviations (>2 standard deviations)
      const ctrDeviation = Math.abs(dayMetrics.cta_performance.ctr - avgCTR) / avgCTR;
      const formDeviation = Math.abs(dayMetrics.form_metrics.completion_rate - avgFormCompletion) / avgFormCompletion;
      const bounceDeviation = Math.abs(dayMetrics.sessions.bounce_rate - avgBounceRate) / avgBounceRate;

      if (ctrDeviation > 0.3) { // 30% deviation
        anomalies.push({
          metric: 'CTA CTR',
          date: dayMetrics.date,
          deviation: ctrDeviation,
          severity: ctrDeviation > 0.5 ? 'high' : 'medium'
        });
      }

      if (formDeviation > 0.3) {
        anomalies.push({
          metric: 'Form Completion Rate',
          date: dayMetrics.date,
          deviation: formDeviation,
          severity: formDeviation > 0.5 ? 'high' : 'medium'
        });
      }

      if (bounceDeviation > 0.3) {
        anomalies.push({
          metric: 'Bounce Rate',
          date: dayMetrics.date,
          deviation: bounceDeviation,
          severity: bounceDeviation > 0.5 ? 'high' : 'medium'
        });
      }
    });

    return anomalies.sort((a, b) => b.deviation - a.deviation);
  }

  /**
   * KV Store operations
   */
  private async getRawEvents(date: string): Promise<RawTelemetryEvent[]> {
    if (!this.kvStore) return [];
    
    try {
      const key = `raw_events_${date}`;
      const data = await this.kvStore.get(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to retrieve raw events:', error);
      return [];
    }
  }

  private async storeAggregatedMetrics(date: string, metrics: DailyMetrics): Promise<void> {
    if (!this.kvStore) return;

    try {
      const key = `daily_metrics_${date}`;
      await this.kvStore.put(key, JSON.stringify(metrics));
    } catch (error) {
      console.error('Failed to store aggregated metrics:', error);
    }
  }

  private async getAggregatedMetrics(date: string): Promise<DailyMetrics | null> {
    if (!this.kvStore) return null;

    try {
      const key = `daily_metrics_${date}`;
      const data = await this.kvStore.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to retrieve aggregated metrics:', error);
      return null;
    }
  }

  private async cleanupOldData(currentDate: string): Promise<void> {
    if (!this.kvStore) return;

    const cutoffDate = new Date(currentDate);
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    
    // This would typically be a batch operation
    // Implementation depends on the KV store's API
    try {
      const cutoffDateString = cutoffDate.toISOString().split('T')[0];
      const oldEventKey = `raw_events_${cutoffDateString}`;
      await this.kvStore.delete(oldEventKey);
    } catch (error) {
      console.warn('Failed to cleanup old data:', error);
    }
  }

  /**
   * Public API methods
   */
  async getMetricsRange(startDate: string, endDate: string): Promise<DailyMetrics[]> {
    const metrics: DailyMetrics[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateString = date.toISOString().split('T')[0];
      const dayMetrics = await this.getAggregatedMetrics(dateString);
      if (dayMetrics) metrics.push(dayMetrics);
    }

    return metrics;
  }

  async exportMetrics(startDate: string, endDate: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const metrics = await this.getMetricsRange(startDate, endDate);
    
    if (format === 'csv') {
      return this.convertToCSV(metrics);
    }
    
    return JSON.stringify(metrics, null, 2);
  }

  private convertToCSV(metrics: DailyMetrics[]): string {
    const headers = [
      'Date', 'Sessions', 'CTA CTR', 'Form Completion Rate', 
      'Bounce Rate', 'Performance Score'
    ];
    
    const rows = metrics.map(m => [
      m.date,
      m.sessions.total,
      (m.cta_performance.ctr * 100).toFixed(2),
      (m.form_metrics.completion_rate * 100).toFixed(2),
      (m.sessions.bounce_rate * 100).toFixed(2),
      m.performance_score
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

// Factory function
export function createMetricsAggregator(config: AggregationConfig, kvStore?: any): MetricsAggregator {
  return new MetricsAggregator(config, kvStore);
}

// Default configuration
export const defaultAggregationConfig: AggregationConfig = {
  kvNamespace: 'fabsy_telemetry',
  retentionDays: 90,
  aggregationSchedule: 'daily',
  alertThresholds: {
    ctr_drop: 0.2, // 20% drop
    form_completion_drop: 0.15, // 15% drop
    bounce_rate_spike: 0.1 // 10% increase
  }
};

export default MetricsAggregator;
export type { DailyMetrics, TrendAnalysis, AggregationConfig, RawTelemetryEvent };