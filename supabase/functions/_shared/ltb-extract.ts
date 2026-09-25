/**
 * Reads one landlord document image (lease, rent ledger, LTB notice, ID) with
 * the same vision model and gateway the ticket OCR uses. Returns raw tool
 * output for normalizeLtbExtraction; never decides anything on its own.
 */

const EXTRACTION_PROMPT = `You are reading one document a landlord uploaded for an Ontario Landlord and Tenant Board matter.

First classify it as one of: lease, rent_ledger, n4_notice, n5_notice, n12_notice, other_ltb_notice, government_id, ltb_hearing_notice, ltb_order, other.

Then copy only what is printed or clearly handwritten on the document:
- Landlord details as written in the lease or notice (landlord_name, landlord_organization if the landlord is a company, landlord address for service, city, province, postal code, phone).
- For a government photo ID only: the holder's first and last name, address, city, province, postal code, and the document type (for example "Ontario driver's licence"). Never return any ID, licence or card number.
- Rental unit address and city, and every tenant name listed.
- Rent amount as a number without currency symbols, rent period (monthly, weekly, daily or yearly), the day of the month rent is due, and the lease start date.
- For a notice: the form number (N4, N5, N7, N8, N12, N13), the date it was served or signed, how it was served (hand, mailbox, mail, courier, email), the termination date written on it, and the total arrears claimed.
- For a rent ledger: the total arrears owing as of the latest entry.
- For a Notice of Hearing or order: the hearing date.

Dates must be YYYY-MM-DD. If a value is not visible, return null. Never guess, infer, calculate or fill in legal conclusions. List in low_confidence_fields every field you returned but could not read clearly. Use notes for one short sentence about anything unusual (for example a notice that looks unsigned or an amount that is crossed out).`;

const STRING = { type: "string", nullable: true };

export const LTB_EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "extract_landlord_document",
    description: "Structured fields copied from one landlord document",
    parameters: {
      type: "object",
      properties: {
        document_kind: {
          type: "string",
          enum: ["lease", "rent_ledger", "n4_notice", "n5_notice", "n12_notice", "other_ltb_notice",
            "government_id", "ltb_hearing_notice", "ltb_order", "other"],
        },
        landlord_name: STRING, landlord_organization: STRING, landlord_address: STRING,
        landlord_city: STRING, landlord_province: STRING, landlord_postal_code: STRING, landlord_phone: STRING,
        id_first_name: STRING, id_last_name: STRING, id_address: STRING, id_city: STRING,
        id_province: STRING, id_postal_code: STRING, id_document_type: STRING,
        rental_unit_address: STRING, rental_unit_city: STRING,
        tenant_names: { type: "array", items: { type: "string" }, nullable: true },
        rent_amount: { type: "number", nullable: true },
        rent_period: { type: "string", nullable: true },
        rent_due_day: { type: "integer", nullable: true },
        lease_start_date: STRING,
        notice_form: STRING, notice_served_date: STRING, notice_service_method: STRING,
        notice_termination_date: STRING,
        arrears_total: { type: "number", nullable: true },
        hearing_date: STRING,
        low_confidence_fields: { type: "array", items: { type: "string" }, nullable: true },
        notes: STRING,
      },
      required: ["document_kind"],
      additionalProperties: false,
    },
  },
};

export class LtbExtractionError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function extractLtbDocument(
  apiKey: string,
  imageDataUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new LtbExtractionError("extraction_not_configured");
  let response: Response;
  try {
    response = await fetcher("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        }],
        tools: [LTB_EXTRACTION_TOOL],
        tool_choice: { type: "function", function: { name: "extract_landlord_document" } },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new LtbExtractionError("extraction_network_error");
  }
  if (!response.ok) throw new LtbExtractionError(`extraction_http_${response.status}`);
  const result = await response.json().catch(() => null) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  } | null;
  const args = result?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (typeof args !== "string") throw new LtbExtractionError("extraction_response_invalid");
  try {
    const parsed = JSON.parse(args);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new LtbExtractionError("extraction_response_invalid");
  }
}

export function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}
