// Keep completion-link rotation independent from platform-managed database keys.
// Missing configuration fails signed aliases closed; legacy links still work.
export function ticketCompletionSecret(): string {
  return Deno.env.get("TICKET_COMPLETION_SIGNING_SECRET") || "";
}
