import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  FileSignature,
  FileUp,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  Scale,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import useSafeHead from "@/hooks/useSafeHead";
import { supabase } from "@/integrations/supabase/client";

type SignatureMethod = "typed" | "manual_scan";
type ConsentStatus = "pending" | "completed" | "document_received";
type UnavailableReason = "missing" | "invalid" | "expired" | "revoked" | "error";
type PageState = "loading" | "processing" | "ready" | "submitting" | "completed" | UnavailableReason;
type ManualUploadState = "idle" | "uploading" | "uploaded" | "error";

interface ConsentClient {
  legalName: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone: string | null;
  dateOfBirth?: string | null;
  address: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

interface ConsentInvite {
  client: ConsentClient;
  matter: {
    ticketNumber: string;
    ticketNumbers?: string[];
    charge: string;
    offenceDate: string | null;
    courtLocation: string | null;
    courtDate: string | null;
    details: string | null;
  };
  expiresAt: string;
}

interface RepresentativeDetails {
  firstName: string;
  lastName: string;
  firm: string | null;
  phone: string;
  mailingAddress: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
}

interface GovernmentFormDetails {
  code: string;
  revision: string;
  sourceUrl: string;
  securityClassification: string;
  sha256: string;
}

interface SignedConsentDetails {
  signedAt: string;
  digitalSignature?: string;
  signatureMethod?: SignatureMethod;
  pdfUrl?: string;
  pdfUrlExpiresIn?: number;
  pdfSha256?: string;
  manualScanPdfUrl?: string;
  manualScanPdfUrlExpiresIn?: number;
  manualScanPdfSha256?: string;
  manualScanReviewStatus?: string;
}

interface ConsentResponse {
  invite?: ConsentInvite;
  representative?: RepresentativeDetails;
  governmentForm?: GovernmentFormDetails;
  consent?: {
    version: string;
    text: string;
    hash: string;
    requiredSignature: string;
  };
  status?: ConsentStatus | string;
  signed?: SignedConsentDetails;
  formData?: {
    phone: string | null;
    dateOfBirth: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    signedAt?: string | null;
  };
  upload?: {
    bucket: string;
    path: string;
    token: string;
    maxBytes: number;
    allowedTypes: string[];
    expiresAt?: string;
  };
  error?: string;
  code?: string;
}

interface RequestFailure {
  code: string;
  message: string;
  status?: number;
}

class ConsentRequestError extends Error {
  code: string;
  status?: number;

  constructor({ code, message, status }: RequestFailure) {
    super(message);
    this.name = "ConsentRequestError";
    this.code = code;
    this.status = status;
  }
}

interface ConsentFormData {
  phone: string;
  dateOfBirth: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  digitalSignature: string;
  manualSignedName: string;
  manualSignedDate: string;
  accepted: boolean;
}

interface UploadedManualScan {
  path: string;
  contentType: string;
  size: number;
}

type FieldErrors = Record<string, string>;

const INITIAL_FORM: ConsentFormData = {
  phone: "",
  dateOfBirth: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  digitalSignature: "",
  manualSignedName: "",
  manualSignedDate: "",
  accepted: false,
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://gcasbisxfrssonllpqrw.supabase.co";
const CONSENT_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/representation-consent`;
const OFFICIAL_APTO_URL = "https://cfr.forms.gov.ab.ca/Form/APTO13348.pdf";
const MAX_MANUAL_SCAN_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MANUAL_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function containsControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);
    if (characterCode < 32 || characterCode === 127) return true;
  }
  return false;
}

function readBearerToken() {
  if (typeof window === "undefined") return "";
  const queryToken = new URLSearchParams(window.location.search).get("token")?.trim() || "";
  const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token")?.trim() || "";
  const candidate = queryToken || fragmentToken;
  if (!candidate || candidate.length > 4096 || containsControlCharacter(candidate)) return "";
  return candidate;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatExpiry(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function formatSignedAt(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeStyle: "short" }).format(parsed);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function trustedPdfUrl(value: string | undefined) {
  if (!value) return "";
  try {
    const candidate = new URL(value);
    const serviceOrigin = new URL(SUPABASE_URL).origin;
    return candidate.protocol === "https:" && candidate.origin === serviceOrigin ? candidate.toString() : "";
  } catch {
    return "";
  }
}

function trustedGovernmentFormUrl(value: string | undefined) {
  try {
    const candidate = new URL(value || OFFICIAL_APTO_URL);
    if (candidate.protocol !== "https:" || candidate.hostname !== "cfr.forms.gov.ab.ca") return OFFICIAL_APTO_URL;
    return candidate.toString();
  } catch {
    return OFFICIAL_APTO_URL;
  }
}

function contentTypeForFile(file: File) {
  if (ACCEPTED_MANUAL_TYPES.includes(file.type)) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return "";
}

function hasSafeUploadTarget(upload: ConsentResponse["upload"]): upload is NonNullable<ConsentResponse["upload"]> {
  if (!upload) return false;
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/i.test(upload.bucket)) return false;
  if (!upload.path || upload.path.length > 1024 || containsControlCharacter(upload.path)) return false;
  if (!upload.token || upload.token.length > 4096 || containsControlCharacter(upload.token)) return false;
  return true;
}

function isFinishedStatus(status: ConsentResponse["status"]) {
  return status === "completed" || status === "document_received";
}

async function requestConsent(token: string, body: Record<string, unknown>): Promise<ConsentResponse> {
  let response: Response;
  try {
    response = await fetch(CONSENT_FUNCTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ConsentRequestError({ code: "network_error", message: "The secure service could not be reached." });
  }

  let data: ConsentResponse = {};
  try {
    data = await response.json() as ConsentResponse;
  } catch {
    // Keep infrastructure details out of the client-facing error.
  }
  if (!response.ok) {
    throw new ConsentRequestError({
      code: typeof data.code === "string" ? data.code : "request_failed",
      message: typeof data.error === "string" ? data.error : "The secure request was not accepted.",
      status: response.status,
    });
  }
  return data;
}

function unavailableReason(details: RequestFailure): UnavailableReason {
  const hint = `${details.code} ${details.message}`.toLowerCase();
  if (hint.includes("expired")) return "expired";
  if (hint.includes("revoked") || hint.includes("disabled")) return "revoked";
  if (details.code === "invite_not_found" || hint.includes("invitation not found") || details.status === 401 || details.status === 404) return "invalid";
  return "error";
}

function Definition({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{value || "Not provided"}</dd>
    </div>
  );
}

function InlineError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-xs font-medium text-destructive">{message}</p>;
}

function ConsentText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="mt-4 space-y-3 border-t pt-4 text-sm leading-6 text-foreground">
      {blocks.map((block, index) => {
        const cleanBlock = block.trim();
        if (/^[A-Z][A-Z\s&/–—-]+$/.test(cleanBlock) && cleanBlock.length < 80) {
          return <h3 key={`${cleanBlock}-${index}`} className="text-sm font-bold tracking-wide">{cleanBlock}</h3>;
        }
        return <p key={`${cleanBlock.slice(0, 24)}-${index}`} className="whitespace-pre-line">{cleanBlock}</p>;
      })}
    </div>
  );
}

function PrivateHeader() {
  return (
    <header className="border-b bg-background" aria-label="Fabsy secure document header">
      <div className="container mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <a href="/" className="flex min-h-11 items-center gap-2 font-bold text-primary" aria-label="Fabsy home">
          <Scale className="h-6 w-6" aria-hidden="true" /><span className="text-2xl">Fabsy</span>
        </a>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />Private document
          </p>
          <a className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline" href="mailto:hello@fabsy.ca">Need help?</a>
        </div>
      </div>
    </header>
  );
}

function PrivateFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 font-semibold text-primary"><Scale className="h-4 w-4" aria-hidden="true" />Fabsy Traffic Ticket Services</div>
        <p className="mt-2">Alberta traffic ticket agent services where permitted.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:text-primary hover:underline" href="tel:+18257932279"><Phone className="h-4 w-4" aria-hidden="true" />(825) 793-2279</a>
          <a className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:text-primary hover:underline" href="mailto:hello@fabsy.ca"><Mail className="h-4 w-4" aria-hidden="true" />hello@fabsy.ca</a>
          <a className="inline-flex min-h-11 items-center underline-offset-4 hover:text-primary hover:underline" href="/privacy-policy">Privacy policy</a>
          <a className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:text-primary hover:underline" href="/terms-of-purchase" target="_blank" rel="noopener noreferrer">
            Terms of purchase<span className="sr-only"> (opens in a new tab)</span><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}

function UnavailableConsent({ reason }: { reason: UnavailableReason }) {
  const copy: Record<UnavailableReason, { title: string; body: string }> = {
    missing: { title: "Secure invitation required", body: "Open the complete consent link Fabsy sent you. If you copied the address manually, make sure the full link was included." },
    invalid: { title: "This consent link is not available", body: "The secure link may be incomplete or no longer active. Ask Fabsy for a new consent invitation." },
    expired: { title: "This consent link has expired", body: "For your privacy, consent links are available only for a limited time. Ask Fabsy for a new invitation." },
    revoked: { title: "This consent link is no longer active", body: "Ask Fabsy if you still need to complete a representation consent form." },
    error: { title: "We could not open the consent form", body: "Please try again in a moment. If the problem continues, contact Fabsy for help." },
  };
  return (
    <Card className="mx-auto max-w-2xl p-6 shadow-fab sm:p-8">
      <Alert variant={reason === "error" ? "destructive" : "default"}>
        <AlertCircle aria-hidden="true" /><AlertTitle>{copy[reason].title}</AlertTitle>
        <AlertDescription>
          <p>{copy[reason].body}</p>
          <p className="mt-3">Email <a className="font-medium underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a> or call <a className="font-medium underline" href="tel:+18257932279">(825) 793-2279</a>.</p>
        </AlertDescription>
      </Alert>
    </Card>
  );
}

export default function RepresentationConsent() {
  const [token] = useState(readBearerToken);
  const [pageState, setPageState] = useState<PageState>(() => token ? "loading" : "missing");
  const [invite, setInvite] = useState<ConsentInvite | null>(null);
  const [representative, setRepresentative] = useState<RepresentativeDetails | null>(null);
  const [governmentForm, setGovernmentForm] = useState<GovernmentFormDetails | null>(null);
  const [consent, setConsent] = useState<ConsentResponse["consent"]>(undefined);
  const [signedDetails, setSignedDetails] = useState<SignedConsentDetails | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadExpiresIn, setDownloadExpiresIn] = useState(0);
  const [manualScanDownloadUrl, setManualScanDownloadUrl] = useState("");
  const [manualScanDownloadExpiresIn, setManualScanDownloadExpiresIn] = useState(0);
  const [signatureMethod, setSignatureMethod] = useState<SignatureMethod>("typed");
  const [form, setForm] = useState<ConsentFormData>(INITIAL_FORM);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [uploadedManualScan, setUploadedManualScan] = useState<UploadedManualScan | null>(null);
  const [manualUploadState, setManualUploadState] = useState<ManualUploadState>("idle");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const alertRef = useRef<HTMLDivElement>(null);
  const completionRef = useRef<HTMLHeadingElement>(null);
  const submitStartedRef = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  useSafeHead({
    title: "Representation Consent | Fabsy",
    description: "Securely review and sign your Fabsy traffic ticket representation consent.",
    canonical: "https://fabsy.ca/representation-consent",
    robots: "noindex, nofollow, noarchive",
  });

  useLayoutEffect(() => {
    if (typeof window === "undefined" || !token || (!window.location.search && !window.location.hash)) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [token]);

  useLayoutEffect(() => {
    document.body.classList.add("fabsy-private-consent");
    return () => document.body.classList.remove("fabsy-private-consent");
  }, []);

  const applyResponse = (data: ConsentResponse) => {
    if (!data.invite || !data.consent || !data.status) return false;
    setInvite(data.invite);
    setRepresentative(data.representative || null);
    setGovernmentForm(data.governmentForm || null);
    setConsent(data.consent);
    setSignedDetails(data.signed || null);
    setForm((current) => ({
      ...current,
      phone: current.phone || data.formData?.phone || data.invite?.client.phone || "",
      dateOfBirth: current.dateOfBirth || data.formData?.dateOfBirth || data.invite?.client.dateOfBirth || "",
      address: current.address || data.formData?.address || data.invite?.client.address || "",
      city: current.city || data.formData?.city || data.invite?.client.city || "",
      province: current.province || data.formData?.province || data.invite?.client.province || "",
      postalCode: current.postalCode || data.formData?.postalCode || data.invite?.client.postalCode || "",
    }));
    setDownloadUrl(trustedPdfUrl(data.signed?.pdfUrl));
    setDownloadExpiresIn(data.signed?.pdfUrlExpiresIn || 0);
    setManualScanDownloadUrl(trustedPdfUrl(data.signed?.manualScanPdfUrl));
    setManualScanDownloadExpiresIn(data.signed?.manualScanPdfUrlExpiresIn || 0);
    setPageState(isFinishedStatus(data.status) ? "completed" : "ready");
    return true;
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    const loadInvite = async () => {
      try {
        const data = await requestConsent(token, { action: "get" });
        if (active && !applyResponse(data)) setPageState("error");
      } catch (error) {
        if (!active) return;
        const details = error instanceof ConsentRequestError ? { code: error.code, message: error.message, status: error.status } : { code: "request_failed", message: "The secure request was not accepted." };
        setPageState(details.code === "consent_processing" ? "processing" : unavailableReason(details));
      }
    };
    void loadInvite();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token || pageState !== "processing") return;
    let active = true;
    let retryTimer: number | undefined;
    const checkStatus = async () => {
      try {
        const data = await requestConsent(token, { action: "get" });
        if (active && !applyResponse(data)) setPageState("error");
      } catch (error) {
        if (!active) return;
        const details = error instanceof ConsentRequestError ? { code: error.code, message: error.message, status: error.status } : { code: "request_failed", message: "The secure request was not accepted." };
        if (details.code === "consent_processing") retryTimer = window.setTimeout(() => { void checkStatus(); }, 3_000);
        else setPageState(unavailableReason(details));
      }
    };
    retryTimer = window.setTimeout(() => { void checkStatus(); }, 3_000);
    return () => { active = false; if (retryTimer !== undefined) window.clearTimeout(retryTimer); };
  }, [pageState, token]);

  useEffect(() => { if (formError) alertRef.current?.focus(); }, [formError]);
  useEffect(() => { if (pageState === "completed") completionRef.current?.focus(); }, [pageState]);

  const clientFirstName = invite?.client.firstName?.trim() || "";
  const clientLastName = invite?.client.lastName?.trim() || "";
  const fullName = consent?.requiredSignature || invite?.client.legalName || [clientFirstName, clientLastName].filter(Boolean).join(" ");
  const ticketNumbers = Array.from(new Set((invite?.matter.ticketNumbers?.length ? invite.matter.ticketNumbers : [invite?.matter.ticketNumber || ""]).map((ticketNumber) => ticketNumber.trim()).filter(Boolean)));
  const typedSignatureMatches = Boolean(fullName && form.digitalSignature && normalizeName(form.digitalSignature) === normalizeName(fullName));
  const manualSignatureMatches = Boolean(fullName && form.manualSignedName && normalizeName(form.manualSignedName) === normalizeName(fullName));
  const expiry = invite ? formatExpiry(invite.expiresAt) : null;
  const officialFormUrl = trustedGovernmentFormUrl(governmentForm?.sourceUrl);

  const updateField = <Key extends keyof ConsentFormData>(key: Key, value: ConsentFormData[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next; });
    if (formError) setFormError("");
  };

  const selectSignatureMethod = (value: string) => {
    if (value !== "typed" && value !== "manual_scan") return;
    setSignatureMethod(value);
    setForm((current) => ({ ...current, accepted: false }));
    setFieldErrors({});
    setFormError("");
  };

  const selectManualFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;
    const contentType = contentTypeForFile(file);
    if (!contentType) {
      setFieldErrors((current) => ({ ...current, manualFile: "Choose a PDF, JPEG, or PNG file." }));
      setFormError("The hand-signed form could not be selected. Review the file requirement below.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_MANUAL_SCAN_BYTES) {
      setFieldErrors((current) => ({ ...current, manualFile: "The file must be no larger than 10 MB." }));
      setFormError("The hand-signed form could not be selected. Review the file requirement below.");
      return;
    }
    setManualFile(file);
    setUploadedManualScan(null);
    setManualUploadState("idle");
    setFieldErrors((current) => { const next = { ...current }; delete next.manualFile; return next; });
    setFormError("");
  };

  const removeManualFile = () => {
    if (manualUploadState === "uploading") return;
    setManualFile(null);
    setUploadedManualScan(null);
    setManualUploadState("idle");
    setFieldErrors((current) => { const next = { ...current }; delete next.manualFile; return next; });
  };

  const validateForm = () => {
    const errors: FieldErrors = {};
    if (!clientFirstName || !clientLastName) errors.clientIdentity = "Your first and last name must be present on the secure invitation.";
    if (!ticketNumbers.length) errors.ticketNumbers = "At least one violation ticket number is required.";
    if (!representative?.firstName || !representative.lastName || !representative.phone) errors.representative = "Fabsy must complete the representative name and phone number before this form can be signed.";
    if (!form.dateOfBirth.trim()) errors.dateOfBirth = "Enter your date of birth.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) || form.dateOfBirth < "1900-01-01" || form.dateOfBirth > localDateValue()) errors.dateOfBirth = "Enter a valid date of birth that is not in the future.";
    if (!form.address.trim()) errors.address = "Enter your mailing address.";
    if (!form.city.trim()) errors.city = "Enter your city or town.";
    if (form.phone.trim()) {
      const phoneDigitCount = form.phone.replace(/\D/g, "").length;
      if (!/^[0-9+(). -]+$/.test(form.phone) || phoneDigitCount < 10 || phoneDigitCount > 15) errors.phone = "Enter a valid phone number, including the area code, or leave this optional field blank.";
    }
    if (form.postalCode.trim()) {
      const postalCode = form.postalCode.trim().toUpperCase();
      if (postalCode.length < 3 || !/^[A-Z0-9][A-Z0-9 -]*[A-Z0-9]$/.test(postalCode)) errors.postalCode = "Enter a valid postal code or leave this optional field blank.";
    }
    if (!form.accepted) errors.accepted = "Confirm the authorization before submitting.";

    if (signatureMethod === "typed") {
      if (!form.digitalSignature.trim()) errors.digitalSignature = "Type your full legal name to sign.";
      else if (!typedSignatureMatches) errors.digitalSignature = `Your typed signature must match ${fullName}.`;
    } else {
      if (!form.manualSignedName.trim()) errors.manualSignedName = "Enter the printed name shown on the hand-signed form.";
      else if (!manualSignatureMatches) errors.manualSignedName = `The printed name must match ${fullName}.`;
      if (!form.manualSignedDate) errors.manualSignedDate = "Enter the date written on the hand-signed form.";
      else if (form.manualSignedDate < "1900-01-01" || form.manualSignedDate > localDateValue()) errors.manualSignedDate = "Enter a valid signed date that is not in the future.";
      if (!manualFile) errors.manualFile = "Take a clear photo or choose the complete signed PDF or image.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length) { setFormError("Review the highlighted information before submitting your consent."); return false; }
    setFormError("");
    return true;
  };

  const ensureManualScanUploaded = async () => {
    if (uploadedManualScan) return uploadedManualScan;
    if (!manualFile || !consent) throw new ConsentRequestError({ code: "manual_scan_required", message: "A hand-signed form is required." });
    const contentType = contentTypeForFile(manualFile);
    setManualUploadState("uploading");
    const uploadResponse = await requestConsent(token, {
      action: "create_manual_upload",
      consentTextHash: consent.hash,
      file: { name: manualFile.name, contentType, size: manualFile.size },
    });
    if (!hasSafeUploadTarget(uploadResponse.upload)) throw new ConsentRequestError({ code: "invalid_upload_target", message: "The secure upload could not be prepared." });
    const upload = uploadResponse.upload;
    const effectiveMaxBytes = Math.min(MAX_MANUAL_SCAN_BYTES, Number.isFinite(upload.maxBytes) && upload.maxBytes > 0 ? upload.maxBytes : MAX_MANUAL_SCAN_BYTES);
    if (manualFile.size > effectiveMaxBytes) throw new ConsentRequestError({ code: "manual_scan_too_large", message: "The selected file exceeds the secure upload limit." });
    if (upload.allowedTypes?.length && !upload.allowedTypes.includes(contentType)) throw new ConsentRequestError({ code: "manual_scan_type_not_allowed", message: "The selected file type is not accepted." });
    const { error: uploadError } = await supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, manualFile, { contentType, upsert: false });
    if (uploadError) throw new ConsentRequestError({ code: "manual_scan_upload_failed", message: "The secure file upload did not finish." });
    const uploaded = { path: upload.path, contentType, size: manualFile.size };
    setUploadedManualScan(uploaded);
    setManualUploadState("uploaded");
    return uploaded;
  };

  const submitConsent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invite || !consent || pageState !== "ready" || submitStartedRef.current || !validateForm()) return;
    submitStartedRef.current = true;
    setPageState("submitting");
    setFormError("");
    let manualScanPrepared = uploadedManualScan;
    try {
      const signedAt = new Date().toISOString();
      const normalizedFormData = {
        phone: form.phone.trim(), dateOfBirth: form.dateOfBirth, address: form.address.trim(), city: form.city.trim(),
        province: form.province.trim(), postalCode: form.postalCode.trim().toUpperCase(), signedAt,
      };
      const body: Record<string, unknown> = { action: "submit", signatureMethod, accepted: true, consentTextHash: consent.hash, formData: normalizedFormData };
      if (signatureMethod === "typed") body.digitalSignature = form.digitalSignature.trim();
      else {
        const manualScan = await ensureManualScanUploaded();
        manualScanPrepared = manualScan;
        body.manualSignedName = form.manualSignedName.trim();
        body.manualSignedDate = form.manualSignedDate;
        body.manualScan = manualScan;
      }
      const data = await requestConsent(token, body);
      if (!isFinishedStatus(data.status) || !data.invite || !data.consent) throw new ConsentRequestError({ code: "invalid_response", message: "Consent was not saved." });
      applyResponse(data);
      setSignedDetails(data.signed || { signedAt, signatureMethod });
      setPageState("completed");
    } catch (error) {
      const details = error instanceof ConsentRequestError ? { code: error.code, message: error.message, status: error.status } : { code: "request_failed", message: "The secure request was not accepted." };
      const reason = unavailableReason(details);
      submitStartedRef.current = false;
      if (signatureMethod === "manual_scan" && !manualScanPrepared) setManualUploadState("error");
      if (reason === "expired" || reason === "revoked" || reason === "invalid") setPageState(reason);
      else {
        setPageState("ready");
        if (details.code === "signature_mismatch" || details.code === "signature_required") {
          const fieldName = signatureMethod === "typed" ? "digitalSignature" : "manualSignedName";
          setFieldErrors((current) => ({ ...current, [fieldName]: `The signature must match ${fullName}.` }));
          setFormError(`The signature must match the full legal name shown on this form: ${fullName}.`);
        } else if (details.code === "consent_version_changed") {
          setForm((current) => ({ ...current, accepted: false }));
          setFormError("The consent wording changed before signing. Reopen the secure invitation and review the current authorization.");
        } else if (details.code === "consent_processing") setPageState("processing");
        else if (details.code === "invalid_client_details") setFormError("Review your identification and mailing information, then try again.");
        else if (details.code.startsWith("manual_scan") || details.code === "invalid_upload_target") {
          setFieldErrors((current) => ({ ...current, manualFile: "The signed form could not be uploaded. Remove it, choose the file again, and retry." }));
          setFormError("The hand-signed form was not submitted. Choose the file again and retry.");
        } else setFormError("Your consent was not saved. Nothing was submitted. Review the fields and try again.");
      }
    }
  };

  const renderCompletion = () => {
    const completedMethod = signedDetails?.signatureMethod || "typed";
    const isManual = completedMethod === "manual_scan";
    const reviewStatus = (signedDetails?.manualScanReviewStatus || "").toLowerCase();
    const requiresReupload = reviewStatus === "requires_reupload" || reviewStatus === "rejected";
    const pendingReview = isManual && !reviewStatus.match(/^(approved|accepted|completed)$/) && !requiresReupload;
    return (
      <Card className="mx-auto max-w-2xl p-6 text-center shadow-elevated sm:p-10" aria-live="polite">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
        <h2 ref={completionRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">{isManual ? "Hand-signed form received" : "Online Fabsy authorization completed"}</h2>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground">{isManual ? "Fabsy securely received your hand-signed APTO form and recorded it with this matter." : "Your consent and electronic signature have been securely recorded."}</p>
        {formatSignedAt(signedDetails?.signedAt) ? <p className="mt-3 text-sm text-muted-foreground">Recorded {formatSignedAt(signedDetails?.signedAt)}</p> : null}
        {pendingReview ? <Alert className="mt-6 text-left"><FileCheck2 aria-hidden="true" /><AlertTitle>Document check in progress</AlertTitle><AlertDescription>Fabsy will check that the complete form, signature, and date are readable before relying on the scan.</AlertDescription></Alert> : null}
        {requiresReupload ? <Alert variant="destructive" className="mt-6 text-left"><AlertCircle aria-hidden="true" /><AlertTitle>A new scan is required</AlertTitle><AlertDescription>Contact Fabsy for a new secure upload link so the complete signed page can be provided.</AlertDescription></Alert> : null}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          {downloadUrl ? <Button asChild size="lg"><a href={downloadUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><Download aria-hidden="true" />Download consent record</a></Button> : null}
          {isManual && manualScanDownloadUrl ? <Button asChild size="lg" variant="outline"><a href={manualScanDownloadUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><FileSignature aria-hidden="true" />Download hand-signed scan</a></Button> : null}
        </div>
        {downloadUrl && downloadExpiresIn > 0 ? <p className="mt-4 text-xs text-muted-foreground">The consent-record download expires in about {Math.max(1, Math.round(downloadExpiresIn / 60))} minutes.</p> : null}
        {manualScanDownloadUrl && manualScanDownloadExpiresIn > 0 ? <p className="mt-2 text-xs text-muted-foreground">The private scan download expires in about {Math.max(1, Math.round(manualScanDownloadExpiresIn / 60))} minutes.</p> : null}
        {!downloadUrl && !manualScanDownloadUrl ? <p className="mt-5 text-sm text-muted-foreground">Contact <a className="underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a> if you need a copy.</p> : null}
      </Card>
    );
  };

  const renderContent = () => {
    if (pageState === "loading" || pageState === "processing") return (
      <Card className="mx-auto max-w-2xl p-8 text-center shadow-fab" role="status" aria-live="polite">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        <h2 className="text-xl font-semibold">{pageState === "processing" ? "Finalizing your consent" : "Opening your secure consent form"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{pageState === "processing" ? "Keep this page open. Your secure documents will appear when they are ready." : "This normally takes only a moment."}</p>
      </Card>
    );
    if (["missing", "invalid", "expired", "revoked", "error"].includes(pageState)) return <UnavailableConsent reason={pageState as UnavailableReason} />;
    if (pageState === "completed") return renderCompletion();
    if (!invite || !consent) return <UnavailableConsent reason="error" />;

    return (
      <form className="space-y-6" onSubmit={submitConsent} noValidate aria-busy={pageState === "submitting"}>
        <Card className="overflow-hidden border-primary/20 shadow-fab">
          <div className="border-b bg-muted/50 px-5 py-4 sm:px-7"><div className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck aria-hidden="true" />Your matter</div></div>
          <div className="space-y-6 p-5 sm:p-7">
            <dl className="grid gap-5 sm:grid-cols-2">
              <Definition label="Full legal name" value={fullName} /><Definition label="Email kept by Fabsy" value={invite.client.email} />
              <div className="min-w-0 sm:col-span-2" id="consent-ticket-numbers">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Violation ticket number(s)</dt>
                <dd className="mt-2">{ticketNumbers.length ? <ul className="flex flex-wrap gap-2" aria-label="Violation ticket numbers">{ticketNumbers.map((ticketNumber) => <li key={ticketNumber} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-semibold text-foreground">{ticketNumber}</li>)}</ul> : <span className="text-sm font-medium text-destructive">Not provided</span>}<InlineError id="ticket-numbers-error" message={fieldErrors.ticketNumbers} /></dd>
              </div>
              <Definition label="Charge" value={invite.matter.charge} />
              {invite.matter.offenceDate ? <Definition label="Offence date" value={invite.matter.offenceDate} /> : null}
              {invite.matter.courtLocation ? <Definition label="Court location" value={invite.matter.courtLocation} /> : null}
              {invite.matter.courtDate ? <Definition label="Court date" value={invite.matter.courtDate} /> : null}
              {invite.matter.details ? <Definition label="Matter details" value={invite.matter.details} /> : null}
            </dl>
            {expiry ? <p className="flex items-start gap-2 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />This secure invitation expires {expiry}.</p> : null}
          </div>
        </Card>

        <Card id="government-details" className="p-5 shadow-fab sm:p-7">
          <fieldset>
            <legend className="text-xl font-bold">Person giving consent — government form details</legend>
            <p className="mt-2 text-sm text-muted-foreground">These fields map to Alberta form {governmentForm?.code || "APTO13348"}. Fields labelled optional are not marked mandatory on the government form.</p>
            <dl className="mt-6 grid gap-5 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"><Definition label="First name" value={clientFirstName} /><Definition label="Last name" value={clientLastName} /></dl>
            <InlineError id="client-identity-error" message={fieldErrors.clientIdentity} />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="consent-dob">Date of birth <span aria-hidden="true">*</span></Label>
                <Input id="consent-dob" type="date" autoComplete="bday" min="1900-01-01" max={localDateValue()} required aria-required="true" aria-invalid={Boolean(fieldErrors.dateOfBirth)} aria-describedby={fieldErrors.dateOfBirth ? "consent-dob-error" : "consent-dob-help"} value={form.dateOfBirth} onChange={(event) => updateField("dateOfBirth", event.target.value)} />
                <p id="consent-dob-help" className="text-xs text-muted-foreground">Use yyyy-mm-dd.</p><InlineError id="consent-dob-error" message={fieldErrors.dateOfBirth} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-phone">Phone number <span className="font-normal text-muted-foreground">(optional on APTO form)</span></Label>
                <Input id="consent-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} placeholder="(780) 555-0123" aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "consent-phone-error" : undefined} value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                <InlineError id="consent-phone-error" message={fieldErrors.phone} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="consent-address">Mailing address <span aria-hidden="true">*</span></Label>
                <Input id="consent-address" autoComplete="street-address" maxLength={160} required aria-required="true" aria-invalid={Boolean(fieldErrors.address)} aria-describedby={fieldErrors.address ? "consent-address-error" : undefined} value={form.address} onChange={(event) => updateField("address", event.target.value)} />
                <InlineError id="consent-address-error" message={fieldErrors.address} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-city">City or town <span aria-hidden="true">*</span></Label>
                <Input id="consent-city" autoComplete="address-level2" maxLength={80} required aria-required="true" aria-invalid={Boolean(fieldErrors.city)} aria-describedby={fieldErrors.city ? "consent-city-error" : undefined} value={form.city} onChange={(event) => updateField("city", event.target.value)} />
                <InlineError id="consent-city-error" message={fieldErrors.city} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-province">Province <span className="font-normal text-muted-foreground">(optional on APTO form)</span></Label>
                <Input id="consent-province" autoComplete="address-level1" autoCapitalize="characters" maxLength={80} placeholder="AB" value={form.province} onChange={(event) => updateField("province", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-postal">Postal code <span className="font-normal text-muted-foreground">(optional on APTO form)</span></Label>
                <Input id="consent-postal" autoComplete="postal-code" autoCapitalize="characters" maxLength={12} placeholder="T4N 1A1" aria-invalid={Boolean(fieldErrors.postalCode)} aria-describedby={fieldErrors.postalCode ? "consent-postal-error" : undefined} value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value.toUpperCase())} />
                <InlineError id="consent-postal-error" message={fieldErrors.postalCode} />
              </div>
            </div>
            <p className="mt-5 text-xs text-muted-foreground"><span aria-hidden="true">*</span> Mandatory on the government form.</p>
          </fieldset>
        </Card>

        <Card id="representative-details" className="p-5 shadow-fab sm:p-7">
          <section aria-labelledby="representative-heading">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Fixed by Fabsy</p><h2 id="representative-heading" className="mt-1 text-xl font-bold">Your named representative</h2>
            <p className="mt-2 text-sm text-muted-foreground">These details are supplied by Fabsy and cannot be changed from this invitation.</p>
            <dl className="mt-6 grid gap-5 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
              <Definition label="First name" value={representative?.firstName} /><Definition label="Last name" value={representative?.lastName} />
              <Definition label="Phone number" value={representative?.phone} />
            </dl>
            <InlineError id="representative-error" message={fieldErrors.representative} />
          </section>
        </Card>

        <Card className="p-5 shadow-fab sm:p-7">
          <section aria-labelledby="authorization-heading" className="space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Please read before signing</p>
              <h2 id="authorization-heading" className="mt-1 text-xl font-bold">Representation authorization</h2>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">Alberta Consent for Representation</p>
                  <p className="mt-1 text-sm text-muted-foreground">{governmentForm?.code || "APTO13348"}{governmentForm?.revision ? ` · Revision ${governmentForm.revision}` : " · Revision 2023-08"}</p>
                </div>
                <a className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-primary underline underline-offset-4" href={officialFormUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">View official form<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
              </div>
              <p className="mt-4 text-sm leading-6">By signing, you authorize the representative named above to act for the listed ticket number(s), access the related information in Alberta's Traffic Ticket Digital Service, and request and receive full disclosure.</p>
              <p className="mt-3 text-sm leading-6">The authorization begins on the date signed and continues until you withdraw it, including by contacting TTDS at <span className="break-all">JSG.TrafficTicketsSupport@gov.ab.ca</span>.</p>
            </div>
            <Alert><ShieldCheck aria-hidden="true" /><AlertTitle>{governmentForm?.securityClassification || "Protected B when completed"}</AlertTitle><AlertDescription>Your completed consent contains sensitive personal information. Fabsy stores and provides it only through this secure invitation.</AlertDescription></Alert>
            <details className="rounded-lg border bg-muted/20 p-4 sm:p-5">
              <summary className="cursor-pointer font-semibold text-primary underline-offset-4 hover:underline">Read the complete consent wording</summary>
              <ConsentText text={consent.text} />
              <p className="mt-4 text-xs text-muted-foreground">Consent version: {consent.version}</p>
            </details>
          </section>
        </Card>

        <Card className="p-5 shadow-fab sm:p-7">
          <fieldset className="space-y-6">
            <legend className="text-xl font-bold">Choose how to sign</legend>
            <RadioGroup value={signatureMethod} onValueChange={selectSignatureMethod} className="grid gap-3 sm:grid-cols-2" aria-label="Signature method">
              <Label htmlFor="signature-typed" className={`flex min-h-28 cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors ${signatureMethod === "typed" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}>
                <RadioGroupItem id="signature-typed" value="typed" className="mt-1 h-5 w-5 shrink-0" /><span><span className="block font-semibold text-foreground">Sign electronically</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">Recommended. Type your name to sign this secure consent online.</span></span>
              </Label>
              <Label htmlFor="signature-manual" className={`flex min-h-28 cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors ${signatureMethod === "manual_scan" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}>
                <RadioGroupItem id="signature-manual" value="manual_scan" className="mt-1 h-5 w-5 shrink-0" /><span><span className="block font-semibold text-foreground">Sign by hand and upload</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">Print the official form, sign it, then upload one complete scan or photo.</span></span>
              </Label>
            </RadioGroup>

            {signatureMethod === "typed" ? (
              <div className="space-y-2">
                <Alert className="mb-4"><FileSignature aria-hidden="true" /><AlertTitle>Electronic Fabsy consent</AlertTitle><AlertDescription>Your typed name signs this secure consent record. If Alberta requires the prescribed APTO PDF, Fabsy will contact you.</AlertDescription></Alert>
                <Label htmlFor="consent-signature">Type your full legal name exactly as shown above</Label>
                <Input id="consent-signature" autoComplete="name" maxLength={200} required className="font-serif text-lg" aria-invalid={Boolean(fieldErrors.digitalSignature)} aria-describedby={fieldErrors.digitalSignature ? "signature-error" : "signature-help"} value={form.digitalSignature} onChange={(event) => updateField("digitalSignature", event.target.value)} />
                <p id="signature-help" className={`text-xs ${form.digitalSignature && !typedSignatureMatches ? "text-destructive" : "text-muted-foreground"}`}>{form.digitalSignature && !typedSignatureMatches ? `Signature must match: ${fullName}` : `Required signature: ${fullName}`}</p>
                <InlineError id="signature-error" message={fieldErrors.digitalSignature} />
              </div>
            ) : (
              <div className="space-y-5 rounded-lg border bg-muted/20 p-4 sm:p-5">
                <div>
                  <h3 className="text-lg font-semibold">Upload a hand-signed APTO form</h3>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                    <li><a className="font-semibold text-primary underline" href={officialFormUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Download the official APTO form</a> and open it in Adobe Reader on a computer. The government PDF does not work inside a mobile browser.</li>
                    <li>Complete the client, representative, and violation-ticket fields using the details shown on this page.</li>
                    <li>Print the page, write the signed date, and sign it by hand.</li>
                    <li>Upload the entire page as one PDF or one clear, well-lit photo with all four corners visible.</li>
                  </ol>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="manual-signed-name">Printed name on signed form</Label>
                    <Input id="manual-signed-name" autoComplete="name" maxLength={200} required aria-invalid={Boolean(fieldErrors.manualSignedName)} aria-describedby={fieldErrors.manualSignedName ? "manual-name-error" : "manual-name-help"} value={form.manualSignedName} onChange={(event) => updateField("manualSignedName", event.target.value)} />
                    <p id="manual-name-help" className="text-xs text-muted-foreground">Must match {fullName} exactly.</p><InlineError id="manual-name-error" message={fieldErrors.manualSignedName} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-signed-date">Date written on signed form</Label>
                    <Input id="manual-signed-date" type="date" min="1900-01-01" max={localDateValue()} required aria-invalid={Boolean(fieldErrors.manualSignedDate)} aria-describedby={fieldErrors.manualSignedDate ? "manual-date-error" : "manual-date-help"} value={form.manualSignedDate} onChange={(event) => updateField("manualSignedDate", event.target.value)} />
                    <p id="manual-date-help" className="text-xs text-muted-foreground">Use yyyy-mm-dd.</p><InlineError id="manual-date-error" message={fieldErrors.manualSignedDate} />
                  </div>
                </div>
                <div id="manual-file-section" className="space-y-3">
                  <div><p className="text-sm font-semibold text-foreground">Complete signed page</p><p className="mt-1 text-xs text-muted-foreground">PDF, JPEG, or PNG · maximum 10 MB · one complete page</p></div>
                  <input ref={photoInputRef} hidden type="file" accept="image/jpeg,image/png" capture="environment" onChange={selectManualFile} />
                  <input ref={documentInputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={selectManualFile} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => photoInputRef.current?.click()} disabled={manualUploadState === "uploading"}><Camera aria-hidden="true" />Take photo</Button>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => documentInputRef.current?.click()} disabled={manualUploadState === "uploading"}><FileUp aria-hidden="true" />{manualFile ? "Replace PDF or image" : "Choose PDF or image"}</Button>
                  </div>
                  {manualFile ? <div className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-sm font-semibold text-foreground">{manualFile.name}</p><p className="mt-1 text-xs text-muted-foreground">{contentTypeForFile(manualFile)} · {formatFileSize(manualFile.size)}</p></div><Button type="button" variant="ghost" className="min-h-11 self-start text-destructive hover:text-destructive sm:self-auto" onClick={removeManualFile} disabled={manualUploadState === "uploading"}><Trash2 aria-hidden="true" />Remove</Button></div> : null}
                  <InlineError id="manual-file-error" message={fieldErrors.manualFile} />
                  <div aria-live="polite" role="status">
                    {manualUploadState === "uploading" ? <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium text-primary"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Securely uploading the signed form…</p><Progress value={65} aria-label="Signed form upload in progress" /></div> : null}
                    {manualUploadState === "uploaded" ? <p className="flex items-center gap-2 text-sm font-medium text-primary"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Signed form uploaded. Finalizing your consent…</p> : null}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
              <Checkbox id="consent-accepted" checked={form.accepted} onCheckedChange={(checked) => updateField("accepted", checked === true)} aria-invalid={Boolean(fieldErrors.accepted)} aria-describedby={fieldErrors.accepted ? "consent-accepted-error" : "consent-confirmation"} />
              <div><Label id="consent-confirmation" htmlFor="consent-accepted" className="cursor-pointer text-sm font-normal leading-6">{signatureMethod === "typed" ? "I am the person named above. I have reviewed and understood the representation authorization and complete consent wording, and I intend my typed name to be my electronic signature." : "I am the person named above. I have reviewed and understood the representation authorization and confirm that the uploaded file is a complete and unaltered copy of the official APTO form I signed by hand."}</Label><InlineError id="consent-accepted-error" message={fieldErrors.accepted} /></div>
            </div>
          </fieldset>

          {formError ? (
            <Alert ref={alertRef} tabIndex={-1} variant="destructive" className="mt-5 outline-none">
              <AlertCircle aria-hidden="true" /><AlertTitle>Consent not submitted</AlertTitle>
              <AlertDescription>
                <p>{formError}</p>
                {Object.entries(fieldErrors).length ? <ul className="mt-2 list-disc space-y-1 pl-5">{Object.entries(fieldErrors).map(([field, message]) => {
                  const targets: Record<string, string> = { clientIdentity: "government-details", ticketNumbers: "consent-ticket-numbers", representative: "representative-details", dateOfBirth: "consent-dob", phone: "consent-phone", address: "consent-address", city: "consent-city", postalCode: "consent-postal", digitalSignature: "consent-signature", manualSignedName: "manual-signed-name", manualSignedDate: "manual-signed-date", manualFile: "manual-file-section", accepted: "consent-accepted" };
                  return <li key={field}><a className="underline" href={`#${targets[field] || "government-details"}`}>{message}</a></li>;
                })}</ul> : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" size="lg" className="mt-6 min-h-12 w-full sm:w-auto" disabled={pageState === "submitting"}>
            {pageState === "submitting" ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileSignature aria-hidden="true" />}
            {pageState === "submitting" ? (signatureMethod === "manual_scan" ? "Uploading and submitting…" : "Securely saving…") : (signatureMethod === "manual_scan" ? "Upload and submit signed form" : "Sign and submit consent")}
          </Button>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Your secure invitation is required to view or submit this consent.</p>
        </Card>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-soft">
      <style>{`.fabsy-private-consent .md\\:hidden.fixed.inset-x-0.bottom-0.z-40{display:none!important}`}</style>
      <PrivateHeader />
      <main id="main-content">
        <section className="bg-gradient-hero px-4 py-8 text-white sm:py-10">
          <div className="container mx-auto max-w-4xl px-0 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><FileSignature className="h-5 w-5" aria-hidden="true" /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">Secure client document</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Traffic ticket representation consent</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">Confirm the government-form details, review the authorization, and sign online or upload the official hand-signed form.</p>
          </div>
        </section>
        <div className="container mx-auto max-w-4xl px-4 py-8 sm:py-12">{renderContent()}</div>
      </main>
      <PrivateFooter />
    </div>
  );
}
