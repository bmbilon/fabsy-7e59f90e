import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface ReferralProfile {
  legal_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
  payout_email: string;
}

export interface ReferralRecord {
  id: string;
  ticket_type: "officer" | "camera";
  amount: number;
  status: "pending" | "eligible" | "paid" | "void";
  created_at: string;
  eligible_at: string | null;
  paid_at: string | null;
  hold_reason: string | null;
}

export interface ReferralDashboard {
  code: string;
  share_url: string;
  is_past_client: boolean;
  referrals: ReferralRecord[];
  payout_history: ReferralRecord[];
  profile: ReferralProfile | null;
  profile_required: boolean;
  year_to_date_paid: number;
  tax_reporting_review: boolean;
  payout_count?: number;
  next_cursor: string | null;
}

export interface StaffReferralRecord extends ReferralRecord {
  order_id: string;
  code: string;
  payout_reference: string | null;
  refund_review_required: boolean;
  accepted_at: string | null;
  payment_settled_at: string | null;
  payment_checked_at: string | null;
  plate: string | null;
  scope_confirmed: boolean | null;
  fleet_account: boolean | null;
  identity_reviewed_at: string | null;
  profile_required: boolean;
  profile_complete: boolean;
  payout_ready: boolean;
  year_to_date_paid: number;
  tax_reporting_review: boolean;
  payee: ReferralProfile | null;
  payout_email?: string | null;
}

export interface AdminReferralDashboard {
  referrals: StaffReferralRecord[];
  next_cursor: string | null;
  can_record_payout: boolean;
}

export async function requestReferralProgram<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>("referral-program", { body });
  if (error) {
    let message = "The referral service is unavailable. Please try again.";
    if (error instanceof FunctionsHttpError) {
      try {
        const payload: unknown = await error.context.json();
        if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") message = payload.error;
      } catch {
        // An unavailable service may not return JSON. Keep a useful, nontechnical error.
      }
    }
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error || "The referral service returned no information. Please try again.");
  return data;
}

const cadFormatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const dateFormatter = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "America/Edmonton" });

export function referralMoney(amount: number) {
  return cadFormatter.format(Number(amount) || 0);
}

export function referralDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function referralStatusLabel(status: ReferralRecord["status"]) {
  return { pending: "Pending review", eligible: "Eligible", paid: "Paid", void: "Void" }[status];
}

export function referralClientNote(referral: ReferralRecord) {
  if (referral.status === "paid") return "Interac transfer recorded";
  if (referral.status === "void") return "Does not meet program eligibility rules";
  if (/profile|address|legal_name|payout_details/.test(referral.hold_reason || "")) return "Complete your payout details";
  if (/refund|dispute|chargeback/.test(referral.hold_reason || "")) return "Payment review in progress";
  if (referral.hold_reason) return "Eligibility checks in progress";
  if (referral.status === "eligible") return "Approved, awaiting payout checks";
  return "Waiting for settlement and file acceptance";
}
