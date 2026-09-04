import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const sourcePath = new URL("./useTicketCache.ts", import.meta.url);
const source = await fs.readFile(sourcePath, "utf8");
const endpointSource = await fs.readFile(new URL("../../supabase/functions/cache-ticket-data/index.ts", import.meta.url), "utf8");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-retired-ticket-cache-"));
const outfile = path.join(temporary, "useTicketCache.mjs");

await build({
  entryPoints: [sourcePath.pathname],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});
const { useTicketCache } = await import(pathToFileURL(outfile).href);

test("retired cache hook has no network, Supabase, logging or ticket-key path", () => {
  for (const forbidden of ["supabase", "fetch(", "console.", "cache-ticket-data", "ticketNumber ||", "Date.now(", "Math.random("]) {
    assert.equal(source.includes(forbidden), false, `retired hook must not contain ${forbidden}`);
  }
});

test("retired cache operations are deterministic no-ops", async () => {
  const cache = useTicketCache();
  assert.equal(await cache.cacheTicketData({ ticketNumber: "SYNTHETIC-1" }, "legacy-key"), null);
  assert.equal(await cache.getCachedTicketData("legacy-key"), null);
  assert.equal(await cache.isCacheKeyValid("legacy-key"), false);
  assert.equal(cache.generateCacheKey({ ticketNumber: "SYNTHETIC-1" }), "");
  assert.equal(cache.isLoading, false);
  assert.equal(cache.error, null);
});

test("legacy edge endpoint is a closed 410 tombstone", () => {
  assert.match(endpointSource, /status:\s*410/);
  assert.match(endpointSource, /ticket_cache_retired/);
  assert.match(endpointSource, /isAllowedTicketIntakeOrigin/);
  for (const forbidden of ["createClient", "SUPABASE_SERVICE_ROLE_KEY", ".from(", "console."]) {
    assert.equal(endpointSource.includes(forbidden), false, `retired endpoint must not contain ${forbidden}`);
  }
});

test.after(async () => fs.rm(temporary, { recursive: true, force: true }));
