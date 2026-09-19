const RECORDING_REQUEST_TIMEOUT_MS = 15_000;

type RecordingOptions = {
  callId: string;
  privateApiKey: string;
  fetcher?: typeof fetch;
};

async function requestRecording(
  url: URL,
  options: RequestInit,
  fetcher: typeof fetch,
): Promise<Response> {
  try {
    return await fetcher(url, {
      ...options,
      method: "GET",
      // This signal also bounds reading the returned recording body.
      signal: AbortSignal.timeout(RECORDING_REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Never log a provider exception that might include a signed recording URL.
    throw new Error("VAPI_RECORDING_REQUEST_FAILED");
  }
}

export async function fetchVapiRecording({
  callId,
  privateApiKey,
  fetcher = fetch,
}: RecordingOptions): Promise<Response> {
  if (typeof callId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(callId)) {
    throw new Error("VAPI_RECORDING_CALL_ID_INVALID");
  }
  if (!privateApiKey) throw new Error("VAPI_RECORDING_KEY_MISSING");

  // Construct the endpoint from the call ID. Never authenticate a URL supplied
  // in a webhook artifact or allow that URL to choose the destination host.
  const endpoint = new URL(
    `https://api.vapi.ai/call/${encodeURIComponent(callId)}/mono-recording`,
  );
  let response = await requestRecording(endpoint, {
    headers: { Authorization: `Bearer ${privateApiKey}` },
    redirect: "manual",
  }, fetcher);

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    await response.body?.cancel();
    let downloadUrl: URL;
    try {
      if (!location) throw new Error();
      downloadUrl = new URL(location, endpoint);
      if (
        downloadUrl.protocol !== "https:" || downloadUrl.username ||
        downloadUrl.password
      ) throw new Error();
    } catch {
      throw new Error("VAPI_RECORDING_REDIRECT_INVALID");
    }
    // The signed storage URL needs no Vapi key. Reject another redirect rather
    // than forwarding credentials or following an unbounded redirect chain.
    response = await requestRecording(
      downloadUrl,
      { redirect: "error" },
      fetcher,
    );
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`VAPI_RECORDING_HTTP_${response.status}`);
  }
  return response;
}

export function recordingFileExtension(response: Response): "mp3" | "wav" {
  const metadata = [
    response.headers.get("content-type"),
    response.headers.get("content-disposition"),
    response.url,
  ].join(" ").toLowerCase();
  return metadata.includes("mpeg") || metadata.includes(".mp3") ? "mp3" : "wav";
}

export function recordingNoticeHtml(
  signedRecordingUrl: string | null,
  recordingExpected: boolean,
): string {
  if (signedRecordingUrl) {
    const escaped = signedRecordingUrl.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
    return `<p style="margin:16px 0"><a href="${escaped}" style="color:#2563eb">Listen to the recording</a> (link valid ~30 days)</p>`;
  }
  return recordingExpected
    ? '<p style="margin:16px 0;color:#b45309">Recording retrieval is unavailable. Use the Call ID above to locate this call in Vapi.</p>'
    : "";
}
