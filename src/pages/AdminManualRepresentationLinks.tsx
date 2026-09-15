import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Link2,
  Loader2,
  Mail,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import useSafeHead from "@/hooks/useSafeHead";

type InviteStatus = "pending" | "signing" | "completed" | "document_received" | "expired" | "revoked" | string;

interface CreatedInvite {
  inviteId: string;
  status: "pending";
  expiresAt: string;
  consentUrl: string;
  emailSubject: string;
  emailBody: string;
  textMessage: string;
}

interface PreparedInvite extends CreatedInvite {
  preparedFor: string;
}

interface RecentInvite {
  inviteId: string;
  status: InviteStatus;
  clientName: string;
  clientEmail: string;
  ticketNumber: string;
  ticketNumbers?: string[];
  chargeDescription: string;
  expiresAt: string;
  createdAt: string | null;
  hasReplacement?: boolean;
}

interface InviteListResponse {
  invites: RecentInvite[];
}

interface InviteForm {
  firstName: string;
  lastName: string;
  email: string;
  ticketNumber: string;
  chargeDescription: string;
  offenceDateText: string;
  courtLocation: string;
  courtDateText: string;
  matterDetails: string;
  expiresInDays: number;
}

const EMPTY_FORM: InviteForm = {
  firstName: "",
  lastName: "",
  email: "",
  ticketNumber: "",
  chargeDescription: "",
  offenceDateText: "",
  courtLocation: "",
  courtDateText: "",
  matterDetails: "",
  expiresInDays: 7,
};

const REISSUABLE_STATUSES = new Set<InviteStatus>(["pending", "expired", "revoked"]);

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayStatus(invite: RecentInvite) {
  if (invite.status === "pending" && new Date(invite.expiresAt).getTime() <= Date.now()) return "expired";
  return invite.status.replaceAll("_", " ");
}

function statusVariant(invite: RecentInvite): "default" | "secondary" | "destructive" | "outline" {
  const status = displayStatus(invite);
  if (status === "completed" || status === "document received") return "default";
  if (status === "expired" || status === "revoked") return "destructive";
  if (status === "pending" || status === "signing") return "secondary";
  return "outline";
}

async function consentInviteErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const responseMessage = typeof body?.error === "string" ? body.error : body?.message;
    if (typeof responseMessage === "string" && responseMessage.trim()) return responseMessage;
  }
  if (error instanceof Error && error.message && !/^Failed to send a request to the Edge Function/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}

export default function AdminManualRepresentationLinks() {
  const navigate = useNavigate();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [created, setCreated] = useState<PreparedInvite | null>(null);
  const [recentInvites, setRecentInvites] = useState<RecentInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [reissuingId, setReissuingId] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState("");
  const operationBusy = busy || Boolean(reissuingId);

  useSafeHead({ title: "Consent Invitations | Fabsy Admin", robots: "noindex, nofollow" });

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    setListError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<InviteListResponse>("consent-invite-admin", {
        body: { action: "list", limit: 50 },
      });
      if (invokeError || !Array.isArray(data?.invites)) {
        throw new Error(await consentInviteErrorMessage(invokeError, "Recent consent invitations could not be loaded."));
      }
      setRecentInvites(data.invites);
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : "Recent consent invitations could not be loaded.");
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        navigate("/admin", { replace: true });
        return;
      }
      try {
        const role = await getIdrStaffRole();
        if (!active) return;
        if (!role) {
          navigate("/admin", { replace: true });
          return;
        }
        await loadInvites();
      } catch {
        if (active) navigate("/admin", { replace: true });
      } finally {
        if (active) setCheckingAccess(false);
      }
    })();
    return () => { active = false; };
  }, [loadInvites, navigate]);

  const update = <K extends keyof InviteForm>(field: K, value: InviteForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setCreated(null);
    setCopied("");
    setCopyError("");
    setError("");
  };

  const createInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setCopied("");
    setCopyError("");
    setCreated(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<CreatedInvite>("consent-invite-admin", {
        body: {
          action: "create",
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          ticketNumber: form.ticketNumber.trim(),
          chargeDescription: form.chargeDescription.trim(),
          offenceDateText: form.offenceDateText.trim() || undefined,
          courtLocation: form.courtLocation.trim() || undefined,
          courtDateText: form.courtDateText.trim() || undefined,
          matterDetails: form.matterDetails.trim() || undefined,
          expiresInDays: form.expiresInDays,
        },
      });
      if (invokeError || !data?.consentUrl || !data.emailSubject || !data.emailBody || !data.textMessage) {
        throw new Error(await consentInviteErrorMessage(invokeError, "The private consent invitation could not be created."));
      }
      setCreated({
        ...data,
        preparedFor: `${form.firstName.trim()} ${form.lastName.trim()} · ${form.ticketNumber.trim()}`,
      });
      await loadInvites();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The private consent invitation could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const reissueInvite = async (invite: RecentInvite) => {
    if (reissuingId) return;
    setReissuingId(invite.inviteId);
    setError("");
    setListError("");
    setCopied("");
    setCopyError("");
    setCreated(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<CreatedInvite>("consent-invite-admin", {
        body: { action: "reissue", inviteId: invite.inviteId },
      });
      if (invokeError || !data?.consentUrl || !data.emailSubject || !data.emailBody || !data.textMessage) {
        throw new Error(await consentInviteErrorMessage(invokeError, "The consent invitation could not be reissued."));
      }
      setCreated({
        ...data,
        preparedFor: `${invite.clientName} · ${invite.ticketNumbers?.filter(Boolean).join(", ") || invite.ticketNumber}`,
      });
      await loadInvites();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : "The consent invitation could not be reissued.");
    } finally {
      setReissuingId("");
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setCopyError("");
    } catch {
      setCopied("");
      setCopyError("Clipboard access is unavailable. Select the text and copy it manually.");
    }
  };

  if (checkingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Checking staff access" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-background/95">
        <div className="container mx-auto px-4 py-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/admin/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Back to Dashboard
          </Button>
          <h1 className="mt-2 text-2xl font-bold">Consent Invitations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Create a private consent link, then copy the prepared email or text message to the named client.
          </p>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Client and ticket</CardTitle>
              <CardDescription>Enter the details that will appear on the client&apos;s secure representation consent.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={createInvite} aria-busy={operationBusy}>
                <fieldset className="space-y-5" disabled={operationBusy}>
                <legend className="sr-only">Client and ticket details</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-first-name">Legal first name</Label>
                    <Input id="invite-first-name" required maxLength={100} autoComplete="off" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-last-name">Legal last name</Label>
                    <Input id="invite-last-name" required maxLength={100} autoComplete="off" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Client email</Label>
                  <Input id="invite-email" required type="email" minLength={3} maxLength={320} autoComplete="off" value={form.email} onChange={(event) => update("email", event.target.value)} />
                  <p className="text-xs text-muted-foreground">The address identifies the client record; creating the invitation does not send an email automatically.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-ticket-number">Ticket number</Label>
                  <Input id="invite-ticket-number" required maxLength={120} autoComplete="off" autoCapitalize="characters" spellCheck={false} value={form.ticketNumber} onChange={(event) => update("ticketNumber", event.target.value.toUpperCase())} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-charge">Charge description</Label>
                  <Input id="invite-charge" required maxLength={500} autoComplete="off" placeholder="For example: Speeding" value={form.chargeDescription} onChange={(event) => update("chargeDescription", event.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-offence-date">Offence date <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="invite-offence-date" maxLength={100} autoComplete="off" placeholder="September 15, 2026" value={form.offenceDateText} onChange={(event) => update("offenceDateText", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-court-date">Court/respond-by date <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="invite-court-date" maxLength={100} autoComplete="off" placeholder="September 16, 2026 at 9:30 a.m." value={form.courtDateText} onChange={(event) => update("courtDateText", event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-court-location">Court location <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="invite-court-location" maxLength={200} autoComplete="off" placeholder="Calgary Traffic Court" value={form.courtLocation} onChange={(event) => update("courtLocation", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-details">Matter details <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea id="invite-details" maxLength={2000} className="min-h-24" placeholder="Add only details the client should see on the consent." value={form.matterDetails} onChange={(event) => update("matterDetails", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-expiry">Link expires after</Label>
                  <Select value={String(form.expiresInDays)} onValueChange={(value) => update("expiresInDays", Number(value))}>
                    <SelectTrigger id="invite-expiry"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {error ? <Alert variant="destructive"><AlertTitle>Invitation not created</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
                <Button type="submit" className="w-full" disabled={operationBusy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Create consent invitation
                </Button>
                <p className="text-xs leading-relaxed text-muted-foreground">The link is a private bearer credential. Send it only to the named client and never post it publicly.</p>
                </fieldset>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Copy and send</CardTitle>
              <CardDescription>Choose the prepared wording for email or text. Fabsy does not send either message from this page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!created ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  <Mail className="mx-auto mb-3 h-9 w-9 opacity-60" aria-hidden="true" />
                  <p>Create or reissue an invitation to prepare the private link.</p>
                </div>
              ) : (
                <>
                  <Alert>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Consent invitation ready</AlertTitle>
                    <AlertDescription>{created.preparedFor}. Nothing has been sent yet. This link expires {formatDateTime(created.expiresAt)}.</AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label htmlFor="consent-link">Private consent link</Label>
                    <div className="flex gap-2">
                      <Input id="consent-link" readOnly value={created.consentUrl} onFocus={(event) => event.currentTarget.select()} />
                      <Button type="button" variant="outline" aria-label="Copy private consent link" onClick={() => void copy(created.consentUrl, "Consent link")}><Copy className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-subject">Email subject</Label>
                    <Input id="email-subject" readOnly value={created.emailSubject} onFocus={(event) => event.currentTarget.select()} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-body">Email body</Label>
                    <Textarea id="email-body" readOnly className="min-h-64" value={created.emailBody} onFocus={(event) => event.currentTarget.select()} />
                  </div>
                  <Button type="button" className="w-full" variant="secondary" onClick={() => void copy(`Subject: ${created.emailSubject}\n\n${created.emailBody}`, "Email")}>
                    <Mail className="mr-2 h-4 w-4" aria-hidden="true" />Copy complete email
                  </Button>
                  <div className="space-y-2 border-t pt-5">
                    <Label htmlFor="text-message">Text message</Label>
                    <Textarea id="text-message" readOnly className="min-h-36" value={created.textMessage} onFocus={(event) => event.currentTarget.select()} />
                  </div>
                  <Button type="button" className="w-full" variant="secondary" onClick={() => void copy(created.textMessage, "Text message")}>
                    <MessageSquareText className="mr-2 h-4 w-4" aria-hidden="true" />Copy text message
                  </Button>
                  {copyError ? <Alert variant="destructive"><AlertTitle>Copy unavailable</AlertTitle><AlertDescription>{copyError}</AlertDescription></Alert> : null}
                  {copied ? <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-700">{copied} copied.</p> : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Recent consent invitations</CardTitle>
              <CardDescription className="mt-1">Review status and expiry without exposing a client&apos;s driver&apos;s licence or plate number.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={loadingInvites || operationBusy} onClick={() => void loadInvites()}>
              {loadingInvites ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {listError ? <Alert variant="destructive" className="mb-4"><AlertTitle>Invitations unavailable</AlertTitle><AlertDescription>{listError}</AlertDescription></Alert> : null}
            {loadingInvites && !recentInvites.length ? (
              <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />Loading invitations…</div>
            ) : recentInvites.length ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Ticket</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Charge</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Expires</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recentInvites.map((invite) => {
                      const ticketNumbers = invite.ticketNumbers?.filter(Boolean).join(", ") || invite.ticketNumber;
                      const canReissue = REISSUABLE_STATUSES.has(invite.status) && !invite.hasReplacement;
                      return (
                        <tr key={invite.inviteId} className="align-top">
                          <td className="px-4 py-4"><p className="font-medium text-foreground">{invite.clientName}</p><p className="mt-1 text-xs text-muted-foreground">{invite.clientEmail}</p></td>
                          <td className="px-4 py-4 font-mono text-xs font-medium">{ticketNumbers}</td>
                          <td className="max-w-64 px-4 py-4">{invite.chargeDescription}</td>
                          <td className="px-4 py-4"><Badge variant={statusVariant(invite)} className="capitalize">{displayStatus(invite)}</Badge></td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">{formatDateTime(invite.createdAt)}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">{formatDateTime(invite.expiresAt)}</td>
                          <td className="px-4 py-4 text-right">
                            <Button type="button" variant="outline" size="sm" disabled={!canReissue || operationBusy} onClick={() => void reissueInvite(invite)}>
                              {reissuingId === invite.inviteId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
                              {invite.hasReplacement ? "Reissued" : "Reissue"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No consent invitations have been created yet.</div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
