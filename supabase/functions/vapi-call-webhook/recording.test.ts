import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  fetchVapiRecording,
  recordingFileExtension,
  recordingNoticeHtml,
} from "./recording.ts";

const callId = "00000000-0000-4000-8000-000000000001";

Deno.test("recording authentication stays on the canonical Vapi API and both requests are bounded", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const response = await fetchVapiRecording({
    callId,
    privateApiKey: "private-test-key",
    fetcher: (url, options) => {
      calls.push({ url: String(url), options: options! });
      return Promise.resolve(
        calls.length === 1
          ? new Response(null, {
            status: 302,
            headers: {
              location: "https://storage.example.test/file.wav?signature=test",
            },
          })
          : new Response(new Uint8Array([1, 2]), {
            headers: { "content-type": "audio/wav" },
          }),
      );
    },
  });
  assertEquals(calls.map((call) => call.url), [
    `https://api.vapi.ai/call/${callId}/mono-recording`,
    "https://storage.example.test/file.wav?signature=test",
  ]);
  assertEquals(
    new Headers(calls[0].options.headers).get("authorization"),
    "Bearer private-test-key",
  );
  assertEquals(
    new Headers(calls[1].options.headers).get("authorization"),
    null,
  );
  assertEquals(calls.map((call) => call.options.redirect), ["manual", "error"]);
  assert(
    calls.every((call) =>
      call.options.method === "GET" &&
      call.options.signal instanceof AbortSignal
    ),
  );
  assertEquals(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([1, 2]),
  );
});

Deno.test("direct authenticated recording responses remain compatible with WAV and MP3", async () => {
  const response = await fetchVapiRecording({
    callId,
    privateApiKey: "test",
    fetcher: () =>
      Promise.resolve(
        new Response("audio", { headers: { "content-type": "audio/mpeg" } }),
      ),
  });
  assertEquals(recordingFileExtension(response), "mp3");
  assertEquals(
    recordingFileExtension(
      new Response(null, {
        headers: { "content-disposition": 'attachment; filename="call.mp3"' },
      }),
    ),
    "mp3",
  );
  assertEquals(
    recordingFileExtension(
      new Response(null, { headers: { "content-type": "audio/wav" } }),
    ),
    "wav",
  );
  await response.body?.cancel();
});

Deno.test("missing credentials and unsafe call IDs never initiate a recording fetch", async () => {
  const forbidden = () => {
    throw new Error("must not fetch");
  };
  await assertRejects(
    () => fetchVapiRecording({ callId, privateApiKey: "", fetcher: forbidden }),
    Error,
    "KEY_MISSING",
  );
  for (const id of ["../call", "", "a/b", "x".repeat(129)]) {
    await assertRejects(
      () =>
        fetchVapiRecording({
          callId: id,
          privateApiKey: "test",
          fetcher: forbidden,
        }),
      Error,
      "CALL_ID_INVALID",
    );
  }
});

Deno.test("recording redirects require an HTTPS target without embedded credentials", async () => {
  for (
    const location of [
      null,
      "http://storage.example.test/file.wav",
      "https://user:password@storage.example.test/file.wav",
      "https://[",
    ]
  ) {
    let calls = 0;
    await assertRejects(
      () =>
        fetchVapiRecording({
          callId,
          privateApiKey: "test",
          fetcher: () => {
            calls++;
            return Promise.resolve(
              new Response(null, {
                status: 302,
                headers: location ? { location } : {},
              }),
            );
          },
        }),
      Error,
    );
    assertEquals(calls, 1);
  }
});

Deno.test("API and storage failures expose only coarse status and do not retry", async () => {
  for (const status of [401, 403, 404, 503]) {
    await assertRejects(
      () =>
        fetchVapiRecording({
          callId,
          privateApiKey: "test",
          fetcher: () =>
            Promise.resolve(new Response("provider details", { status })),
        }),
      Error,
      `HTTP_${status}`,
    );
  }
  let calls = 0;
  await assertRejects(
    () =>
      fetchVapiRecording({
        callId,
        privateApiKey: "test",
        fetcher: () => {
          calls++;
          return Promise.resolve(
            calls === 1
              ? new Response(null, {
                status: 302,
                headers: {
                  location: "https://storage.example.test/file.wav?secret=test",
                },
              })
              : new Response("private error payload", { status: 403 }),
          );
        },
      }),
    Error,
    "HTTP_403",
  );
  assertEquals(calls, 2);
});

Deno.test("network/timeout failures cannot expose signed recording URLs in logs", async () => {
  const error = await assertRejects(() =>
    fetchVapiRecording({
      callId,
      privateApiKey: "test",
      fetcher: () =>
        Promise.reject(
          new Error("failed https://storage.example.test/file?secret=private"),
        ),
    }), Error);
  assertEquals(error.message, "VAPI_RECORDING_REQUEST_FAILED");
});

Deno.test("recording notice offers only the stored recording or a clear retrieval status", () => {
  assertEquals(recordingNoticeHtml(null, false), "");
  const unavailable = recordingNoticeHtml(null, true);
  assert(unavailable.includes("Recording retrieval is unavailable"));
  assert(!unavailable.includes("href="));
  const available = recordingNoticeHtml(
    'https://storage.example.test/signed?a=1&b="two"',
    true,
  );
  assert(available.includes("a=1&amp;b=&quot;two&quot;"));
  assert(available.includes("Listen to the recording"));
});
