import { useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { captureReferralFromLocation } from "@/lib/referrals/capture";
import { normalizeReferralCode } from "@/lib/referrals/attribution";

export function ReferralAttribution() {
  const { pathname, search } = useLocation();
  useEffect(() => { void captureReferralFromLocation({ pathname, search }); }, [pathname, search]);
  return null;
}

export function ReferralRedirect() {
  const { code } = useParams();
  const location = useLocation();
  const normalized = normalizeReferralCode(code);
  if (!normalized) return <Navigate to="/refer" replace />;
  const query = new URLSearchParams(location.search);
  query.set("ref", normalized);
  return <Navigate to={"/rapid-resolution?" + query.toString()} replace />;
}
