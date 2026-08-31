import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, MessageCircle, MessageSquare, RefreshCw, Users } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import useSafeHead from "@/hooks/useSafeHead";
import { referralClientNote, referralDate, referralMoney, referralStatusLabel, requestReferralProgram } from "@/lib/referral-program";
import type { ReferralDashboard, ReferralProfile } from "@/lib/referral-program";

const emptyProfile: ReferralProfile = { legal_name: "", address_line1: "", address_line2: "", city: "", province: "AB", postal_code: "", payout_email: "" };
const provinces = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;

function profileForm(profile: ReferralProfile | null): ReferralProfile {
  return {
    legal_name: profile?.legal_name || "",
    address_line1: profile?.address_line1 || "",
    address_line2: profile?.address_line2 || "",
    city: profile?.city || "",
    province: profile?.province || "AB",
    postal_code: profile?.postal_code || "",
    payout_email: profile?.payout_email || "",
  };
}

function ReferralContent() {
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [profile, setProfile] = useState<ReferralProfile>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [messageType, setMessageType] = useState("general");
  const [experienceConfirmed, setExperienceConfirmed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    requestReferralProgram<ReferralDashboard>({ action: "dashboard" })
      .then((data) => {
        if (!active) return;
        setDashboard(data);
        setProfile(profileForm(data.profile));
      })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load your referrals."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const copy = async (value: string, label: string) => {
    setNotice("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Copy is unavailable in this browser. Select the text and copy it manually.");
    }
  };

  const loadMore = async () => {
    if (!dashboard?.next_cursor) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const data = await requestReferralProgram<ReferralDashboard>({ action: "dashboard", cursor: dashboard.next_cursor });
      setDashboard((current) => current ? {
        ...data,
        referrals: [...current.referrals, ...data.referrals.filter((row) => !current.referrals.some((existing) => existing.id === row.id))],
        payout_history: [...current.payout_history, ...data.payout_history.filter((row) => !current.payout_history.some((existing) => existing.id === row.id))],
      } : data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load older referrals.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice("");
    try {
      const data = await requestReferralProgram<ReferralDashboard>({ action: "save_profile", ...profile });
      setDashboard(data);
      setProfile(profileForm(data.profile));
      setNotice("Payout details saved. This does not send an e-transfer.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save payout details.");
    } finally {
      setIsSaving(false);
    }
  };

  const shortLink = dashboard ? `fabsy.ca/r/${dashboard.code}` : "";
  const personalMessage = `Got a ticket? Fabsy fought mine for a flat $198, no success fee, no court. Use my link: ${shortLink}`;
  const generalMessage = `Got an Alberta ticket? Fabsy offers pre-trial ticket help for a flat fee, with no success fee. Use my link: ${shortLink}`;
  const shareMessage = `${messageType === "personal" ? personalMessage : generalMessage}\n\nI may receive a referral payment if you use my link. Current officer-ticket pricing is $198 CAD + GST; verified pro driver pricing is available. Trial is separate, and court attendance may still be required.`;
  const canShare = messageType !== "personal" || (dashboard?.is_past_client && experienceConfirmed);
  const updateProfile = (field: keyof ReferralProfile, value: string) => setProfile((current) => ({ ...current, [field]: value }));

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Badge>Private portal</Badge><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Refer a driver</h1><p className="mt-3 max-w-2xl text-muted-foreground">Your link, referral status and completed Interac payouts in one place.</p></div>
        <nav aria-label="Portal navigation" className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/portal/cases">My cases</Link></Button><Button asChild variant="outline"><Link to="/portal/insurance-reports">My reports</Link></Button></nav>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">$50 for an eligible officer ticket. $20 for an eligible camera ticket. No cap. <Link to="/refer#referral-terms" className="font-medium text-primary underline underline-offset-4">Program terms</Link></p>
      <div aria-live="polite" role="status" className="my-4 text-sm font-medium text-primary">{notice}</div>
      {error ? <Alert variant="destructive" className="mb-5"><AlertTitle>Something needs attention</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" className="ml-3 mt-2" disabled={isSaving || isLoadingMore} onClick={() => setReload((value) => value + 1)}>Try again</Button></AlertDescription></Alert> : null}
      {isLoading ? <p role="status" className="py-12 text-muted-foreground">Loading your referral program…</p> : dashboard ? (
        <>
          {dashboard.profile_required ? <Alert className="mb-6 border-primary/30"><AlertTitle>Complete your payout details</AlertTitle><AlertDescription>We need your legal name and address before your second payout. <a href="#payout-profile" className="underline underline-offset-4">Add them below.</a></AlertDescription></Alert> : null}
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" aria-hidden="true" /> Your referral link</CardTitle><CardDescription>Sharing is your choice. These buttons open a message for you to review.</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div><Label htmlFor="referral-code">Your code</Label><Input id="referral-code" readOnly value={dashboard.code} className="mt-2 font-mono font-semibold" onFocus={(event) => event.currentTarget.select()} /></div>
                <div><Label htmlFor="referral-link">Share link</Label><div className="mt-2 flex gap-2"><Input id="referral-link" readOnly value={dashboard.share_url} onFocus={(event) => event.currentTarget.select()} /><Button variant="outline" aria-label="Copy referral link" onClick={() => void copy(dashboard.share_url, "Referral link")}><Copy className="h-4 w-4" aria-hidden="true" /></Button></div></div>
                <div className="space-y-2">
                  <Label htmlFor="referral-message-type">Choose your message</Label>
                  <select id="referral-message-type" value={messageType} onChange={(event) => { setMessageType(event.target.value); setExperienceConfirmed(false); }} className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="general">A general recommendation</option>
                    <option value="personal" disabled={!dashboard.is_past_client}>My $198 ticket experience</option>
                  </select>
                </div>
                {messageType === "personal" ? <div className="flex items-start gap-3 rounded-lg border p-3"><Checkbox id="referral-experience-confirmed" checked={experienceConfirmed} onCheckedChange={(checked) => setExperienceConfirmed(checked === true)} /><Label htmlFor="referral-experience-confirmed" className="text-sm font-normal leading-relaxed">Fabsy handled my ticket for $198 before GST, charged no success fee, and I did not go to court. This describes my own experience.</Label></div> : null}
                <div className="space-y-2"><Label htmlFor="referral-message">Message preview</Label><Textarea id="referral-message" value={shareMessage} readOnly rows={7} onFocus={(event) => event.currentTarget.select()} /></div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={!canShare} onClick={() => void copy(shareMessage, "Share message")}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy message</Button>
                  {canShare ? <><Button asChild variant="outline"><a href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />WhatsApp</a></Button><Button asChild variant="outline"><a href={`sms:?body=${encodeURIComponent(shareMessage)}`}><MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />SMS</a></Button></> : <><Button variant="outline" disabled>WhatsApp</Button><Button variant="outline" disabled>SMS</Button></>}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">Only share personal claims that are true for you. The general message works for new users, discounted clients and camera-ticket clients. Let the driver know you may earn a referral payment.</p>
              </CardContent>
            </Card>
            <div className="space-y-6">
              <Card><CardHeader><CardDescription>Paid this calendar year</CardDescription><CardTitle className="text-4xl">{referralMoney(dashboard.year_to_date_paid)} <span className="text-sm font-normal text-muted-foreground">CAD</span></CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground"><p>Rewards are paid seven days after both payment settlement and acceptance of the Alberta file, subject to eligibility and payout checks.</p><p>Fleet accounts, self-referrals and refunded or disputed orders do not produce an automatic payout.</p>{dashboard.tax_reporting_review ? <p className="font-medium text-foreground">Your payments have passed $500 this calendar year. Fabsy will review any required tax reporting and contact you securely if more information is needed.</p> : null}</CardContent></Card>
              <Card id="payout-profile" className="scroll-mt-24">
                <CardHeader><CardTitle>Payout details</CardTitle><CardDescription>Legal name and address are required before the second payout. Do not enter a SIN here.</CardDescription></CardHeader>
                <CardContent>
                  <form onSubmit={saveProfile} className="space-y-4">
                    <div className="space-y-2"><Label htmlFor="referral-legal-name">Legal name</Label><Input id="referral-legal-name" autoComplete="name" required minLength={2} maxLength={160} value={profile.legal_name} onChange={(event) => updateProfile("legal_name", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="referral-payout-email">Interac delivery email</Label><Input id="referral-payout-email" type="email" autoComplete="email" maxLength={254} value={profile.payout_email} onChange={(event) => updateProfile("payout_email", event.target.value)} /><p className="text-xs text-muted-foreground">If blank, your verified portal email is used.</p></div>
                    <div className="space-y-2"><Label htmlFor="referral-address1">Canadian street address</Label><Input id="referral-address1" autoComplete="address-line1" required minLength={3} maxLength={200} value={profile.address_line1} onChange={(event) => updateProfile("address_line1", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="referral-address2">Unit or address line 2 (optional)</Label><Input id="referral-address2" autoComplete="address-line2" maxLength={160} value={profile.address_line2} onChange={(event) => updateProfile("address_line2", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="referral-city">City</Label><Input id="referral-city" autoComplete="address-level2" required minLength={2} maxLength={100} value={profile.city} onChange={(event) => updateProfile("city", event.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label htmlFor="referral-province">Province / territory</Label><select id="referral-province" autoComplete="address-level1" required value={profile.province} onChange={(event) => updateProfile("province", event.target.value)} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{provinces.map((province) => <option key={province} value={province}>{province}</option>)}</select></div>
                      <div className="space-y-2"><Label htmlFor="referral-postal-code">Postal code</Label><Input id="referral-postal-code" autoComplete="postal-code" autoCapitalize="characters" required minLength={6} maxLength={7} value={profile.postal_code} onChange={(event) => updateProfile("postal_code", event.target.value)} /></div>
                    </div>
                    <Button type="submit" disabled={isSaving} className="w-full">{isSaving ? "Saving…" : "Save payout details"}</Button>
                    <p className="text-xs leading-relaxed text-muted-foreground">Used for payout administration, fraud checks and required tax reporting. Saving does not send a payment. <Link to="/privacy-policy" className="underline underline-offset-4">Privacy Policy</Link></p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="mt-8"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Referral status</CardTitle><CardDescription className="mt-2">The driver's case details stay private. Amounts are CAD.</CardDescription></div><Button variant="outline" size="sm" disabled={isSaving || isLoadingMore} onClick={() => setReload((value) => value + 1)}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Refresh</Button></div></CardHeader><CardContent>
            {dashboard.referrals.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No referrals yet. Share your link with a driver who could use help; a referral appears here when their order is recorded.</p> : <Table><TableHeader><TableRow><TableHead>Referral</TableHead><TableHead>Ticket</TableHead><TableHead>Reward</TableHead><TableHead>Status</TableHead><TableHead>Earliest payout</TableHead><TableHead>Update</TableHead></TableRow></TableHeader><TableBody>{dashboard.referrals.map((referral) => <TableRow key={referral.id}><TableCell className="whitespace-nowrap">{referralDate(referral.created_at)}<span className="mt-1 block font-mono text-xs text-muted-foreground">{referral.id.slice(0, 8)}</span></TableCell><TableCell>{referral.ticket_type === "camera" ? "Camera" : "Officer"}</TableCell><TableCell>{referralMoney(referral.amount)}</TableCell><TableCell><Badge variant={referral.status === "paid" ? "default" : "outline"}>{referralStatusLabel(referral.status)}</Badge></TableCell><TableCell className="whitespace-nowrap">{referralDate(referral.eligible_at)}</TableCell><TableCell className="min-w-44 text-sm text-muted-foreground">{referralClientNote(referral)}</TableCell></TableRow>)}</TableBody></Table>}
          </CardContent></Card>
          <Card className="mt-6"><CardHeader><CardTitle>Payout history</CardTitle><CardDescription>Completed transfers for the referrals loaded below. Use “Load older referrals” for earlier history.</CardDescription></CardHeader><CardContent>{dashboard.payout_history.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No completed payouts in the loaded history.</p> : <Table><TableHeader><TableRow><TableHead>Paid</TableHead><TableHead>Referral</TableHead><TableHead>Amount (CAD)</TableHead><TableHead>Method</TableHead></TableRow></TableHeader><TableBody>{dashboard.payout_history.map((payout) => <TableRow key={payout.id}><TableCell>{referralDate(payout.paid_at)}</TableCell><TableCell className="font-mono text-xs">{payout.id.slice(0, 8)}</TableCell><TableCell>{referralMoney(payout.amount)}</TableCell><TableCell>Interac e-transfer</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
          {dashboard.next_cursor ? <div className="mt-6 text-center"><Button variant="outline" onClick={() => void loadMore()} disabled={isLoadingMore || isSaving}>{isLoadingMore ? "Loading…" : "Load older referrals"}</Button></div> : null}
        </>
      ) : null}
    </main>
  );
}

export default function ReferralPortal() {
  useSafeHead({ title: "Refer a Driver | Your Fabsy Portal", robots: "noindex, nofollow" });
  return <div className="min-h-screen bg-background"><Header /><IdrAccessGate redirectPath="/portal/referrals" title="Sign in or join the referral program" description="Use your email to sign in or create a free portal account. No previous purchase is required. We'll send a secure sign-in link." emailLabel="Email address"><ReferralContent /></IdrAccessGate><Footer /></div>;
}
