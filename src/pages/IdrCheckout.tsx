import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CreditCard, FileSearch, LockKeyhole, ShieldCheck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import useSafeHead from "@/hooks/useSafeHead";
import { supabase } from "@/integrations/supabase/client";
import { IDR_DISCLAIMER, IDR_PRICE_STANDALONE } from "@/config/idr";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";

type CheckoutForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const initialForm: CheckoutForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

const STANDALONE_ORDER_KEY = "fabsy-idr-standalone-order";

function getStandaloneOrderId() {
  const fallback = crypto.randomUUID();
  if (typeof window === "undefined") return fallback;
  try {
    const existing = window.sessionStorage.getItem(STANDALONE_ORDER_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    window.sessionStorage.setItem(STANDALONE_ORDER_KEY, fallback);
  } catch {
    return fallback;
  }
  return fallback;
}

const IdrCheckout = () => {
  useSafeHead({
    title: `${INSURANCE_IMPACT_REPORT.name} Checkout | Fabsy`,
    description: `Purchase the standalone Fabsy ${INSURANCE_IMPACT_REPORT.name} for $${IDR_PRICE_STANDALONE} CAD plus applicable GST.`,
    canonical: "https://fabsy.ca/insurance-damage-report/checkout",
    robots: "noindex, nofollow",
  });

  const [form, setForm] = useState<CheckoutForm>(initialForm);
  const [orderId] = useState(getStandaloneOrderId);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const updateField = (field: keyof CheckoutForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validate = () => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneDigits = form.phone.replace(/\D/g, "");

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.phone.trim()
    ) {
      return "Complete every required field before continuing.";
    }

    if (!emailPattern.test(form.email.trim())) {
      return "Enter a valid email address.";
    }

    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return "Enter a valid phone number.";
    }

    if (!agreedToTerms) {
      return "Agree to the Terms of Service and Privacy Policy before continuing.";
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      toast({
        title: "Check your information",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-idr-payment", {
        body: {
          product: "standalone",
          orderId,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
        },
      });

      if (error) throw error;
      if (!data?.url || typeof data.url !== "string") {
        throw new Error("Checkout did not return a secure payment URL.");
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error("IDR checkout error:", error);
      toast({
        title: "Checkout unavailable",
        description: "We could not start secure checkout. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />

      <main className="container mx-auto px-4 py-10 lg:py-16">
        <div className="mx-auto max-w-5xl">
          <Button asChild variant="ghost" className="mb-5 text-white hover:bg-black/20 hover:text-white">
            <Link to="/insurance-damage-report">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to report details
            </Link>
          </Button>

          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <Card className="p-6 shadow-elevated sm:p-8">
              <div className="mb-7">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileSearch className="h-6 w-6" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{INSURANCE_IMPACT_REPORT.name} checkout</h1>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  Enter the information that will identify your standalone report order. After
                  payment, Fabsy will provide secure instructions for ordering and uploading your
                  commercial 5-year Alberta driver's abstract and supplying the requested renewal context.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="idr-first-name">First name *</Label>
                    <Input
                      id="idr-first-name"
                      name="firstName"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(event) => updateField("firstName", event.target.value)}
                      disabled={isProcessing}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="idr-last-name">Last name *</Label>
                    <Input
                      id="idr-last-name"
                      name="lastName"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(event) => updateField("lastName", event.target.value)}
                      disabled={isProcessing}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="idr-email">Email *</Label>
                  <Input
                    id="idr-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    disabled={isProcessing}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Secure access instructions will be sent to this address after payment.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="idr-phone">Phone *</Label>
                  <Input
                    id="idr-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                    disabled={isProcessing}
                    required
                  />
                </div>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="idr-terms"
                      checked={agreedToTerms}
                      onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                      disabled={isProcessing}
                      className="mt-0.5"
                    />
                    <Label htmlFor="idr-terms" className="cursor-pointer text-sm leading-relaxed">
                      I agree to Fabsy's{" "}
                      <Link to="/terms-of-service" className="font-medium text-primary underline">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link to="/privacy-policy" className="font-medium text-primary underline">
                        Privacy Policy
                      </Link>
                      .
                    </Label>
                  </div>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">{IDR_DISCLAIMER}</p>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="min-h-12 w-full text-base font-semibold"
                  disabled={isProcessing || !agreedToTerms}
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  {isProcessing ? "Starting secure checkout..." : `Continue to secure checkout for $${IDR_PRICE_STANDALONE}`}
                </Button>
              </form>
            </Card>

            <div className="space-y-6 lg:sticky lg:top-24">
              <Card className="p-6 shadow-fab">
                <h2 className="text-xl font-bold">Order summary</h2>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{INSURANCE_IMPACT_REPORT.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Standalone purchase</p>
                  </div>
                  <p className="font-bold">${IDR_PRICE_STANDALONE} CAD</p>
                </div>
                <div className="my-5 border-t" />
                <div className="flex items-center justify-between text-lg font-bold">
                  <span>Checkout subtotal</span>
                  <span className="text-primary">${IDR_PRICE_STANDALONE} CAD</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Applicable tax is calculated at Stripe checkout.
                </p>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  This checkout is for the standalone report. The required abstract is ordered
                  separately, and government or registry fees apply.
                </p>
              </Card>

              <Card className="border-primary/30 bg-primary/5 p-6">
                <Badge className="mb-3">Need ticket help too?</Badge>
                <h2 className="text-xl font-bold">Both services for ${RAPID_RESOLUTION_BUNDLE.priceCad}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The bundle combines this report with ${RAPID_RESOLUTION.priceCad} {RAPID_RESOLUTION.name} for an eligible Alberta pre-trial matter. Applicable GST is extra; trial representation is separate.
                </p>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link to={RAPID_RESOLUTION.intakePath}>Choose the bundle instead</Link>
                </Button>
              </Card>

              <Card className="p-6">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-bold">Secure Stripe checkout</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Payment details are entered on Stripe's hosted checkout page. Fabsy does not
                      collect card details in this form.
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex items-start gap-3 rounded-lg border border-white/25 bg-black/15 p-5 text-white">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm leading-relaxed text-white/90">
                  Your completed report and survey will be available only through your authenticated
                  customer workspace.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default IdrCheckout;
