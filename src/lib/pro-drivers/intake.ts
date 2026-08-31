import { PRO_DRIVER_DISCOUNT_PERCENT } from "@/config/pro-drivers";
import { detectTicketType } from "@/lib/ticket/ticketType";
import { validateTicketCaptureFile, type TicketCaptureFileDescriptor } from "@/lib/ticket/ticketCapture";

export const LICENCE_CLASSES = ["1", "2", "3", "4", "5", "6", "7", "unknown"] as const;
export type LicenceClass = typeof LICENCE_CLASSES[number];
export const LICENCE_CLASS_OPTIONS: { value: LicenceClass; label: string }[] = [
  { value: "1", label: "Class 1 — commercial" },
  { value: "2", label: "Class 2 — bus" },
  { value: "3", label: "Class 3" },
  { value: "4", label: "Class 4 — taxi, ride-share or ambulance" },
  { value: "5", label: "Class 5" },
  { value: "6", label: "Class 6 — motorcycle" },
  { value: "7", label: "Class 7 — learner" },
  { value: "unknown", label: "Not sure / not an Alberta licence" },
];

export function normalizeLicenceClass(value: unknown): LicenceClass {
  return typeof value === "string" && LICENCE_CLASSES.some(item => item === value) ? value as LicenceClass : "unknown";
}

export function isProLicenceClass(value: unknown): value is "1" | "2" | "4" {
  return value === "1" || value === "2" || value === "4";
}

export function isPhotoRadarIntake(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.order_type === "photo_radar" || data.product === "photo-radar" || detectTicketType(value) === "photo_radar";
}

export function licenceClassHint(value: unknown): LicenceClass {
  if (typeof value !== "string" && typeof value !== "number") return "unknown";
  const match = /^(?:class\s*)?([1-7])(?:[\s-]*GDL)?$/i.exec(String(value).trim());
  return normalizeLicenceClass(match?.[1]);
}

export function validateProLicenceFile(file: TicketCaptureFileDescriptor): { valid: true; mimeType: string } | { valid: false; error: string } {
  const descriptor = validateTicketCaptureFile(file);
  if (!descriptor.valid || descriptor.kind !== "image" || !["image/jpeg", "image/png", "image/webp"].includes(descriptor.mimeType)) {
    return { valid: false, error: "For the 20% discount, choose a clear JPG, PNG or WebP licence photo, 10 MB or smaller." };
  }
  return { valid: true, mimeType: descriptor.mimeType };
}

export interface ProVerificationResponse {
  verified: true;
  status: "verified";
  discountPercent: 20;
}

/** Only call with the direct verification endpoint response, never form state. */
export function verifiedProResponse(value: unknown): ProVerificationResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  return response.verified === true && response.status === "verified" && response.discountPercent === PRO_DRIVER_DISCOUNT_PERCENT
    ? { verified: true, status: "verified", discountPercent: 20 }
    : null;
}

export function proCheckoutSubtotalCents(baseCents: number, intake: unknown, serverVerification: unknown): number {
  const data = intake && typeof intake === "object" ? intake as Record<string, unknown> : {};
  return !isPhotoRadarIntake(intake) && isProLicenceClass(data.licenceClass) && verifiedProResponse(serverVerification)
    ? Math.round(baseCents * (100 - PRO_DRIVER_DISCOUNT_PERCENT) / 100)
    : baseCents;
}

export function licencePhotoAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The licence photo could not be read."));
    reader.onerror = () => reject(new Error("The licence photo could not be read."));
    reader.readAsDataURL(file);
  });
}
