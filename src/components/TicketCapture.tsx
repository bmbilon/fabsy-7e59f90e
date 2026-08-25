import { useEffect, useId, useRef, useState } from "react";
import { Camera, CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  TICKET_CAPTURE_BROWSE_ACCEPT,
  TICKET_CAPTURE_PHOTO_ACCEPT,
  validateTicketCaptureFile,
} from "@/lib/ticket/ticketCapture";

export type TicketOcrData = Record<string, unknown>;

export interface TicketCaptureProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onOcrData: (data: TicketOcrData | null) => void;
  disabled?: boolean;
  label?: string;
  required?: boolean;
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
}: TicketCaptureProps) {
  const reactId = useId();
  const inputId = reactId.replace(/:/g, "");
  const browseInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const latestOcrHandler = useRef(onOcrData);
  const requestId = useRef(0);
  const [status, setStatus] = useState<CaptureStatus>({ kind: "idle" });

  useEffect(() => {
    latestOcrHandler.current = onOcrData;
  }, [onOcrData]);

  useEffect(() => {
    const currentRequest = ++requestId.current;

    if (!file) {
      setStatus({ kind: "idle" });
      latestOcrHandler.current(null);
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
      return;
    }

    latestOcrHandler.current(null);

    if (validation.kind === "pdf") {
      setStatus({
        kind: "success",
        title: "Ticket attached",
        message: "The PDF is ready to save and will be reviewed manually. Enter any readable details in the form.",
      });
      return;
    }

    setStatus({ kind: "processing", message: "Scanning the ticket to help fill in the form…" });

    void (async () => {
      try {
        const imageBase64 = await readAsDataUrl(file);
        const { data, error } = await supabase.functions.invoke("ocr-ticket", {
          body: { imageBase64 },
        });
        if (error) throw error;

        const ocrData = extractedOcrData(data);
        if (!ocrData) throw new Error("No ticket details were returned.");
        if (requestId.current !== currentRequest) return;

        latestOcrHandler.current(ocrData);
        setStatus({
          kind: "success",
          title: "Ticket scanned",
          message: "Review the auto-filled details and correct anything the scan did not read accurately.",
        });
      } catch {
        if (requestId.current !== currentRequest) return;
        setStatus({
          kind: "error",
          title: "Ticket attached, but the scan did not finish",
          message: "The source file is still selected. Continue by entering the ticket details manually.",
        });
      }
    })();

    return () => {
      requestId.current += 1;
    };
  }, [file]);

  const selectFile = (selectedFile: File | undefined, input: HTMLInputElement) => {
    input.value = "";
    if (!selectedFile) return;

    const validation = validateTicketCaptureFile(selectedFile);
    if ("error" in validation) {
      setStatus({
        kind: "error",
        title: "Ticket file not accepted",
        message: validation.error,
      });
      return;
    }

    onFileChange(selectedFile);
  };

  const clearFile = () => {
    requestId.current += 1;
    onFileChange(null);
    latestOcrHandler.current(null);
    setStatus({ kind: "idle" });
  };

  return (
    <fieldset
      className="space-y-3"
      disabled={disabled}
      aria-describedby={`${inputId}-help ${inputId}-status`}
    >
      <legend className="text-sm font-medium text-foreground">
        {label}{required ? <span className="text-destructive"> *</span> : null}
      </legend>

      <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 sm:p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          {status.kind === "processing" ? (
            <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden="true" />
          ) : file ? (
            <FileText className="h-9 w-9 text-primary" aria-hidden="true" />
          ) : (
            <Upload className="h-9 w-9 text-primary" aria-hidden="true" />
          )}

          <div className="min-w-0 max-w-full">
            <p className="font-semibold text-foreground">
              {file ? "Ticket file selected" : "Add a ticket file"}
            </p>
            <p className="mt-1 max-w-full break-all text-sm text-muted-foreground">
              {file?.name || "PDF, JPG, PNG, WebP, HEIC or HEIF · maximum 10 MB"}
            </p>
          </div>

          <div className="flex w-full flex-col justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => browseInputRef.current?.click()}
              disabled={disabled}
            >
              <Upload aria-hidden="true" />
              Browse files
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled}
            >
              <Camera aria-hidden="true" />
              Take photo
            </Button>
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

      <input
        ref={browseInputRef}
        id={`${inputId}-browse`}
        type="file"
        accept={TICKET_CAPTURE_BROWSE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Browse for ${label.toLowerCase()}`}
        aria-required={required}
        aria-describedby={`${inputId}-help ${inputId}-status`}
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
        aria-describedby={`${inputId}-help ${inputId}-status`}
        onChange={(event) => selectFile(event.target.files?.[0], event.currentTarget)}
      />

      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        Images are scanned to help fill the form. PDFs are attached for manual review and are not sent to OCR.
      </p>

      <div id={`${inputId}-status`} aria-live="polite">
        {status.kind === "processing" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {status.message}
          </p>
        ) : null}

        {status.kind === "success" ? (
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
