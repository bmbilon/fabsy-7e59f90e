export const MANUAL_SCAN_MAX_BYTES = 10 * 1024 * 1024;
export const MANUAL_SCAN_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type ManualScanContentType = typeof MANUAL_SCAN_ALLOWED_TYPES[number];

export interface ManualScanDescriptor {
  name: string;
  contentType: ManualScanContentType;
  size: number;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function containsControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);
    if (characterCode < 32 || characterCode === 127) return true;
  }
  return false;
}

export function manualScanDescriptor(
  value: unknown,
): ManualScanDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const name = clean(entry.name);
  const contentType = clean(entry.contentType) as ManualScanContentType;
  const size = Number(entry.size);
  if (
    !name || name.length > 255 || containsControlCharacter(name) ||
    !MANUAL_SCAN_ALLOWED_TYPES.includes(contentType) ||
    !Number.isSafeInteger(size) || size < 1 || size > MANUAL_SCAN_MAX_BYTES
  ) return null;
  return { name, contentType, size };
}

export function fileExtension(contentType: ManualScanContentType) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/jpeg") return "jpg";
  return "png";
}

export function matchesDeclaredMagic(
  bytes: Uint8Array,
  contentType: ManualScanContentType,
) {
  if (contentType === "application/pdf") {
    return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
      bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d &&
    bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

export function safeManualTempPath(inviteId: string, path: string) {
  return new RegExp(
    `^temporary/${
      inviteId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }/[0-9a-f-]{36}/upload\\.(?:pdf|jpg|png)$`,
  ).test(path) && !path.includes("..");
}
