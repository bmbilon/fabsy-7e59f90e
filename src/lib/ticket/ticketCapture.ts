export const TICKET_CAPTURE_MAX_BYTES = 10 * 1024 * 1024;

export const TICKET_CAPTURE_BROWSE_ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
].join(",");

export const TICKET_CAPTURE_PHOTO_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
].join(",");

export type TicketCaptureFileKind = "image" | "pdf";

export interface TicketCaptureFileDescriptor {
  name: string;
  size: number;
  type?: string;
}

export type TicketCaptureValidationResult =
  | {
      valid: true;
      kind: TicketCaptureFileKind;
      mimeType: string;
    }
  | {
      valid: false;
      error: string;
    };

interface SupportedFileType {
  kind: TicketCaptureFileKind;
  mimeType: string;
}

const SUPPORTED_MIME_TYPES: Record<string, SupportedFileType> = {
  "application/pdf": { kind: "pdf", mimeType: "application/pdf" },
  "image/jpeg": { kind: "image", mimeType: "image/jpeg" },
  "image/png": { kind: "image", mimeType: "image/png" },
  "image/webp": { kind: "image", mimeType: "image/webp" },
  "image/heic": { kind: "image", mimeType: "image/heic" },
  "image/heif": { kind: "image", mimeType: "image/heif" },
};

const SUPPORTED_EXTENSIONS: Record<string, SupportedFileType> = {
  pdf: { kind: "pdf", mimeType: "application/pdf" },
  jpg: { kind: "image", mimeType: "image/jpeg" },
  jpeg: { kind: "image", mimeType: "image/jpeg" },
  png: { kind: "image", mimeType: "image/png" },
  webp: { kind: "image", mimeType: "image/webp" },
  heic: { kind: "image", mimeType: "image/heic" },
  heif: { kind: "image", mimeType: "image/heif" },
};

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);

function fileExtension(fileName: string) {
  const finalDot = fileName.lastIndexOf(".");
  return finalDot >= 0 ? fileName.slice(finalDot + 1).trim().toLowerCase() : "";
}

export function validateTicketCaptureFile(
  file: TicketCaptureFileDescriptor,
  maxBytes = TICKET_CAPTURE_MAX_BYTES,
): TicketCaptureValidationResult {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, error: "The selected ticket file is empty." };
  }

  if (file.size > maxBytes) {
    return { valid: false, error: "The ticket file must be 10 MB or smaller." };
  }

  const mimeType = (file.type || "").split(";", 1)[0].trim().toLowerCase();
  const mimeMatch = SUPPORTED_MIME_TYPES[mimeType];
  const extensionMatch = SUPPORTED_EXTENSIONS[fileExtension(file.name)];

  if (mimeMatch && extensionMatch && mimeMatch.mimeType !== extensionMatch.mimeType) {
    return {
      valid: false,
      error: "The ticket file extension does not match its file type.",
    };
  }

  if (mimeMatch) return { valid: true, ...mimeMatch };

  if (extensionMatch && GENERIC_MIME_TYPES.has(mimeType)) {
    return { valid: true, ...extensionMatch };
  }

  return {
    valid: false,
    error: "Upload a PDF, JPG, PNG, WebP, HEIC or HEIF ticket file.",
  };
}
export type TicketCaptureState = "empty" | "processing" | "complete" | "manual" | "invalid";
