import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { photoIntakeDetails } from "./photo-intake-details.ts";

/** Runs after the receipt response. A failed scan never invalidates consent. */
export async function processPhotoIntake(admin: SupabaseClient, submissionId: string) {
  const { data: ticket, error } = await admin.from("ticket_submissions")
    .update({ intake_review_status: "scanning", intake_scan_started_at: new Date().toISOString() })
    .eq("id", submissionId).eq("intake_mode", "photo_only").eq("intake_review_status", "pending_scan")
    .not("consent_form_path", "is", null).select("id,client_id,ticket_document_path,ticket_type,ticket_type_source").maybeSingle();
  if (error || !ticket) return;
  try {
    if (/\.pdf$/i.test(ticket.ticket_document_path)) throw new Error("PDF requires staff review");
    const { data: file, error: downloadError } = await admin.storage.from("assessment-tickets").download(ticket.ticket_document_path);
    if (downloadError || !file || file.size > 10 * 1024 * 1024) throw new Error("Ticket could not be read");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    const { data: scan, error: scanError } = await admin.functions.invoke("ocr-ticket", {
      body: { imageBase64: `data:${file.type || "image/jpeg"};base64,${btoa(binary)}` },
    });
    if (scanError || scan?.success !== true || !scan.data || typeof scan.data !== "object") throw new Error("Scan unavailable");
    const selectedTicketType = ticket.ticket_type_source === "manual" && ["officer_issued", "photo_radar"].includes(ticket.ticket_type)
      ? ticket.ticket_type as "officer_issued" | "photo_radar" : undefined;
    const fields = photoIntakeDetails(scan.data, selectedTicketType);
    // Only the provisional client created for this ticket is enriched. Never
    // look up or overwrite another client's record using unconfirmed OCR.
    if (ticket.client_id === ticket.id) {
      const { error: clientError } = await admin.from("clients").update({
        first_name: fields.first_name, last_name: fields.last_name,
        address: fields.address, city: fields.city, postal_code: fields.postal_code, date_of_birth: fields.date_of_birth,
      }).eq("id", ticket.client_id);
      if (clientError) throw clientError;
    }
    const { error: updateError } = await admin.from("ticket_submissions").update(fields)
      .eq("id", ticket.id).eq("intake_review_status", "scanning").eq("status", "awaiting_payment");
    if (updateError) throw updateError;
  } catch {
    await admin.from("ticket_submissions").update({
      intake_review_status: "needs_review",
      additional_notes: "Photo and consent received. The file needs staff review; contact the customer if any details are unclear.",
    }).eq("id", ticket.id).eq("intake_review_status", "scanning");
  }
}

export function queuePhotoIntake(admin: SupabaseClient, submissionId: string) {
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(processPhotoIntake(admin, submissionId).catch(() => {
    console.error("Photo intake requires staff review", submissionId);
  }));
}
