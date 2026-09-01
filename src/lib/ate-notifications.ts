import { PHOTO_RADAR } from "@/config/offers";

export interface AteCaseEvent {
  id: string;
  event_type: string;
  audience: "client" | "staff";
  status: string;
  created_at: string;
  payload: { portal_path?: string; complete_disclosure_at?: string; action_due_at?: string; proposed_fine_cents?: number; outcome?: string; final_fine_cents?: number; decision?: string };
}

/** Plain text for staff review/copy only. This function has no sending effect. */
export function ateNotificationDraft(event: AteCaseEvent, submissionId: string) {
  const portal = `https://fabsy.ca/portal/cases/${encodeURIComponent(submissionId)}`;
  const update: Record<string, string> = {
    payment_confirmed: "Your $79 Photo Radar service payment plus $3.95 GST ($82.95 total) is confirmed. Fabsy will check the accepted scope and deadlines, enter the authorized not-guilty plea and request disclosure.",
    disclosure_complete: "Complete, readable disclosure has been received and matched to your file. Fabsy's 48-hour commitment runs from that actual receipt/matching time and covers our next authorized action; Crown response and final-outcome timing are separate.",
    action_recorded: "Fabsy has recorded the next authorized action on your Photo Radar file. Open your secure case page for the file status. No Crown result is promised.",
    crown_offer: "A Crown response is available for your review. Open your secure case page, read the exact current terms and expiry, then approve, decline or ask a question. No proposed deal is accepted automatically.",
    outcome_recorded: "The final outcome has been recorded on your Photo Radar file. Open your secure case page to review it and any remaining payment instructions.",
    client_instruction: "A client instruction is recorded on the current ATE offer. Verify the exact version, instruction and any expiry in the staff case before taking the next authorized action. This event does not itself accept the Crown agreement.",
  };
  return `${event.audience === "staff" ? "Internal Fabsy case update" : "Your Fabsy Photo Radar file"}\n\n${update[event.event_type] || "A file update is ready for review."}\n\n${portal}\n\n${PHOTO_RADAR.insuranceDisclaimer} No trial and no success fee. Keep following the notice's deadlines unless Fabsy confirms otherwise.`;
}
