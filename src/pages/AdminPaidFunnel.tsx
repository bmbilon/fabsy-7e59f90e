import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getIdrStaffRole } from '@/hooks/useIdrAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

type FunnelEventName =
  | 'landing_view'
  | 'primary_cta_click'
  | 'phone_click'
  | 'intake_started'
  | 'ticket_uploaded'
  | 'lead_saved'
  | 'intake_step_completed'
  | 'checkout_started'
  | 'checkout_canceled'
  | 'purchase';

interface EventTotal {
  event_name: FunnelEventName;
  event_count: number;
  sessions: number;
}

interface CampaignTotal {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  landing_sessions: number;
  cta_sessions: number;
  phone_sessions: number;
  intake_sessions: number;
  upload_sessions: number;
  lead_sessions: number;
  checkout_sessions: number;
  canceled_sessions: number;
  purchase_sessions: number;
}

interface FunnelReport {
  generated_at: string;
  since: string;
  until: string;
  consented_sessions_only: true;
  events: EventTotal[];
  campaigns: CampaignTotal[];
  daily: Array<{ day: string; landing_sessions: number; lead_sessions: number; purchase_sessions: number }>;
}

const windows = [1, 7, 14, 30, 90] as const;
const stages: Array<{ event: FunnelEventName; label: string }> = [
  { event: 'landing_view', label: 'Landing views' },
  { event: 'primary_cta_click', label: 'Primary CTA clicks' },
  { event: 'intake_started', label: 'Intakes started' },
  { event: 'ticket_uploaded', label: 'Tickets uploaded' },
  { event: 'lead_saved', label: 'Recoverable leads' },
  { event: 'checkout_started', label: 'Checkouts started' },
  { event: 'purchase', label: 'Verified purchases' },
];

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeReport(value: FunnelReport): FunnelReport {
  return {
    ...value,
    events: Array.isArray(value.events)
      ? value.events.map(event => ({ ...event, event_count: numberValue(event.event_count), sessions: numberValue(event.sessions) }))
      : [],
    campaigns: Array.isArray(value.campaigns)
      ? value.campaigns.map(campaign => ({
          ...campaign,
          landing_sessions: numberValue(campaign.landing_sessions),
          cta_sessions: numberValue(campaign.cta_sessions),
          phone_sessions: numberValue(campaign.phone_sessions),
          intake_sessions: numberValue(campaign.intake_sessions),
          upload_sessions: numberValue(campaign.upload_sessions),
          lead_sessions: numberValue(campaign.lead_sessions),
          checkout_sessions: numberValue(campaign.checkout_sessions),
          canceled_sessions: numberValue(campaign.canceled_sessions),
          purchase_sessions: numberValue(campaign.purchase_sessions),
        }))
      : [],
    daily: Array.isArray(value.daily) ? value.daily : [],
  };
}

function percent(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : '—';
}

export default function AdminPaidFunnel() {
  const [days, setDays] = useState<(typeof windows)[number]>(7);
  const [report, setReport] = useState<FunnelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async (windowDays = days) => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session || !await getIdrStaffRole()) {
        navigate('/admin');
        return;
      }
      const { data, error } = await supabase.functions.invoke<FunnelReport>('paid-funnel-report', {
        body: { days: windowDays },
      });
      if (error || !data || data.consented_sessions_only !== true) throw error || new Error('Invalid funnel report');
      setReport(normalizeReport(data));
    } catch (error) {
      console.error('Unable to load paid funnel report', error);
      toast({
        title: 'Funnel report unavailable',
        description: 'No campaign decision should be made until the report can be read back.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [days, navigate, toast]);

  useEffect(() => { void load(days); }, [days, load]);

  const eventSessions = useMemo(() => new Map(
    (report?.events || []).map(event => [event.event_name, event.sessions]),
  ), [report]);
  const landingSessions = eventSessions.get('landing_view') || 0;
  const phoneSessions = eventSessions.get('phone_click') || 0;
  const canceledSessions = eventSessions.get('checkout_canceled') || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Button type="button" variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/admin/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Back to Dashboard
          </Button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Paid acquisition funnel</h1>
              <p className="text-sm text-muted-foreground">Consent-qualified, first-party counts by campaign and creative.</p>
            </div>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void load(days)}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-8">
        <Card className="border-amber-300/70 bg-amber-50/40">
          <CardContent className="pt-6 text-sm leading-relaxed text-slate-700">
            These counts include only visitors who explicitly allowed Fabsy funnel measurement. Reconcile them with Meta and Google clicks, spend, and consent acceptance before calculating conversion rates or changing budget.
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2" aria-label="Reporting window">
          {windows.map(windowDays => (
            <Button
              key={windowDays}
              type="button"
              size="sm"
              variant={days === windowDays ? 'default' : 'outline'}
              onClick={() => setDays(windowDays)}
              aria-pressed={days === windowDays}
            >
              {windowDays === 1 ? '24 hours' : `${windowDays} days`}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Consented landing sessions</CardDescription><CardTitle className="text-3xl">{loading ? '…' : landingSessions}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Recoverable lead rate</CardDescription><CardTitle className="text-3xl">{loading ? '…' : percent(eventSessions.get('lead_saved') || 0, landingSessions)}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Purchase rate</CardDescription><CardTitle className="text-3xl">{loading ? '…' : percent(eventSessions.get('purchase') || 0, landingSessions)}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Phone / checkout cancels</CardDescription><CardTitle className="text-3xl">{loading ? '…' : `${phoneSessions} / ${canceledSessions}`}</CardTitle></CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Measured journey</CardTitle>
            <CardDescription>Unique sessions reaching each stage. Percentages use measured landing sessions as the denominator.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stages.map(({ event, label }) => {
              const count = eventSessions.get(event) || 0;
              return <div key={event} className="rounded-lg border bg-background p-4">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-bold">{loading ? '…' : count}</span>
                  <Badge variant="outline">{loading ? '…' : percent(count, landingSessions)}</Badge>
                </div>
              </div>;
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" /><CardTitle>Campaign and creative breakdown</CardTitle></div>
            <CardDescription>UTM-based unique sessions. “Direct” means no paid attribution was present or retained.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Source / campaign / content</th>
                    <th className="px-3 py-3">Landing</th><th className="px-3 py-3">CTA</th><th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Intake</th><th className="px-3 py-3">Upload</th><th className="px-3 py-3">Lead</th>
                    <th className="px-3 py-3">Checkout</th><th className="px-3 py-3">Cancel</th><th className="px-3 py-3">Purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.campaigns || []).map((campaign, index) => <tr key={`${campaign.source}:${campaign.campaign}:${campaign.content}:${index}`} className="border-b last:border-0">
                    <td className="px-3 py-3"><div className="font-medium">{campaign.source} · {campaign.campaign}</div><div className="text-xs text-muted-foreground">{campaign.medium} · {campaign.content}</div></td>
                    <td className="px-3 py-3">{campaign.landing_sessions}</td><td className="px-3 py-3">{campaign.cta_sessions}</td><td className="px-3 py-3">{campaign.phone_sessions}</td>
                    <td className="px-3 py-3">{campaign.intake_sessions}</td><td className="px-3 py-3">{campaign.upload_sessions}</td><td className="px-3 py-3">{campaign.lead_sessions}</td>
                    <td className="px-3 py-3">{campaign.checkout_sessions}</td><td className="px-3 py-3">{campaign.canceled_sessions}</td><td className="px-3 py-3 font-semibold">{campaign.purchase_sessions}</td>
                  </tr>)}
                  {!loading && !report?.campaigns.length ? <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">No consented funnel events in this window.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {report ? <p className="text-xs text-muted-foreground">Generated {new Date(report.generated_at).toLocaleString()} · Window begins {new Date(report.since).toLocaleString()}</p> : null}
      </main>
    </div>
  );
}
