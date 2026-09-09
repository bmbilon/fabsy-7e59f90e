import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Mail, RefreshCw } from "lucide-react";

// Additive migration types are kept here until the next full database type generation.
const db = supabase as unknown as import("@supabase/supabase-js").SupabaseClient;
interface Confirmation {
  id: string;
  confirmed_on: string;
  timeframe_text: string;
  notification_status: string;
  sent_at: string | null;
}
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-CA", {
  month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
}).format(new Date(`${value}T12:00:00Z`));
const deliveryLabel = (status: string) => ({ sent: "Notice sent", pending: "Notice queued", processing: "Sending notice", needs_review: "Notice needs review" })[status] || status;

export function DisclosureConfirmations({ submissionId, staff = false }: { submissionId: string; staff?: boolean }) {
  const query = useQuery({
    queryKey: ["disclosure-confirmations", submissionId],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_case_disclosure_confirmations", { p_submission_id: submissionId });
      if (error) throw error;
      return data as Confirmation[];
    },
    refetchInterval: 60_000,
  });
  if (query.isPending) return <p className="py-4 text-sm text-muted-foreground" role="status">Loading disclosure updates...</p>;
  if (query.isError) return <div className="my-6 rounded-lg border p-4"><p role="alert">Disclosure updates could not be loaded.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Try again</Button></div>;
  if (!query.data?.length) return staff ? <p className="my-6 text-sm text-muted-foreground">No disclosure request confirmation has been recorded for this case.</p> : null;
  return <Card className="my-6">
    <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />Disclosure request confirmed</CardTitle><CardDescription>The Crown has acknowledged the request. This update does not mean the disclosure has arrived.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      {query.data.map(item => <div key={item.id} className="space-y-2 border-l-2 border-primary pl-4">
        <p className="font-medium">Confirmed {dateLabel(item.confirmed_on)}</p>
        <p className="text-sm text-muted-foreground">Crown's stated timeframe</p>
        <p>{item.timeframe_text}</p>
        {staff && <Badge variant={item.notification_status === "needs_review" ? "destructive" : "secondary"}>{deliveryLabel(item.notification_status)}</Badge>}
      </div>)}
      <p className="text-sm text-muted-foreground">The Crown's timeframe is an estimate. Your ticket deadlines remain unchanged.</p>
    </CardContent>
  </Card>;
}

interface ReviewItem { id: string; ticket_number: string | null; review_reason: string | null; parse_error: string | null; received_at: string }
interface DeliveryIssue { id: string; submission_id: string; status: string; last_error: string | null; attempts: number }
interface Health { delivery_enabled: boolean; routing_configured: boolean; last_worker_at: string | null; last_webhook_at: string | null; last_worker_error: string | null }

export function DisclosureAutomationPanel() {
  const client = useQueryClient();
  const [retrying, setRetrying] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["disclosure-automation"],
    queryFn: async () => {
      const [health, review, deliveries] = await Promise.all([
        db.from("disclosure_automation_state").select("delivery_enabled,routing_configured,last_worker_at,last_webhook_at,last_worker_error").eq("id", true).single(),
        db.from("disclosure_confirmations").select("id,ticket_number,review_reason,parse_error,received_at", { count: "exact" }).in("status", ["pending", "needs_review"]).order("received_at", { ascending: false }).limit(50),
        db.from("disclosure_notification_outbox").select("id,submission_id,status,last_error,attempts", { count: "exact" }).neq("status", "sent").order("created_at", { ascending: true }).limit(50),
      ]);
      if (health.error || review.error || deliveries.error) throw health.error || review.error || deliveries.error;
      return { health: health.data as Health, review: review.data as ReviewItem[], deliveries: deliveries.data as DeliveryIssue[], reviewCount: review.count || 0, deliveryCount: deliveries.count || 0 };
    },
    refetchInterval: 60_000,
  });
  const retry = async (id: string) => {
    setRetrying(id);
    setFeedback(null);
    try {
      const { data, error } = await db.rpc("match_disclosure_confirmation", { p_id: id });
      if (error) throw error;
      setFeedback(data === "matched" ? "Case matched. The client notice is queued." : data === "duplicate" ? "This case already has the confirmation." : "The confirmation still needs review. See the reason below.");
      await Promise.all([client.invalidateQueries({ queryKey: ["disclosure-automation"] }), client.invalidateQueries({ queryKey: ["disclosure-confirmations"] })]);
    } catch { setFeedback("Matching failed. Try again after checking the case details."); }
    finally { setRetrying(null); }
  };
  const health = query.data?.health;
  const stale = !health?.last_worker_at || Date.now() - Date.parse(health.last_worker_at) > 10 * 60_000;
  const active = health?.delivery_enabled && health.routing_configured && !stale && !health.last_worker_error;
  return <Card className="mb-8">
    <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Disclosure confirmation automation</CardTitle><CardDescription>Incoming Crown acknowledgements, case matching and client notices.</CardDescription></div>
      <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {query.isPending ? <p role="status">Loading automation status...</p> : query.isError ? <p role="alert">Automation status is unavailable. Refresh to retry.</p> : <>
        <div className="flex flex-wrap items-center gap-3"><Badge variant={active ? "secondary" : "destructive"}>{active ? "Active" : !health?.delivery_enabled ? "Client delivery paused" : !health.routing_configured ? "Email routing not connected" : stale ? "Worker needs attention" : "Delivery needs attention"}</Badge><span className="text-sm">{query.data.reviewCount} confirmations need review · {query.data.deliveryCount} notices pending or needing review</span></div>
        <p className="text-sm text-muted-foreground">Last worker run: {health?.last_worker_at ? new Date(health.last_worker_at).toLocaleString("en-CA", { timeZone: "America/Edmonton" }) : "Not yet recorded"} (Alberta time). Processes every minute.</p>
        {health?.last_worker_error && <p className="text-sm text-destructive" role="alert">{health.last_worker_error}</p>}
        {feedback && <p role="status" className="text-sm">{feedback}</p>}
        {query.data.review.map(item => <div key={item.id} className="rounded-lg border p-4">
          <p className="font-medium">{item.ticket_number ? `Ticket ${item.ticket_number}` : "Ticket could not be identified"}</p><p className="my-2 text-sm">{item.review_reason || "Waiting to match a case."}</p>
          {item.parse_error ? <p className="text-sm text-muted-foreground">Check the original Crown email. A parser or authentication review is required before automated notification.</p> : <Button variant="outline" size="sm" disabled={retrying !== null} onClick={() => retry(item.id)}>{retrying === item.id ? "Matching..." : "Retry case matching"}</Button>}
        </div>)}
        {query.data.deliveries.map(item => <div key={item.id} className="rounded-lg border p-4 text-sm"><Link className="font-medium underline" to={`/admin/submissions/${item.submission_id}`}>Open case</Link><span className="ml-3">{deliveryLabel(item.status)} · {item.attempts} attempts</span>{item.last_error && <p className="mt-2">{item.last_error}</p>}{item.status === "needs_review" && <p className="mt-2 text-muted-foreground">Check the case recipient and Resend delivery log before sending manually. Automatic delivery is paused for this notice to prevent duplicates.</p>}</div>)}
        {(query.data.reviewCount > 50 || query.data.deliveryCount > 50) && <p className="text-sm text-muted-foreground">Showing up to 50 items in each queue. Resolve these items and refresh to see the rest.</p>}
      </>}
    </CardContent>
  </Card>;
}
