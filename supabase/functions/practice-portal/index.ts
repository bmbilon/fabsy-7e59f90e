import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { createPortalHandler } from "../_shared/practice-portal-core.ts";

/**
 * Public, token-authorized client portal for anderhue.ca/files
 * (ARCHITECTURE.md 4.2). All logic lives in ../_shared/practice-portal-core.ts;
 * this file only wires the service client, the environment and background
 * work.
 */

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function background(task: Promise<unknown>) {
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(task);
}

export const handler = createPortalHandler({
  rpc: async (name, args) => {
    const { data, error } = await admin.rpc(name, args);
    return { data, error };
  },
  storage: bucket => admin.storage.from(bucket),
  env: key => Deno.env.get(key),
  background,
  wakeNotices: async () => {
    try {
      await admin.functions.invoke("process-practice-notices", { body: {} });
    } catch {
      // The minute cron delivers it.
    }
  },
});

if (import.meta.main) serve(handler);
