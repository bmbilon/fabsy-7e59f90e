import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SmsMessage = {
  message_sid: string; body: string; reply_text: string | null; received_at: string;
  state: string; delivery_status: string | null; delivery_error_code: string | null;
};
type Inquiry = {
  id: string; from_number: string; to_number: string; created_at: string;
  last_message_at: string; opted_out: boolean; email_status: string;
  messages: SmsMessage[]; message_count: number; messages_truncated: boolean;
};

export default function SmsIntakeInbox() {
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setInquiries(null);
    setError(false);
    void (async () => {
      try {
        const result = await supabase.rpc("admin_sms_intake_inbox");
        if (result.error) throw result.error;
        const data = result.data as unknown as { inquiries?: Inquiry[] };
        if (!Array.isArray(data?.inquiries)) throw new Error("Invalid SMS inbox response");
        if (active) setInquiries(data.inquiries);
      } catch { if (active) setError(true); }
    })();
    return () => { active = false; };
  }, [revision]);
  return <section className="space-y-6" aria-labelledby="sms-inbox-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="sms-inbox-heading" className="text-2xl font-bold">SMS inquiries</h2>
        <p className="mt-2 text-sm text-muted-foreground">Recent SMS conversations. An inquiry is not a submitted ticket, payment, or authorization to act. Message content is retained for 30 days.</p></div>
      <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Refresh SMS inquiries</Button>
    </div>
    {error ? <p role="alert">SMS inquiries are unavailable. Try refreshing.</p>
      : inquiries === null ? <p role="status">Loading SMS inquiries…</p>
      : inquiries.length === 0 ? <p>No recent SMS inquiries.</p>
      : inquiries.map(inquiry => <Card key={inquiry.id} className="space-y-4 p-5">
        <div>
          <h3 className="font-semibold">{inquiry.from_number}</h3>
          <p className="text-sm text-muted-foreground">To {inquiry.to_number} · Last message {new Date(inquiry.last_message_at).toLocaleString()}</p>
          <p className="mt-1 text-sm">Internal email: {(inquiry.email_status === "sent" ? "provider accepted; delivery unconfirmed" : inquiry.email_status) || "unavailable"}{inquiry.opted_out ? " · Automated replies stopped by sender" : ""}</p>
        </div>
        <ol className="space-y-4">{inquiry.messages.map(message => <li key={message.message_sid} className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">{new Date(message.received_at).toLocaleString()} · {message.state.replaceAll("_", " ")}</p>
          <p className="whitespace-pre-wrap break-words"><strong>Incoming: </strong>{message.body || "No text supplied"}</p>
          {message.reply_text && <p className="whitespace-pre-wrap break-words"><strong>Prepared reply: </strong>{message.reply_text}</p>}
          {message.reply_text && <p className="text-xs text-muted-foreground">Delivery: {message.delivery_status || "awaiting provider confirmation"}{message.delivery_error_code ? ` (${message.delivery_error_code})` : ""}</p>}
        </li>)}</ol>
        {inquiry.messages_truncated && <p className="text-sm text-muted-foreground">Showing the latest 50 of {inquiry.message_count} messages.</p>}
      </Card>)}
  </section>;
}
