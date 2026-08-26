import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSignature,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import useSafeHead from "@/hooks/useSafeHead";

type ConsentStatus = "pending" | "completed";
type UnavailableReason = "missing" | "invalid" | "expired" | "revoked" | "error";
type PageState = "loading" | "processing" | "ready" | "submitting" | "completed" | UnavailableReason;

interface ConsentInvite {
  client: {
    legalName: string;
    email: string;
    phone: string | null;
    dateOfBirth?: string | null;
    address: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    driversLicense?: string | null;
  };
  matter: {
    ticketNumber: string;
    charge: string;
    offenceDate: string | null;
    courtLocation: string | null;
    courtDate: string | null;
    details: string | null;
  };
  fees: {
    baseFeeCents: number | null;
    currency: string;
    taxTerms: string;
    successFeePercent: number | null;
    successFeeWaived: boolean;
    additionalTerms: string | null;
  };
  expiresAt: string;
}

interface ConsentResponse {
  invite?: ConsentInvite;
  consent?: {
    version: string;
    text: string;
    hash: string;
    requiredSignature: string;
  };
  status?: ConsentStatus;
  signed?: {
    signedAt: string;
    digitalSignature?: string;
    pdfUrl?: string;
    pdfUrlExpiresIn?: number;
    pdfSha256?: string;
  };
  formData?: {
    phone: string | null;
    dateOfBirth: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    driversLicense: string | null;
    signedAt?: string | null;
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
  driversLicense: string;
  digitalSignature: string;
  accepted: boolean;
}

const INITIAL_FORM: ConsentFormData = {
  phone: "",
  dateOfBirth: "",
  address: "",
  city: "",
  province: "Alberta",
  postalCode: "",
  driversLicense: "",
  digitalSignature: "",
  accepted: false,
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://gcasbisxfrssonllpqrw.supabase.co";
const CONSENT_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/representation-consent`;

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

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || "CAD"}`;
  }
}

function formatExpiry(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
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

async function requestConsent(token: string, body: Record<string, unknown>): Promise<ConsentResponse> {
  let response: Response;
  try {
    response = await fetch(CONSENT_FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
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
    // The generic response below avoids displaying provider or infrastructure details.
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
  if (
    details.code === "invite_not_found" ||
    hint.includes("invitation not found") ||
    details.status === 401 ||
    details.status === 404
  ) return "invalid";
  return "error";
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{value || "Not provided"}</dd>
    </div>
  );
}

function UnavailableConsent({ reason }: { reason: UnavailableReason }) {
  const copy: Record<UnavailableReason, { title: string; body: string }> = {
    missing: {
      title: "Secure invitation required",
      body: "Open the complete consent link Fabsy sent you. If you copied the address manually, make sure the full link was included.",
    },
    invalid: {
      title: "This consent link is not available",
      body: "The secure link may be incomplete or no longer active. Ask Fabsy for a new consent invitation.",
    },
    expired: {
      title: "This consent link has expired",
      body: "For your privacy, consent links are available only for a limited time. Ask Fabsy for a new invitation.",
    },
    revoked: {
      title: "This consent link is no longer active",
      body: "Ask Fabsy if you still need to complete a representation consent form.",
    },
    error: {
      title: "We could not open the consent form",
      body: "Please try again in a moment. If the problem continues, contact Fabsy for help.",
    },
  };

  return (
    <Card className="mx-auto max-w-2xl p-6 shadow-fab sm:p-8">
      <Alert variant={reason === "error" ? "destructive" : "default"}>
        <AlertCircle aria-hidden="true" />
        <AlertTitle>{copy[reason].title}</AlertTitle>
        <AlertDescription>
          <p>{copy[reason].body}</p>
          <p className="mt-3">
            Email <a className="font-medium underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a> or call{" "}
            <a className="font-medium underline" href="tel:+18257932279">(825) 793-2279</a>.
          </p>
        </AlertDescription>
      </Alert>
    </Card>
  );
}

export default function RepresentationConsent() {
  const [token] = useState(readBearerToken);
  const [pageState, setPageState] = useState<PageState>(() => token ? "loading" : "missing");
  const [invite, setInvite] = useState<ConsentInvite | null>(null);
  const [consent, setConsent] = useState<ConsentResponse["consent"]>(undefined);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadExpiresIn, setDownloadExpiresIn] = useState(0);
  const [form, setForm] = useState<ConsentFormData>(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const completionRef = useRef<HTMLHeadingElement>(null);
  const submitStartedRef = useRef(false);

  useSafeHead({
    title: "Representation Consent | Fabsy",
    description: "Securely review and sign your Fabsy traffic ticket representation consent.",
    canonical: "https://fabsy.ca/representation-consent",
    robots: "noindex, nofollow, noarchive",
  });

  // Read the bearer once, then remove it from the address and browser history
  // before analytics, API calls, or outbound navigation can observe it.
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !token || (!window.location.search && !window.location.hash)) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;

    const loadInvite = async () => {
      try {
        const data = await requestConsent(token, { action: "get" });
        if (!active) return;
        if (!data.invite || !data.consent || !data.status) {
          setPageState("error");
          return;
        }
        setInvite(data.invite);
        setConsent(data.consent);
        setForm((current) => ({
          ...current,
          phone: current.phone || data.formData?.phone || data.invite?.client.phone || "",
          dateOfBirth: current.dateOfBirth || data.formData?.dateOfBirth || data.invite?.client.dateOfBirth || "",
          address: current.address || data.formData?.address || data.invite?.client.address || "",
          city: current.city || data.formData?.city || data.invite?.client.city || "",
          province: data.formData?.province || data.invite?.client.province || current.province || "Alberta",
          postalCode: current.postalCode || data.formData?.postalCode || data.invite?.client.postalCode || "",
          driversLicense: current.driversLicense || data.formData?.driversLicense || data.invite?.client.driversLicense || "",
        }));
        setDownloadUrl(trustedPdfUrl(data.signed?.pdfUrl));
        setDownloadExpiresIn(data.signed?.pdfUrlExpiresIn || 0);
        setPageState(data.status === "completed" ? "completed" : "ready");
      } catch (error) {
        if (!active) return;
        const details = error instanceof ConsentRequestError
          ? { code: error.code, message: error.message, status: error.status }
          : { code: "request_failed", message: "The secure request was not accepted." };
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
        if (!active) return;
        if (!data.invite || !data.consent || !data.status) {
          setPageState("error");
          return;
        }
        setInvite(data.invite);
        setConsent(data.consent);
        setDownloadUrl(trustedPdfUrl(data.signed?.pdfUrl));
        setDownloadExpiresIn(data.signed?.pdfUrlExpiresIn || 0);
        setPageState(data.status === "completed" ? "completed" : "ready");
      } catch (error) {
        if (!active) return;
        const details = error instanceof ConsentRequestError
          ? { code: error.code, message: error.message, status: error.status }
          : { code: "request_failed", message: "The secure request was not accepted." };
        if (details.code === "consent_processing") {
          retryTimer = window.setTimeout(() => { void checkStatus(); }, 3_000);
        } else {
          setPageState(unavailableReason(details));
        }
      }
    };

    retryTimer = window.setTimeout(() => { void checkStatus(); }, 3_000);
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [pageState, token]);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (pageState === "completed") completionRef.current?.focus();
  }, [pageState]);

  const fullName = consent?.requiredSignature || invite?.client.legalName || "";
  const signatureMatches = Boolean(
    fullName && form.digitalSignature && normalizeName(form.digitalSignature) === normalizeName(fullName),
  );
  const expiry = invite ? formatExpiry(invite.expiresAt) : null;
  const feeIsWaived = Boolean(
    invite && (invite.fees.successFeeWaived || invite.fees.successFeePercent === 0),
  );

  const updateField = <Key extends keyof ConsentFormData>(key: Key, value: ConsentFormData[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (formError) setFormError("");
  };

  const submitConsent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invite || !consent || pageState !== "ready" || submitStartedRef.current) return;

    const requiredValues = [
      form.phone,
      form.dateOfBirth,
      form.address,
      form.city,
      form.province,
      form.postalCode,
      form.driversLicense,
      form.digitalSignature,
    ];
    if (requiredValues.some((value) => !value.trim()) || !form.accepted) {
      setFormError("Complete every required field, confirm the authorization, and type your full legal name to sign.");
      return;
    }
    const phone = form.phone.trim();
    const phoneDigitCount = phone.replace(/\D/g, "").length;
    if (!/^[0-9+(). -]+$/.test(phone) || phoneDigitCount < 10 || phoneDigitCount > 15) {
      setFormError("Enter a valid phone number, including the area code.");
      return;
    }
    const today = localDateValue();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) || form.dateOfBirth < "1900-01-01" || form.dateOfBirth > today) {
      setFormError("Enter a valid date of birth that is not in the future.");
      return;
    }
    const postalCode = form.postalCode.trim().toUpperCase();
    if (postalCode.length < 3 || !/^[A-Z0-9][A-Z0-9 -]*[A-Z0-9]$/.test(postalCode)) {
      setFormError("Enter a valid postal code.");
      return;
    }
    const driversLicense = form.driversLicense.trim();
    if (driversLicense.length < 3 || !/^[A-Za-z0-9][A-Za-z0-9 .'-]*[A-Za-z0-9]$/.test(driversLicense)) {
      setFormError("Enter a valid driver's licence number.");
      return;
    }
    if (!signatureMatches) {
      setFormError(`Your typed signature must match the full legal name shown above: ${fullName}.`);
      return;
    }

    submitStartedRef.current = true;
    setPageState("submitting");
    setFormError("");
    try {
      const data = await requestConsent(token, {
        action: "submit",
        accepted: true,
        digitalSignature: form.digitalSignature.trim(),
        consentTextHash: consent.hash,
        formData: {
          phone,
          dateOfBirth: form.dateOfBirth,
          address: form.address.trim(),
          city: form.city.trim(),
          province: form.province.trim(),
          postalCode,
          driversLicense,
          signedAt: new Date().toISOString(),
        },
      });
      if (data.status !== "completed" || !data.invite || !data.consent) {
        throw new ConsentRequestError({ code: "invalid_response", message: "Consent was not saved." });
      }
      setInvite(data.invite);
      setConsent(data.consent);
      setDownloadUrl(trustedPdfUrl(data.signed?.pdfUrl));
      setDownloadExpiresIn(data.signed?.pdfUrlExpiresIn || 0);
      setPageState("completed");
    } catch (error) {
      const details = error instanceof ConsentRequestError
        ? { code: error.code, message: error.message, status: error.status }
        : { code: "request_failed", message: "The secure request was not accepted." };
      const reason = unavailableReason(details);
      submitStartedRef.current = false;
      if (reason === "expired" || reason === "revoked" || reason === "invalid") {
        setPageState(reason);
      } else {
        setPageState("ready");
        if (details.code === "signature_mismatch" || details.code === "signature_required") {
          setFormError(`Your typed signature must match the full legal name shown above: ${fullName}.`);
        } else if (details.code === "consent_version_changed") {
          setForm((current) => ({ ...current, accepted: false }));
          setFormError("The consent terms changed before signing. Reopen the secure invitation and review the current terms.");
        } else if (details.code === "consent_processing") {
          setPageState("processing");
        } else if (details.code === "invalid_client_details") {
          setFormError("Review your phone number, date of birth, address, postal code, and driver's licence number, then try again.");
        } else {
          setFormError("Your consent was not saved. Nothing was submitted. Please review the fields and try again.");
        }
      }
    }
  };

  const renderContent = () => {
    if (pageState === "loading" || pageState === "processing") {
      return (
        <Card className="mx-auto max-w-2xl p-8 text-center shadow-fab" role="status" aria-live="polite">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">
            {pageState === "processing" ? "Finalizing your signed consent" : "Opening your secure consent form"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {pageState === "processing" ? "Keep this page open. Your secure PDF will appear when it is ready." : "This normally takes only a moment."}
          </p>
        </Card>
      );
    }

    if (["missing", "invalid", "expired", "revoked", "error"].includes(pageState)) {
      return <UnavailableConsent reason={pageState as UnavailableReason} />;
    }

    if (pageState === "completed") {
      return (
        <Card className="mx-auto max-w-2xl p-6 text-center shadow-elevated sm:p-10" aria-live="polite">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
          <h2 ref={completionRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">
            Consent completed
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Your signed representation consent has been securely recorded. You do not need to sign it again.
          </p>
          {downloadUrl ? (
            <>
              <Button asChild size="lg" className="mt-6">
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                  <Download aria-hidden="true" />
                  Download your signed consent PDF
                </a>
              </Button>
              {downloadExpiresIn > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  This private download link expires in about {Math.max(1, Math.round(downloadExpiresIn / 60))} minutes. Reopen your original secure invitation if you later need a new link.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Contact <a className="underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a> if you need another copy.
            </p>
          )}
        </Card>
      );
    }

    if (!invite || !consent) return <UnavailableConsent reason="error" />;

    return (
      <form className="space-y-6" onSubmit={submitConsent} noValidate>
        <Card className="overflow-hidden border-primary/20 shadow-fab">
          <div className="border-b bg-muted/50 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck aria-hidden="true" />
              Invitation details
            </div>
          </div>
          <div className="space-y-6 p-5 sm:p-7">
            <dl className="grid gap-5 sm:grid-cols-2">
              <Definition label="Full legal name" value={fullName} />
              <Definition label="Email" value={invite.client.email} />
              <Definition label="Ticket or file number" value={invite.matter.ticketNumber} />
              <Definition label="Charge" value={invite.matter.charge} />
              {invite.matter.offenceDate ? <Definition label="Offence date" value={invite.matter.offenceDate} /> : null}
              {invite.matter.courtLocation ? <Definition label="Court location" value={invite.matter.courtLocation} /> : null}
              {invite.matter.courtDate ? <Definition label="Court date" value={invite.matter.courtDate} /> : null}
              {invite.matter.details ? <Definition label="Matter details" value={invite.matter.details} /> : null}
            </dl>

            <Separator />

            <section aria-labelledby="fee-heading">
              <h2 id="fee-heading" className="text-lg font-semibold">Your agreed fee terms</h2>
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {typeof invite.fees.baseFeeCents === "number" ? (
                    <Definition
                      label="Base representation fee"
                      value={`${formatMoney(invite.fees.baseFeeCents, invite.fees.currency)} ${invite.fees.taxTerms}`}
                    />
                  ) : null}
                  {typeof invite.fees.successFeePercent === "number" ? (
                    <Definition
                      label="Fine-reduction fee"
                      value={feeIsWaived
                        ? `Waived in full for this matter${invite.fees.successFeePercent > 0 ? ` (usual rate: ${invite.fees.successFeePercent}% of any fine reduction)` : ""}`
                        : `${invite.fees.successFeePercent}% of any fine reduction achieved`}
                    />
                  ) : null}
                </dl>
                {invite.fees.additionalTerms ? (
                  <p className="mt-3 text-sm font-medium text-foreground">{invite.fees.additionalTerms}</p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">These are the client-specific fee terms for the matter identified above.</p>
              </div>
            </section>

            {expiry ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                This secure invitation expires {expiry}.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="p-5 shadow-fab sm:p-7">
          <fieldset>
            <legend className="text-xl font-bold">Information required for representation</legend>
            <p className="mt-2 text-sm text-muted-foreground">All fields are required and are used to identify you and act on this matter.</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="consent-phone">Phone number</Label>
                <Input id="consent-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} placeholder="(780) 555-0123" required value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-dob">Date of birth</Label>
                <Input id="consent-dob" type="date" autoComplete="bday" min="1900-01-01" max={localDateValue()} required value={form.dateOfBirth} onChange={(event) => updateField("dateOfBirth", event.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="consent-address">Street address</Label>
                <Input id="consent-address" autoComplete="street-address" maxLength={160} required value={form.address} onChange={(event) => updateField("address", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-city">City</Label>
                <Input id="consent-city" autoComplete="address-level2" maxLength={80} required value={form.city} onChange={(event) => updateField("city", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-province">Province</Label>
                <Input id="consent-province" autoComplete="address-level1" maxLength={80} required value={form.province} onChange={(event) => updateField("province", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-postal">Postal code</Label>
                <Input id="consent-postal" autoComplete="postal-code" autoCapitalize="characters" maxLength={12} placeholder="T4N 1A1" required value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value.toUpperCase())} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-licence">Driver's licence number</Label>
                <Input id="consent-licence" autoComplete="off" autoCapitalize="characters" maxLength={40} required value={form.driversLicense} onChange={(event) => updateField("driversLicense", event.target.value)} />
              </div>
            </div>
          </fieldset>
        </Card>

        <Card className="p-5 shadow-fab sm:p-7">
          <section aria-labelledby="authorization-heading" className="space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Please read before signing</p>
              <h2 id="authorization-heading" className="mt-1 text-xl font-bold">Consent to traffic ticket representation</h2>
            </div>

            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-foreground">
              {consent.text}
            </div>

            <Alert>
              <FileSignature aria-hidden="true" />
              <AlertTitle>Separate government form may still be required</AlertTitle>
              <AlertDescription>
                This is Fabsy's client authorization. Alberta's Traffic Ticket Digital Service (TTDS), a court, or another government body may still require its separate prescribed Consent for Representation form. Fabsy will tell you if that form is needed.
              </AlertDescription>
            </Alert>
            <Alert>
              <AlertCircle aria-hidden="true" />
              <AlertTitle>No guaranteed outcome</AlertTitle>
              <AlertDescription>
                Fabsy does not promise a withdrawal, reduction, acquittal, demerit result, insurance result, premium result, or any other specific outcome. A guilty plea or final negotiated disposition will not be accepted without my instructions.
              </AlertDescription>
            </Alert>
            <Alert>
              <LockKeyhole aria-hidden="true" />
              <AlertTitle>Deadlines still apply</AlertTitle>
              <AlertDescription>
                Signing this form does not extend a response date, payment date, court date, appeal period, or statutory deadline. I will continue following existing notices until Fabsy confirms in writing that it has assumed conduct of the matter.
              </AlertDescription>
            </Alert>

            <p className="text-xs text-muted-foreground">Consent text version: {consent.version}</p>
          </section>
        </Card>

        <Card className="p-5 shadow-fab sm:p-7">
          <fieldset className="space-y-5">
            <legend className="text-xl font-bold">Digital signature</legend>
            <div className="space-y-2">
              <Label htmlFor="consent-signature">Type your full legal name exactly as shown above</Label>
              <Input
                id="consent-signature"
                autoComplete="name"
                maxLength={200}
                required
                className="font-serif text-lg"
                aria-describedby="signature-help"
                value={form.digitalSignature}
                onChange={(event) => updateField("digitalSignature", event.target.value)}
              />
              <p id="signature-help" className={`text-xs ${form.digitalSignature && !signatureMatches ? "text-destructive" : "text-muted-foreground"}`}>
                {form.digitalSignature && !signatureMatches ? `Signature must match: ${fullName}` : `Required signature: ${fullName}`}
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
              <Checkbox id="consent-accepted" checked={form.accepted} onCheckedChange={(checked) => updateField("accepted", checked === true)} aria-describedby="consent-confirmation" />
              <Label id="consent-confirmation" htmlFor="consent-accepted" className="cursor-pointer text-sm font-normal leading-6">
                I am the person named above. I have read and understood this form, agree to the quoted fee terms, authorize representation as described, and intend my typed name to be my electronic signature.
              </Label>
            </div>
          </fieldset>

          {formError ? (
            <Alert ref={alertRef} tabIndex={-1} variant="destructive" className="mt-5 outline-none">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Consent not submitted</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" size="lg" className="mt-6 w-full sm:w-auto" disabled={pageState === "submitting"}>
            <FileSignature aria-hidden="true" />
            {pageState === "submitting" ? "Securely saving…" : "Sign and submit consent"}
          </Button>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            Your secure invitation is required to view or submit this form. This page does not request payment.
          </p>
        </Card>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-soft">
      <Header />
      <main id="main-content">
        <section className="bg-gradient-hero px-4 py-10 text-white sm:py-14">
          <div className="container mx-auto max-w-4xl px-0 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <FileSignature className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-light">Secure client document</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Traffic ticket representation consent</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              Review the matter and exact fee terms, complete your information, and sign securely online. No payment is requested on this page.
            </p>
          </div>
        </section>

        <div className="container mx-auto max-w-4xl px-4 py-8 sm:py-12">
          {renderContent()}
        </div>
      </main>
      <Footer />
    </div>
  );
}
