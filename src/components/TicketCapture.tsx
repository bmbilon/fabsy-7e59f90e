import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Camera, CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TicketPhotoCheck, TicketPhotoGuide } from "@/components/TicketPhotoGuide";
import { supabase } from "@/integrations/supabase/client";
import {
  TICKET_CAPTURE_BROWSE_ACCEPT,
  TICKET_CAPTURE_PHOTO_ACCEPT,
  validateTicketCaptureFile,
  type TicketCaptureState,
} from "@/lib/ticket/ticketCapture";

export type TicketOcrData = Record<string, unknown>;

export interface TicketCaptureProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onOcrData: (data: TicketOcrData | null) => void;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  skipInitialScan?: boolean;
  selectionOnly?: boolean;
  scanOnSelect?: boolean;
  allowFileSelection?: boolean;
  compact?: boolean;
  onCaptureStateChange?: (state: TicketCaptureState) => void;
}

type CaptureStatus =
  | { kind: "idle" }
  | { kind: "processing"; message: string }
  | { kind: "success"; title: string; message: string }
  | { kind: "error"; title: string; message: string };

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The ticket image could not be read."));
    };
    reader.onerror = () => reject(reader.error || new Error("The ticket image could not be read."));
    reader.readAsDataURL(file);
  });
}

function extractedOcrData(value: unknown): TicketOcrData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;

  if ("success" in response) {
    if (response.success !== true) return null;
    if (response.data && typeof response.data === "object" && !Array.isArray(response.data)) {
      return response.data as TicketOcrData;
    }
    return null;
  }

  if ("error" in response || Object.keys(response).length === 0) return null;
  return response;
}

export default function TicketCapture({
  file,
  onFileChange,
  onOcrData,
  disabled = false,
  label = "Ticket PDF or clear image",
  required = false,
  skipInitialScan = false,
  selectionOnly = false,
  scanOnSelect = true,
  allowFileSelection = true,
  compact = false,
  onCaptureStateChange,
}: TicketCaptureProps) {
  const reactId = useId();
  const inputId = reactId.replace(/:/g, "");
  const browseInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const latestOcrHandler = useRef(onOcrData);
  const latestStateHandler = useRef(onCaptureStateChange);
  const requestId = useRef(0);
  const dragDepth = useRef(0);
  const alreadyCapturedFile = useRef(skipInitialScan ? file : null);
  const [status, setStatus] = useState<CaptureStatus>({ kind: "idle" });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    latestOcrHandler.current = onOcrData;
  }, [onOcrData]);

  useEffect(() => {
    latestStateHandler.current = onCaptureStateChange;
  }, [onCaptureStateChange]);

  useEffect(() => {
    const currentRequest = ++requestId.current;

    if (!file) {
      setStatus({ kind: "idle" });
      latestOcrHandler.current(null);
      latestStateHandler.current?.("empty");
      return;
    }

    const validation = validateTicketCaptureFile(file);
    if ("error" in validation) {
      setStatus({
        kind: "error",
        title: "Ticket file not accepted",
        message: validation.error,
      });
      latestOcrHandler.current(null);
      latestStateHandler.current?.("invalid");
      return;
    }

    latestOcrHandler.current(null);

    // The first intake checkpoint selects a local file. Contact permission
    // must be saved before either OCR or private storage receives its bytes.
    if (!scanOnSelect) {
      setStatus({ kind: "success", title: "Ticket attached", message: "Ready to submit." });
      latestStateHandler.current?.("complete");
      return;
    }
    if (selectionOnly) {
      setStatus({ kind: "success", title: "Ticket selected", message: "This file is still on your device. Save your contact details and permission below before we scan or upload it." });
      latestStateHandler.current?.("empty");
      return;
    }

    if (alreadyCapturedFile.current === file) {
      setStatus({ kind: "success", title: "Ticket attached", message: "Your captured details are ready below. Review them before continuing." });
      latestStateHandler.current?.("complete");
      return;
    }
    alreadyCapturedFile.current = null;

    if (validation.kind === "pdf") {
      setStatus({
        kind: "success",
        title: "Ticket attached",
        message: "The PDF is ready to save and will be reviewed manually. Enter any readable details in the form.",
      });
      latestStateHandler.current?.("manual");
      return;
    }

    setStatus({ kind: "processing", message: "Scanning the ticket to help fill in the form…" });
    latestStateHandler.current?.("processing");

    void (async () => {
      try {
        const imageBase64 = await readAsDataUrl(file);
        if (requestId.current !== currentRequest) return;
        const { data, error } = await supabase.functions.invoke("ocr-ticket", {
          body: { imageBase64 },
        });
        if (error) throw error;

        const ocrData = extractedOcrData(data);
        if (!ocrData) throw new Error("No ticket details were returned.");
        if (requestId.current !== currentRequest) return;

        latestOcrHandler.current(ocrData);
        alreadyCapturedFile.current = file;
        setStatus({
          kind: "success",
          title: "Ticket scanned",
          message: "Review the auto-filled details and correct anything the scan did not read accurately.",
        });
        latestStateHandler.current?.("complete");
      } catch {
        if (requestId.current !== currentRequest) return;
        setStatus({
          kind: "error",
          title: "Ticket attached, but the scan did not finish",
          message: "The source file is still selected. Continue by entering the ticket details manually.",
        });
        latestStateHandler.current?.("manual");
      }
    })();

    return () => {
      requestId.current += 1;
    };
  }, [file, selectionOnly, scanOnSelect]);

  const selectFile = (selectedFile: File | undefined, input?: HTMLInputElement) => {
    if (input) input.value = "";
    if (!selectedFile || selectedFile === file) return;

    const validation = validateTicketCaptureFile(selectedFile);
    if ("error" in validation) {
      setStatus({
        kind: "error",
        title: "Ticket file not accepted",
        message: validation.error,
      });
      return;
    }

    requestId.current += 1;
    alreadyCapturedFile.current = null;
    onFileChange(selectedFile);
  };

  const clearFile = () => {
    requestId.current += 1;
    alreadyCapturedFile.current = null;
    onFileChange(null);
    latestOcrHandler.current(null);
    setStatus({ kind: "idle" });
  };

  const isFileDrag = (event: DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !allowFileSelection || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !allowFileSelection || !isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || dragDepth.current === 0) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (disabled || !allowFileSelection) return;
    if (event.dataTransfer.files.length > 1) {
      setStatus({ kind: "error", title: "Choose one ticket file", message: "Upload one ticket file at a time." });
      return;
    }
    selectFile(event.dataTransfer.files[0]);
  };

  const selectedFileType = file ? validateTicketCaptureFile(file) : null;

  return (
    <fieldset
      className="space-y-3"
      disabled={disabled}
      aria-describedby={`${scanOnSelect ? `${inputId}-help ` : ""}${inputId}-status`}
    >
      <legend className={scanOnSelect ? "text-sm font-medium text-foreground" : "sr-only"}>
        {label}{required ? <span className="text-destructive"> *</span> : null}
      </legend>

      {scanOnSelect && !compact && <TicketPhotoGuide />}

      <div
        className={`rounded-xl border-2 border-dashed transition-colors ${isDragging ? "border-primary bg-primary/15 ring-4 ring-primary/20" : "border-primary/40 bg-primary/5"} ${compact ? "p-[12px]" : "p-5 sm:p-6"}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`flex flex-col items-center text-center ${compact ? "gap-2" : "gap-4"}`}>
          <button
            type="button"
            className={`flex w-full min-w-0 flex-col items-center rounded-lg border border-primary/30 bg-background px-4 text-center shadow-sm transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "gap-1 py-3" : "gap-2 py-4"}`}
            onClick={() => browseInputRef.current?.click()}
            disabled={disabled}
            aria-label={file ? "Change ticket file" : "Choose a ticket file"}
          >
            {status.kind === "processing" ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            ) : file ? (
              <FileText className="h-8 w-8 text-primary" aria-hidden="true" />
            ) : (
              <Upload className="h-8 w-8 text-primary" aria-hidden="true" />
            )}
            <span className={`font-semibold text-primary ${compact ? "text-sm" : "text-base sm:text-lg"}`}>
              {isDragging ? "Drop your ticket here" : file ? "Ticket file selected — click to change" : allowFileSelection ? <><span className="sm:hidden">Tap to upload your ticket</span><span className="hidden sm:inline">Click to upload or drag and drop</span></> : "Click to upload your ticket"}
            </span>
            <span className={`max-w-full break-all text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>
              {file?.name || "PDF, JPG, PNG, WebP, HEIC or HEIF · maximum 10 MB"}
            </span>
          </button>

          <div className={`flex w-full justify-center gap-3 ${compact ? "flex-wrap" : "flex-col sm:flex-row"}`}>
            <Button
              type="button"
              variant="outline"
              onClick={() => browseInputRef.current?.click()}
              className={compact ? "min-h-11 px-[10px] text-xs" : undefined}
              disabled={disabled}
            >
              <Upload aria-hidden="true" />
              {!scanOnSelect && file ? "Change" : "Browse files"}
            </Button>
            {(scanOnSelect || !file) && <Button
              type="button"
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              className={compact ? "min-h-11 px-[10px] text-xs" : undefined}
              disabled={disabled}
            >
              <Camera aria-hidden="true" />
              Take photo
            </Button>}
            {file ? (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFile}
                disabled={disabled}
              >
                <X aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {scanOnSelect && selectedFileType?.valid && selectedFileType.kind === "image" ? <TicketPhotoCheck /> : null}

      {allowFileSelection && <><input
        ref={browseInputRef}
        id={`${inputId}-browse`}
        type="file"
        accept={TICKET_CAPTURE_BROWSE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Browse for ${label.toLowerCase()}`}
        aria-required={required}
        aria-describedby={`${scanOnSelect ? `${inputId}-help ` : ""}${inputId}-status`}
        onChange={(event) => selectFile(event.target.files?.[0], event.currentTarget)}
      />
      <input
        ref={cameraInputRef}
        id={`${inputId}-camera`}
        type="file"
        accept={TICKET_CAPTURE_PHOTO_ACCEPT}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Take a photo of ${label.toLowerCase()}`}
        aria-required={required}
        aria-describedby={`${scanOnSelect ? `${inputId}-help ` : ""}${inputId}-status`}
        onChange={(event) => selectFile(event.target.files?.[0], event.currentTarget)}
      /></>}

      {scanOnSelect && <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        Images are scanned to help fill the form. PDFs are attached for manual review and are not sent to OCR.
      </p>}

      <div id={`${inputId}-status`} aria-live="polite">
        {!scanOnSelect && status.kind === "success" ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Ticket attached</p> : status.kind === "processing" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {status.message}
          </p>
        ) : null}

        {scanOnSelect && status.kind === "success" ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <AlertTitle>{status.title}</AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : null}

        {status.kind === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>{status.title}</AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </fieldset>
  );
}
