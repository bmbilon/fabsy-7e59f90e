import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import { functionInvokeMessage } from "@/lib/manualRepresentation";
import { SERVICE_PRODUCTS } from "../../supabase/functions/_shared/service-checkout";

type Order = { id: string; name: string; represented_name: string; email: string; product: string; mode: string; payment_status: string;
  total_cents: number; consent_form_path: string | null; ticket_document_path: string | null; ticket_submission_id: string | null;
  created_at: string; match_status: string; applied_at: string | null };
type Ticket = { id: string; email: string; ticket_number: string; first_name: string; last_name: string; ticket_type: string; status: string };
export default function AdminServiceOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  async function call(body: Record<string, unknown>) {
    const { data, error: failure } = await supabase.functions.invoke("service-checkout", { body });
    if (failure || data?.error) throw new Error(data?.error || await functionInvokeMessage(failure, "The orders could not be loaded."));
    return data;
  }
  async function load() {
    setLoading(true); setError("");
    try { const data = await call({ action: "staff-list", email }); setOrders(data.orders || []); setTickets(data.tickets || []); }
    catch (caught) { setError((caught as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void (async () => {
    if (!await getIdrStaffRole()) { navigate("/admin", { replace: true }); return; }
    await load();
  })(); }, []);
  async function link(orderId: string, ticketId: string) {
    setLoading(true); setError("");
    try { await call({ action: "staff-link", orderId, ticketId }); await load(); }
    catch (caught) { setError((caught as Error).message); setLoading(false); }
  }
  async function file(orderId: string, kind: string) {
    try { const data = await call({ action: "staff-file", orderId, kind }); window.open(data.url, "_blank", "noopener,noreferrer"); }
    catch (caught) { setError((caught as Error).message); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <div><h1 className="text-3xl font-bold">Consent and payments</h1><p className="mt-2 text-muted-foreground">Send the same link to anyone. No client setup is needed.</p></div>
    <div className="grid gap-4 sm:grid-cols-3">{[["Consent and payment", "/checkout"], ["Consent only", "/consent"], ["Payment only", "/payment"]].map(([label, path]) => <Card key={path}><CardContent className="space-y-3 pt-6"><h2 className="font-semibold">{label}</h2><a className="block text-sm text-primary underline" href={path} target="_blank" rel="noreferrer">fabsy.ca{path}</a><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(`https://fabsy.ca${path}`).then(() => setCopied(path)).catch(() => setError("Select and copy the link above.")); }}>{copied === path ? "Copied" : "Copy link"}</Button></CardContent></Card>)}</div>
    <p className="text-sm text-muted-foreground">Orders are matched by email and confirmed identity or ticket number. Multiple matches stay here for review. Uploaded documents are saved with the order. <Link to="/admin/checkout-links/private" className="text-primary underline">Older private-link workflow</Link></p>
    <form className="flex gap-3" onSubmit={event => { event.preventDefault(); void load(); }}><Input aria-label="Find by customer email" placeholder="Find by customer email" type="email" value={email} onChange={e => setEmail(e.target.value)} /><Button disabled={loading}>Find orders</Button><Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>Refresh</Button></form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading && <p role="status">Loading orders…</p>}
    {!loading && !orders.length && <p className="text-muted-foreground">No service orders yet.</p>}
    {orders.map(order => {
      const matches = tickets.filter(ticket => ticket.email.trim().toLowerCase() === order.email && (ticket.ticket_type === "photo_radar") === (order.product === "photo_radar"));
      const linked = tickets.find(t => t.id === order.ticket_submission_id);
      return <Card key={order.id}><CardContent className="space-y-4 pt-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{order.name}</h2>{order.represented_name !== order.name && <p className="text-sm">For {order.represented_name}</p>}<p className="break-all text-sm text-muted-foreground">{order.email}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{order.mode === "consent" ? "Consent only" : order.payment_status.replaceAll("_", " ")}</span></div>
        <p className="text-sm">{SERVICE_PRODUCTS.find(p => p.key === order.product)?.name} · ${(order.total_cents / 100).toFixed(2)} including GST · {new Date(order.created_at).toLocaleString()}</p>
        <div className="flex flex-wrap gap-3">{order.consent_form_path ? <Button variant="outline" size="sm" onClick={() => void file(order.id, "consent")}>View consent</Button> : <span className="text-sm">Consent not supplied in this request</span>}{order.ticket_document_path && <Button variant="outline" size="sm" onClick={() => void file(order.id, "ticket")}>View uploaded document</Button>}</div>
        {order.ticket_submission_id ? <p className="text-sm"><Link className="text-primary underline" to={`/admin/submissions/${order.ticket_submission_id}`}>Ticket {linked?.ticket_number || "awaiting review"}</Link> · {order.applied_at ? "Recorded on case" : "Matched — review case details / authorization"}</p> : order.product !== "insurance_report" ? <div className="space-y-2"><p className="text-sm">{matches.length ? "Confirm the ticket for this order:" : "Awaiting a ticket using this email."}</p>{matches.map(ticket => <Button key={ticket.id} variant="outline" size="sm" disabled={loading} onClick={() => void link(order.id, ticket.id)}>Link {ticket.ticket_number || "unread ticket"} — {ticket.first_name} {ticket.last_name}</Button>)}</div> : <Link to="/admin/idr" className="text-sm text-primary underline">Open insurance reports</Link>}
      </CardContent></Card>;
    })}
  </main>;
}
