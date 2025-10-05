import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import type { FormData } from "@/components/TicketForm";

const DisputeConfirmPage = () => {
  type LocationState = { state?: { prefillTicketData?: Partial<FormData> | null } };
  const location = useLocation() as unknown as LocationState;
  const navigate = useNavigate();
  const { toast } = useToast();

  // Try to get prefill from navigation state first; otherwise from localStorage
  const rawPrefill = useMemo(() => {
    const fromState = location?.state?.prefillTicketData ?? null;
    if (fromState) return fromState;

    try {
      const primary = localStorage.getItem('eligibility-ocr-data');
      if (primary) return JSON.parse(primary);
      const backup = localStorage.getItem('eligibility-ocr-data-backup');
      if (backup) return JSON.parse(backup);
    } catch (e) {
      console.warn('[DisputeConfirm] Failed parsing localStorage data', e);
    }
    return null;
  }, [location?.state]);

  // Normalize and coerce into Partial<FormData>
  const prefill: Partial<FormData> | null = useMemo(() => {
    if (!rawPrefill) return null;
    const coerceDate = (v: unknown) => {
      if (!v) return undefined;
      if (v instanceof Date) return v;
      if (typeof v === 'string') {
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
      }
      return undefined;
    };

    return {
      ticketNumber: rawPrefill.ticketNumber || '',
      issueDate: coerceDate(rawPrefill.issueDate),
      location: rawPrefill.location || '',
      officer: rawPrefill.officer || '',
      officerBadge: rawPrefill.officerBadge || '',
      offenceSection: rawPrefill.offenceSection || '',
      offenceSubSection: rawPrefill.offenceSubSection || '',
      offenceDescription: rawPrefill.offenceDescription || '',
      violation: rawPrefill.violation || '',
      fineAmount: rawPrefill.fineAmount || rawPrefill.fine || '',
      courtDate: coerceDate(rawPrefill.courtDate),
      courtJurisdiction: rawPrefill.courtJurisdiction || '',
    } as Partial<FormData>;
  }, [rawPrefill]);

  useEffect(() => {
    // Ensure page starts at the top
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const proceed = () => {
    if (!prefill) {
      toast({ title: 'No ticket data found', description: 'Please go back and scan your ticket again.', variant: 'destructive' });
      navigate('/');
      return;
    }

    // Persist to localStorage as well for resilience
    try {
      // Store a serializable form (dates as ISO) for backup
      const backup = {
        ...prefill,
        issueDate: prefill.issueDate ? prefill.issueDate.toISOString() : undefined,
        courtDate: prefill.courtDate ? prefill.courtDate.toISOString() : undefined,
      };
      localStorage.setItem('eligibility-ocr-data', JSON.stringify(backup));
    } catch (e) {
      console.warn('[DisputeConfirm] Failed saving localStorage backup', e);
    }

    // Navigate to the ticket form passing prefill through state
    navigate('/ticket-form', { state: { prefillTicketData: prefill } });
  };

  const goBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="text-center mb-8">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">Ready to Dispute</Badge>
          <h1 className="text-3xl font-bold">Confirm and Proceed</h1>
          <p className="text-muted-foreground mt-2">We will use the details below to pre-fill your dispute form.</p>
        </div>

        <Card className="p-6 bg-gradient-card border-primary/10 shadow-fab">
          {prefill ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium">Ticket Number</div>
                <div className="bg-background/50 p-2 rounded mt-1">{prefill.ticketNumber || '—'}</div>
              </div>
              <div>
                <div className="font-medium">Fine Amount</div>
                <div className="bg-background/50 p-2 rounded mt-1">{prefill.fineAmount || '—'}</div>
              </div>
              <div>
                <div className="font-medium">Issue Date</div>
                <div className="bg-background/50 p-2 rounded mt-1">{prefill.issueDate ? prefill.issueDate.toDateString() : '—'}</div>
              </div>
              <div>
                <div className="font-medium">Court Date</div>
                <div className="bg-background/50 p-2 rounded mt-1">{prefill.courtDate ? prefill.courtDate.toDateString() : '—'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="font-medium">Location</div>
                <div className="bg-background/50 p-2 rounded mt-1">{prefill.location || '—'}</div>
              </div>
              <div>
                <div className="font-medium">Officer</div>
                <div className="bg-background/50 p-2 rounded mt-1">{prefill.officer || '—'}</div>
              </div>
              <div>
                <div className="font-medium">Badge</div>
                <div className="bg-background/50 p-2 rounded mt-1">{prefill.officerBadge || '—'}</div>
              </div>
              {(prefill.offenceSection || prefill.offenceSubSection || prefill.offenceDescription) && (
                <div className="md:col-span-2">
                  <div className="font-medium">Offence</div>
                  <div className="bg-background/50 p-2 rounded mt-1">
                    {prefill.offenceSection && <span className="mr-2">Sec. {prefill.offenceSection}</span>}
                    {prefill.offenceSubSection && <span className="mr-2">Subsec. {prefill.offenceSubSection}</span>}
                    {prefill.offenceDescription && <span>{prefill.offenceDescription}</span>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground">No ticket data found. Please go back and scan your ticket again.</div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Button variant="outline" onClick={goBack} className="flex-1">Go Back</Button>
            <Button onClick={proceed} className="flex-1 bg-gradient-primary hover:opacity-90">
              Proceed with Form Submission to Dispute your Ticket
            </Button>
          </div>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default DisputeConfirmPage;