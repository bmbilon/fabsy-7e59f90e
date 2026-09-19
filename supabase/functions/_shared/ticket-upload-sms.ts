// Existing owner route used by send-notification; never send this alert to the customer.
const OWNER_PHONE = "+14036695353";
export const UPLOAD_ALERT_SMS_BODY =
  "Fabsy: A ticket was uploaded. Follow up in https://fabsy.ca/admin/cases . This does not confirm payment or authorization.";

export type UploadSmsAlert = { alert_id: string; claim_id: string };
export type UploadSmsConfig = {
  accountSid: string;
  authToken: string;
  from: string;
};
export type UploadSmsOutcome = "accepted" | "failed" | "indeterminate";

export function validUploadSmsConfig(config: UploadSmsConfig): boolean {
  return /^AC[a-fA-F0-9]{32}$/.test(config.accountSid) &&
    Boolean(config.authToken.trim()) && /^\+[1-9]\d{7,14}$/.test(config.from);
}

// Read-only readiness check. The provider result and configured numbers never
// leave this function; success proves account access and an owned SMS sender,
// not final message delivery.
export async function checkUploadSmsReadiness(
  config: UploadSmsConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ ready: boolean; code: string | null }> {
  if (!validUploadSmsConfig(config)) {
    return { ready: false, code: "configuration_missing" };
  }
  try {
    const url = new URL(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/IncomingPhoneNumbers.json`,
    );
    url.searchParams.set("PhoneNumber", config.from);
    url.searchParams.set("PageSize", "1");
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${
          btoa(`${config.accountSid}:${config.authToken}`)
        }`,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return {
        ready: false,
        code: response.status === 401 || response.status === 403
          ? "provider_auth_failed"
          : "provider_lookup_failed",
      };
    }
    const result = await response.json() as {
      incoming_phone_numbers?: {
        account_sid?: string;
        phone_number?: string;
        capabilities?: { sms?: boolean };
      }[];
    };
    const senderOwned = Array.isArray(result.incoming_phone_numbers) &&
      result.incoming_phone_numbers.some((number) =>
        number.account_sid === config.accountSid &&
        number.phone_number === config.from && number.capabilities?.sms === true
      );
    return {
      ready: senderOwned,
      code: senderOwned ? null : "sender_not_owned_or_sms_capable",
    };
  } catch {
    return { ready: false, code: "provider_lookup_failed" };
  }
}

export class UploadSmsSendError extends Error {
  constructor(public code: string, public outcome: "failed" | "indeterminate") {
    super(code);
  }
}

export async function sendUploadAlertSms(
  config: UploadSmsConfig,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!validUploadSmsConfig(config)) {
    throw new UploadSmsSendError("configuration_missing", "failed");
  }
  let response: Response;
  try {
    response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${
            btoa(`${config.accountSid}:${config.authToken}`)
          }`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: OWNER_PHONE,
          From: config.from,
          Body: UPLOAD_ALERT_SMS_BODY,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    // Twilio may have accepted the message before the response was lost.
    throw new UploadSmsSendError("provider_network_error", "indeterminate");
  }
  if (!response.ok) {
    throw new UploadSmsSendError(
      `provider_http_${response.status}`,
      response.status >= 400 && response.status < 500 && response.status !== 408
        ? "failed"
        : "indeterminate",
    );
  }
  const result = await response.json().catch(() => ({})) as { sid?: unknown };
  if (
    typeof result.sid !== "string" || !/^SM[a-fA-F0-9]{32}$/.test(result.sid)
  ) {
    throw new UploadSmsSendError("provider_response_invalid", "indeterminate");
  }
  // A Message SID confirms provider acceptance, not handset delivery.
  return result.sid;
}

export type UploadSmsDependencies = {
  claim: () => Promise<UploadSmsAlert[]>;
  send: () => Promise<string>;
  finish: (
    alert: UploadSmsAlert,
    outcome: UploadSmsOutcome,
    providerId: string | null,
    failureCode: string | null,
  ) => Promise<boolean>;
};

export async function processTicketUploadSms(deps: UploadSmsDependencies) {
  const result = {
    claimed: 0,
    accepted: 0,
    failed: 0,
    indeterminate: 0,
    recordingFailed: 0,
  };
  const alerts = await deps.claim();
  result.claimed = alerts.length;
  for (const alert of alerts) {
    let outcome: UploadSmsOutcome = "indeterminate";
    let providerId: string | null = null;
    let failureCode: string | null = null;
    try {
      providerId = await deps.send();
      outcome = "accepted";
    } catch (error) {
      outcome = error instanceof UploadSmsSendError
        ? error.outcome
        : "indeterminate";
      failureCode = error instanceof UploadSmsSendError
        ? error.code
        : "upload_sms_attempt_error";
    }
    try {
      if (await deps.finish(alert, outcome, providerId, failureCode)) {
        result[outcome]++;
      } else result.recordingFailed++;
    } catch {
      // A lost completion write leaves a lease, which expires to indeterminate.
      // There is deliberately no automatic retry of a possibly accepted SMS.
      result.recordingFailed++;
    }
  }
  return result;
}
