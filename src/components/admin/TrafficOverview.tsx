import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowUpRight, Download, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TrafficReport } from '@/lib/admin/traffic';

const fmt = new Intl.NumberFormat('en-CA');
const pct = (value: number, total: number) => total ? `${(value / total * 100).toFixed(1)}%` : '—';

function exportBreakdown(rows: TrafficReport['breakdown']) {
  const columns = ['channel', 'source', 'page', 'campaign', 'device', 'requests'] as const;
  const csv = [columns.join(','), ...rows.map(row => columns.map(key =>
    `"${String(row[key]).replace(/"/g, '""')}"`).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'fabsy-traffic-breakdown.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TrafficOverview({ report }: { report: TrafficReport }) {
  const [channel, setChannel] = useState('All channels');
  const [activitySource, setActivitySource] = useState('All sources');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'requests' | 'page'>('requests');
  const filtered = useMemo(() => report.breakdown
    .filter(row => (channel === 'All channels' || row.channel === channel) &&
      `${row.source} ${row.page} ${row.campaign} ${row.device}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'requests' ? b.requests - a.requests : a.page.localeCompare(b.page)),
  [report.breakdown, channel, query, sort]);
  const delta = report.comparison_complete && report.previous_requests
    ? (report.requests - report.previous_requests) / report.previous_requests * 100 : null;
  const top = report.pages[0];
  const direct = report.channels.find(row => row.channel === 'Direct / unknown')?.requests || 0;
  const paid = report.channels.filter(row => row.channel.startsWith('Paid') || row.channel === 'Other paid').reduce((sum, row) => sum + row.requests, 0);
  const activitySources = [...new Set(report.consented_activity.map(row => row.source))].sort();
  const activity = report.consented_activity.filter(row => activitySource === 'All sources' || row.source === activitySource);
  const maxDay = Math.max(1, ...report.daily.map(row => row.requests));
  const maxHour = Math.max(1, ...report.recent_hours.map(row => row.requests));
  const insights = [
    top && `${top.page} received ${pct(top.requests, report.requests)} of measured public page requests.`,
    direct > 0 && `${pct(direct, report.requests)} of requests have no known external source. Direct includes missing referrers and unrecognized tags.`,
    paid > 0 && `${fmt.format(paid)} requests carried paid attribution. Use the consented journey and ad-platform spend below for paid decisions.`,
    report.requests === 0 && 'No eligible document requests have been recorded in this window. Check deployment and the collection start time.',
  ].filter(Boolean);

  return <section className="space-y-5" aria-labelledby="all-traffic-title">
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle id="all-traffic-title">All-source traffic</CardTitle>
          <CardDescription className="mt-1">Public HTML requests counted at Cloudflare, including direct, search, social, AI, email and referrals. Updated when this report refreshes.</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild><Link to="/admin/live"><Activity className="mr-2 h-4 w-4" />Live visitors</Link></Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Public page requests</p><p className="mt-1 text-3xl font-bold tabular-nums">{fmt.format(report.requests)}</p>{delta !== null ? <p className={`mt-1 flex items-center text-sm ${delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{delta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{Math.abs(delta).toFixed(1)}% vs previous equal window</p> : <p className="text-xs text-muted-foreground">Comparison available after a full prior window</p>}</div>
          <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">This clock hour</p><p className="mt-1 text-3xl font-bold tabular-nums">{fmt.format(report.this_hour)}</p><p className="text-xs text-muted-foreground">Hour to date, not a rolling hour</p></div>
          <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Paid-tagged requests</p><p className="mt-1 text-3xl font-bold tabular-nums">{fmt.format(paid)}</p><p className="text-xs text-muted-foreground">Across all public pages</p></div>
          <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Submitted cases</p><p className="mt-1 text-3xl font-bold tabular-nums">{fmt.format(report.submissions)}</p><p className="text-xs text-muted-foreground">All sources; independent case count</p></div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm text-slate-700">
          <Info className="mr-2 inline h-4 w-4 text-blue-700" />Requests include repeat views and cannot be treated as visitors or sessions. Known bots, speculative requests, privacy-signal opt-outs and private routes are excluded. Browser behavior requires consent. Case and payment totals cover all sources but cannot be assigned to a request source without a verified attribution link. Collection began {report.collection_started_at ? new Date(report.collection_started_at).toLocaleString('en-CA') : 'with this deployment'}; older periods cannot be reconstructed.
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Traffic by day</CardTitle><CardDescription>Edmonton dates · page requests</CardDescription></CardHeader><CardContent>
        {report.daily.length ? <div className="flex h-40 items-end gap-1" role="img" aria-label={`Daily traffic: ${report.daily.map(row => `${row.day} ${row.requests}`).join(', ')}`}>
          {report.daily.map(row => <div key={row.day} className="min-w-0 flex-1 rounded-t bg-blue-500" style={{ height: `${Math.max(2, row.requests / maxDay * 100)}%` }} title={`${row.day}: ${fmt.format(row.requests)}`} />)}
        </div> : <p className="text-sm text-muted-foreground">No data yet.</p>}
        {report.daily.length > 1 && <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{report.daily[0].day}</span><span>{report.daily.at(-1)?.day}</span></div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Last 24 hours</CardTitle><CardDescription>Hourly document requests · latest bar is the current hour</CardDescription></CardHeader><CardContent>
        <div className="flex h-40 items-end gap-1" role="img" aria-label={`Hourly traffic: ${report.recent_hours.map(row => `${row.bucket_start} ${row.requests}`).join(', ')}`}>
          {report.recent_hours.map(row => <div key={row.bucket_start} className="min-w-0 flex-1 rounded-t bg-teal-500" style={{ height: `${Math.max(2, row.requests / maxHour * 100)}%` }} title={`${new Date(row.bucket_start).toLocaleString('en-CA')}: ${fmt.format(row.requests)}`} />)}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>24 hours ago</span><span>Now</span></div>
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>What stands out</CardTitle><CardDescription>Computed from this reporting window</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm md:grid-cols-2">
        {insights.map((insight, i) => <p key={i} className="rounded-md bg-slate-50 px-3 py-2">{insight}</p>)}
      </CardContent></Card>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Channels and sources</CardTitle><CardDescription>Attributed from reviewed campaign tags, click kind or the incoming referrer.</CardDescription></CardHeader><CardContent className="space-y-2">
        {report.channels.map(row => <button key={row.channel} type="button" onClick={() => setChannel(row.channel)} className="block w-full rounded-md p-2 text-left hover:bg-slate-50" aria-label={`Filter ${row.channel}`}>
          <div className="mb-1 flex justify-between gap-2 text-sm"><span>{row.channel}</span><strong>{fmt.format(row.requests)} <span className="font-normal text-muted-foreground">({pct(row.requests, report.requests)})</span></strong></div>
          <div className="h-1.5 rounded bg-slate-100"><div className="h-full rounded bg-blue-500" style={{ width: pct(row.requests, report.requests) === '—' ? '0%' : pct(row.requests, report.requests) }} /></div>
        </button>)}
        {!report.channels.length && <p className="text-sm text-muted-foreground">No source data yet.</p>}
        {report.sources.length > 0 && <div className="mt-4 border-t pt-3"><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Top sources</p><div className="flex flex-wrap gap-2">{report.sources.slice(0, 8).map(row => <span key={`${row.channel}:${row.source}`} className="rounded-full border px-2.5 py-1 text-xs">{row.source} · {fmt.format(row.requests)}</span>)}</div></div>}
        {report.devices.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">Devices: {report.devices.map(row => <span key={row.device}>{row.device} {fmt.format(row.requests)}</span>)}</div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Top pages</CardTitle><CardDescription>Document requests, including article pages.</CardDescription></CardHeader><CardContent><div className="space-y-2">
        {report.pages.slice(0, 10).map(row => <div key={row.page} className="flex justify-between gap-3 border-b py-2 text-sm"><span className="min-w-0 break-all">{row.page}</span><strong className="shrink-0 tabular-nums">{fmt.format(row.requests)}</strong></div>)}
        {!report.pages.length && <p className="text-sm text-muted-foreground">No page data yet.</p>}
      </div></CardContent></Card>
    </div>

    <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle>Consented behavior by source and page</CardTitle><CardDescription className="mt-1">Distinct consenting sessions reaching each page and stage. One session can appear on several pages and at several stages; rows are not a conversion funnel.</CardDescription></div><select className="rounded-md border bg-background px-3 py-2 text-sm" value={activitySource} onChange={event => setActivitySource(event.target.value)} aria-label="Behavior source"><option>All sources</option>{activitySources.map(source => <option key={source}>{source}</option>)}</select></CardHeader><CardContent><div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="sticky top-0 border-b bg-background text-xs uppercase text-muted-foreground"><tr><th className="p-2">Source</th><th className="p-2">Page</th><th className="p-2">Checkpoint</th><th className="p-2 text-right">Sessions</th></tr></thead><tbody>
      {activity.map((row, index) => <tr key={`${row.source}:${row.page}:${row.stage}:${index}`} className="border-b"><td className="p-2">{row.source}</td><td className="p-2 break-all">{row.page}</td><td className="p-2 capitalize">{row.stage}</td><td className="p-2 text-right font-semibold tabular-nums">{fmt.format(row.sessions)}</td></tr>)}
      {!activity.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No consenting session checkpoints for this selection yet.</td></tr>}
    </tbody></table></div></CardContent></Card>

    <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><div><CardTitle>Explore traffic</CardTitle><CardDescription className="mt-1">Source × page × campaign × device. Top 500 combinations; download the filtered rows.</CardDescription></div><Button variant="outline" size="sm" onClick={() => exportBreakdown(filtered)}><Download className="mr-2 h-4 w-4" />CSV</Button></CardHeader><CardContent>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={channel} onChange={event => setChannel(event.target.value)} aria-label="Channel"><option>All channels</option>{report.channels.map(row => <option key={row.channel}>{row.channel}</option>)}</select>
        <input className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" placeholder="Search source, page, campaign or device" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search traffic" />
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={sort} onChange={event => setSort(event.target.value as 'requests' | 'page')} aria-label="Sort traffic"><option value="requests">Most requests</option><option value="page">Page A–Z</option></select>
      </div>
      <div className="max-h-[440px] overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 border-b bg-background text-xs uppercase text-muted-foreground"><tr><th className="p-2">Channel / source</th><th className="p-2">Page</th><th className="p-2">Campaign</th><th className="p-2">Device</th><th className="p-2 text-right">Requests</th></tr></thead><tbody>
        {filtered.map((row, index) => <tr key={`${row.channel}:${row.source}:${row.page}:${row.campaign}:${row.device}:${index}`} className="border-b"><td className="p-2">{row.channel}<span className="block text-xs text-muted-foreground">{row.source}</span></td><td className="p-2 break-all">{row.page}</td><td className="p-2">{row.campaign || '—'}</td><td className="p-2">{row.device}</td><td className="p-2 text-right font-semibold tabular-nums">{fmt.format(row.requests)}</td></tr>)}
        {!filtered.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No matching requests.</td></tr>}
      </tbody></table></div>
    </CardContent></Card>
  </section>;
}
