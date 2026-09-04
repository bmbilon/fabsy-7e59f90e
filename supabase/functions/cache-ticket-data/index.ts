import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  isAllowedTicketIntakeOrigin,
  ticketIntakeResponseHeaders,
} from "../_shared/ticket-intake-draft.ts";

const configuredOrigins = Deno.env.get("TICKET_INTAKE_ALLOWED_ORIGINS") || "";

/**
 * The legacy OCR cache accepted caller-selected keys while using a service-role
 * client. RLS could not protect that public proxy. Ticket intake drafts now own
 * private resume state, so fail closed instead of retaining a second PII store.
 */
serve((req) => {
  const origin = req.headers.get("origin");
  const headers = ticketIntakeResponseHeaders(origin, configuredOrigins);
  if (!isAllowedTicketIntakeOrigin(origin, configuredOrigins)) {
    return new Response(JSON.stringify({ error: "Origin is not allowed." }), {
      status: 403,
      headers,
    });
  }
  if (req.method === "OPTIONS") return new Response(null, { headers });
  return new Response(
    JSON.stringify({
      error: "The legacy remote ticket cache has been retired.",
      code: "ticket_cache_retired",
    }),
    { status: 410, headers },
  );
});
