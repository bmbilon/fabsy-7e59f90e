/**
 * Reads one Ontario offence notice (traffic ticket) image with the same
 * vision model, gateway and timeout as ltb-extract.ts. Returns raw tool
 * output for normalizeTicketExtraction; never decides anything on its own.
 */

export const OFFENCE_NOTICE_PROMPT = `You are reading one photo of an Ontario traffic ticket (a Provincial Offences Act offence notice or certificate of offence) that a client uploaded to a paralegal practice.

Copy only what is printed or clearly handwritten on the ticket:
- offence_number: the ticket's own offence notice number, usually printed near the top, often beside a barcode.
- offence_date: the date of the offence.
- offence_description: the offence as written, for example "Speeding 80 km/h in a posted 60 km/h zone".
- statute_section: the act and section written on the ticket, for example "HTA 128".
- set_fine and total_payable: the set fine and the total payable, as numbers without currency symbols.
- court_location: the court office or address the ticket says to contact or attend.
- ticket_city: the municipality where the offence happened.

Never return a driver's licence number, a licence plate number, a vehicle identification number, a date of birth, an address or any other identification number, even if it is printed on the ticket, and never copy them into notes.

Dates must be YYYY-MM-DD. If a value is not visible or you are not sure of it, return null. Never guess, infer, calculate or complete a partial value. List in low_confidence_fields every field you returned but could not read clearly. Use notes for one short sentence about anything unusual, for example text that is cut off, a ticket that looks altered, or a second page. If the image is not an Ontario offence notice, return null for every field and say in notes what kind of document it appears to be, without copying any personal details.`;

const STRING = { type: "string", nullable: true };

export const OFFENCE_NOTICE_TOOL = {
  type: "function",
  function: {
    name: "extract_ontario_offence_notice",
    description: "Fields copied from one Ontario offence notice image",
    parameters: {
      type: "object",
      properties: {
        offence_number: STRING,
        offence_date: STRING,
        offence_description: STRING,
        statute_section: STRING,
        set_fine: { type: "number", nullable: true },
        total_payable: { type: "number", nullable: true },
        court_location: STRING,
        ticket_city: STRING,
        low_confidence_fields: { type: "array", items: { type: "string" }, nullable: true },
        notes: STRING,
      },
      required: ["offence_number"],
      additionalProperties: false,
    },
  },
};

export class PracticeExtractionError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function extractOffenceNotice(
  apiKey: string,
  imageDataUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new PracticeExtractionError("extraction_not_configured");
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
            { type: "text", text: OFFENCE_NOTICE_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        }],
        tools: [OFFENCE_NOTICE_TOOL],
        tool_choice: { type: "function", function: { name: "extract_ontario_offence_notice" } },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new PracticeExtractionError("extraction_network_error");
  }
  if (!response.ok) throw new PracticeExtractionError(`extraction_http_${response.status}`);
  const result = await response.json().catch(() => null) as {
    choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
  } | null;
  const call = result?.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (typeof call?.arguments !== "string" || (call.name && call.name !== "extract_ontario_offence_notice")) {
    throw new PracticeExtractionError("extraction_response_invalid");
  }
  try {
    const parsed = JSON.parse(call.arguments);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new PracticeExtractionError("extraction_response_invalid");
  }
}

export function imageBytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}
