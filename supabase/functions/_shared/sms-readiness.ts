import { checkUploadSmsReadiness } from "./ticket-upload-sms.ts";

type ReadinessConfig = {
  accountSid: string;
  authToken: string;
  from: string;
  assistantId: string;
  vapiKey: string;
  senderHashKey: string;
  webhookUrl: string;
  supabaseUrl: string;
  previousSenderHashKey?: string;
  senderRateLimit?: string;
  globalRateLimit?: string;
  dailyRateLimit?: string;
};
type Check = { ready: boolean; code: string | null };
const validOptionalLimit = (value: string | undefined, max: number) =>
  !value ||
  (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) &&
    Number(value) >= 1 && Number(value) <= max);

// All provider requests here are GETs. This proves credentials, an owned sender,
// and a tool-free text assistant without creating chats, inquiries or messages.
export async function checkSmsBridgeReadiness(
  config: ReadinessConfig,
  database: () => Promise<unknown>,
  fetcher: typeof fetch = fetch,
) {
  let configured =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(
        config.assistantId,
      ) &&
    Boolean(config.vapiKey) &&
    new TextEncoder().encode(config.senderHashKey).length >= 32 &&
    (!config.previousSenderHashKey ||
      (new TextEncoder().encode(config.previousSenderHashKey).length >= 32 &&
        config.previousSenderHashKey !== config.senderHashKey)) &&
    validOptionalLimit(config.senderRateLimit, 100) &&
    validOptionalLimit(config.globalRateLimit, 1000) &&
    validOptionalLimit(config.dailyRateLimit, 10000);
  try {
    const endpoint = new URL(config.webhookUrl);
    configured = configured && endpoint.protocol === "https:" &&
      !endpoint.search && !endpoint.hash &&
      endpoint.href ===
        new URL("/functions/v1/sms-vapi-webhook", config.supabaseUrl).href;
  } catch {
    configured = false;
  }
  if (!configured) {
    return {
      ready: false,
      code: "configuration_missing",
      twilio: null,
      vapi: null,
      database: null,
    };
  }

  const [twilio, vapi, db] = await Promise.all([
    checkUploadSmsReadiness(config, fetcher),
    (async (): Promise<
      Check & { assistantId?: string; assistantName?: string }
    > => {
      try {
        const response = await fetcher(
          `https://api.vapi.ai/assistant/${config.assistantId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.vapiKey}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) {
          return {
            ready: false,
            code: response.status === 401 || response.status === 403
              ? "provider_auth_failed"
              : "assistant_lookup_failed",
          };
        }
        const assistant = await response.json();
        if (
          !assistant || assistant.id !== config.assistantId ||
          typeof assistant.name !== "string" || !assistant.model
        ) {
          return { ready: false, code: "assistant_response_invalid" };
        }
        const model = assistant.model;
        // A tool-enabled assistant could execute actions despite SMS instructions.
        // Do not switch routing until the configured text assistant passes review.
        const hasTools = [model.tools, model.toolIds, model.functions].some(
          (value) => Array.isArray(value) && value.length > 0,
        );
        return {
          ready: !hasTools,
          code: hasTools ? "assistant_has_actions" : null,
          assistantId: assistant.id,
          assistantName: assistant.name.slice(0, 120),
        };
      } catch {
        return { ready: false, code: "assistant_lookup_failed" };
      }
    })(),
    (async () => {
      try {
        const result = await database() as Record<string, unknown> | null;
        const valid = result?.version === 1 &&
          result?.contracts_ready === true &&
          typeof result?.circuit_enabled === "boolean";
        return {
          ready: valid,
          code: valid ? null : "database_contracts_missing",
          circuitEnabled: valid ? result!.circuit_enabled : null,
        };
      } catch {
        return {
          ready: false,
          code: "database_check_failed",
          circuitEnabled: null,
        };
      }
    })(),
  ]);
  return {
    ready: twilio.ready && vapi.ready && db.ready,
    code: null,
    twilio,
    vapi,
    database: db,
  };
}
