import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import PortalLookupFields, { emptyPortalLookup } from "@/components/PortalLookupFields";
import { supabase } from "@/integrations/supabase/client";
import { functionErrorDetails } from "@/lib/ticket/submitIntake";
import useSafeHead from "@/hooks/useSafeHead";

type State =
  | { step: "complete" }
  | { step: "redirect"; url: string }
  | { step: "owner" | "lookup" | "review"; ticketNumber: string }
  | { step: "payment"; ticketNumber: string; amountCents?: number };
type Action = "read" | "save-owner" | "save-lookup" | "pay";

const checkoutError = "We could not open your saved checkout. Reply to your Fabsy reminder for help.";
const currency = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function checkoutDestination(value: string, action: Action) {
  const url = new URL(value);
  if (url.username || url.password) throw new Error(checkoutError);
  if (action === "pay" && url.origin === "https://checkout.stripe.com") return url.href;
  if (action === "read" && url.origin === "https://fabsy.ca" &&
      ["/complete-ticket", "/payment", "/consent", "/checkout"].includes(url.pathname)) return url.href;
  throw new Error(checkoutError);
}

async function fetchState(token: string, action: Action, fields: Record<string, unknown> = {}): Promise<State> {
  const { data, error } = await supabase.functions.invoke("checkout-reminder-resume", { body: { token, action, ...fields } });
  if (error || !data?.step) throw new Error((await functionErrorDetails(error, checkoutError)).message);
  return data.step === "redirect" ? { step: "redirect", url: checkoutDestination(data.url, action) } : data;
}

export default function CheckoutReminderResume({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [lookup, setLookup] = useState(emptyPortalLookup);
  const pending = useRef(false);
  useSafeHead({ title: "Continue your saved checkout | Fabsy", description: "Complete your saved ticket checkout.",
    robots: "noindex, nofollow, noarchive" });

  useEffect(() => {
    let active = true;
    void fetchState(token, "read").then(value => { if (active) setState(value); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : checkoutError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function submit(event: FormEvent, action: Exclude<Action, "read">, fields?: Record<string, unknown>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await fetchState(token, action, fields);
      if (next.step === "redirect") {
        window.location.assign(next.url);
        return;
      }
      setLookup(emptyPortalLookup());
      setState(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : checkoutError);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto max-w-2xl px-4 py-5">
      <Link to="/" className="text-xl font-bold text-primary">Fabsy</Link>
    </div></header>
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card className="space-y-5 p-5 sm:p-8">
        <h1 className="text-2xl font-bold">Continue your saved checkout</h1>
        {loading && <p role="status">Opening your saved ticket…</p>}
        {state && "ticketNumber" in state && <p>Ticket {state.ticketNumber}</p>}
        {state?.step === "complete" && <p role="status">Your consent and payment are on file.</p>}
        {state?.step === "review" && <p role="status">Your ticket is saved. Fabsy needs to review the details before you can pay.</p>}
        {state?.step === "redirect" && <Button asChild><a href={state.url}>Continue</a></Button>}
        {state?.step === "owner" && <form className="space-y-4" onSubmit={event => void submit(event, "save-owner", { answer })}>
          <Label htmlFor="resume-camera-owner">Was the vehicle registered to you on the offence date?</Label>
          <select id="resume-camera-owner" className="h-12 w-full rounded-md border bg-background px-3"
            value={answer} onChange={event => setAnswer(event.target.value)} disabled={busy} required>
            <option value="">Select an answer</option>
            <option value="yes">Yes</option>
            <option value="sold_before">I sold it before that date</option>
            <option value="stolen">It was stolen</option>
          </select>
          <Button type="submit" disabled={busy || !answer}>{busy ? "Saving…" : "Save and continue"}</Button>
        </form>}
        {state?.step === "lookup" && <form className="space-y-4"
          onSubmit={event => void submit(event, "save-lookup", { ...lookup })}>
          <PortalLookupFields lookup={lookup} onChange={setLookup} disabled={busy} />
          <Button type="submit" disabled={busy || !lookup.confirmed || !lookup.value.trim()}>
            {busy ? "Saving…" : "Save and continue"}
          </Button>
        </form>}
        {state?.step === "payment" && <form className="space-y-4" onSubmit={event => void submit(event, "pay")}>
          <p>Your ticket and consent are saved. Stripe will show the total before you confirm payment.</p>
          {typeof state.amountCents === "number" && <p className="font-semibold">{currency.format(state.amountCents / 100)} CAD</p>}
          <Button type="submit" disabled={busy}>{busy ? "Opening Stripe…" : "Continue to Stripe"}</Button>
        </form>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && state?.step !== "complete" && <p className="text-sm text-muted-foreground">
          Need help? Reply to your reminder or contact <a className="underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a>.
        </p>}
      </Card>
    </main>
  </div>;
}
