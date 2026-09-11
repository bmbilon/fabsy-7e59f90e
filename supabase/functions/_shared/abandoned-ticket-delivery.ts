import {
  type AbandonedTicketEmail,
  renderAbandonedTicketEmail,
} from "./abandoned-ticket-email.ts";

export type AbandonedTicketJob = {
  id: string;
  draft_id: string;
  claim_id: string;
  email_payload: AbandonedTicketEmail | null;
};

export type AbandonedTicketContext = {
  eligible: boolean;
  reason?: string;
  retryable?: boolean;
  email?: string;
  firstName?: string | null;
  ticketType?: string | null;
  ticketNumber?: string | null;
  checkoutSessionIds?: string[];
};

export class AbandonedTicketDeliveryError extends Error {
  constructor(public code: string, public permanent = false) {
    super(code);
  }
}

/** Fail closed on an unreadable Stripe session; webhook lag must not cause a reminder. */
export async function checkoutHasCompleted(
  apiKey: string,
  sessionId: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!apiKey || !/^cs_(live|test)_[A-Za-z0-9_]{8,240}$/.test(sessionId)) {
    throw new AbandonedTicketDeliveryError("payment_check_invalid");
  }
  let response: Response;
  try {
    response = await fetcher(
      `https://api.stripe.com/v1/checkout/sessions/${
        encodeURIComponent(sessionId)
      }`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new AbandonedTicketDeliveryError("payment_check_unavailable");
  }
  const session = await response.json().catch(() => ({})) as {
    id?: string;
    payment_status?: string;
    status?: string;
  };
  if (
    !response.ok || session.id !== sessionId ||
    !["paid", "unpaid", "no_payment_required"].includes(
      session.payment_status || "",
    ) ||
    !["open", "complete", "expired"].includes(session.status || "")
  ) {
    throw new AbandonedTicketDeliveryError("payment_check_unavailable");
  }
  // Completed delayed-method checkouts are also excluded while Stripe settles.
  return session.payment_status !== "unpaid" || session.status === "complete";
}

export async function sendAbandonedTicketEmail(
  apiKey: string,
  email: AbandonedTicketEmail,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!apiKey) {
    throw new AbandonedTicketDeliveryError("email_configuration_missing");
  }
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `abandoned-ticket/${id}`,
      },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AbandonedTicketDeliveryError("email_provider_unavailable");
  }
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok) {
    throw new AbandonedTicketDeliveryError(
      `email_provider_http_${response.status}`,
      response.status >= 400 && response.status < 500 &&
        ![408, 409, 425, 429].includes(response.status),
    );
  }
  if (typeof result.id !== "string" || !result.id) {
    throw new AbandonedTicketDeliveryError("email_provider_response_invalid");
  }
  return result.id;
}

type Outcome = "sent" | "retry" | "failed" | "suppressed";
export type AbandonedTicketDependencies = {
  claim: () => Promise<AbandonedTicketJob | null>;
  context: (job: AbandonedTicketJob) => Promise<AbandonedTicketContext>;
  freeze: (
    job: AbandonedTicketJob,
    email: AbandonedTicketEmail,
  ) => Promise<AbandonedTicketEmail | null>;
  checkoutCompleted: (id: string) => Promise<boolean>;
  send: (email: AbandonedTicketEmail, id: string) => Promise<string>;
  finish: (
    job: AbandonedTicketJob,
    status: Outcome,
    providerId: string | null,
    reason: string | null,
  ) => Promise<boolean>;
};

const safeReason = (reason: string | undefined) =>
  reason && /^[a-z0-9_]{1,80}$/.test(reason) ? reason : "no_longer_eligible";

export async function processAbandonedTicketEmails(
  deps: AbandonedTicketDependencies,
) {
  const result = {
    claimed: 0,
    sent: 0,
    retry: 0,
    failed: 0,
    suppressed: 0,
    recordingFailed: 0,
  };
  const deadline = Date.now() + 110_000;
  // Claim individually: earlier slow requests never consume later jobs' leases.
  for (let count = 0; count < 5 && Date.now() < deadline; count++) {
    const job = await deps.claim();
    if (!job) break;
    result.claimed++;
    let status: Outcome = "retry";
    let providerId: string | null = null;
    let reason: string | null = null;
    try {
      const context = await deps.context(job);
      if (!context.eligible) {
        status = context.retryable ? "retry" : "suppressed";
        reason = safeReason(context.reason);
      } else if (!context.email || !Array.isArray(context.checkoutSessionIds)) {
        throw new AbandonedTicketDeliveryError("intake_context_invalid");
      } else {
        let completed = false;
        for (const id of new Set(context.checkoutSessionIds)) {
          if (Date.now() >= deadline) {
            throw new AbandonedTicketDeliveryError("worker_time_budget");
          }
          if (await deps.checkoutCompleted(id)) {
            completed = true;
            break;
          }
        }
        if (completed) {
          status = "suppressed";
          reason = "stripe_checkout_completed";
        } else {
          const proposed = job.email_payload || renderAbandonedTicketEmail({
            email: context.email,
            firstName: context.firstName,
            ticketType: context.ticketType,
            ticketNumber: context.ticketNumber,
          });
          const email = await deps.freeze(job, proposed);
          // Re-read after provider lookups and freezing, just before sending.
          const latest = await deps.context(job);
          if (!latest.eligible) {
            status = latest.retryable ? "retry" : "suppressed";
            reason = safeReason(latest.reason);
          } else if (
            !email || email.to.length !== 1 || email.to[0] !== latest.email
          ) {
            status = "suppressed";
            reason = "recipient_changed";
          } else if (
            !Array.isArray(latest.checkoutSessionIds) ||
            latest.checkoutSessionIds.some((id) =>
              !context.checkoutSessionIds!.includes(id)
            )
          ) {
            // A new checkout created during the checks has not been verified.
            status = "retry";
            reason = "checkout_changed";
          } else {
            if (Date.now() >= deadline) {
              throw new AbandonedTicketDeliveryError("worker_time_budget");
            }
            providerId = await deps.send(email, job.id);
            status = "sent";
          }
        }
      }
    } catch (error) {
      status = error instanceof AbandonedTicketDeliveryError && error.permanent
        ? "failed"
        : "retry";
      reason = error instanceof AbandonedTicketDeliveryError
        ? error.code
        : "reminder_attempt_error";
    }
    try {
      if (await deps.finish(job, status, providerId, reason)) result[status]++;
      else result.recordingFailed++;
    } catch {
      result.recordingFailed++;
    }
  }
  return result;
}
