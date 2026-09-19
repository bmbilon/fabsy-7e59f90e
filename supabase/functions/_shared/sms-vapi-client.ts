import { extractVapiChatResult } from "./sms-vapi.ts";
import type {
  ChatRequest,
  VapiChatClient,
} from "../sms-vapi-webhook/handler.ts";

export class SmsVapiClient implements VapiChatClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createChat(request: ChatRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9_000);
    try {
      const response = await this.fetcher("https://api.vapi.ai/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          assistantId: request.assistantId,
          input: request.input,
          ...(request.previousChatId
            ? { previousChatId: request.previousChatId }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Vapi Chat API failed with status ${response.status}`);
      }
      const contentLength = Number(
        response.headers.get("content-length") || "0",
      );
      if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
        throw new Error("Vapi Chat API response was too large");
      }
      const rawResponse = await response.text();
      if (rawResponse.length > 1_000_000) {
        throw new Error("Vapi Chat API response was too large");
      }
      let payload: unknown;
      try {
        payload = JSON.parse(rawResponse);
      } catch {
        throw new Error("Vapi Chat API returned invalid JSON");
      }
      const result = extractVapiChatResult(payload);
      if (!result) {
        throw new Error("Vapi Chat API returned an invalid response");
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Inbound Twilio requests have a short response window. Three DB operations at
// most 1.5s each plus a 9s Chat call leave time to return signed-path TwiML.
export function createSmsDatabaseFetch(
  fetcher: typeof fetch = fetch,
  timeoutMs = 1500,
): typeof fetch {
  return (input, init) =>
    fetcher(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
}
