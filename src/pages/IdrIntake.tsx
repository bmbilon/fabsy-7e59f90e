import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ExternalLink, FileCheck2, FileUp, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIdrAuth } from "@/hooks/useIdrAuth";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IDR_DISCLAIMER } from "@/config/idr";
import { albertaGrid2026 } from "@/data/alberta-grid";
import useSafeHead from "@/hooks/useSafeHead";
import {
  buildIdrClientIntake,
  EMPTY_IDR_CLIENT_INTAKE,
  intakeDraftFromStored,
  type IdrClientIntake,
  type IdrClientIntakeDraft,
} from "@/lib/idr/intake";
import { idrDb } from "@/lib/idr/supabase";
const ABSTRACT_ORDER_URL = "https://eservices.alberta.ca/driver-abstract-commercial.html";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const ABSTRACT_OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/;

interface IdrOrder {
  id: string;
  type: "standalone" | "addon";
  price_paid: number;
  status: "paid" | "awaiting_abstract" | "in_review" | "delivered";
  created_at: string;
  intake_json: IdrClientIntake | null;
  intake_completed_at: string | null;
  abstracts?: AbstractSummary | AbstractSummary[] | null;
}

interface AbstractSummary {
  file_url: string;
  parse_status: "pending" | "parsed" | "manual_review";
  review_started_at?: string | null;
}

interface RegisteredAbstractUpload {
  abstract_id: string;
  file_url: string;
  previous_file_url: string | null;
  parse_status: "manual_review";
  uploaded_at: string;
  review_version: number;
}

function relationOne<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value || undefined;
}

function extensionFor(file: File) {
  const byType: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return byType[file.type] || "bin";
}

function IntakeContent() {
  const { session, signOut } = useIdrAuth();
  const [orders, setOrders] = useState<IdrOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [intake, setIntake] = useState<IdrClientIntakeDraft>({ ...EMPTY_IDR_CLIENT_INTAKE });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingIntake, setIsSavingIntake] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      try {
        window.sessionStorage.removeItem("fabsy-idr-standalone-order");
      } catch {
        // Storage can be unavailable in privacy-focused browser modes.
      }
    }
  }, []);

  useEffect(() => {
    const loadOrders = async () => {
      setIsLoading(true);
      const { data, error: orderError } = await idrDb
        .from("idr_orders")
        .select("id,type,price_paid,status,created_at,intake_json,intake_completed_at,abstracts(file_url,parse_status,review_started_at)")
        .order("created_at", { ascending: false });

      if (orderError) {
        setError(orderError.message);
      } else {
        const nextOrders = (data || []) as IdrOrder[];
        setOrders(nextOrders);
        const firstOpen = nextOrders.find((order) =>
          ["paid", "awaiting_abstract", "in_review"].includes(order.status),
        );
        setSelectedOrderId(firstOpen?.id || nextOrders[0]?.id || "");
      }
      setIsLoading(false);
    };

    if (session) loadOrders();
  }, [session]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId),
    [orders, selectedOrderId],
  );

  const selectedAbstract = useMemo(
    () => relationOne(selectedOrder?.abstracts),
    [selectedOrder?.abstracts],
  );

  const intakeLocked = selectedOrder?.status === "in_review" || selectedOrder?.status === "delivered";
  const abstractReplaceable = selectedOrder?.status !== "delivered" &&
    selectedAbstract?.parse_status !== "parsed" &&
    !selectedAbstract?.review_started_at;

  useEffect(() => {
    setIntake(intakeDraftFromStored(selectedOrder?.intake_json));
    setError(null);
    setMessage(null);
  }, [selectedOrder?.id, selectedOrder?.intake_json]);

  useEffect(() => {
    setFile(null);
  }, [selectedOrderId]);

  useEffect(() => {
    if (!abstractReplaceable) setFile(null);
  }, [abstractReplaceable]);

  const updateIntake = <K extends keyof IdrClientIntakeDraft>(
    field: K,
    value: IdrClientIntakeDraft[K],
  ) => setIntake((current) => ({ ...current, [field]: value }));

  const saveIntake = async () => {
    if (!selectedOrderId || intakeLocked) return;
    const built = buildIdrClientIntake(intake, albertaGrid2026);
    if (!built.intake) {
      setError(built.error || "Complete the required report details.");
      return;
    }
    setIsSavingIntake(true);
    setError(null);
    setMessage(null);
    const { data, error: saveError } = await idrDb
      .from("idr_orders")
      .update({ intake_json: built.intake })
      .eq("id", selectedOrderId)
      .select("intake_json,intake_completed_at")
      .single();
    if (saveError || !data?.intake_completed_at) {
      setError(saveError?.message || "The secure intake could not be saved. Please try again.");
    } else {
      setOrders((current) => current.map((order) => order.id === selectedOrderId
        ? {
            ...order,
            intake_json: data.intake_json as IdrClientIntake,
            intake_completed_at: data.intake_completed_at as string,
          }
        : order));
      setMessage("Your report details are saved. You can now upload the driver abstract.");
    }
    setIsSavingIntake(false);
  };

  const acceptFile = (nextFile: File | null) => {
    setError(null);
    setMessage(null);
    if (!nextFile) {
      setFile(null);
      return true;
    }
    if (!ALLOWED_TYPES.has(nextFile.type)) {
      setFile(null);
      setError("Upload a PDF, JPG, PNG, or WebP file.");
      return false;
    }
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError("The abstract must be 10 MB or smaller.");
      return false;
    }
    setFile(nextFile);
    return true;
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    if (!acceptFile(event.target.files?.[0] || null)) event.target.value = "";
  };

  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!abstractReplaceable) return;
    acceptFile(event.dataTransfer.files?.[0] || null);
  };

  const uploadAbstract = async () => {
    if (!file || !selectedOrderId || !selectedOrder?.intake_completed_at || !abstractReplaceable) return;
    setIsUploading(true);
    setError(null);
    setMessage(null);

    const { data: existingAbstract, error: existingAbstractError } = await idrDb
      .from("abstracts")
      .select("file_url,parse_status,review_started_at")
      .eq("idr_order_id", selectedOrderId)
      .maybeSingle();
    if (existingAbstractError) {
      setError("The existing upload record could not be checked. Please try again.");
      setIsUploading(false);
      return;
    }
    if (existingAbstract?.parse_status === "parsed" || existingAbstract?.review_started_at) {
      setError("Fabsy has started reviewing this abstract, so it can no longer be replaced.");
      setIsUploading(false);
      return;
    }

    // Reconcile files left by an interrupted upload before consuming another
    // bounded object slot. The storage delete policy protects whichever path
    // is currently registered, including one changed by another browser tab.
    const { data: existingObjects, error: listError } = await supabase.storage
      .from("idr-abstracts")
      .list(selectedOrderId, { limit: 100 });
    if (listError) {
      setError("Previous abstract uploads could not be reconciled. Please try again.");
      setIsUploading(false);
      return;
    }
    for (const object of existingObjects || []) {
      if (!ABSTRACT_OBJECT_NAME.test(object.name)) continue;
      const objectPath = `${selectedOrderId}/${object.name}`;
      if (objectPath === existingAbstract?.file_url) continue;
      const { error: orphanCleanupError } = await supabase.storage
        .from("idr-abstracts")
        .remove([objectPath]);
      if (orphanCleanupError) console.error("Interrupted abstract cleanup failed", orphanCleanupError);
    }

    const { data: remainingObjects, error: remainingListError } = await supabase.storage
      .from("idr-abstracts")
      .list(selectedOrderId, { limit: 6 });
    if (remainingListError || (remainingObjects?.length || 0) >= 5) {
      setError(
        "Previous interrupted uploads could not be cleared. Refresh the portal or contact Fabsy with your order number.",
      );
      setIsUploading(false);
      return;
    }

    const storagePath = `${selectedOrderId}/${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage
      .from("idr-abstracts")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setError(uploadError.message);
      setIsUploading(false);
      return;
    }

    const { data: registrationData, error: recordError } = await idrDb.rpc(
      "register_idr_abstract_upload",
      {
        p_order_id: selectedOrderId,
        p_file_url: storagePath,
      },
    );

    const registered = registrationData as RegisteredAbstractUpload | null;
    if (recordError || !registered?.abstract_id || registered.file_url !== storagePath) {
      await supabase.storage.from("idr-abstracts").remove([storagePath]);
      setError(
        recordError?.message ||
          "The file uploaded, but the review record could not be created. Contact Fabsy and include your order number.",
      );
      setIsUploading(false);
      return;
    }

    const { data: currentAbstract, error: currentAbstractError } = await idrDb
      .from("abstracts")
      .select("file_url,parse_status,review_started_at")
      .eq("idr_order_id", selectedOrderId)
      .maybeSingle();

    const cleanupPaths = new Set<string>();
    if (registered.previous_file_url && registered.previous_file_url !== storagePath) {
      cleanupPaths.add(registered.previous_file_url);
    }
    if (!currentAbstractError && currentAbstract?.file_url && currentAbstract.file_url !== storagePath) {
      cleanupPaths.add(storagePath);
    }
    for (const cleanupPath of cleanupPaths) {
      const { error: cleanupError } = await supabase.storage
        .from("idr-abstracts")
        .remove([cleanupPath]);
      if (cleanupError) console.error("Superseded abstract cleanup failed", cleanupError);
    }

    const currentPath = currentAbstract?.file_url || registered.file_url;
    const currentParseStatus = currentAbstract?.parse_status || registered.parse_status;
    setMessage(
      currentPath === storagePath
        ? "Your abstract is in Fabsy's manual review queue. We will email you when the report is ready."
        : "A newer abstract upload is in Fabsy's manual review queue.",
    );
    setOrders((current) => current.map((order) => order.id === selectedOrderId
      ? {
          ...order,
          status: "in_review",
          abstracts: {
            file_url: currentPath,
            parse_status: currentParseStatus,
            review_started_at: currentAbstract?.review_started_at || null,
          },
        }
      : order));
    setFile(null);
    setIsUploading(false);
  };

  return (
    <main className="container mx-auto max-w-6xl px-4 py-12">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="mb-3">Private IDR portal</Badge>
          <h1 className="text-3xl font-bold sm:text-4xl">Complete your private IDR intake</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Add the ticket and policy details Fabsy needs, then upload the abstract you order directly from Alberta.
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">1</div>
              <CardTitle>Ticket and policy details</CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Enter these values from your ticket, policy, and renewal documents. Authorized Fabsy staff manually compare them with the abstract before delivery.
              </CardDescription>
            </div>
            {selectedOrder?.intake_completed_at && <Badge variant="secondary">Details saved</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your paid orders...</p>
          ) : orders.length === 0 ? (
            <Alert>
              <AlertTitle>No paid order found</AlertTitle>
              <AlertDescription>
                Payment confirmation can take a short time. Refresh shortly, or check that you used your purchase email.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {orders.length > 1 && (
                <div className="max-w-md space-y-2">
                  <Label htmlFor="idr-order">Report order</Label>
                  <select
                    id="idr-order"
                    value={selectedOrderId}
                    onChange={(event) => setSelectedOrderId(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.type === "addon" ? "Ticket add-on" : "Standalone report"} from {new Date(order.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <fieldset disabled={intakeLocked || isSavingIntake} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="intake-ticket-number">Ticket number</Label>
                  <Input id="intake-ticket-number" maxLength={200} value={intake.ticketNumber} onChange={(event) => updateIntake("ticketNumber", event.target.value)} />
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="intake-offence">Current ticket offence</Label>
                  <Input id="intake-offence" required maxLength={200} value={intake.offence} onChange={(event) => updateIntake("offence", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-section">Act and section</Label>
                  <Input id="intake-section" maxLength={200} value={intake.section} onChange={(event) => updateIntake("section", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-occurrence">Occurrence date</Label>
                  <Input id="intake-occurrence" type="date" value={intake.occurrenceDate} onChange={(event) => updateIntake("occurrenceDate", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-issue">Issue date</Label>
                  <Input id="intake-issue" type="date" value={intake.issueDate} onChange={(event) => updateIntake("issueDate", event.target.value)} />
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="intake-location">Ticket location</Label>
                  <Input id="intake-location" maxLength={200} value={intake.location} onChange={(event) => updateIntake("location", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-renewal">Next policy renewal date</Label>
                  <Input id="intake-renewal" type="date" required value={intake.policyRenewalDate} onChange={(event) => updateIntake("policyRenewalDate", event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label htmlFor="intake-scenario">Is this ticket already shown as a conviction on the abstract?</Label>
                  <Select value={intake.scenarioMode} onValueChange={(value: "listed" | "projected") => updateIntake("scenarioMode", value)}>
                    <SelectTrigger id="intake-scenario"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projected">No, it is pending or not shown</SelectItem>
                      <SelectItem value="listed">Yes, it is already shown</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A pending ticket is shown as a clearly labelled projection. It is not treated as a verified abstract conviction.
                  </p>
                </div>
              </div>

              <div className="border-t pt-6">
                <h2 className="text-lg font-semibold">Alberta Grid and policy inputs</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These values support the sourced benchmark in the report. Check your current policy or renewal documents.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="intake-premium">Current annual premium (CAD, optional)</Label>
                    <Input id="intake-premium" type="number" min="0.01" max="1000000" step="0.01" value={intake.annualPremium} onChange={(event) => updateIntake("annualPremium", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-grid-step">Alberta Grid step</Label>
                    <Input id="intake-grid-step" type="number" min="-15" max="100" step="1" required value={intake.gridStep} onChange={(event) => updateIntake("gridStep", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-territory">Grid territory</Label>
                    <Select value={intake.territoryCode || "not-selected"} onValueChange={(value) => updateIntake("territoryCode", value === "not-selected" ? "" : value)}>
                      <SelectTrigger id="intake-territory"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-selected">Choose a territory</SelectItem>
                        {albertaGrid2026.territoryDifferentials.map((territory) => (
                          <SelectItem key={territory.code} value={territory.code}>{territory.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-liability">Third-party liability limit</Label>
                    <Select value={intake.liabilityLimitCents || "not-selected"} onValueChange={(value) => updateIntake("liabilityLimitCents", value === "not-selected" ? "" : value)}>
                      <SelectTrigger id="intake-liability"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-selected">Choose a limit</SelectItem>
                        {albertaGrid2026.liabilityLimitDifferentials.map((limit) => (
                          <SelectItem key={limit.limitCents} value={String(limit.limitCents)}>
                            ${(limit.limitCents / 100).toLocaleString("en-CA")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-criminal">Grid criminal conviction count</Label>
                    <Input id="intake-criminal" type="number" min="0" max="99" step="1" required value={intake.criminalConvictions} onChange={(event) => updateIntake("criminalConvictions", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-claims">At-fault claim count</Label>
                    <Input id="intake-claims" type="number" min="0" max="99" step="1" required value={intake.atFaultClaims} onChange={(event) => updateIntake("atFaultClaims", event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <Checkbox id="intake-source-ack" checked={intake.sourceAcknowledgement} onCheckedChange={(checked) => updateIntake("sourceAcknowledgement", checked === true)} />
                <Label htmlFor="intake-source-ack" className="font-normal leading-5">
                  I entered these details from my ticket and insurance records and understand Fabsy will manually review them before delivering the report.
                </Label>
              </div>

              {intakeLocked ? (
                <Alert>
                  <FileCheck2 className="h-4 w-4" />
                  <AlertTitle>Details locked for review</AlertTitle>
                  <AlertDescription>Contact Fabsy if a source detail needs to be corrected after review begins.</AlertDescription>
                </Alert>
              ) : (
                <Button type="button" onClick={() => void saveIntake()} disabled={isSavingIntake}>
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  {isSavingIntake ? "Saving securely..." : "Save report details securely"}
                </Button>
              )}
              </fieldset>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">2</div>
            <CardTitle>Order your abstract</CardTitle>
            <CardDescription>Choose a 5-year Commercial Driver's Abstract.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Alberta currently lists the online price as $25.45, including the service charge. Government fees can change.
            </p>
            <Button asChild variant="outline" className="w-full">
              <a href={ABSTRACT_ORDER_URL} target="_blank" rel="noreferrer">
                Open Alberta eServices <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">3</div>
            <CardTitle>Download the file</CardTitle>
            <CardDescription>Save the official PDF or a clear image of every page.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p>Your file is stored in a private bucket and is available only to you and authorized Fabsy staff.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">4</div>
            <CardTitle>Upload for review</CardTitle>
            <CardDescription>Phase 1 uses human transcription and verification.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading your orders...</p>
            ) : orders.length === 0 ? (
              <Alert>
                <AlertTitle>No paid order found</AlertTitle>
                <AlertDescription>
                  Payment confirmation can take a short time. Refresh shortly, or check that you used your purchase email.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {!selectedOrder?.intake_completed_at && (
                  <Alert>
                    <AlertTitle>Save step 1 first</AlertTitle>
                    <AlertDescription>The report details must be saved before the abstract can be uploaded.</AlertDescription>
                  </Alert>
                )}
                {!abstractReplaceable && (
                  <Alert>
                    <FileCheck2 className="h-4 w-4" />
                    <AlertTitle>Abstract locked for review</AlertTitle>
                    <AlertDescription>Fabsy has started or completed review, so this source file can no longer be replaced.</AlertDescription>
                  </Alert>
                )}
                {selectedAbstract && abstractReplaceable && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Abstract received</AlertTitle>
                    <AlertDescription>You may replace it until an authorized Fabsy reviewer begins transcription.</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="abstract-file">Driver abstract</Label>
                  <div
                    className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={dropFile}
                  >
                    <Input
                      id="abstract-file"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={chooseFile}
                      disabled={!selectedOrder?.intake_completed_at || !abstractReplaceable}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">Choose a file or drag it into this area.</p>
                  </div>
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG, or WebP, up to 10 MB.</p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => void uploadAbstract()}
                  disabled={!file || isUploading || !selectedOrder?.intake_completed_at || !abstractReplaceable}
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  {isUploading ? "Uploading securely..." : "Upload abstract"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Action could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert className="mt-6 border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved securely</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8 rounded-lg border bg-muted/30 p-5 text-sm text-muted-foreground">
        <p>{IDR_DISCLAIMER}</p>
        <Button asChild variant="link" className="mt-2 h-auto p-0">
          <Link to="/portal/insurance-reports">View all of my IDR orders</Link>
        </Button>
      </div>
    </main>
  );
}

export default function IdrIntake() {
  useSafeHead({ title: "Private IDR Intake | Fabsy", robots: "noindex, nofollow" });
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <IdrAccessGate redirectPath="/insurance-damage-report/intake">
        <IntakeContent />
      </IdrAccessGate>
      <Footer />
    </div>
  );
}
