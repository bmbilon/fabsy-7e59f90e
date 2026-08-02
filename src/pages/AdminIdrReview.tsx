import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import { useToast } from "@/hooks/use-toast";
import {
  IDR_CONVICTION_AGING_YEARS,
  IDR_DISCLAIMER,
  IDR_INSURER_RULE_MAX_AGE_DAYS,
  IDR_MAX_CARRIERS_TO_CALL,
  IDR_MIN_CARRIERS_TO_CALL,
} from "@/config/idr";
import { albertaGrid2026 } from "@/data/alberta-grid";
import {
  addCalendarYears,
  generateIdrReport,
  type ConvictionClass,
  type AlbertaGridContext,
  type IdrReport,
  type InsurerRule,
  type ParsedConviction,
  type TicketScenarioInput,
  type TicketParticulars,
} from "@/lib/idr";
import type { IdrClientIntake } from "@/lib/idr/intake";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import useSafeHead from "@/hooks/useSafeHead";

// New IDR tables land ahead of the generated Supabase client types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const idrDb = supabase as any;

type StaffRole = "admin" | "case_manager";

interface ClientSummary {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface TicketSubmissionSummary {
  ticket_number?: string | null;
  violation?: string | null;
  violation_date?: string | null;
  court_location?: string | null;
}

interface IdrOrderDetail {
  id: string;
  type: "standalone" | "addon";
  price_paid: number;
  status: "paid" | "awaiting_abstract" | "in_review" | "delivered";
  created_at: string;
  intake_json: IdrClientIntake | null;
  intake_completed_at: string | null;
  clients?: ClientSummary | ClientSummary[] | null;
  ticket_submissions?: TicketSubmissionSummary | TicketSubmissionSummary[] | null;
}

interface AbstractRecord {
  id: string;
  idr_order_id: string;
  file_url: string;
  parsed_json: StoredTranscription | null;
  parse_status: "pending" | "parsed" | "manual_review";
  uploaded_at: string;
  review_started_at: string | null;
  review_started_by: string | null;
  review_version: number;
}

interface AbstractReviewClaim {
  id: string;
  file_url: string;
  review_started_at: string | null;
  review_started_by: string | null;
  review_version: number;
}

interface SavedIdrReview {
  abstract_id: string;
  review_version: number;
  parse_status: "parsed";
  saved_at: string;
  order_status: "in_review";
}

interface InsurerRuleRecord {
  id: string;
  carrier_name: string;
  conviction_class: ConvictionClass;
  threshold_count: number;
  behavior: "no_surcharge" | "surcharge" | "decline";
  surcharge_note: string | null;
  forgiveness_product: boolean;
  forgiveness_note: string | null;
  phone: string | null;
  quote_url: string | null;
  source_publisher: string | null;
  source_title: string | null;
  source_url: string;
  last_verified: string;
  estimate_min_percent: number | null;
  estimate_max_percent: number | null;
  estimate_source_publisher: string | null;
  estimate_source_title: string | null;
  estimate_source_url: string | null;
  estimate_last_verified: string | null;
  active: boolean;
}

type SourcedEstimateRuleRecord = InsurerRuleRecord & {
  estimate_min_percent: number;
  estimate_max_percent: number;
  estimate_source_publisher: string;
  estimate_source_title: string;
  estimate_source_url: string;
  estimate_last_verified: string;
};

interface ConvictionDraft {
  id: string;
  offence: string;
  section: string;
  conviction_date: string;
  conviction_class: ConvictionClass;
  discrepancy: string;
  discrepancy_severity: ParsedConviction["discrepancyFlags"][number]["severity"];
  applicable_lookback_years: string;
  lookback_source_publisher: string;
  lookback_source_title: string;
  lookback_source_url: string;
  lookback_last_verified: string;
}

interface TicketDraft {
  ticketNumber: string;
  offence: string;
  section: string;
  occurrenceDate: string;
  issueDate: string;
  location: string;
}

interface RatingInputsDraft {
  annualPremium: string;
  gridStep: string;
  territoryCode: string;
  liabilityLimitCents: string;
  criminalConvictions: string;
  atFaultClaims: string;
}

interface StoredRatingInputs {
  annual_premium_cents?: number;
  grid_profile?: AlbertaGridContext;
}

interface StoredTranscription {
  schema_version?: string;
  transcribed_at?: string;
  convictions?: Array<Partial<ConvictionDraft> & {
    convictionDate?: string;
    convictionClass?: ConvictionClass;
    applicableLookbackYears?: number;
    applicableLookbackSource?: {
      publisher?: string;
      title?: string;
      url?: string;
      accessedDate?: string;
    };
  }>;
  ticket_particulars?: Partial<TicketDraft>;
  ticket?: Partial<TicketDraft>;
  ticket_scenario?: TicketScenarioInput;
  renewal_date?: string;
  rating_inputs?: StoredRatingInputs;
}

const EMPTY_TICKET: TicketDraft = {
  ticketNumber: "",
  offence: "",
  section: "",
  occurrenceDate: "",
  issueDate: "",
  location: "",
};

const EMPTY_RATING_INPUTS: RatingInputsDraft = {
  annualPremium: "",
  gridStep: "",
  territoryCode: "",
  liabilityLimitCents: "",
  criminalConvictions: "",
  atFaultClaims: "",
};

function relationOne<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value || undefined;
}

function clientName(order: IdrOrderDetail | null) {
  const client = relationOne(order?.clients);
  return [client?.first_name, client?.last_name].filter(Boolean).join(" ") || client?.email || "Client unavailable";
}

function newConviction(): ConvictionDraft {
  return {
    id: crypto.randomUUID(),
    offence: "",
    section: "",
    conviction_date: "",
    conviction_class: "minor",
    discrepancy: "",
    discrepancy_severity: "review",
    applicable_lookback_years: "",
    lookback_source_publisher: "",
    lookback_source_title: "",
    lookback_source_url: "",
    lookback_last_verified: "",
  };
}

function normalizeConvictions(parsed: StoredTranscription | null): ConvictionDraft[] {
  return (parsed?.convictions || []).map((conviction) => ({
    id: conviction.id || crypto.randomUUID(),
    offence: conviction.offence || "",
    section: conviction.section || "",
    conviction_date: conviction.conviction_date || conviction.convictionDate || "",
    conviction_class: conviction.conviction_class || conviction.convictionClass || "minor",
    discrepancy: conviction.discrepancy || "",
    discrepancy_severity: ["info", "review", "blocking"].includes(conviction.discrepancy_severity || "")
      ? conviction.discrepancy_severity as ConvictionDraft["discrepancy_severity"]
      : "review",
    applicable_lookback_years: conviction.applicable_lookback_years ||
      (conviction.applicableLookbackYears === undefined ? "" : String(conviction.applicableLookbackYears)),
    lookback_source_publisher: conviction.lookback_source_publisher ||
      conviction.applicableLookbackSource?.publisher || "",
    lookback_source_title: conviction.lookback_source_title ||
      conviction.applicableLookbackSource?.title || "",
    lookback_source_url: conviction.lookback_source_url ||
      conviction.applicableLookbackSource?.url || "",
    lookback_last_verified: conviction.lookback_last_verified ||
      conviction.applicableLookbackSource?.accessedDate || "",
  }));
}

function ticketFromStored(parsed: StoredTranscription | null): Partial<TicketDraft> {
  return parsed?.ticket_particulars || parsed?.ticket || {};
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(value));
}

function edmontonToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

function validNonFutureIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
}

function publicHttpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function defaultThreeYearExit(value: string) {
  try {
    return addCalendarYears(value, IDR_CONVICTION_AGING_YEARS);
  } catch {
    return null;
  }
}

function lookbackSourceIsStale(value: string) {
  if (!validNonFutureIsoDate(value)) return true;
  const verifiedAt = new Date(`${value}T00:00:00Z`).getTime();
  return Math.floor((Date.now() - verifiedAt) / 86_400_000) > IDR_INSURER_RULE_MAX_AGE_DAYS;
}

function reportCanBeDelivered(report: IdrReport | null) {
  if (!report?.verification.deliveryReady || report.carrierCallList.status !== "ready") return false;
  const carrierCount = report.carrierCallList.entries.length;
  return carrierCount >= IDR_MIN_CARRIERS_TO_CALL && carrierCount <= IDR_MAX_CARRIERS_TO_CALL;
}

function sourcePublisherFallback(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Public source";
  }
}

function hasSourcedEstimate(row: InsurerRuleRecord): row is SourcedEstimateRuleRecord {
  return row.estimate_min_percent !== null &&
    row.estimate_max_percent !== null &&
    row.estimate_min_percent >= 0 &&
    row.estimate_max_percent >= row.estimate_min_percent &&
    Boolean(row.estimate_source_publisher?.trim()) &&
    Boolean(row.estimate_source_title?.trim()) &&
    Boolean(row.estimate_source_url) &&
    Boolean(row.estimate_last_verified);
}

function buildGeneratorRules(rows: InsurerRuleRecord[]): InsurerRule[] {
  return rows
    .filter((row) => row.active)
    .map((row) => {
      const estimateFields: Partial<Pick<
        InsurerRule,
        "estimatedAnnualImpactPercentRange" | "estimateSource"
      >> = {};
      if (hasSourcedEstimate(row)) {
        estimateFields.estimatedAnnualImpactPercentRange = {
          minimum: row.estimate_min_percent,
          maximum: row.estimate_max_percent,
        };
        estimateFields.estimateSource = {
          publisher: row.estimate_source_publisher,
          title: row.estimate_source_title,
          url: row.estimate_source_url,
          accessedDate: row.estimate_last_verified,
        };
      }

      return {
        carrierId: row.id,
        carrierName: row.carrier_name,
        convictionClass: row.conviction_class,
        thresholdCount: row.threshold_count,
        behavior: row.behavior,
        ...(row.surcharge_note ? { surchargeNote: row.surcharge_note } : {}),
        forgivenessProduct: row.forgiveness_product,
        ...(row.forgiveness_note ? { forgivenessNote: row.forgiveness_note } : {}),
        researchSource: {
          publisher: row.source_publisher?.trim() || sourcePublisherFallback(row.source_url),
          title: row.source_title?.trim() || row.source_url,
          url: row.source_url,
          accessedDate: row.last_verified,
        },
        ...(row.phone ? { phone: row.phone } : {}),
        ...(row.quote_url ? { quoteUrl: row.quote_url } : {}),
        ...estimateFields,
      };
    });
}

export default function AdminIdrReview() {
  useSafeHead({ title: "Review IDR Order | Fabsy", robots: "noindex, nofollow" });
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [staffUser, setStaffUser] = useState<User | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [order, setOrder] = useState<IdrOrderDetail | null>(null);
  const [abstractRecord, setAbstractRecord] = useState<AbstractRecord | null>(null);
  const [insurerRules, setInsurerRules] = useState<InsurerRuleRecord[]>([]);
  const [convictions, setConvictions] = useState<ConvictionDraft[]>([]);
  const [ticket, setTicket] = useState<TicketDraft>(EMPTY_TICKET);
  const [ticketScenarioMode, setTicketScenarioMode] = useState<TicketScenarioInput["mode"]>("projected");
  const [ticketScenarioClass, setTicketScenarioClass] = useState<ConvictionClass | "">("");
  const [renewalDate, setRenewalDate] = useState("");
  const [ratingInputs, setRatingInputs] = useState<RatingInputsDraft>(EMPTY_RATING_INPUTS);
  const [report, setReport] = useState<IdrReport | null>(null);
  const [reportSaved, setReportSaved] = useState(false);
  const [signedAbstractUrl, setSignedAbstractUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isInvoking, setIsInvoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) throw new Error("The IDR order identifier is missing.");
    const [orderResult, abstractResult, reportResult, rulesResult] = await Promise.all([
      idrDb
        .from("idr_orders")
        .select("id,type,price_paid,status,created_at,intake_json,intake_completed_at,clients(first_name,last_name,email),ticket_submissions(ticket_number,violation,violation_date,court_location)")
        .eq("id", orderId)
        .single(),
      idrDb
        .from("abstracts")
        .select("id,idr_order_id,file_url,parsed_json,parse_status,uploaded_at,review_started_at,review_started_by,review_version")
        .eq("idr_order_id", orderId)
        .maybeSingle(),
      idrDb
        .from("idr_reports")
        .select("id,report_json,renewal_date")
        .eq("idr_order_id", orderId)
        .maybeSingle(),
      idrDb
        .from("insurer_rules")
        .select("*")
        .eq("active", true)
        .order("carrier_name", { ascending: true }),
    ]);

    const firstError = orderResult.error || abstractResult.error || reportResult.error || rulesResult.error;
    if (firstError) throw firstError;

    const nextOrder = orderResult.data as IdrOrderDetail;
    const nextAbstract = (abstractResult.data || null) as AbstractRecord | null;
    const parsed = nextAbstract?.parsed_json || null;
    const submission = relationOne(nextOrder.ticket_submissions);
    const storedTicket = ticketFromStored(parsed);
    const clientIntake = nextOrder.intake_json;
    const intakeTicket = clientIntake?.ticket;
    const storedReport = (reportResult.data?.report_json || null) as IdrReport | null;
    const storedScenario = parsed?.ticket_scenario || (storedReport?.ticketScenario
      ? {
          mode: storedReport.ticketScenario.mode,
          ...(storedReport.ticketScenario.convictionClass
            ? { convictionClass: storedReport.ticketScenario.convictionClass }
            : {}),
        }
      : undefined);

    setOrder(nextOrder);
    setAbstractRecord(nextAbstract);
    setInsurerRules((rulesResult.data || []) as InsurerRuleRecord[]);
    setConvictions(normalizeConvictions(parsed));
    setTicket({
      ticketNumber: storedTicket.ticketNumber || intakeTicket?.ticket_number || submission?.ticket_number || "",
      offence: storedTicket.offence || intakeTicket?.offence || submission?.violation || "",
      section: storedTicket.section || intakeTicket?.section || "",
      occurrenceDate: storedTicket.occurrenceDate || intakeTicket?.occurrence_date || submission?.violation_date?.slice(0, 10) || "",
      issueDate: storedTicket.issueDate || intakeTicket?.issue_date || "",
      location: storedTicket.location || intakeTicket?.location || submission?.court_location || "",
    });
    setTicketScenarioMode(storedScenario?.mode || intakeTicket?.scenario_mode || "projected");
    setTicketScenarioClass(storedScenario?.convictionClass || "");
    setRenewalDate(parsed?.renewal_date || clientIntake?.policy_renewal_date || reportResult.data?.renewal_date || "");
    const storedRatingInputs = parsed?.rating_inputs;
    const intakeRatingInputs = clientIntake?.rating_inputs;
    const annualPremiumCents = storedRatingInputs?.annual_premium_cents ?? intakeRatingInputs?.annual_premium_cents;
    const gridStep = storedRatingInputs?.grid_profile?.gridStep ?? intakeRatingInputs?.grid_step;
    const territoryCode = storedRatingInputs?.grid_profile?.territoryCode ?? intakeRatingInputs?.territory_code;
    const liabilityLimitCents = storedRatingInputs?.grid_profile?.liabilityLimitCents ?? intakeRatingInputs?.liability_limit_cents;
    const criminalConvictions = storedRatingInputs?.grid_profile?.criminalConvictions ?? intakeRatingInputs?.criminal_convictions;
    const atFaultClaims = storedRatingInputs?.grid_profile?.atFaultClaims ?? intakeRatingInputs?.at_fault_claims;
    setRatingInputs({
      annualPremium: annualPremiumCents === undefined
        ? ""
        : (annualPremiumCents / 100).toFixed(2),
      gridStep: gridStep === undefined ? "" : String(gridStep),
      territoryCode: territoryCode || "",
      liabilityLimitCents: liabilityLimitCents === undefined ? "" : String(liabilityLimitCents),
      criminalConvictions: criminalConvictions === undefined ? "" : String(criminalConvictions),
      atFaultClaims: atFaultClaims === undefined ? "" : String(atFaultClaims),
    });
    setReport(storedReport);
    setReportSaved(Boolean(reportResult.data));
  }, [orderId]);

  const authenticateAndLoad = useCallback(
    async (user: User) => {
      setIsLoading(true);
      setError(null);
      try {
        const roleData = await getIdrStaffRole();
        if (!roleData) {
          toast({
            title: "Unauthorized",
            description: "An admin or case manager role is required.",
            variant: "destructive",
          });
          navigate("/admin");
          return;
        }
        setStaffUser(user);
        setRole(roleData);
        await loadOrder();
      } catch (loadError: unknown) {
        setError(errorMessage(loadError, "The IDR order could not be loaded."));
      } finally {
        setIsLoading(false);
      }
    },
    [loadOrder, navigate, toast],
  );

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && mounted) navigate("/admin");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session?.user) {
        setIsLoading(false);
        navigate("/admin");
        return;
      }
      void authenticateAndLoad(session.user);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [authenticateAndLoad, navigate]);

  const generatorRules = useMemo(() => buildGeneratorRules(insurerRules), [insurerRules]);

  const updateConviction = <K extends keyof ConvictionDraft>(
    id: string,
    field: K,
    value: ConvictionDraft[K],
  ) => {
    setConvictions((current) => current.map((conviction) =>
      conviction.id === id ? { ...conviction, [field]: value } : conviction,
    ));
  };

  const claimAbstractReview = async () => {
    if (!abstractRecord) throw new Error("No abstract is available to review.");
    const loadedFileUrl = abstractRecord.file_url;
    const loadedReviewVersion = abstractRecord.review_version;
    const { data, error: claimError } = await idrDb.rpc("claim_idr_abstract_review", {
      p_abstract_id: abstractRecord.id,
    });
    const claim = data as AbstractReviewClaim | null;
    if (claimError || !claim?.id || !claim.file_url) {
      throw claimError || new Error("The abstract review could not be claimed.");
    }
    if (claim.file_url !== loadedFileUrl || claim.review_version !== loadedReviewVersion) {
      setSignedAbstractUrl(null);
      await loadOrder();
      throw new Error(
        "The abstract review changed in another session. The current source and transcription have been reloaded.",
      );
    }
    setAbstractRecord((current) => current?.id === claim.id
      ? {
          ...current,
          file_url: claim.file_url,
          review_started_at: claim.review_started_at,
          review_started_by: claim.review_started_by,
          review_version: claim.review_version,
        }
      : current);
    return claim;
  };

  const createSignedAbstractLink = async () => {
    if (!abstractRecord) return;
    setIsSigning(true);
    setError(null);
    try {
      const claim = await claimAbstractReview();
      const { data, error: signedError } = await supabase.storage
        .from("idr-abstracts")
        .createSignedUrl(claim.file_url, 300, { download: true });
      if (signedError || !data?.signedUrl) throw signedError || new Error("Signed URL unavailable.");
      setSignedAbstractUrl(data.signedUrl);
      window.setTimeout(() => setSignedAbstractUrl(null), 300_000);
    } catch (signError: unknown) {
      setError(errorMessage(signError, "A private download link could not be created."));
    } finally {
      setIsSigning(false);
    }
  };

  const saveReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!orderId || !abstractRecord || !staffUser) return;
    setError(null);

    if (order?.status === "delivered") {
      setError("Delivered reports are locked so the portal, PDF, and HTML remain identical.");
      return;
    }

    if (!ticket.offence.trim()) {
      setError("Ticket offence is required before generating the report.");
      return;
    }
    if (!renewalDate) {
      setError("Policy renewal date is required before generating the report.");
      return;
    }
    if (ticketScenarioMode === "projected" && !ticketScenarioClass) {
      setError("Classify the projected current-ticket conviction before generating the report.");
      return;
    }
    const incompleteConviction = convictions.find((conviction) =>
      !conviction.offence.trim() || !conviction.conviction_date,
    );
    if (incompleteConviction) {
      setError("Every conviction requires an offence and conviction date.");
      return;
    }
    for (let index = 0; index < convictions.length; index += 1) {
      const conviction = convictions[index];
      const lookbackValues = [
        conviction.applicable_lookback_years,
        conviction.lookback_source_publisher,
        conviction.lookback_source_title,
        conviction.lookback_source_url,
        conviction.lookback_last_verified,
      ];
      const hasLookback = lookbackValues.some((value) => value.trim());
      if (!hasLookback) continue;
      if (lookbackValues.some((value) => !value.trim())) {
        setError(`Conviction ${index + 1} requires complete alternate lookback source details.`);
        return;
      }
      const lookbackYears = Number(conviction.applicable_lookback_years);
      if (
        !Number.isInteger(lookbackYears) ||
        lookbackYears < 1 ||
        lookbackYears === IDR_CONVICTION_AGING_YEARS
      ) {
        setError(`Conviction ${index + 1} alternate lookback must be a positive whole number other than ${IDR_CONVICTION_AGING_YEARS}.`);
        return;
      }
      if (!publicHttpsUrl(conviction.lookback_source_url)) {
        setError(`Conviction ${index + 1} lookback source must be a public HTTPS URL.`);
        return;
      }
      if (!validNonFutureIsoDate(conviction.lookback_last_verified)) {
        setError(`Conviction ${index + 1} lookback source date must be valid and not in the future.`);
        return;
      }
    }

    const annualPremiumDollars = ratingInputs.annualPremium.trim()
      ? Number(ratingInputs.annualPremium)
      : null;
    if (
      annualPremiumDollars !== null &&
      (!Number.isFinite(annualPremiumDollars) || annualPremiumDollars <= 0)
    ) {
      setError("Current annual premium must be a positive dollar amount when supplied.");
      return;
    }
    const annualPremiumCents = annualPremiumDollars === null
      ? null
      : Math.round(annualPremiumDollars * 100);

    const gridValues = [
      ratingInputs.gridStep,
      ratingInputs.territoryCode,
      ratingInputs.liabilityLimitCents,
      ratingInputs.criminalConvictions,
      ratingInputs.atFaultClaims,
    ];
    const hasGridProfile = gridValues.some((value) => value.trim());
    if (hasGridProfile && gridValues.some((value) => !value.trim())) {
      setError("Complete every Alberta Grid profile field or leave the entire profile blank.");
      return;
    }

    let gridProfile: AlbertaGridContext | undefined;
    if (hasGridProfile) {
      const gridStep = Number(ratingInputs.gridStep);
      const liabilityLimitCents = Number(ratingInputs.liabilityLimitCents);
      const criminalConvictions = Number(ratingInputs.criminalConvictions);
      const atFaultClaims = Number(ratingInputs.atFaultClaims);
      const gridStepIsSupported =
        albertaGrid2026.gridStepDifferentials.bands.some(
          (band) => gridStep >= band.minimum && gridStep <= band.maximum,
        ) || (
          albertaGrid2026.gridStepDifferentials.overflow !== undefined &&
          gridStep >= albertaGrid2026.gridStepDifferentials.overflow.from
        );
      if (
        !Number.isInteger(gridStep) ||
        !gridStepIsSupported ||
        !albertaGrid2026.territoryDifferentials.some(
          (territory) => territory.code === ratingInputs.territoryCode,
        ) ||
        !albertaGrid2026.liabilityLimitDifferentials.some(
          (limit) => limit.limitCents === liabilityLimitCents,
        ) ||
        !Number.isInteger(criminalConvictions) ||
        criminalConvictions < 0 ||
        !Number.isInteger(atFaultClaims) ||
        atFaultClaims < 0
      ) {
        setError("The Alberta Grid profile contains an unsupported value or a negative count.");
        return;
      }
      gridProfile = {
        gridStep,
        territoryCode: ratingInputs.territoryCode,
        liabilityLimitCents,
        criminalConvictions,
        atFaultClaims,
      };
    }

    const ticketScenario: TicketScenarioInput = ticketScenarioMode === "projected"
      ? { mode: "projected", convictionClass: ticketScenarioClass as ConvictionClass }
      : { mode: "listed" };

    setIsSaving(true);
    try {
      const reviewClaim = await claimAbstractReview();

      const parsedConvictions: ParsedConviction[] = convictions.map((conviction) => {
        const hasLookback = Boolean(conviction.applicable_lookback_years.trim());
        return {
          id: conviction.id,
          offence: conviction.offence.trim(),
          ...(conviction.section.trim() ? { section: conviction.section.trim() } : {}),
          convictionDate: conviction.conviction_date,
          convictionClass: conviction.conviction_class,
          discrepancyFlags: conviction.discrepancy.trim()
            ? [{
                code: "manual-review-discrepancy",
                detail: conviction.discrepancy.trim(),
                field: "other" as const,
                severity: conviction.discrepancy_severity,
              }]
            : [],
          ...(hasLookback
            ? {
                applicableLookbackYears: Number(conviction.applicable_lookback_years),
                applicableLookbackSource: {
                  publisher: conviction.lookback_source_publisher.trim(),
                  title: conviction.lookback_source_title.trim(),
                  url: new URL(conviction.lookback_source_url).toString(),
                  accessedDate: conviction.lookback_last_verified,
                },
              }
            : {}),
        };
      });
      const ticketParticulars: TicketParticulars = {
        ...(ticket.ticketNumber.trim() ? { ticketNumber: ticket.ticketNumber.trim() } : {}),
        offence: ticket.offence.trim(),
        ...(ticket.section.trim() ? { section: ticket.section.trim() } : {}),
        ...(ticket.occurrenceDate ? { occurrenceDate: ticket.occurrenceDate } : {}),
        ...(ticket.issueDate ? { issueDate: ticket.issueDate } : {}),
        ...(ticket.location.trim() ? { location: ticket.location.trim() } : {}),
      };
      const generated = generateIdrReport({
        asOfDate: edmontonToday(),
        convictions: parsedConvictions,
        ticket: ticketParticulars,
        ticketScenario,
        insurerRules: generatorRules,
        gridDataset: albertaGrid2026,
        ...(gridProfile ? { gridProfile } : {}),
        ...(annualPremiumCents !== null
          ? {
              premiumBaseline: {
                annualPremiumCents,
                currency: "CAD" as const,
                basis: "current-policy" as const,
              },
            }
          : {}),
        policyRenewalDate: renewalDate,
        reminderLeadDays: [45],
      });
      const now = new Date().toISOString();
      const transcription: StoredTranscription = {
        schema_version: "1.2.0",
        transcribed_at: now,
        convictions,
        ticket_particulars: ticket,
        ticket_scenario: ticketScenario,
        renewal_date: renewalDate,
        ...(
          annualPremiumCents !== null || gridProfile
            ? {
                rating_inputs: {
                  ...(annualPremiumCents !== null ? { annual_premium_cents: annualPremiumCents } : {}),
                  ...(gridProfile ? { grid_profile: gridProfile } : {}),
                },
              }
            : {}
        ),
      };

      const { data: saveData, error: saveRpcError } = await idrDb.rpc("save_idr_report_review", {
        p_order_id: orderId,
        p_abstract_id: abstractRecord.id,
        p_expected_file_url: reviewClaim.file_url,
        p_expected_review_version: reviewClaim.review_version,
        p_transcription: transcription,
        p_report_json: generated,
        p_renewal_date: renewalDate,
      });
      const saved = saveData as SavedIdrReview | null;
      if (saveRpcError || !saved?.abstract_id || saved.abstract_id !== abstractRecord.id) {
        throw saveRpcError || new Error("The reviewed report could not be saved atomically.");
      }

      setAbstractRecord((current) => current
        ? {
            ...current,
            parsed_json: transcription,
            parse_status: saved.parse_status,
            review_version: saved.review_version,
          }
        : current);
      setOrder((current) => current ? { ...current, status: saved.order_status } : current);
      setReport(generated);
      setReportSaved(true);
      toast({ title: "IDR report saved", description: "The transcription and report JSON were saved for this order." });
    } catch (saveError: unknown) {
      setError(errorMessage(saveError, "The report could not be generated and saved."));
    } finally {
      setIsSaving(false);
    }
  };

  const invokeReportFunction = async () => {
    if (!orderId || !reportSaved || !reportCanBeDelivered(report)) {
      setError("Resolve every report blocker and save a delivery-ready report before invoking generation.");
      return;
    }
    setIsInvoking(true);
    setError(null);
    try {
      const { error: invokeError } = await supabase.functions.invoke("generate-idr-report", {
        body: { orderId },
      });
      if (invokeError) throw invokeError;
      toast({ title: "Report function invoked", description: "The saved order was sent to the report generation function." });
    } catch (invokeError: unknown) {
      setError(errorMessage(invokeError, "The report generation function could not be invoked."));
    } finally {
      setIsInvoking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">Loading IDR review...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-12">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>IDR order unavailable</AlertTitle>
          <AlertDescription>{error || "This order could not be found."}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/idr")}><ArrowLeft className="mr-2 h-4 w-4" />Back to IDR operations</Button>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate("/admin/idr")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to IDR operations
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Review IDR order</h1>
              <p className="text-sm text-muted-foreground">{clientName(order)} · Ordered {displayDate(order.created_at)}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{role?.replace("_", " ")}</Badge>
              <Badge>{order.status.replace("_", " ")}</Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Action could not be completed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order</CardTitle>
              <CardDescription>Private operational details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium">Order ID:</span> {order.id}</p>
              <p><span className="font-medium">Type:</span> {order.type}</p>
              <p><span className="font-medium">Paid:</span> ${Number(order.price_paid).toFixed(2)}</p>
              <p><span className="font-medium">Client intake:</span> {order.intake_completed_at ? `Saved ${displayDate(order.intake_completed_at)}` : "Not supplied"}</p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Private abstract</CardTitle>
              <CardDescription>Signed links expire after five minutes. Do not share them.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!abstractRecord ? (
                <Alert>
                  <AlertTitle>No abstract uploaded</AlertTitle>
                  <AlertDescription>The client has not registered an abstract for this order.</AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{abstractRecord.parse_status.replace("_", " ")}</Badge>
                    <span>Uploaded {displayDate(abstractRecord.uploaded_at)}</span>
                    {abstractRecord.review_started_at && (
                      <span>
                        Review claimed {displayDate(abstractRecord.review_started_at)} {abstractRecord.review_started_by === staffUser?.id ? "by you" : "by another staff member"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void createSignedAbstractLink()} disabled={isSigning}>
                      <Download className="mr-2 h-4 w-4" />{isSigning ? "Creating link..." : "Create private download link"}
                    </Button>
                    {signedAbstractUrl && (
                      <Button asChild>
                        <a href={signedAbstractUrl} download>Download abstract</a>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <form className="space-y-6" onSubmit={saveReport}>
          <fieldset disabled={order?.status === "delivered"} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ticket particulars</CardTitle>
              <CardDescription>Client-supplied values are prefilled. Verify them against the source records and do not infer missing facts.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="ticket-number">Ticket number</Label><Input id="ticket-number" value={ticket.ticketNumber} onChange={(event) => setTicket((current) => ({ ...current, ticketNumber: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="ticket-offence">Offence</Label><Input id="ticket-offence" required value={ticket.offence} onChange={(event) => setTicket((current) => ({ ...current, offence: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="ticket-section">Section</Label><Input id="ticket-section" value={ticket.section} onChange={(event) => setTicket((current) => ({ ...current, section: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="occurrence-date">Occurrence date</Label><Input id="occurrence-date" type="date" value={ticket.occurrenceDate} onChange={(event) => setTicket((current) => ({ ...current, occurrenceDate: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="issue-date">Issue date</Label><Input id="issue-date" type="date" value={ticket.issueDate} onChange={(event) => setTicket((current) => ({ ...current, issueDate: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="ticket-location">Location</Label><Input id="ticket-location" value={ticket.location} onChange={(event) => setTicket((current) => ({ ...current, location: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="renewal-date">Policy renewal date</Label><Input id="renewal-date" type="date" required value={renewalDate} onChange={(event) => setRenewalDate(event.target.value)} /></div>
              <div className="space-y-2">
                <Label htmlFor="ticket-scenario-mode">Current ticket treatment</Label>
                <Select value={ticketScenarioMode} onValueChange={(value: TicketScenarioInput["mode"]) => setTicketScenarioMode(value)}>
                  <SelectTrigger id="ticket-scenario-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projected">Projected, not yet on abstract</SelectItem>
                    <SelectItem value="listed">Already listed on abstract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-scenario-class">Projected conviction class</Label>
                <Select
                  disabled={ticketScenarioMode !== "projected"}
                  value={ticketScenarioClass || "not-classified"}
                  onValueChange={(value) => setTicketScenarioClass(value === "not-classified" ? "" : value as ConvictionClass)}
                >
                  <SelectTrigger id="ticket-scenario-class"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-classified">Select after review</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="serious">Serious</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
                Projected mode creates a separately labelled what-if scenario without changing the verified abstract transcription. Listed mode must match an abstract conviction and never adds a second count.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Conviction transcription</CardTitle>
                  <CardDescription>Enter each conviction exactly as shown on the abstract and flag discrepancies for follow-up.</CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={() => setConvictions((current) => [...current, newConviction()])}><Plus className="mr-2 h-4 w-4" />Add conviction</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {convictions.length === 0 ? (
                <Alert>
                  <FileCheck2 className="h-4 w-4" />
                  <AlertTitle>No convictions transcribed</AlertTitle>
                  <AlertDescription>Leave this empty only when the abstract has no conviction entries.</AlertDescription>
                </Alert>
              ) : convictions.map((conviction, index) => (
                <fieldset key={conviction.id} className="rounded-lg border p-4">
                  <legend className="px-2 text-sm font-semibold">Conviction {index + 1}</legend>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2 lg:col-span-2"><Label htmlFor={`offence-${conviction.id}`}>Offence</Label><Input id={`offence-${conviction.id}`} required value={conviction.offence} onChange={(event) => updateConviction(conviction.id, "offence", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor={`section-${conviction.id}`}>Section</Label><Input id={`section-${conviction.id}`} value={conviction.section} onChange={(event) => updateConviction(conviction.id, "section", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor={`date-${conviction.id}`}>Conviction date</Label><Input id={`date-${conviction.id}`} type="date" required value={conviction.conviction_date} onChange={(event) => updateConviction(conviction.id, "conviction_date", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor={`class-${conviction.id}`}>Class</Label><Select value={conviction.conviction_class} onValueChange={(value: ConvictionClass) => updateConviction(conviction.id, "conviction_class", value)}><SelectTrigger id={`class-${conviction.id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="minor">Minor</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="serious">Serious</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2">
                      <Label htmlFor={`discrepancy-severity-${conviction.id}`}>Note status</Label>
                      <Select
                        value={conviction.discrepancy_severity}
                        onValueChange={(value: ConvictionDraft["discrepancy_severity"]) => updateConviction(conviction.id, "discrepancy_severity", value)}
                      >
                        <SelectTrigger id={`discrepancy-severity-${conviction.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Informational or resolved</SelectItem>
                          <SelectItem value="review">Review required</SelectItem>
                          <SelectItem value="blocking">Blocking</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2 lg:col-span-2"><Label htmlFor={`discrepancy-${conviction.id}`}>Discrepancy or review note</Label><Textarea id={`discrepancy-${conviction.id}`} placeholder="Leave blank when none is identified." value={conviction.discrepancy} onChange={(event) => updateConviction(conviction.id, "discrepancy", event.target.value)} /></div>
                    <div className="flex items-end"><Button type="button" variant="outline" onClick={() => setConvictions((current) => current.filter((item) => item.id !== conviction.id))}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div>
                    <div className="text-sm text-muted-foreground lg:col-span-4">
                      Default product three-year exit: {defaultThreeYearExit(conviction.conviction_date) || "Enter a conviction date"}.
                    </div>
                    <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
                      <legend className="px-2 text-sm font-semibold">Optional sourced alternate lookback</legend>
                      <p className="text-sm text-muted-foreground md:col-span-2 lg:col-span-4">
                        Complete every field only when a current public source documents an insurer-specific window other than three years. Serious convictions need this research before delivery.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor={`lookback-years-${conviction.id}`}>Lookback years</Label>
                        <Input
                          id={`lookback-years-${conviction.id}`}
                          type="number"
                          min="1"
                          step="1"
                          value={conviction.applicable_lookback_years}
                          onChange={(event) => updateConviction(conviction.id, "applicable_lookback_years", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`lookback-publisher-${conviction.id}`}>Source publisher</Label>
                        <Input id={`lookback-publisher-${conviction.id}`} value={conviction.lookback_source_publisher} onChange={(event) => updateConviction(conviction.id, "lookback_source_publisher", event.target.value)} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor={`lookback-title-${conviction.id}`}>Source title</Label>
                        <Input id={`lookback-title-${conviction.id}`} value={conviction.lookback_source_title} onChange={(event) => updateConviction(conviction.id, "lookback_source_title", event.target.value)} />
                      </div>
                      <div className="space-y-2 md:col-span-2 lg:col-span-3">
                        <Label htmlFor={`lookback-url-${conviction.id}`}>Public HTTPS source</Label>
                        <Input id={`lookback-url-${conviction.id}`} type="url" pattern="https://.*" placeholder="https://" value={conviction.lookback_source_url} onChange={(event) => updateConviction(conviction.id, "lookback_source_url", event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`lookback-verified-${conviction.id}`}>Source accessed</Label>
                        <Input id={`lookback-verified-${conviction.id}`} type="date" value={conviction.lookback_last_verified} onChange={(event) => updateConviction(conviction.id, "lookback_last_verified", event.target.value)} />
                      </div>
                      {conviction.lookback_last_verified && lookbackSourceIsStale(conviction.lookback_last_verified) && (
                        <p className="text-sm text-destructive md:col-span-2 lg:col-span-4">
                          This source is not current enough for delivery. Refresh it within {IDR_INSURER_RULE_MAX_AGE_DAYS} days.
                        </p>
                      )}
                    </fieldset>
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Premium and Alberta Grid inputs</CardTitle>
              <CardDescription>
                The current policy premium is optional when it is visible in the supplied records. Complete every Grid field for the required sourced 2026 benchmark; otherwise the report is saved as not ready for delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="annual-premium">Current annual premium (CAD)</Label>
                <Input
                  id="annual-premium"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Example: 2400.00"
                  value={ratingInputs.annualPremium}
                  onChange={(event) => setRatingInputs((current) => ({ ...current, annualPremium: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grid-step">Grid step</Label>
                <Input
                  id="grid-step"
                  type="number"
                  step="1"
                  placeholder="Example: 0"
                  value={ratingInputs.gridStep}
                  onChange={(event) => setRatingInputs((current) => ({ ...current, gridStep: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grid-territory">Grid territory</Label>
                <Select
                  value={ratingInputs.territoryCode || "not-supplied"}
                  onValueChange={(value) => setRatingInputs((current) => ({
                    ...current,
                    territoryCode: value === "not-supplied" ? "" : value,
                  }))}
                >
                  <SelectTrigger id="grid-territory"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-supplied">Not supplied</SelectItem>
                    {albertaGrid2026.territoryDifferentials.map((territory) => (
                      <SelectItem key={territory.code} value={territory.code}>{territory.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="liability-limit">Third-party liability limit</Label>
                <Select
                  value={ratingInputs.liabilityLimitCents || "not-supplied"}
                  onValueChange={(value) => setRatingInputs((current) => ({
                    ...current,
                    liabilityLimitCents: value === "not-supplied" ? "" : value,
                  }))}
                >
                  <SelectTrigger id="liability-limit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-supplied">Not supplied</SelectItem>
                    {albertaGrid2026.liabilityLimitDifferentials.map((limit) => (
                      <SelectItem key={limit.limitCents} value={String(limit.limitCents)}>
                        ${(limit.limitCents / 100).toLocaleString("en-CA")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="criminal-convictions">Grid criminal conviction count</Label>
                <Input
                  id="criminal-convictions"
                  type="number"
                  min="0"
                  step="1"
                  value={ratingInputs.criminalConvictions}
                  onChange={(event) => setRatingInputs((current) => ({ ...current, criminalConvictions: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="at-fault-claims">At-fault claim count</Label>
                <Input
                  id="at-fault-claims"
                  type="number"
                  min="0"
                  step="1"
                  value={ratingInputs.atFaultClaims}
                  onChange={(event) => setRatingInputs((current) => ({ ...current, atFaultClaims: event.target.value }))}
                />
              </div>
              <p className="text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
                Minor and major conviction counts are derived from the active conviction transcription. Criminal convictions and at-fault claims must be entered from verified records.
              </p>
            </CardContent>
          </Card>

          <Alert>
            <AlertTitle>Consumer research disclaimer</AlertTitle>
            <AlertDescription>{IDR_DISCLAIMER}</AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" disabled={isSaving || !abstractRecord}>
              <Save className="mr-2 h-4 w-4" />{isSaving ? "Generating and saving..." : "Generate and save report JSON"}
            </Button>
            {reportSaved && (
              <Button type="button" size="lg" variant="outline" disabled={isInvoking || !reportCanBeDelivered(report)} onClick={() => void invokeReportFunction()}>
                <Send className="mr-2 h-4 w-4" />{isInvoking ? "Invoking..." : "Invoke report generation"}
              </Button>
            )}
          </div>
          {reportSaved && report && !reportCanBeDelivered(report) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Report is not ready for delivery</AlertTitle>
              <AlertDescription>
                Resolve the saved report blockers, then generate and save it again before invoking delivery.
              </AlertDescription>
            </Alert>
          )}
          </fieldset>
          {order?.status === "delivered" && (
            <Alert>
              <FileCheck2 className="h-4 w-4" />
              <AlertTitle>Delivered report locked</AlertTitle>
              <AlertDescription>
                The transcription and saved report cannot be changed after delivery. This keeps the portal, PDF, and HTML versions identical.
              </AlertDescription>
            </Alert>
          )}
          {order?.status === "delivered" && reportSaved && reportCanBeDelivered(report) && (
            <Button type="button" size="lg" variant="outline" disabled={isInvoking} onClick={() => void invokeReportFunction()}>
              <Send className="mr-2 h-4 w-4" />{isInvoking ? "Invoking..." : "Retry delivery email"}
            </Button>
          )}
        </form>

        {report && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" />Saved report summary</CardTitle>
              <CardDescription>The full structured report is stored in idr_reports.report_json.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div><p className="text-muted-foreground">Verification</p><p className="font-medium">{report.verification.status.replace("-", " ")}</p></div>
                <div><p className="text-muted-foreground">Delivery ready</p><p className="font-medium">{reportCanBeDelivered(report) ? "Yes" : "No"}</p></div>
                <div><p className="text-muted-foreground">Ticket match</p><p className="font-medium">{report.verification.ticketMatch.replace("-", " ")}</p></div>
                <div><p className="text-muted-foreground">Convictions checked</p><p className="font-medium">{report.verification.checkedConvictions}</p></div>
                <div><p className="text-muted-foreground">Carrier calls</p><p className="font-medium">{report.carrierCallList.entries.length} ({report.carrierCallList.status})</p></div>
              </div>
              {(report.verification.blockers || []).length > 0 && (
                <div>
                  <p className="font-medium">Delivery blockers</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {(report.verification.blockers || []).map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
