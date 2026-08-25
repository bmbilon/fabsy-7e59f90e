import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileCheck2, Save, Send, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { idrDb } from "@/lib/idr/supabase";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";

type InsuranceRisk = "trivial" | "moderate" | "material" | "uncertain";

interface AssessmentResultDraft {
  chargeSummary: string;
  keyDeadline: string;
  fineSummary: string;
  demeritImplications: string;
  insuranceRisk: InsuranceRisk;
  insuranceAssessment: string;
  financialExposure: string;
  optionsAssessment: string;
  representationEconomics: string;
  recommendation: string;
  nextStep: string;
  representationRecommended: boolean;
}

interface AssessmentIntake {
  schema_version: number;
  ticket: Record<string, string | number | null>;
  driving: Record<string, string | number | null>;
  insurance: Record<string, string | number | null>;
  attribution?: Record<string, string>;
}

interface ReviewConsent {
  schema_version: number;
  consent_version: string;
  accepted: boolean;
  digital_signature: string;
  signed_at: string;
  captured_at?: string;
}

interface AssessmentRow {
  id: string;
  ticket_number: string;
  violation: string;
  status: string;
  service_type: string;
  assessment_intake: AssessmentIntake;
  assessment_result: Record<string, unknown> | null;
  assessment_ticket_path: string;
  assessment_policy_paths: string[] | null;
  review_consent: ReviewConsent | null;
  assessment_paid_at: string | null;
  assessment_delivered_at: string | null;
  representation_credit_eligible: boolean;
  created_at: string;
  clients: { first_name: string; last_name: string; email: string; phone: string } | Array<{ first_name: string; last_name: string; email: string; phone: string }>;
}

const emptyResult: AssessmentResultDraft = {
  chargeSummary: "",
  keyDeadline: "",
  fineSummary: "",
  demeritImplications: "",
  insuranceRisk: "uncertain",
  insuranceAssessment: "",
  financialExposure: "",
  optionsAssessment: "",
  representationEconomics: "",
  recommendation: "",
  nextStep: "",
  representationRecommended: false,
};

function fromStored(result: Record<string, unknown> | null): AssessmentResultDraft {
  if (!result || result.schema_version !== 1) return emptyResult;
  return {
    chargeSummary: String(result.charge_summary || ""),
    keyDeadline: String(result.key_deadline || ""),
    fineSummary: String(result.fine_summary || ""),
    demeritImplications: String(result.demerit_implications || ""),
    insuranceRisk: (["trivial", "moderate", "material", "uncertain"].includes(String(result.insurance_risk)) ? result.insurance_risk : "uncertain") as InsuranceRisk,
    insuranceAssessment: String(result.insurance_assessment || ""),
    financialExposure: String(result.financial_exposure || ""),
    optionsAssessment: String(result.options_assessment || ""),
    representationEconomics: String(result.representation_economics || ""),
    recommendation: String(result.recommendation || ""),
    nextStep: String(result.next_step || ""),
    representationRecommended: result.representation_recommended === true,
  };
}

function relationOne<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "" || value === "unknown") return "I don't know / not supplied";
  return String(value).replace(/_/g, " ");
}

function displayDateTime(value: string | null | undefined) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminAssessmentReview() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [result, setResult] = useState<AssessmentResultDraft>(emptyResult);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session || !(await getIdrStaffRole())) {
        navigate("/admin");
        return;
      }
      const { data, error } = await idrDb.from("ticket_submissions")
        .select("id,ticket_number,violation,status,service_type,assessment_intake,assessment_result,assessment_ticket_path,assessment_policy_paths,review_consent,assessment_paid_at,assessment_delivered_at,representation_credit_eligible,created_at,clients(first_name,last_name,email,phone)")
        .eq("id", id).single();
      if (error || !data || data.service_type !== "ticket_insurance_assessment") {
        toast({ title: "Ticket Triage not found", description: "This case is not a Ticket Triage order.", variant: "destructive" });
        navigate("/admin/cases");
        return;
      }
      setAssessment(data as AssessmentRow);
      setResult(fromStored(data.assessment_result));
      setLoading(false);
    })();
  }, [id, navigate, toast]);

  const update = <K extends keyof AssessmentResultDraft>(field: K, value: AssessmentResultDraft[K]) => {
    setResult((current) => ({ ...current, [field]: value }));
  };

  const resultJson = () => ({
    schema_version: 1,
    charge_summary: result.chargeSummary.trim(),
    key_deadline: result.keyDeadline.trim(),
    fine_summary: result.fineSummary.trim(),
    demerit_implications: result.demeritImplications.trim(),
    insurance_risk: result.insuranceRisk,
    insurance_assessment: result.insuranceAssessment.trim(),
    financial_exposure: result.financialExposure.trim(),
    options_assessment: result.optionsAssessment.trim(),
    representation_economics: result.representationEconomics.trim(),
    recommendation: result.recommendation.trim(),
    next_step: result.nextStep.trim(),
    representation_recommended: result.representationRecommended,
    insurance_disclaimer: TICKET_ASSESSMENT.insuranceDisclaimer,
    service_disclaimer: TICKET_ASSESSMENT.serviceDisclaimer,
    representation_credit_enabled: TICKET_ASSESSMENT.representationCredit.enabled,
  });

  const resultComplete = Object.entries(resultJson()).every(([key, value]) => {
    if (["representation_recommended", "representation_credit_enabled"].includes(key)) return typeof value === "boolean";
    return typeof value !== "string" || value.trim().length > 0;
  });

  const save = async () => {
    if (!assessment || assessment.assessment_delivered_at) return false;
    setSaving(true);
    const { error } = await idrDb.from("ticket_submissions").update({
      assessment_result: resultJson(),
      status: assessment.status === "assessment_pending" ? "in_progress" : assessment.status,
      updated_at: new Date().toISOString(),
    }).eq("id", assessment.id).is("assessment_delivered_at", null);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return false;
    }
    setAssessment({ ...assessment, assessment_result: resultJson(), status: assessment.status === "assessment_pending" ? "in_progress" : assessment.status });
    toast({ title: "Assessment saved", description: "The structured result remains a private staff draft until delivery." });
    return true;
  };

  const deliver = async () => {
    if (!assessment || !resultComplete || assessment.assessment_delivered_at) return;
    setDelivering(true);
    if (!(await save())) {
      setDelivering(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke("send-assessment-result", { body: { submissionId: assessment.id } });
    if (error || data?.error) {
      toast({ title: "Delivery failed", description: data?.error || error?.message || "The assessment email could not be sent.", variant: "destructive" });
    } else {
      const deliveredAt = new Date().toISOString();
      setAssessment({ ...assessment, status: "completed", assessment_delivered_at: deliveredAt, assessment_result: resultJson() });
      toast({ title: "Assessment delivered", description: "The human-reviewed assessment was emailed and is now immutable." });
    }
    setDelivering(false);
  };

  const downloadPrivateDocument = async (bucket: string, path: string, fileName: string, label: string) => {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      toast({ title: "Download failed", description: error?.message || `The private ${label} could not be downloaded.`, variant: "destructive" });
      return;
    }
    const objectUrl = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  const downloadTicket = async () => {
    if (!assessment?.assessment_ticket_path) return;
    const extension = assessment.assessment_ticket_path.split(".").pop() || "pdf";
    await downloadPrivateDocument(
      "assessment-tickets",
      assessment.assessment_ticket_path,
      `assessment-ticket-${assessment.id}.${extension}`,
      "ticket",
    );
  };

  const downloadPolicyDocument = async (path: string, index: number) => {
    if (!assessment) return;
    const extension = path.split(".").pop() || "pdf";
    await downloadPrivateDocument(
      "assessment-policy-documents",
      path,
      `assessment-policy-${assessment.id}-${index + 1}.${extension}`,
      `policy document ${index + 1}`,
    );
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;
  if (!assessment) return null;
  const client = relationOne(assessment.clients);
  const locked = Boolean(assessment.assessment_delivered_at);
  const policyPaths = assessment.assessment_policy_paths || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-5">
          <Button variant="ghost" onClick={() => navigate("/admin/cases")}><ArrowLeft className="mr-2 h-4 w-4" />Back to cases</Button>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2"><Badge>Priority Ticket Review</Badge><Badge variant={locked ? "default" : "outline"}>{assessment.status.replace(/_/g, " ")}</Badge></div>
              <h1 className="mt-3 text-3xl font-bold">{client.first_name} {client.last_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{client.email} · {client.phone || "No phone supplied"} · {assessment.ticket_number}</p>
            </div>
            <Button variant="outline" onClick={() => void downloadTicket()}><Download className="mr-2 h-4 w-4" />Download private ticket</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid max-w-7xl gap-7 px-4 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Customer intake</CardTitle><CardDescription>Structured context collected before the $149 checkout.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <IntakeGroup title="Ticket" values={assessment.assessment_intake.ticket} />
              <IntakeGroup title="Driving" values={assessment.assessment_intake.driving} />
              <IntakeGroup title="Insurance" values={assessment.assessment_intake.insurance} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Private source documents</CardTitle><CardDescription>Files supplied for this human review.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div><p className="font-semibold">Traffic ticket</p><p className="text-xs text-muted-foreground">{assessment.assessment_ticket_path}</p></div>
                <Button variant="outline" size="sm" onClick={() => void downloadTicket()}><Download className="mr-2 h-4 w-4" />Download</Button>
              </div>
              {policyPaths.length ? policyPaths.map((path, index) => (
                <div key={path} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div><p className="font-semibold">Policy document {index + 1}</p><p className="text-xs text-muted-foreground">{path}</p></div>
                  <Button variant="outline" size="sm" onClick={() => void downloadPolicyDocument(path, index)}><Download className="mr-2 h-4 w-4" />Download</Button>
                </div>
              )) : <p className="text-sm text-muted-foreground">No policy documents are attached to this legacy assessment.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Signed review consent</CardTitle><CardDescription>Consent to review the supplied ticket and policy documents.</CardDescription></CardHeader>
            <CardContent>
              {assessment.review_consent ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt><dd className="mt-1"><Badge variant={assessment.review_consent.accepted ? "default" : "destructive"}>{assessment.review_consent.accepted ? "Accepted" : "Not accepted"}</Badge></dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consent version</dt><dd className="mt-1 text-sm">{assessment.review_consent.consent_version}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schema version</dt><dd className="mt-1 text-sm">{assessment.review_consent.schema_version}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Digital signature</dt><dd className="mt-1 text-sm font-medium">{assessment.review_consent.digital_signature}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed</dt><dd className="mt-1 text-sm">{displayDateTime(assessment.review_consent.signed_at)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captured by Fabsy</dt><dd className="mt-1 text-sm">{displayDateTime(assessment.review_consent.captured_at)}</dd></div>
                </dl>
              ) : <p className="text-sm text-muted-foreground">No signed review consent is stored for this legacy assessment.</p>}
            </CardContent>
          </Card>
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Review guardrails</AlertTitle>
            <AlertDescription>Use ranges or scenarios only when supportable. State uncertainty. Do not promise a court result, insurer decision or premium change.</AlertDescription>
          </Alert>
          {assessment.representation_credit_eligible ? (
            <Alert className="border-violet-200 bg-violet-50">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Priority Ticket Triage upgrade</AlertTitle>
              <AlertDescription>If representation is worthwhile and this matter is eligible, apply the $149 assessment payment to the $488 base representation fee. Quote a $339 base-fee balance plus applicable tax; priority placement and the 30% success fee on any fine reduction still apply.</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" />Human-reviewed assessment</CardTitle>
            <CardDescription>Every field is required for delivery. “Not reasonably supportable from the supplied information” is preferable to false precision.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <TextField id="charge-summary" label="Charge summary" value={result.chargeSummary} onChange={(value) => update("chargeSummary", value)} disabled={locked} />
            <div className="grid gap-5 sm:grid-cols-2">
              <InputField id="key-deadline" label="Key deadline" value={result.keyDeadline} onChange={(value) => update("keyDeadline", value)} disabled={locked} />
              <InputField id="fine-summary" label="Fine summary" value={result.fineSummary} onChange={(value) => update("fineSummary", value)} disabled={locked} />
            </div>
            <TextField id="demerit-implications" label="Demerit implications" value={result.demeritImplications} onChange={(value) => update("demeritImplications", value)} disabled={locked} />
            <div className="space-y-2"><Label htmlFor="insurance-risk">Insurance-risk classification</Label><Select value={result.insuranceRisk} onValueChange={(value) => update("insuranceRisk", value as InsuranceRisk)} disabled={locked}><SelectTrigger id="insurance-risk"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trivial">Trivial / low significance</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="material">Potentially material</SelectItem><SelectItem value="uncertain">Uncertain</SelectItem></SelectContent></Select></div>
            <TextField id="insurance-assessment" label="Insurance impact assessment" value={result.insuranceAssessment} onChange={(value) => update("insuranceAssessment", value)} disabled={locked} />
            <TextField id="financial-exposure" label="Estimated financial significance / range" value={result.financialExposure} onChange={(value) => update("financialExposure", value)} disabled={locked} />
            <TextField id="options-assessment" label="Options assessment" value={result.optionsAssessment} onChange={(value) => update("optionsAssessment", value)} disabled={locked} />
            <TextField id="representation-economics" label="Representation break-even analysis" value={result.representationEconomics} onChange={(value) => update("representationEconomics", value)} disabled={locked} />
            <TextField id="recommendation" label="Recommended action" value={result.recommendation} onChange={(value) => update("recommendation", value)} disabled={locked} />
            <TextField id="next-step" label="Fabsy action path / next step" value={result.nextStep} onChange={(value) => update("nextStep", value)} disabled={locked} />
            <div className="flex items-start gap-3 rounded-lg border p-4"><Checkbox id="representation-recommended" checked={result.representationRecommended} onCheckedChange={(value) => update("representationRecommended", value === true)} disabled={locked} /><Label htmlFor="representation-recommended" className="cursor-pointer leading-relaxed">Professional representation may be economically worthwhile and the delivery email should include the Fabsy representation path.</Label></div>

            {locked ? (
              <Alert className="border-emerald-200 bg-emerald-50"><AlertTitle>Delivered and locked</AlertTitle><AlertDescription>The emailed assessment is immutable. Create a documented correction workflow rather than changing this record.</AlertDescription></Alert>
            ) : (
              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => void save()} disabled={saving || delivering}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save private draft"}</Button>
                <Button onClick={() => void deliver()} disabled={!resultComplete || saving || delivering}><Send className="mr-2 h-4 w-4" />{delivering ? "Delivering…" : "Deliver assessment by email"}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function IntakeGroup({ title, values }: { title: string; values: Record<string, string | number | null> }) {
  return <div><h3 className="font-bold">{title}</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(values).map(([key, value]) => <div key={key} className={key === "what_happened" ? "sm:col-span-2" : ""}><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, " ")}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{display(value)}</dd></div>)}</dl></div>;
}

function TextField({ id, label, value, onChange, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={4} maxLength={5000} /></div>;
}

function InputField({ id, label, value, onChange, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} maxLength={5000} /></div>;
}
