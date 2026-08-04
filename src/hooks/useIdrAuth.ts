import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type IdrStaffRole = "admin" | "case_manager";

export async function getIdrStaffRole(): Promise<IdrStaffRole | null> {
  // The RPC is added by the IDR migration ahead of the generated client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("idr_staff_role");
  if (error) throw error;
  return data === "admin" || data === "case_manager" ? data : null;
}

export function useIdrAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [claimedUserId, setClaimedUserId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session) {
      setClaimedUserId(null);
      setAccessError(null);
      return () => {
        active = false;
      };
    }

    setAccessError(null);
    const claimClientRecords = async () => {
      // The RPC is added by the IDR security migration ahead of generated client types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("claim_idr_client_records");
      if (!active) return;
      if (error) {
        setAccessError("This sign-in could not be linked to the purchase record. Contact Fabsy for help.");
        return;
      }
      setClaimedUserId(session.user.id);
    };
    claimClientRecords();

    return () => {
      active = false;
    };
  }, [session]);

  const sendMagicLink = useCallback(async (email: string, redirectPath: string) => {
    const redirectTo = new URL(redirectPath, window.location.origin).toString();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const isAccessLoading = isLoading || Boolean(session && claimedUserId !== session.user.id && !accessError);

  return { session, isLoading: isAccessLoading, accessError, sendMagicLink, signOut };
}
