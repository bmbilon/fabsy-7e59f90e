import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import { Button } from "@/components/ui/button";
import SmsIntakeInbox from "@/components/SmsIntakeInbox";

export default function AdminSmsIntake() {
  const [allowed, setAllowed] = useState(false);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    let generation = 0;
    const check = async (session: Session | null, request: number) => {
      if (!active || request !== generation) return;
      try {
        const role = session ? await getIdrStaffRole() : null;
        if (!active || request !== generation) return;
        if (!session || !role) { navigate("/admin", { replace: true }); return; }
        setAllowed(true);
      } catch { if (active && request === generation) setFailed(true); }
    };
    const schedule = (session: Session | null) => {
      const request = ++generation;
      setAllowed(false);
      setFailed(false);
      // Never await a Supabase API inside its auth-state callback.
      queueMicrotask(() => { void check(session, request); });
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => schedule(session));
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || generation !== 0) return;
      if (error) setFailed(true); else schedule(data.session);
    }).catch(() => { if (active && generation === 0) setFailed(true); });
    return () => { active = false; generation++; subscription.unsubscribe(); };
  }, [navigate]);
  return <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
    <Button asChild variant="ghost"><Link to="/admin/dashboard">Back to Dashboard</Link></Button>
    {allowed ? <SmsIntakeInbox /> : failed
      ? <p role="alert">Staff access could not be verified. <Link to="/admin" className="underline">Sign in again.</Link></p>
      : <p role="status">Checking staff access…</p>}
  </main>;
}
