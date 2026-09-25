import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  LTB_BUCKET,
  type LtbCaseState,
  type LtbClientState,
  type LtbExtraction,
  mergeLtbIntake,
  normalizeLtbExtraction,
} from "./ltb-intake-core.ts";
import { bytesToDataUrl, extractLtbDocument } from "./ltb-extract.ts";

const CASE_FIELDS = "id,practice_id,client_id,issue,rental_unit_address,unit_city,tenant_names,rent_amount_cents,rent_period," +
  "rent_due_day,lease_start_date,arrears_claimed_cents,notice_form,notice_served_on,notice_service_method," +
  "notice_termination_date,hearing_date,field_sources,review_notes";
type CaseRow = LtbCaseState & { id: string; practice_id: string; client_id: string; review_notes: string | null };
type ClientRow = LtbClientState & { id: string };
type DocumentRow = { id: string; storage_path: string; content_type: string; size_bytes: number };

const CLIENT_FIELDS = "id,registration_status,client_type,first_name,last_name,organization_name,phone," +
  "mailing_address,city,province,postal_code,identity_document_type,field_sources";

/**
 * Runs after the finalize response. Reads each uploaded image, merges what it
 * finds into empty fields, and settles the review status, which releases the
 * staff alert. Any failure leaves an explicit staff review task.
 */
export async function processLtbIntake(admin: SupabaseClient, caseId: string, apiKey: string) {
  const { data: claimed, error: claimError } = await admin.rpc("ltb_claim_intake_scan", { p_case_id: caseId });
  if (claimError || claimed !== true) return;
  let existingNotes: string | null = null;
  try {
    const [{ data: caseData, error: caseError }, { data: documentData, error: docError }] = await Promise.all([
      admin.from("ltb_cases").select(CASE_FIELDS).eq("id", caseId).single(),
      admin.from("ltb_case_documents").select("id,storage_path,content_type,size_bytes")
        .eq("case_id", caseId).not("uploaded_at", "is", null).eq("extraction_status", "pending")
        .order("created_at"),
    ]);
    const caseRow = caseData as unknown as CaseRow | null;
    const documents = (documentData || []) as unknown as DocumentRow[];
    if (caseError || !caseRow || docError) throw new Error("case_unavailable");
    existingNotes = caseRow.review_notes;
    const { data: clientData, error: clientError } = await admin.from("ltb_clients").select(CLIENT_FIELDS)
      .eq("id", caseRow.client_id).single();
    const client = clientData as unknown as ClientRow | null;
    if (clientError || !client) throw new Error("client_unavailable");

    const extractions: LtbExtraction[] = [];
    const unread: { documentId: string; reason: "pdf" | "failed" }[] = [];
    for (const doc of documents) {
      if (doc.content_type === "application/pdf") {
        unread.push({ documentId: doc.id, reason: "pdf" });
        await admin.from("ltb_case_documents").update({ extraction_status: "skipped" }).eq("id", doc.id);
        continue;
      }
      try {
        const { data: file, error: downloadError } = await admin.storage.from(LTB_BUCKET).download(doc.storage_path);
        if (downloadError || !file || file.size > 10 * 1024 * 1024) throw new Error("download_failed");
        const raw = await extractLtbDocument(apiKey,
          bytesToDataUrl(new Uint8Array(await file.arrayBuffer()), doc.content_type));
        const extraction = normalizeLtbExtraction(doc.id, raw);
        extractions.push(extraction);
        await admin.from("ltb_case_documents").update({
          kind: extraction.kind, extraction_status: "extracted", extracted_at: new Date().toISOString(),
          extracted: { fields: extraction.fields, lowConfidence: extraction.lowConfidence, notes: extraction.notes },
        }).eq("id", doc.id);
      } catch {
        unread.push({ documentId: doc.id, reason: "failed" });
        await admin.from("ltb_case_documents").update({ extraction_status: "failed" }).eq("id", doc.id);
      }
    }

    const merge = mergeLtbIntake({
      caseState: { ...caseRow, tenant_names: caseRow.tenant_names || [], field_sources: caseRow.field_sources || {} },
      client: { ...client, field_sources: client.field_sources || {} },
      extractions,
      unreadDocuments: unread,
    });

    // Only the provisional client may gain document details, and only while
    // it is still provisional at write time.
    if (Object.keys(merge.clientPatch).length && client.registration_status === "provisional") {
      const { error } = await admin.from("ltb_clients").update(merge.clientPatch)
        .eq("id", client.id).eq("registration_status", "provisional");
      if (error) throw error;
    }
    const reviewNotes = [caseRow.review_notes, ...merge.notes].filter(Boolean).join("\n").slice(0, 4000);
    const { error: updateError } = await admin.from("ltb_cases").update({
      ...merge.casePatch,
      intake_review_status: merge.reviewStatus,
      review_notes: reviewNotes,
    }).eq("id", caseId).eq("intake_review_status", "scanning");
    if (updateError) throw updateError;
    await admin.from("ltb_case_events").insert({
      case_id: caseId,
      practice_id: caseRow.practice_id,
      event: "documents_read",
      detail: { read: extractions.length, unread: unread.length, reviewStatus: merge.reviewStatus },
    });
  } catch {
    await admin.from("ltb_cases").update({
      intake_review_status: "needs_review",
      review_notes: [existingNotes, "Documents received. Automatic reading failed, so review the uploads directly before acting."]
        .filter(Boolean).join("\n").slice(0, 4000),
    }).eq("id", caseId).eq("intake_review_status", "scanning");
  }
  await wakeAlertWorker(admin);
}

/** Sends the staff alert now instead of waiting for the next cron tick. */
export async function wakeAlertWorker(admin: SupabaseClient) {
  try {
    await admin.functions.invoke("process-ltb-intake-alerts", { body: {} });
  } catch {
    // The minute cron delivers it.
  }
}

export function queueLtbIntake(admin: SupabaseClient, caseId: string, apiKey: string) {
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
  const task = processLtbIntake(admin, caseId, apiKey).catch(() => {
    console.error("LTB intake requires staff review", caseId);
  });
  if (runtime?.waitUntil) runtime.waitUntil(task);
}
