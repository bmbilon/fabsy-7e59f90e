import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileSearch,
  Pencil,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import { useToast } from "@/hooks/use-toast";
import { IDR_INSURER_RULE_MAX_AGE_DAYS } from "@/config/idr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import useSafeHead from "@/hooks/useSafeHead";

// New IDR tables land ahead of the generated Supabase client types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const idrDb = supabase as any;

type StaffRole = "admin" | "case_manager";
type ConvictionClass = "minor" | "major" | "serious";
type RuleBehavior = "no_surcharge" | "surcharge" | "decline";

interface ClientSummary {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface AbstractQueueItem {
  id: string;
  idr_order_id: string;
  file_url: string;
  parse_status: "manual_review";
  uploaded_at: string;
  idr_orders?: {
    id: string;
    status: string;
    type: string;
    clients?: ClientSummary | ClientSummary[] | null;
  } | null;
}

interface IdrOrderRow {
  id: string;
  type: "standalone" | "addon";
  price_paid: number;
  status: "paid" | "awaiting_abstract" | "in_review" | "delivered";
  created_at: string;
  clients?: ClientSummary | ClientSummary[] | null;
  abstracts?: { id: string; parse_status: string }[] | null;
}

interface InsurerRuleRow {
  id: string;
  carrier_name: string;
  conviction_class: ConvictionClass;
  threshold_count: number;
  behavior: RuleBehavior;
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

interface RuleFormState {
  carrier_name: string;
  conviction_class: ConvictionClass;
  threshold_count: string;
  behavior: RuleBehavior;
  surcharge_note: string;
  forgiveness_product: boolean;
  forgiveness_note: string;
  phone: string;
  quote_url: string;
  source_publisher: string;
  source_title: string;
  source_url: string;
  last_verified: string;
  estimate_min_percent: string;
  estimate_max_percent: string;
  estimate_source_publisher: string;
  estimate_source_title: string;
  estimate_source_url: string;
  estimate_last_verified: string;
  active: boolean;
}

const EMPTY_RULE: RuleFormState = {
  carrier_name: "",
  conviction_class: "minor",
  threshold_count: "0",
  behavior: "no_surcharge",
  surcharge_note: "",
  forgiveness_product: false,
  forgiveness_note: "",
  phone: "",
  quote_url: "",
  source_publisher: "",
  source_title: "",
  source_url: "",
  last_verified: "",
  estimate_min_percent: "",
  estimate_max_percent: "",
  estimate_source_publisher: "",
  estimate_source_title: "",
  estimate_source_url: "",
  estimate_last_verified: "",
  active: true,
};

function firstClient(value: ClientSummary | ClientSummary[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clientLabel(value: ClientSummary | ClientSummary[] | null | undefined) {
  const client = firstClient(value);
  const name = [client?.first_name, client?.last_name].filter(Boolean).join(" ");
  return name || client?.email || "Client unavailable";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(value));
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

function isValidVerifiedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
}

function isPublicHttpsUrl(value: URL) {
  return value.protocol === "https:" && Boolean(value.hostname) && !value.username && !value.password;
}

function isValidPhone(value: string) {
  return /^\+?[0-9][0-9().\s-]{6,24}(?:\s*(?:x|ext\.?)\s*\d{1,6})?$/i.test(value.trim());
}

function sourceIsStale(value: string) {
  const verifiedAt = new Date(`${value}T00:00:00Z`).getTime();
  const ageDays = Math.floor((Date.now() - verifiedAt) / 86_400_000);
  return ageDays < 0 || ageDays > IDR_INSURER_RULE_MAX_AGE_DAYS;
}

function statusVariant(status: IdrOrderRow["status"]) {
  if (status === "delivered") return "default" as const;
  if (status === "in_review") return "secondary" as const;
  return "outline" as const;
}

export default function AdminIdrDashboard() {
  useSafeHead({ title: "Insurance Report Operations | Fabsy", robots: "noindex, nofollow" });
  const navigate = useNavigate();
  const { toast } = useToast();
  const [role, setRole] = useState<StaffRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<AbstractQueueItem[]>([]);
  const [orders, setOrders] = useState<IdrOrderRow[]>([]);
  const [rules, setRules] = useState<InsurerRuleRow[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE);
  const [isSavingRule, setIsSavingRule] = useState(false);

  const loadIdrData = useCallback(async () => {
    const [queueResult, ordersResult, rulesResult] = await Promise.all([
      idrDb
        .from("abstracts")
        .select("id,idr_order_id,file_url,parse_status,uploaded_at,idr_orders(id,status,type,clients(first_name,last_name,email))")
        .eq("parse_status", "manual_review")
        .order("uploaded_at", { ascending: true }),
      idrDb
        .from("idr_orders")
        .select("id,type,price_paid,status,created_at,clients(first_name,last_name,email),abstracts(id,parse_status)")
        .order("created_at", { ascending: false }),
      idrDb.from("insurer_rules").select("*").order("carrier_name", { ascending: true }),
    ]);

    const firstError = queueResult.error || ordersResult.error || rulesResult.error;
    if (firstError) throw firstError;

    setQueue((queueResult.data || []) as AbstractQueueItem[]);
    setOrders((ordersResult.data || []) as IdrOrderRow[]);
    setRules((rulesResult.data || []) as InsurerRuleRow[]);
  }, []);

  const authenticateAndLoad = useCallback(
    async () => {
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

        setRole(roleData);
        await loadIdrData();
      } catch (loadError: unknown) {
        setError(errorMessage(loadError, "The IDR workspace could not be loaded."));
      } finally {
        setIsLoading(false);
      }
    },
    [loadIdrData, navigate, toast],
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
      void authenticateAndLoad();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [authenticateAndLoad, navigate]);

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleForm(EMPTY_RULE);
  };

  const beginEditRule = (rule: InsurerRuleRow) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      carrier_name: rule.carrier_name,
      conviction_class: rule.conviction_class,
      threshold_count: String(rule.threshold_count),
      behavior: rule.behavior,
      surcharge_note: rule.surcharge_note || "",
      forgiveness_product: rule.forgiveness_product,
      forgiveness_note: rule.forgiveness_note || "",
      phone: rule.phone || "",
      quote_url: rule.quote_url || "",
      source_publisher: rule.source_publisher || "",
      source_title: rule.source_title || "",
      source_url: rule.source_url,
      last_verified: rule.last_verified,
      estimate_min_percent: rule.estimate_min_percent === null ? "" : String(rule.estimate_min_percent),
      estimate_max_percent: rule.estimate_max_percent === null ? "" : String(rule.estimate_max_percent),
      estimate_source_publisher: rule.estimate_source_publisher || "",
      estimate_source_title: rule.estimate_source_title || "",
      estimate_source_url: rule.estimate_source_url || "",
      estimate_last_verified: rule.estimate_last_verified || "",
      active: rule.active,
    });
    document.getElementById("insurer-rule-editor")?.scrollIntoView({ behavior: "smooth" });
  };

  const saveRule = async (event: FormEvent) => {
    event.preventDefault();
    if (role !== "admin") return;

    const threshold = Number(ruleForm.threshold_count);
    let source: URL;
    let quoteUrl: URL | null = null;
    let estimateSourceUrl: URL | null = null;
    try {
      source = new URL(ruleForm.source_url);
    } catch {
      setError("Insurer rules require a valid HTTPS source URL.");
      return;
    }
    if (!isPublicHttpsUrl(source)) {
      setError("Insurer rules require a valid HTTPS source URL.");
      return;
    }
    if (ruleForm.quote_url.trim()) {
      try {
        quoteUrl = new URL(ruleForm.quote_url);
      } catch {
        setError("Public information URL must be a valid HTTPS URL when provided.");
        return;
      }
      if (!isPublicHttpsUrl(quoteUrl)) {
        setError("Public information URL must be a valid HTTPS URL when provided.");
        return;
      }
    }
    if (ruleForm.phone.trim() && !isValidPhone(ruleForm.phone)) {
      setError("Carrier phone must be a valid public contact number when provided.");
      return;
    }
    if (
      !ruleForm.carrier_name.trim() ||
      !ruleForm.source_publisher.trim() ||
      !ruleForm.source_title.trim() ||
      !Number.isInteger(threshold) ||
      threshold < 0
    ) {
      setError("Carrier name, source publisher and title, and a non-negative whole-number threshold are required.");
      return;
    }
    if (!isValidVerifiedDate(ruleForm.last_verified)) {
      setError("Every insurer rule requires a valid, non-future last verified date.");
      return;
    }

    const estimateValues = [
      ruleForm.estimate_min_percent,
      ruleForm.estimate_max_percent,
      ruleForm.estimate_source_publisher,
      ruleForm.estimate_source_title,
      ruleForm.estimate_source_url,
      ruleForm.estimate_last_verified,
    ];
    const hasEstimate = estimateValues.some((value) => value.trim());
    const estimateMinimum = hasEstimate ? Number(ruleForm.estimate_min_percent) : null;
    const estimateMaximum = hasEstimate ? Number(ruleForm.estimate_max_percent) : null;
    if (hasEstimate && estimateValues.some((value) => !value.trim())) {
      setError("A premium estimate requires both percentage bounds and complete source details.");
      return;
    }
    if (
      hasEstimate &&
      (
        estimateMinimum === null ||
        estimateMaximum === null ||
        !Number.isFinite(estimateMinimum) ||
        !Number.isFinite(estimateMaximum) ||
        estimateMinimum < 0 ||
        estimateMaximum < estimateMinimum
      )
    ) {
      setError("Premium estimate percentages must be non-negative, with the maximum at least the minimum.");
      return;
    }
    if (hasEstimate) {
      try {
        estimateSourceUrl = new URL(ruleForm.estimate_source_url);
      } catch {
        setError("Premium estimate source URL must be a valid public HTTPS URL.");
        return;
      }
      if (!isPublicHttpsUrl(estimateSourceUrl)) {
        setError("Premium estimate source URL must be a valid public HTTPS URL.");
        return;
      }
      if (!isValidVerifiedDate(ruleForm.estimate_last_verified)) {
        setError("Premium estimate verification date must be a valid, non-future date.");
        return;
      }
    }

    setIsSavingRule(true);
    setError(null);
    const payload = {
      carrier_name: ruleForm.carrier_name.trim(),
      conviction_class: ruleForm.conviction_class,
      threshold_count: threshold,
      behavior: ruleForm.behavior,
      surcharge_note: ruleForm.surcharge_note.trim() || null,
      forgiveness_product: ruleForm.forgiveness_product,
      forgiveness_note: ruleForm.forgiveness_note.trim() || null,
      phone: ruleForm.phone.trim() || null,
      quote_url: quoteUrl?.toString() || null,
      source_publisher: ruleForm.source_publisher.trim(),
      source_title: ruleForm.source_title.trim(),
      source_url: source.toString(),
      last_verified: ruleForm.last_verified,
      estimate_min_percent: estimateMinimum,
      estimate_max_percent: estimateMaximum,
      estimate_source_publisher: hasEstimate ? ruleForm.estimate_source_publisher.trim() : null,
      estimate_source_title: hasEstimate ? ruleForm.estimate_source_title.trim() : null,
      estimate_source_url: estimateSourceUrl?.toString() || null,
      estimate_last_verified: hasEstimate ? ruleForm.estimate_last_verified : null,
      active: ruleForm.active,
    };

    try {
      const result = editingRuleId
        ? await idrDb.from("insurer_rules").update(payload).eq("id", editingRuleId)
        : await idrDb.from("insurer_rules").insert(payload);

      if (result.error) throw result.error;
      toast({
        title: editingRuleId ? "Rule updated" : "Rule created",
        description: "The insurer research rule has been saved.",
      });
      resetRuleForm();
      await loadIdrData();
    } catch (saveError: unknown) {
      setError(errorMessage(saveError, "The insurer rule could not be saved."));
    } finally {
      setIsSavingRule(false);
    }
  };

  const deactivateRule = async (rule: InsurerRuleRow) => {
    if (role !== "admin" || !rule.active) return;
    setError(null);
    try {
      const { error: updateError } = await idrDb
        .from("insurer_rules")
        .update({ active: false })
        .eq("id", rule.id);
      if (updateError) throw updateError;
      toast({ title: "Rule deactivated", description: `${rule.carrier_name} will be excluded from new reports.` });
      await loadIdrData();
    } catch (deactivateError: unknown) {
      setError(errorMessage(deactivateError, "The insurer rule could not be deactivated."));
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">Loading IDR operations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate("/admin/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Insurance Impact &amp; Renewal Planning Report operations</h1>
              <p className="text-sm text-muted-foreground">Manual abstract review, report orders, and sourced public insurer research.</p>
            </div>
            <Badge variant="outline" className="w-fit"><ShieldCheck className="mr-1 h-3.5 w-3.5" />{role?.replace("_", " ")}</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-8">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Action could not be completed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section aria-labelledby="manual-review-heading">
          <div className="mb-4 flex items-center gap-3">
            <FileSearch className="h-6 w-6 text-primary" />
            <div>
              <h2 id="manual-review-heading" className="text-xl font-semibold">Manual review queue</h2>
              <p className="text-sm text-muted-foreground">Oldest uploaded abstracts are shown first.</p>
            </div>
          </div>
          {queue.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Queue is clear</AlertTitle>
              <AlertDescription>No abstracts currently require manual review.</AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {queue.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{clientLabel(item.idr_orders?.clients)}</CardTitle>
                      <Badge variant="secondary">Manual review</Badge>
                    </div>
                    <CardDescription>Uploaded {formatDate(item.uploaded_at)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" onClick={() => navigate(`/admin/idr/${item.idr_order_id}`)}>
                      Review abstract
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="orders-heading">
          <div className="mb-4 flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-primary" />
            <div>
              <h2 id="orders-heading" className="text-xl font-semibold">Insurance report orders</h2>
              <p className="text-sm text-muted-foreground">Open any order to review its abstract and report data.</p>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No insurance report orders found.</TableCell></TableRow>
                    ) : orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{clientLabel(order.clients)}</TableCell>
                        <TableCell className="capitalize">{order.type}</TableCell>
                        <TableCell>${Number(order.price_paid).toFixed(2)}</TableCell>
                        <TableCell><Badge variant={statusVariant(order.status)}>{order.status.replace("_", " ")}</Badge></TableCell>
                        <TableCell>{formatDate(order.created_at)}</TableCell>
                        <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => navigate(`/admin/idr/${order.id}`)}>Open</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="insurer-rules-heading">
          <div className="mb-4">
            <h2 id="insurer-rules-heading" className="text-xl font-semibold">Sourced insurer rules</h2>
            <p className="text-sm text-muted-foreground">Only administrators can change rules. Every rule must retain an HTTPS source and verification date.</p>
          </div>

          {role === "admin" && (
            <Card id="insurer-rule-editor" className="mb-5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {editingRuleId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingRuleId ? "Edit insurer rule" : "Create insurer rule"}
                </CardTitle>
                <CardDescription>Record only manually verified carrier information.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={saveRule}>
                  <div className="space-y-2">
                    <Label htmlFor="carrier-name">Carrier name</Label>
                    <Input id="carrier-name" required value={ruleForm.carrier_name} onChange={(event) => setRuleForm((value) => ({ ...value, carrier_name: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conviction-class">Conviction class</Label>
                    <Select value={ruleForm.conviction_class} onValueChange={(value: ConvictionClass) => setRuleForm((current) => ({ ...current, conviction_class: value }))}>
                      <SelectTrigger id="conviction-class"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minor">Minor</SelectItem>
                        <SelectItem value="major">Major</SelectItem>
                        <SelectItem value="serious">Serious</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="threshold-count">Threshold count</Label>
                    <Input id="threshold-count" type="number" min="0" step="1" required value={ruleForm.threshold_count} onChange={(event) => setRuleForm((value) => ({ ...value, threshold_count: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rule-behavior">Behavior</Label>
                    <Select value={ruleForm.behavior} onValueChange={(value: RuleBehavior) => setRuleForm((current) => ({ ...current, behavior: value }))}>
                      <SelectTrigger id="rule-behavior"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_surcharge">No surcharge</SelectItem>
                        <SelectItem value="surcharge">Surcharge</SelectItem>
                        <SelectItem value="decline">Decline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="surcharge-note">Surcharge or behavior note</Label>
                    <Textarea id="surcharge-note" value={ruleForm.surcharge_note} onChange={(event) => setRuleForm((value) => ({ ...value, surcharge_note: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="source-publisher">Source publisher</Label>
                    <Input id="source-publisher" required value={ruleForm.source_publisher} onChange={(event) => setRuleForm((value) => ({ ...value, source_publisher: event.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="source-title">Source title</Label>
                    <Input id="source-title" required value={ruleForm.source_title} onChange={(event) => setRuleForm((value) => ({ ...value, source_title: event.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="source-url">Public HTTPS source</Label>
                    <Input id="source-url" type="url" required pattern="https://.*" placeholder="https://" value={ruleForm.source_url} onChange={(event) => setRuleForm((value) => ({ ...value, source_url: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-verified">Last verified</Label>
                    <Input id="last-verified" type="date" required value={ruleForm.last_verified} onChange={(event) => setRuleForm((value) => ({ ...value, last_verified: event.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="forgiveness-product" checked={ruleForm.forgiveness_product} onCheckedChange={(checked) => setRuleForm((value) => ({ ...value, forgiveness_product: checked === true }))} />
                    <Label htmlFor="forgiveness-product">Forgiveness product documented</Label>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="forgiveness-note">Forgiveness note</Label>
                    <Textarea id="forgiveness-note" value={ruleForm.forgiveness_note} onChange={(event) => setRuleForm((value) => ({ ...value, forgiveness_note: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="carrier-phone">Verified carrier phone</Label>
                    <Input id="carrier-phone" type="tel" value={ruleForm.phone} onChange={(event) => setRuleForm((value) => ({ ...value, phone: event.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="quote-url">Verified HTTPS public information URL</Label>
                    <Input id="quote-url" type="url" pattern="https://.*" placeholder="https://" value={ruleForm.quote_url} onChange={(event) => setRuleForm((value) => ({ ...value, quote_url: event.target.value }))} />
                  </div>
                  <fieldset className="grid gap-4 rounded-lg border p-4 md:col-span-2 md:grid-cols-2 xl:col-span-3 xl:grid-cols-3">
                    <legend className="px-2 text-sm font-semibold">Optional sourced annual premium impact range</legend>
                    <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                      Complete every field in this section or leave all fields blank. Enter percentage points, such as 12.5 for 12.5%.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="estimate-min-percent">Minimum percent</Label>
                      <Input id="estimate-min-percent" type="number" min="0" step="0.001" value={ruleForm.estimate_min_percent} onChange={(event) => setRuleForm((value) => ({ ...value, estimate_min_percent: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estimate-max-percent">Maximum percent</Label>
                      <Input id="estimate-max-percent" type="number" min="0" step="0.001" value={ruleForm.estimate_max_percent} onChange={(event) => setRuleForm((value) => ({ ...value, estimate_max_percent: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estimate-source-publisher">Estimate source publisher</Label>
                      <Input id="estimate-source-publisher" value={ruleForm.estimate_source_publisher} onChange={(event) => setRuleForm((value) => ({ ...value, estimate_source_publisher: event.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2 xl:col-span-3">
                      <Label htmlFor="estimate-source-title">Estimate source title</Label>
                      <Input id="estimate-source-title" value={ruleForm.estimate_source_title} onChange={(event) => setRuleForm((value) => ({ ...value, estimate_source_title: event.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="estimate-source-url">Estimate public HTTPS source</Label>
                      <Input id="estimate-source-url" type="url" pattern="https://.*" placeholder="https://" value={ruleForm.estimate_source_url} onChange={(event) => setRuleForm((value) => ({ ...value, estimate_source_url: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estimate-last-verified">Estimate last verified</Label>
                      <Input id="estimate-last-verified" type="date" value={ruleForm.estimate_last_verified} onChange={(event) => setRuleForm((value) => ({ ...value, estimate_last_verified: event.target.value }))} />
                    </div>
                  </fieldset>
                  <div className="flex items-center gap-2">
                    <Checkbox id="rule-active" checked={ruleForm.active} onCheckedChange={(checked) => setRuleForm((value) => ({ ...value, active: checked === true }))} />
                    <Label htmlFor="rule-active">Active rule</Label>
                  </div>
                  <div className="flex gap-2 md:col-span-2 xl:col-span-3">
                    <Button type="submit" disabled={isSavingRule}>{isSavingRule ? "Saving..." : editingRuleId ? "Save changes" : "Create rule"}</Button>
                    {editingRuleId && <Button type="button" variant="outline" onClick={resetRuleForm}><X className="mr-2 h-4 w-4" />Cancel</Button>}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Carrier</TableHead>
                      <TableHead>Class / threshold</TableHead>
                      <TableHead>Behavior</TableHead>
                      <TableHead>Impact range</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead>Status</TableHead>
                      {role === "admin" && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.length === 0 ? (
                      <TableRow><TableCell colSpan={role === "admin" ? 9 : 8} className="py-8 text-center text-muted-foreground">No insurer rules have been recorded.</TableCell></TableRow>
                    ) : rules.map((rule) => (
                      <TableRow key={rule.id} className={!rule.active ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">{rule.carrier_name}</TableCell>
                        <TableCell className="capitalize">{rule.conviction_class} at {rule.threshold_count}</TableCell>
                        <TableCell>{rule.behavior.replace("_", " ")}</TableCell>
                        <TableCell>
                          {rule.estimate_min_percent !== null && rule.estimate_max_percent !== null
                            ? (
                                <div className="flex flex-col items-start gap-1">
                                  <span>{rule.estimate_min_percent}% to {rule.estimate_max_percent}%</span>
                                  {rule.estimate_source_url && (
                                    <a className="text-primary hover:underline" href={rule.estimate_source_url} target="_blank" rel="noreferrer">
                                      Estimate source
                                    </a>
                                  )}
                                  {rule.estimate_last_verified && sourceIsStale(rule.estimate_last_verified) && (
                                    <Badge variant="destructive">Estimate stale</Badge>
                                  )}
                                </div>
                              )
                            : <span className="text-muted-foreground">Not supplied</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            {rule.phone && <a className="text-primary hover:underline" href={`tel:${rule.phone}`}>{rule.phone}</a>}
                            {rule.quote_url && <a className="text-primary hover:underline" href={rule.quote_url} target="_blank" rel="noreferrer">Public information</a>}
                            {!rule.phone && !rule.quote_url && <span className="text-muted-foreground">Not verified</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs">
                            <p className="font-medium">{rule.source_publisher || "Publisher not recorded"}</p>
                            <p className="truncate text-xs text-muted-foreground">{rule.source_title || "Title not recorded"}</p>
                            <Button asChild variant="link" size="sm" className="h-auto p-0">
                              <a href={rule.source_url} target="_blank" rel="noreferrer">Open source <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <span>{formatDate(`${rule.last_verified}T12:00:00`)}</span>
                            {sourceIsStale(rule.last_verified) && <Badge variant="destructive">Refresh required</Badge>}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant={rule.active ? "default" : "outline"}>{rule.active ? "Active" : "Inactive"}</Badge></TableCell>
                        {role === "admin" && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => beginEditRule(rule)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                              {rule.active && <Button variant="outline" size="sm" onClick={() => void deactivateRule(rule)}>Deactivate</Button>}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
