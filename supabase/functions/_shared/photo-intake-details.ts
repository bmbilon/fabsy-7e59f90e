/** OCR is a suggestion from the attached file, never a customer identity match. */
export function photoIntakeDetails(raw: Record<string, unknown>, selectedTicketType?: "officer_issued" | "photo_radar") {
  const text = (key: string, max: number) => typeof raw[key] === "string" ? String(raw[key]).trim().slice(0, max) : "";
  const date = (key: string) => {
    const value = text(key, 10);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : null;
    return parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  };
  const detectedPhotoRadar = raw.ticket_type === "photo_radar";
  const classified = detectedPhotoRadar || raw.officer_issued_format === true;
  const detectedTicketType = detectedPhotoRadar ? "photo_radar" : "officer_issued";
  const typeConflict = classified && Boolean(selectedTicketType && selectedTicketType !== detectedTicketType);
  const photoRadar = (selectedTicketType ?? detectedTicketType) === "photo_radar";
  const firstName = text("firstName", 100);
  const lastName = text("lastName", 100);
  const ticketNumber = text("ticketNumber", 50);
  const ready = classified && !typeConflict && Boolean(firstName && lastName && ticketNumber) && raw.vehicle_seized !== true;
  return {
    first_name: firstName, last_name: lastName, ticket_number: ticketNumber,
    drivers_license: text("driversLicense", 50), address: text("address", 500), city: text("city", 100), postal_code: text("postalCode", 20),
    date_of_birth: date("dateOfBirth"), violation: text("offenceDescription", 500) || text("violation", 500),
    fine_amount: typeof raw.fineAmount === "number" && Number.isFinite(raw.fineAmount) ? String(raw.fineAmount) : text("fineAmount", 20),
    violation_date: date(photoRadar ? "offenceDate" : "issueDate"), court_date: date("courtDate"), court_location: text("location", 200),
    ticket_type: photoRadar ? "photo_radar" : "officer_issued", ticket_type_source: selectedTicketType ? "manual" : classified ? "upload" : "default",
    order_type: photoRadar ? "photo_radar" : "rapid_resolution", review_path: photoRadar ? "ate" : "standard",
    registered_owner_on_offence_date: null, insurance_company: null,
    ...(photoRadar ? { representation_includes_assessment: false } : {}),
    intake_review_status: ready ? "ready" : "needs_review",
    additional_notes: typeConflict
      ? `Photo-only intake. The customer selected ${selectedTicketType}, but the upload suggested ${detectedTicketType}. Confirm the ticket type and service fee with the customer before checkout.`
      : ready
      ? "Photo-only intake. Ticket details were extracted automatically and have not been confirmed by the customer. Review the attached original before acting."
      : "Photo-only intake. Missing, unclear or out-of-scope ticket details require staff review. Contact the customer for clarification; do not infer missing details.",
  };
}
