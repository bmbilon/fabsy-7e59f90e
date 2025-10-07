/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 12: Conversion Layer & Form Telemetry - Alert System
 * 
 * Automated alerts for conversion rate drops, engagement issues, 
 * and form completion threshold violations with notification channels
 */

interface AlertCondition {
  id: string;
  name: string;
  condition: (metrics: ConversionMetrics) => boolean;
  threshold: number;
  comparison: 'less_than' | 'greater_than';
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldownPeriod: number; // minutes
  notificationChannels: ('email' | 'slack' | 'webhook')[];
}

interface ConversionMetrics {
  timestamp: number;
  funnel: {
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
  };
  cityPerformance: Array<{
    city: string;
    offence: string;
    cta_ctr: number;
    conversion_rate: number;
  }>;
  dwellTime: {
    average: number;
    bounce_rate: number;
  };
}

interface Alert {
  id: string;
  alertId: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  value: number;
  threshold: number;
  resolved: boolean;
  acknowledgedAt?: number;
}

interface NotificationConfig {
  email: {
    smtp_host: string;
    smtp_port: number;
    username: string;
    password: string;
    from_email: string;
    recipients: string[];
  };
  slack: {
    webhook_url: string;
    channel: string;
    username: string;
  };
  webhook: {
    url: string;
    headers?: Record<string, string>;
  };
}

class ConversionAlertSystem {
  private alertConditions: AlertCondition[] = [];
  private activeAlerts = new Map<string, Alert>();
  private alertHistory: Alert[] = [];
  private notifications: NotificationConfig;
  private cooldownTracker = new Map<string, number>();

  constructor(notifications: NotificationConfig) {
    this.notifications = notifications;
    this.setupDefaultAlerts();
  }

  private setupDefaultAlerts(): void {
    this.alertConditions = [
      {
        id: 'low_cta_ctr',
        name: 'Low CTA Click-Through Rate',
        condition: (m) => m.funnel.conversion_rates.cta_rate < this.threshold,
        threshold: 0.025, // 2.5%
        comparison: 'less_than',
        severity: 'medium',
        cooldownPeriod: 30,
        notificationChannels: ['slack', 'email']
      },
      {
        id: 'low_form_completion',
        name: 'Low Form Completion Rate',
        condition: (m) => m.funnel.conversion_rates.form_complete_rate < this.threshold,
        threshold: 0.30, // 30%
        comparison: 'less_than',
        severity: 'high',
        cooldownPeriod: 15,
        notificationChannels: ['slack', 'email', 'webhook']
      },
      {
        id: 'high_bounce_rate',
        name: 'High Bounce Rate',
        condition: (m) => m.dwellTime.bounce_rate > this.threshold,
        threshold: 0.65, // 65%
        comparison: 'greater_than',
        severity: 'medium',
        cooldownPeriod: 60,
        notificationChannels: ['slack']
      },
      {
        id: 'low_scroll_engagement',
        name: 'Low Scroll Engagement',
        condition: (m) => m.funnel.conversion_rates.scroll_rate < this.threshold,
        threshold: 0.50, // 50%
        comparison: 'less_than',
        severity: 'low',
        cooldownPeriod: 120,
        notificationChannels: ['email']
      },
      {
        id: 'city_underperformance',
        name: 'City Performance Below Average',
        condition: (m) => {
          const avgCTR = m.cityPerformance.reduce((sum, c) => sum + c.cta_ctr, 0) / m.cityPerformance.length;
          return m.cityPerformance.some(c => c.cta_ctr < avgCTR * 0.7);
        },
        threshold: 0.7, // 70% of average
        comparison: 'less_than',
        severity: 'low',
        cooldownPeriod: 180,
        notificationChannels: ['email']
      },
      {
        id: 'critical_form_drop',
        name: 'Critical Form Completion Drop',
        condition: (m) => m.funnel.conversion_rates.form_complete_rate < this.threshold,
        threshold: 0.15, // 15% - critical level
        comparison: 'less_than',
        severity: 'critical',
        cooldownPeriod: 5,
        notificationChannels: ['slack', 'email', 'webhook']
      }
    ];
  }

  async checkAlerts(metrics: ConversionMetrics): Promise<Alert[]> {
    const newAlerts: Alert[] = [];
    const now = Date.now();

    for (const condition of this.alertConditions) {
      // Check cooldown
      const lastAlert = this.cooldownTracker.get(condition.id);
      if (lastAlert && (now - lastAlert) < condition.cooldownPeriod * 60 * 1000) {
        continue;
      }

      // Evaluate condition
      if (this.evaluateCondition(condition, metrics)) {
        const alert = this.createAlert(condition, metrics);
        
        // Don't duplicate active alerts
        if (!this.activeAlerts.has(alert.alertId)) {
          this.activeAlerts.set(alert.alertId, alert);
          this.alertHistory.push(alert);
          newAlerts.push(alert);
          
          // Send notifications
          await this.sendNotifications(alert, condition.notificationChannels);
          
          // Update cooldown
          this.cooldownTracker.set(condition.id, now);
        }
      } else {
        // Auto-resolve if condition no longer met
        const activeAlert = this.activeAlerts.get(condition.id);
        if (activeAlert && !activeAlert.resolved) {
          activeAlert.resolved = true;
          await this.sendResolutionNotification(activeAlert);
        }
      }
    }

    return newAlerts;
  }

  private evaluateCondition(condition: AlertCondition, metrics: ConversionMetrics): boolean {
    try {
      // Create a dynamic evaluation context
      const context = {
        threshold: condition.threshold,
        ...metrics
      };
      
      return condition.condition.call(context, metrics);
    } catch (error) {
      console.error(`Error evaluating condition ${condition.id}:`, error);
      return false;
    }
  }

  private createAlert(condition: AlertCondition, metrics: ConversionMetrics): Alert {
    let value: number;
    let description: string;

    switch (condition.id) {
      case 'low_cta_ctr':
        value = metrics.funnel.conversion_rates.cta_rate;
        description = `CTA click-through rate is ${(value * 100).toFixed(1)}%, below threshold of ${(condition.threshold * 100).toFixed(1)}%`;
        break;
      case 'low_form_completion':
      case 'critical_form_drop':
        value = metrics.funnel.conversion_rates.form_complete_rate;
        description = `Form completion rate is ${(value * 100).toFixed(1)}%, below threshold of ${(condition.threshold * 100).toFixed(1)}%`;
        break;
      case 'high_bounce_rate':
        value = metrics.dwellTime.bounce_rate;
        description = `Bounce rate is ${(value * 100).toFixed(1)}%, above threshold of ${(condition.threshold * 100).toFixed(1)}%`;
        break;
      case 'low_scroll_engagement':
        value = metrics.funnel.conversion_rates.scroll_rate;
        description = `Scroll engagement is ${(value * 100).toFixed(1)}%, below threshold of ${(condition.threshold * 100).toFixed(1)}%`;
        break;
      case 'city_underperformance':
        const avgCTR = metrics.cityPerformance.reduce((sum, c) => sum + c.cta_ctr, 0) / metrics.cityPerformance.length;
        const underperforming = metrics.cityPerformance.filter(c => c.cta_ctr < avgCTR * condition.threshold);
        value = avgCTR * condition.threshold;
        description = `Cities underperforming: ${underperforming.map(c => `${c.city} (${(c.cta_ctr * 100).toFixed(1)}%)`).join(', ')}`;
        break;
      default:
        value = 0;
        description = `Alert triggered for ${condition.name}`;
    }

    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      alertId: condition.id,
      timestamp: Date.now(),
      severity: condition.severity,
      title: condition.name,
      description,
      value,
      threshold: condition.threshold,
      resolved: false
    };
  }

  private async sendNotifications(alert: Alert, channels: ('email' | 'slack' | 'webhook')[]): Promise<void> {
    const promises = channels.map(channel => {
      switch (channel) {
        case 'email':
          return this.sendEmailAlert(alert);
        case 'slack':
          return this.sendSlackAlert(alert);
        case 'webhook':
          return this.sendWebhookAlert(alert);
        default:
          return Promise.resolve();
      }
    });

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  }

  private async sendEmailAlert(alert: Alert): Promise<void> {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransporter({
      host: this.notifications.email.smtp_host,
      port: this.notifications.email.smtp_port,
      secure: this.notifications.email.smtp_port === 465,
      auth: {
        user: this.notifications.email.username,
        pass: this.notifications.email.password
      }
    });

    const severityColors = {
      low: '#FEF3C7',
      medium: '#FED7AA', 
      high: '#FCA5A5',
      critical: '#F87171'
    };

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${severityColors[alert.severity]}; padding: 20px; border-radius: 8px;">
          <h2 style="color: #1F2937; margin: 0 0 10px 0;">${alert.title}</h2>
          <p style="color: #374151; margin: 0 0 15px 0;">${alert.description}</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
            <div>
              <strong>Severity:</strong> ${alert.severity.toUpperCase()}
            </div>
            <div>
              <strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}
            </div>
            <div>
              <strong>Current Value:</strong> ${(alert.value * 100).toFixed(1)}%
            </div>
            <div>
              <strong>Threshold:</strong> ${(alert.threshold * 100).toFixed(1)}%
            </div>
          </div>
        </div>
        <p style="color: #6B7280; font-size: 12px; margin-top: 20px;">
          This is an automated alert from the Fabsy AEO Conversion Monitoring System.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: this.notifications.email.from_email,
      to: this.notifications.email.recipients.join(', '),
      subject: `🚨 Conversion Alert: ${alert.title}`,
      html: htmlContent
    });
  }

  private async sendSlackAlert(alert: Alert): Promise<void> {
    const severityEmojis = {
      low: '⚠️',
      medium: '🟡',
      high: '🔴', 
      critical: '🚨'
    };

    const payload = {
      channel: this.notifications.slack.channel,
      username: this.notifications.slack.username,
      attachments: [
        {
          color: alert.severity === 'critical' ? 'danger' : alert.severity === 'high' ? 'warning' : 'good',
          title: `${severityEmojis[alert.severity]} ${alert.title}`,
          text: alert.description,
          fields: [
            {
              title: 'Current Value',
              value: `${(alert.value * 100).toFixed(1)}%`,
              short: true
            },
            {
              title: 'Threshold',
              value: `${(alert.threshold * 100).toFixed(1)}%`,
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Time',
              value: new Date(alert.timestamp).toLocaleString(),
              short: true
            }
          ],
          footer: 'Fabsy AEO Conversion Monitor',
          ts: Math.floor(alert.timestamp / 1000)
        }
      ]
    };

    await fetch(this.notifications.slack.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  private async sendWebhookAlert(alert: Alert): Promise<void> {
    const payload = {
      event: 'conversion_alert',
      alert: {
        ...alert,
        source: 'fabsy_aeo_monitor'
      }
    };

    await fetch(this.notifications.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.notifications.webhook.headers
      },
      body: JSON.stringify(payload)
    });
  }

  private async sendResolutionNotification(alert: Alert): Promise<void> {
    // Send a simple resolution message to Slack
    if (this.notifications.slack.webhook_url) {
      const payload = {
        channel: this.notifications.slack.channel,
        username: this.notifications.slack.username,
        text: `✅ Alert resolved: ${alert.title}`,
        attachments: [
          {
            color: 'good',
            text: `The condition that triggered this alert has been resolved.`,
            footer: 'Fabsy AEO Conversion Monitor',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      await fetch(this.notifications.slack.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  }

  // Management methods
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledgedAt = Date.now();
      return true;
    }
    return false;
  }

  getAlertHistory(limit = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  addCustomAlert(condition: AlertCondition): void {
    this.alertConditions.push(condition);
  }

  updateNotificationConfig(config: Partial<NotificationConfig>): void {
    this.notifications = { ...this.notifications, ...config };
  }

  // Utility method for testing alerts
  async testNotifications(): Promise<void> {
    const testAlert: Alert = {
      id: 'test_alert',
      alertId: 'test',
      timestamp: Date.now(),
      severity: 'medium',
      title: 'Test Alert',
      description: 'This is a test notification to verify the alert system is working correctly.',
      value: 0.02,
      threshold: 0.025,
      resolved: false
    };

    await this.sendNotifications(testAlert, ['email', 'slack', 'webhook']);
  }
}

// Factory function for easy instantiation
export function createAlertSystem(config: NotificationConfig): ConversionAlertSystem {
  return new ConversionAlertSystem(config);
}

// Example usage configuration
export const defaultAlertConfig: NotificationConfig = {
  email: {
    smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtp_port: parseInt(process.env.SMTP_PORT || '587'),
    username: process.env.SMTP_USERNAME || '',
    password: process.env.SMTP_PASSWORD || '',
    from_email: process.env.FROM_EMAIL || 'alerts@fabsy.ca',
    recipients: (process.env.ALERT_RECIPIENTS || '').split(',').filter(Boolean)
  },
  slack: {
    webhook_url: process.env.SLACK_WEBHOOK_URL || '',
    channel: process.env.SLACK_CHANNEL || '#alerts',
    username: 'Fabsy AEO Monitor'
  },
  webhook: {
    url: process.env.WEBHOOK_URL || '',
    headers: {
      'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN || ''}`,
      'X-Source': 'fabsy-aeo-monitor'
    }
  }
};

export default ConversionAlertSystem;
export type { Alert, AlertCondition, ConversionMetrics, NotificationConfig };