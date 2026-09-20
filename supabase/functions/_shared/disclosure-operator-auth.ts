/** Validate a caller's service role through PostgREST's verified JWT and database grants. */
export async function verifyDisclosureServiceOperator(
  authorization: string,
  config: { supabaseUrl: string; anonKey: string },
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!/^Bearer [A-Za-z0-9._~-]{1,8192}$/.test(authorization) || !config.anonKey) return false;
  try {
    const origin = new URL(config.supabaseUrl);
    if (origin.protocol !== "https:" || origin.username || origin.password) return false;
    const endpoint = new URL("/rest/v1/rpc/verify_disclosure_automation_operator", origin);
    const result = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: authorization,
      },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    // Never infer privilege from an unverified claim, a successful unrelated query,
    // or a truthy response. This RPC is executable only by service_role.
    return result.status === 200 && await result.json() === true;
  } catch {
    return false;
  }
}
