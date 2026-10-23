import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { createIntakeHandler } from "../_shared/practice-intake-handler.ts";
import { type PracticeIntakeDb, processPracticeIntake, wakeNoticeWorker } from "../_shared/process-practice-intake.ts";

/**
 * Public intake for traffic tickets and other matters on anderhue.ca
 * (ARCHITECTURE.md 4.1). All logic lives in
 * ../_shared/practice-intake-handler.ts; this file only wires the service
 * client, the environment and background work.
 */

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = admin as unknown as PracticeIntakeDb;

function background(task: Promise<unknown>) {
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(task);
}

export const handler = createIntakeHandler({
  rpc: async (name, args) => {
    const { data, error } = await admin.rpc(name, args);
    return { data, error };
  },
  storage: bucket => admin.storage.from(bucket),
  env: key => Deno.env.get(key),
  background,
  startReader: matterId => processPracticeIntake(db, matterId, Deno.env.get("LOVABLE_API_KEY") || ""),
  wakeNotices: () => wakeNoticeWorker(db),
});

if (import.meta.main) serve(handler);
