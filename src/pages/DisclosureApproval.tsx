import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Approval = {
  status: string; case_label: string; ticket_suffix: string; scope: string;
  terms_url: string; terms_version: string; terms_text: string; terms_sha256: string; expires_at: string;
};

const statusText: Record<string, string> = {
  approved: "Approved. Fabsy will continue this case while the approval is valid.",
  consumed: "Your approval was used for the prepared portal session. This is not a filing receipt.",
  rejected: "Declined. This request will not continue automatically.",
  expired: "This approval expired. The case needs a freshly prepared request.",
  revoked: "This approval was cancelled. No action is available here.",
  creating: "The approval is still being prepared. Reopen the text message shortly.",
  delivery_failed: "This request needs operator review. Approval is unavailable.",
};

export default function DisclosureApproval() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Keep the capability out of history, URLs sent to services and copied links.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    let active = true;
    const load = async () => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setError("Open the private approval link from your text message."); return; }
      const { data, error: invokeError } = await supabase.functions.invoke("disclosure-approval", { body: { action: "preview", token } });
      if (!active) return;
      if (invokeError || data?.error) setError("This approval link is unavailable or has expired. Open the latest text message.");
      else setApproval(data as Approval);
    };
    void load().catch(() => { if (active) setError("The approval could not be loaded. Check your connection and reopen the text message."); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!approval || approval.status !== "pending") return;
    const expire = () => setApproval((current) => current && current.status === "pending" ? { ...current, status: "expired" } : current);
    const timer = window.setTimeout(expire, Math.max(0, new Date(approval.expires_at).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [approval]);

  const decide = async (decision: "approved" | "rejected") => {
    if (!approval || busy || approval.status !== "pending") return;
    setBusy(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("disclosure-approval", {
        body: { action: "decide", token, decision, terms_sha256: approval.terms_sha256 },
      });
      if (invokeError || data?.error) {
        // A lost response may follow a successful decision: reconcile without repeating it.
        const check = await supabase.functions.invoke("disclosure-approval", { body: { action: "preview", token } });
        if (!check.error && check.data && check.data.status !== "pending") setApproval(check.data as Approval);
        else setError("Your choice could not be confirmed. Reopen the text message to check before trying again.");
      } else setApproval({ ...approval, status: data.status });
    } catch { setError("Your choice could not be confirmed. Reopen the text message to check its status."); }
    finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14">
      <Helmet>
        <title>Approve portal request | Fabsy</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="mx-auto max-w-xl space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><LockKeyhole className="h-4 w-4" aria-hidden="true" />Private approval for Brett</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Approve this portal request</h1>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-900">{error}</p>}
        {!approval && !error && <p role="status" className="text-slate-600">Loading your request…</p>}
        {approval && <>
          <div className="rounded-xl bg-slate-100 p-4">
            <p className="text-lg font-semibold text-slate-950">{approval.case_label}</p>
            <p className="mt-1 text-sm text-slate-600">Ticket ending {approval.ticket_suffix}</p>
          </div>
          <p className="leading-relaxed text-slate-700">{approval.scope}</p>
          <p className="text-sm leading-relaxed text-slate-600">This applies only to this case and the Terms captured below. Opening this page does not approve anything.</p>
          <details className="rounded-lg border border-slate-200 p-4">
            <summary className="cursor-pointer font-semibold text-slate-900">Review the Alberta Terms of Use</summary>
            <p className="mt-3 text-xs text-slate-500">{approval.terms_version}</p>
            <div className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{approval.terms_text}</div>
            <a className="mt-4 inline-block text-sm font-semibold text-blue-700 underline" href={approval.terms_url} target="_blank" rel="noreferrer noopener">Open Alberta’s Terms page</a>
          </details>
          {approval.status === "pending" ? <>
            <p className="text-sm text-slate-600">Expires {new Date(approval.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} on this device.</p>
            <div className="flex flex-col gap-3">
              <Button className="h-auto min-h-12 whitespace-normal py-3 text-base" disabled={busy} onClick={() => void decide("approved")}>Yes, accept these terms and proceed</Button>
              <Button variant="outline" className="min-h-12 text-base" disabled={busy} onClick={() => void decide("rejected")}>No, stop this request</Button>
            </div>
            {busy && <p role="status" className="text-sm text-slate-600">Saving your choice…</p>}
          </> : <div role="status" className="flex gap-3 rounded-lg bg-slate-100 p-4 text-slate-800">
            {approval.status === "approved" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
            <p>{statusText[approval.status] || "This request is no longer available."}</p>
          </div>}
        </>}
      </div>
    </main>
  );
}
