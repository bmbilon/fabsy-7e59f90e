import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  checkUploadSmsReadiness,
  processTicketUploadSms,
  sendUploadAlertSms,
  UPLOAD_ALERT_SMS_BODY,
  type UploadSmsDependencies,
  UploadSmsSendError,
  validUploadSmsConfig,
} from "./ticket-upload-sms.ts";

const config = {
  accountSid: `AC${"a".repeat(32)}`,
  authToken: "test-token",
  from: "+14035550100",
};
const sid = `SM${"b".repeat(32)}`;

Deno.test("SMS readiness only reads provider-owned sender metadata and returns coarse status", async () => {
  const valid = {
    account_sid: config.accountSid,
    phone_number: config.from,
    capabilities: { sms: true },
  };
  let calls = 0;
  assertEquals(
    await checkUploadSmsReadiness(config, (url, options) => {
      calls++;
      assertEquals(options?.method, "GET");
      const endpoint = new URL(String(url));
      assert(endpoint.pathname.endsWith("/IncomingPhoneNumbers.json"));
      assertEquals(endpoint.searchParams.get("PhoneNumber"), config.from);
      return Promise.resolve(
        Response.json({ incoming_phone_numbers: [valid] }),
      );
    }),
    { ready: true, code: null },
  );
  assertEquals(calls, 1);
  for (
    const numbers of [[], [{ ...valid, phone_number: "+14035550101" }], [{
      ...valid,
      account_sid: `AC${"b".repeat(32)}`,
    }], [{ ...valid, capabilities: { sms: false } }]]
  ) {
    assertEquals(
      await checkUploadSmsReadiness(
        config,
        () =>
          Promise.resolve(Response.json({ incoming_phone_numbers: numbers })),
      ),
      { ready: false, code: "sender_not_owned_or_sms_capable" },
    );
  }
  assertEquals(
    await checkUploadSmsReadiness(
      config,
      () =>
        Promise.resolve(new Response("secret provider error", { status: 401 })),
    ),
    { ready: false, code: "provider_auth_failed" },
  );
  assertEquals(
    await checkUploadSmsReadiness(
      config,
      () => Promise.reject(new Error("timeout")),
    ),
    { ready: false, code: "provider_lookup_failed" },
  );
});

Deno.test("upload SMS uses fixed owner route and generic body with no customer details", async () => {
  let request: RequestInit | undefined;
  const accepted = await sendUploadAlertSms(config, (_url, options) => {
    request = options;
    return Promise.resolve(Response.json({ sid, status: "queued" }));
  });
  assertEquals(accepted, sid);
  const body = new URLSearchParams(request!.body as URLSearchParams);
  assertEquals(body.get("To"), "+14036695353");
  assertEquals(body.get("From"), config.from);
  assertEquals(body.get("Body"), UPLOAD_ALERT_SMS_BODY);
  assert(
    UPLOAD_ALERT_SMS_BODY.includes("does not confirm payment or authorization"),
  );
  assert(
    !/accessToken|resume=|storage\/|ticketNumber|firstName/.test(
      UPLOAD_ALERT_SMS_BODY,
    ),
  );
});

Deno.test("invalid SMS configuration is rejected before contacting provider", async () => {
  for (
    const invalid of [{ ...config, accountSid: "invalid" }, {
      ...config,
      authToken: "",
    }, { ...config, from: "4035550100" }]
  ) {
    assertEquals(validUploadSmsConfig(invalid), false);
    await assertRejects(
      () =>
        sendUploadAlertSms(invalid, () => {
          throw new Error("must not call provider");
        }),
      UploadSmsSendError,
      "configuration_missing",
    );
  }
});

Deno.test("SMS errors never assume an ambiguous response is safe to retry", async () => {
  for (
    const [status, outcome] of [
      [400, "failed"],
      [401, "failed"],
      [429, "failed"],
      [408, "indeterminate"],
      [500, "indeterminate"],
      [503, "indeterminate"],
    ]
  ) {
    const error = await assertRejects(
      () =>
        sendUploadAlertSms(
          config,
          () => Promise.resolve(new Response("{}", { status: Number(status) })),
        ),
      UploadSmsSendError,
    );
    assertEquals(error.outcome, outcome);
  }
  const lost = await assertRejects(
    () =>
      sendUploadAlertSms(config, () => Promise.reject(new Error("timeout"))),
    UploadSmsSendError,
  );
  assertEquals(lost.outcome, "indeterminate");
  for (const body of ["{}", '{"sid":"invalid"}', "invalid-json"]) {
    const malformed = await assertRejects(
      () =>
        sendUploadAlertSms(config, () => Promise.resolve(new Response(body))),
      UploadSmsSendError,
    );
    assertEquals(malformed.outcome, "indeterminate");
  }
});

function dependencies(
  overrides: Partial<UploadSmsDependencies> = {},
): UploadSmsDependencies {
  return {
    claim: () =>
      Promise.resolve([{ alert_id: "upload-1", claim_id: "claim-1" }]),
    send: () => Promise.resolve(sid),
    finish: () => Promise.resolve(true),
    ...overrides,
  };
}

Deno.test("SMS acceptance is persisted as accepted and never called delivered", async () => {
  const result = await processTicketUploadSms(
    dependencies({
      finish: (_alert, status, providerId, code) => {
        assertEquals([status, providerId, code], ["accepted", sid, null]);
        return Promise.resolve(true);
      },
    }),
  );
  assertEquals(result, {
    claimed: 1,
    accepted: 1,
    failed: 0,
    indeterminate: 0,
    recordingFailed: 0,
  });
});

Deno.test("ambiguous SMS send and completion-write failure never trigger a second send", async () => {
  let sends = 0;
  const result = await processTicketUploadSms(dependencies({
    send: () => {
      sends++;
      return Promise.reject(
        new UploadSmsSendError("provider_network_error", "indeterminate"),
      );
    },
    finish: (_alert, status, providerId, code) => {
      assertEquals([status, providerId, code], [
        "indeterminate",
        null,
        "provider_network_error",
      ]);
      return Promise.reject(new Error("database unavailable"));
    },
  }));
  assertEquals(sends, 1);
  assertEquals(result.recordingFailed, 1);
  const lost = await processTicketUploadSms(
    dependencies({ finish: () => Promise.resolve(false) }),
  );
  assertEquals(lost.recordingFailed, 1);
  assertEquals(lost.accepted, 0);
});

Deno.test("one SMS failure does not suppress the next independently claimed upload", async () => {
  let sends = 0;
  const result = await processTicketUploadSms(
    dependencies({
      claim: () =>
        Promise.resolve([{ alert_id: "one", claim_id: "c1" }, {
          alert_id: "two",
          claim_id: "c2",
        }]),
      send: () => {
        sends++;
        return sends === 1
          ? Promise.reject(
            new UploadSmsSendError("provider_http_400", "failed"),
          )
          : Promise.resolve(sid);
      },
    }),
  );
  assertEquals(result.failed, 1);
  assertEquals(result.accepted, 1);
});
