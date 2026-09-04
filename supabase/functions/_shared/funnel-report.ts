export const FUNNEL_REPORT_WINDOWS = [1, 7, 14, 30, 90] as const;
export type FunnelReportWindow = (typeof FUNNEL_REPORT_WINDOWS)[number];

export class FunnelReportRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function parseFunnelReportWindow(value: unknown): FunnelReportWindow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FunnelReportRequestError('body_invalid');
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== 'days')) {
    throw new FunnelReportRequestError('body_fields_invalid');
  }
  const days = body.days ?? 7;
  if (typeof days !== 'number' || !FUNNEL_REPORT_WINDOWS.includes(days as FunnelReportWindow)) {
    throw new FunnelReportRequestError('window_invalid');
  }
  return days as FunnelReportWindow;
}
