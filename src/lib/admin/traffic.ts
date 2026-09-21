type CountRow = { requests: number };
export interface TrafficReport {
  generated_at: string;
  collection_started_at: string | null;
  comparison_complete: boolean;
  request_counts_not_people_or_sessions: true;
  requests: number;
  previous_requests: number;
  this_hour: number;
  submissions: number;
  channels: Array<CountRow & { channel: string }>;
  sources: Array<CountRow & { channel: string; source: string }>;
  pages: Array<CountRow & { page: string }>;
  breakdown: Array<CountRow & { channel: string; source: string; page: string; campaign: string; device: string }>;
  devices: Array<CountRow & { device: string }>;
  daily: Array<CountRow & { day: string }>;
  recent_hours: Array<CountRow & { bucket_start: string }>;
  consented_activity: Array<{ source: string; page: string; stage: 'browsing' | 'intake' | 'review'; sessions: number }>;
}

const readCount = (value: unknown) => Math.max(0, Number(value) || 0);

export function normalizeTraffic(value: TrafficReport): TrafficReport {
  if (!value || value.request_counts_not_people_or_sessions !== true || typeof value.comparison_complete !== 'boolean' || !Array.isArray(value.channels) ||
      !Array.isArray(value.sources) || !Array.isArray(value.breakdown) || !Array.isArray(value.pages) ||
      !Array.isArray(value.devices) || !Array.isArray(value.daily) || !Array.isArray(value.recent_hours) ||
      !Array.isArray(value.consented_activity)) {
    throw new Error('Invalid traffic report');
  }
  return {
    ...value,
    requests: readCount(value.requests), previous_requests: readCount(value.previous_requests),
    this_hour: readCount(value.this_hour), submissions: readCount(value.submissions),
    channels: value.channels.map(row => ({ ...row, requests: readCount(row.requests) })),
    sources: value.sources.map(row => ({ ...row, requests: readCount(row.requests) })),
    pages: value.pages.map(row => ({ ...row, requests: readCount(row.requests) })),
    breakdown: value.breakdown.map(row => ({ ...row, requests: readCount(row.requests) })),
    devices: value.devices.map(row => ({ ...row, requests: readCount(row.requests) })),
    daily: value.daily.map(row => ({ ...row, requests: readCount(row.requests) })),
    recent_hours: value.recent_hours.map(row => ({ ...row, requests: readCount(row.requests) })),
    consented_activity: value.consented_activity.map(row => ({ ...row, sessions: readCount(row.sessions) })),
  };
}
