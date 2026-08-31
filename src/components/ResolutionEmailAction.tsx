import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface ResolutionPreview {
  fingerprint: string;
  recipient: string;
  subject: string;
  mainCopy: string;
  referralInvitation: string;
  referralTerms: string;
  invitationAvailable: boolean;
  invitationUnavailableReason: string | null;
}

export interface ResolutionEmailActionProps {
  submissionId: string;
  outcomeSaved: boolean;
  className?: string;
}

export function ResolutionEmailAction({ submissionId, outcomeSaved, className }: ResolutionEmailActionProps) {
  const id = useId();
  const activeRequest = useRef(false);
  const currentSubmission = useRef(submissionId);
  currentSubmission.current = submissionId;
  const [preview, setPreview] = useState<ResolutionPreview | null>(null);
  const [includeInvitation, setIncludeInvitation] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setPreview(null);
    setIncludeInvitation(false);
    setReviewConfirmed(false);
    setError("");
    setNotice("");
  }, [submissionId, outcomeSaved]);

  const request = async (send: boolean) => {
    if (!outcomeSaved || activeRequest.current || (send && (!preview || !reviewConfirmed))) return;
    activeRequest.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const requestSubmission = submissionId;
    try {
      const { data, error: requestError } = await supabase.functions.invoke("send-idr-case-update", {
        body: {
          submissionId, event: "case_resolved", preview: !send,
          previewFingerprint: send ? preview?.fingerprint : undefined,
          includeReferralInvite: send && includeInvitation,
          referralConsentConfirmed: send && includeInvitation,
        },
      });
      if (requestError) {
        const context = (requestError as { context?: unknown }).context;
        const detail = context instanceof Response ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error || "The resolution update could not be prepared or sent. Check its email event before retrying.");
      }
      if (!data?.success) throw new Error(data?.error || "The resolution update could not be confirmed.");
      if (currentSubmission.current !== requestSubmission) return;
      if (!send) {
        if (!data.preview?.recipient || !data.preview?.mainCopy || !data.preview?.fingerprint) throw new Error("The email preview is incomplete.");
        setPreview(data.preview as ResolutionPreview);
        setReviewConfirmed(false);
        setIncludeInvitation(false);
      } else {
        setPreview(null);
        setReviewConfirmed(false);
        setIncludeInvitation(false);
        setNotice(data.skipped === "already_sent" ? "This outcome's resolution email was already accepted by the email provider. No duplicate was sent."
          : data.skipped === "already_processing" ? "This outcome's email is already being processed. Check its email event before retrying."
            : "The email provider accepted this resolution update. Delivery is not guaranteed; check the provider record if needed.");
      }
    } catch (caught) {
      if (currentSubmission.current === requestSubmission) setError(caught instanceof Error ? caught.message : "The resolution update could not be confirmed.");
    } finally {
      activeRequest.current = false;
      setBusy(false);
    }
  };

  return (
    <section className={className} aria-label="Resolution email">
      <div className="space-y-3 rounded-lg border bg-background p-4">
        <div><h3 className="font-semibold">Resolution email</h3><p className="mt-1 text-sm text-muted-foreground">Review the saved result and recipient before sending. Saving an outcome does not send this email.</p></div>
        {!outcomeSaved ? <p className="text-sm text-muted-foreground">Save a final outcome to review its email.</p> : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {notice ? <p role="status" className="text-sm">{notice}</p> : null}
        {preview ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md bg-muted/40 p-4 text-sm">
              <p className="break-all"><strong>To:</strong> {preview.recipient}</p>
              <p><strong>Subject:</strong> {preview.subject}</p>
              <p className="leading-relaxed">{preview.mainCopy}</p>
              <p className="text-muted-foreground">Includes the ticket details and a link to the private case page.</p>
              {includeInvitation ? <><p>{preview.referralInvitation}</p><p className="text-xs leading-relaxed">{preview.referralTerms} The email includes the client's own referral link, Fabsy's mailing details and an unsubscribe option.</p></> : null}
            </div>
            {preview.invitationAvailable ? <div className="flex items-start gap-3"><Checkbox id={`${id}-referral`} checked={includeInvitation} disabled={busy} onCheckedChange={(checked) => { setIncludeInvitation(checked === true); setReviewConfirmed(false); }} /><Label htmlFor={`${id}-referral`} className="text-sm font-normal leading-relaxed">Include the referral invitation. I checked this client's consent and unsubscribe preferences and confirmed they may receive it.</Label></div> : <p className="text-xs leading-relaxed text-muted-foreground">{preview.invitationUnavailableReason}</p>}
            <div className="flex items-start gap-3"><Checkbox id={`${id}-reviewed`} checked={reviewConfirmed} disabled={busy} onCheckedChange={(checked) => setReviewConfirmed(checked === true)} /><Label htmlFor={`${id}-reviewed`} className="text-sm font-normal leading-relaxed">I reviewed the saved result and recipient and want to send this email now.</Label></div>
            <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !reviewConfirmed} onClick={() => void request(true)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="mr-2 h-4 w-4" aria-hidden="true" />}Send reviewed resolution email</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button></div>
          </div>
        ) : <Button type="button" variant="outline" disabled={busy || !outcomeSaved} onClick={() => void request(false)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="mr-2 h-4 w-4" aria-hidden="true" />}Review resolution email</Button>}
      </div>
    </section>
  );
}
