import { AREAS, torontoToday, UPLOAD_LIMITS } from "./practice-catalog.ts";
import {
  mergeTicketIntake,
  normalizeTicketExtraction,
  type TicketExtraction,
  type TrafficMatterState,
} from "./practice-intake-core.ts";
import { extractOffenceNotice, imageBytesToDataUrl, PracticeExtractionError } from "./practice-extract.ts";

/**
 * Background ticket reader for traffic matters (mirror of
 * process-ltb-intake.ts). Runs after the finalize response: reads each
 * uploaded ticket image, fills empty matter fields, and settles the intake
 * review status, which queues the staff alert. Any failure leaves an explicit
 * staff review task. The client record is never read or changed.
 */

const MATTER_FIELDS = "id,practice_id,client_id,area,offence_number,offence_date,offence_description," +
  "statute_section,set_fine_cents,total_payable_cents,court_location,ticket_city,option_deadline," +
  "field_sources,review_notes";
type MatterRow = TrafficMatterState & {
  id: string;
  practice_id: string;
  client_id: string;
  area: string;
  review_notes: string | null;
};
type DocumentRow = { id: string; storage_path: string; content_type: string; size_bytes: number; kind: string | null };

type Result = { data: unknown; error: unknown };

/** The chainable PostgREST subset this reader uses. */
export interface QueryChain extends PromiseLike<Result> {
  eq(column: string, value: unknown): QueryChain;
  not(column: string, operator: string, value: unknown): QueryChain;
  order(column: string, options?: { ascending?: boolean }): QueryChain;
  single(): PromiseLike<Result>;
}

/** The subset of the Supabase service client this reader uses. */
export interface PracticeIntakeDb {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<Result>;
  from(table: string): {
    select(columns: string): QueryChain;
    update(values: Record<string, unknown>): QueryChain;
    insert(values: Record<string, unknown>): PromiseLike<Result>;
  };
  storage: { from(bucket: string): { download(path: string): PromiseLike<{ data: Blob | null; error: unknown }> } };
  functions: { invoke(name: string, options?: { body?: unknown }): PromiseLike<unknown> };
}

export interface PracticeReaderOptions {
  /** Defaults to the vision model call in practice-extract.ts. */
  extract?: (imageDataUrl: string) => Promise<Record<string, unknown>>;
  /** Toronto calendar date used to reject offence dates in the future. */
  today?: string;
  /** Receives codes only, never personal data. */
  log?: (...parts: string[]) => void;
}

export type PracticeReaderOutcome = "skipped" | "ready" | "needs_review" | "failed";

const BUCKET = AREAS.traffic.bucket;
const FAILED_NOTE = "Documents received. Automatic reading failed, so review the uploads directly before acting.";
/**
 * Images read at once. Two keeps six images at the 45 s model timeout near
 * 135 s, inside the 3-minute stalled-scan sweep, with at most two images in memory.
 */
const READ_CONCURRENCY = 2;

/** Runs `task` over `items` with at most `limit` in flight; results keep input order. */
export async function mapInOrder<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

export async function processPracticeIntake(
  db: PracticeIntakeDb, matterId: string, apiKey: string, options: PracticeReaderOptions = {},
): Promise<PracticeReaderOutcome> {
  const log = options.log || ((...parts: string[]) => console.error(...parts));
  const extract = options.extract || ((dataUrl: string) => extractOffenceNotice(apiKey, dataUrl));
  const { data: claimed, error: claimError } = await db.rpc("practice_claim_intake_scan", { p_matter_id: matterId });
  if (claimError || claimed !== true) return "skipped";

  let outcome: PracticeReaderOutcome = "failed";
  let existingNotes: string | null = null;
  try {
    const [{ data: matterData, error: matterError }, { data: documentData, error: docError }] = await Promise.all([
      db.from("practice_matters").select(MATTER_FIELDS).eq("id", matterId).single(),
      db.from("practice_matter_documents").select("id,storage_path,content_type,size_bytes,kind")
        .eq("matter_id", matterId).not("uploaded_at", "is", null).eq("extraction_status", "pending")
        .order("created_at"),
    ]);
    const matter = matterData as MatterRow | null;
    const documents = (documentData || []) as DocumentRow[];
    if (matterError || !matter || docError) throw new Error("matter_unavailable");
    existingNotes = matter.review_notes;
    if (matter.area !== "traffic") throw new Error("not_a_traffic_matter");

    const today = options.today || torontoToday();
    const results = await mapInOrder(documents, READ_CONCURRENCY, async (doc): Promise<TicketExtraction | "pdf" | "failed"> => {
      if (doc.content_type === "application/pdf") {
        await db.from("practice_matter_documents").update({ extraction_status: "skipped" }).eq("id", doc.id);
        return "pdf";
      }
      try {
        const { data: file, error: downloadError } = await db.storage.from(BUCKET).download(doc.storage_path);
        if (downloadError || !file || file.size > UPLOAD_LIMITS.maxBytes) throw new Error("download_failed");
        const raw = await extract(imageBytesToDataUrl(new Uint8Array(await file.arrayBuffer()), doc.content_type));
        const extraction = normalizeTicketExtraction(doc.id, raw, today);
        await db.from("practice_matter_documents").update({
          ...(extraction.readSomething && !doc.kind ? { kind: "ticket" } : {}),
          extraction_status: "extracted",
          extracted_at: new Date().toISOString(),
          extracted: { fields: extraction.fields, lowConfidence: extraction.lowConfidence, notes: extraction.notes },
        }).eq("id", doc.id);
        return extraction;
      } catch (error) {
        log("practice ticket read failed", errorCode(error));
        await db.from("practice_matter_documents").update({ extraction_status: "failed" }).eq("id", doc.id);
        return "failed";
      }
    });
    // Upload order decides which image fills a field first.
    const extractions: TicketExtraction[] = [];
    const unread: { documentId: string; reason: "pdf" | "failed" }[] = [];
    results.forEach((result, index) => {
      if (typeof result === "string") unread.push({ documentId: documents[index].id, reason: result });
      else extractions.push(result);
    });

    const merge = mergeTicketIntake({
      matter: { ...matter, field_sources: matter.field_sources || {} },
      extractions,
      unreadDocuments: unread,
    });
    const reviewNotes = [matter.review_notes, ...merge.notes].filter(Boolean).join("\n").slice(0, 4000);
    const { error: updateError } = await db.from("practice_matters").update({
      ...merge.matterPatch,
      intake_review_status: merge.reviewStatus,
      review_notes: reviewNotes,
    }).eq("id", matterId).eq("intake_review_status", "scanning");
    if (updateError) throw new Error("matter_update_failed");
    await db.from("practice_matter_events").insert({
      matter_id: matterId,
      practice_id: matter.practice_id,
      event: "documents_read",
      detail: { read: extractions.length, unread: unread.length, reviewStatus: merge.reviewStatus },
    });
    outcome = merge.reviewStatus;
  } catch (error) {
    log("practice intake requires staff review", errorCode(error));
    try {
      await db.from("practice_matters").update({
        intake_review_status: "needs_review",
        review_notes: [existingNotes, FAILED_NOTE].filter(Boolean).join("\n").slice(0, 4000),
      }).eq("id", matterId).eq("intake_review_status", "scanning");
    } catch {
      // The stalled-intake sweep settles it within minutes.
    }
    outcome = "failed";
  }
  await wakeNoticeWorker(db);
  return outcome;
}

/** A loggable code: our own snake_case error codes, otherwise only the error class name. */
function errorCode(error: unknown): string {
  if (error instanceof PracticeExtractionError) return error.code;
  if (error instanceof Error) return /^[a-z0-9_]{1,60}$/.test(error.message) ? error.message : error.name;
  return "unknown";
}

/** Sends the staff alert now instead of waiting for the next cron tick. */
export async function wakeNoticeWorker(db: Pick<PracticeIntakeDb, "functions">) {
  try {
    await db.functions.invoke("process-practice-notices", { body: {} });
  } catch {
    // The minute cron delivers it.
  }
}
