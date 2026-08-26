// Bump this whenever buildConsentText changes. Completed invitations retain the
// exact text/version/hash they signed, independent of later deployments.
export const CONSENT_TEXT_VERSION =
  "standalone-representation-consent-v3-consent-only-2026-08-26";

export interface ConsentTextInvite {
  client_legal_name: unknown;
  client_first_name: unknown;
  client_last_name: unknown;
  ticket_number: unknown;
  ticket_numbers: unknown;
  charge_description: unknown;
  offence_date_text: unknown;
  court_location: unknown;
  court_date_text: unknown;
  matter_details: unknown;
  representative_first_name: unknown;
  representative_last_name: unknown;
  representative_firm: unknown;
  representative_phone: unknown;
  representative_mailing_address: unknown;
  representative_city: unknown;
  representative_province: unknown;
  representative_postal_code: unknown;
  government_form_code: unknown;
  government_form_revision: unknown;
  government_form_url: unknown;
}

function cleanLine(value: unknown) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ")
    .trim();
}

function optionalLine(value: unknown) {
  const cleaned = cleanLine(value);
  return cleaned || null;
}

/**
 * Builds the exact authorization shown to and accepted by the client.
 * Commercial terms intentionally live outside this consent contract.
 */
export function buildConsentText(invite: ConsentTextInvite) {
  const legalName = cleanLine(invite.client_legal_name);
  const firstName = cleanLine(invite.client_first_name);
  const lastName = cleanLine(invite.client_last_name);
  const ticketNumbers = Array.isArray(invite.ticket_numbers)
    ? invite.ticket_numbers.map(cleanLine).filter(Boolean)
    : [cleanLine(invite.ticket_number)].filter(Boolean);
  const charge = cleanLine(invite.charge_description);
  const offenceDate = optionalLine(invite.offence_date_text);
  const courtLocation = optionalLine(invite.court_location);
  const courtDate = optionalLine(invite.court_date_text);
  const matterDetails = optionalLine(invite.matter_details);
  const matterSchedule = [
    offenceDate ? `Offence date: ${offenceDate}` : null,
    courtLocation ? `Court location: ${courtLocation}` : null,
    courtDate ? `Court date: ${courtDate}` : null,
  ].filter(Boolean).join(" | ");
  const representativeFirstName = cleanLine(
    invite.representative_first_name,
  );
  const representativeLastName = cleanLine(invite.representative_last_name);
  const representativeName =
    `${representativeFirstName} ${representativeLastName}`.trim();
  const representativeFirm = cleanLine(invite.representative_firm);
  const representativePhone = cleanLine(invite.representative_phone);
  const governmentFormCode = cleanLine(invite.government_form_code);
  const governmentFormRevision = cleanLine(invite.government_form_revision);
  const governmentFormUrl = cleanLine(invite.government_form_url);

  if (
    !legalName || !firstName || !lastName || !ticketNumbers.length ||
    !charge || !representativeName || !representativeFirm ||
    !representativePhone || !governmentFormCode || !governmentFormRevision ||
    !governmentFormUrl
  ) {
    throw new Error("Stored invitation terms are incomplete.");
  }

  return [
    "CLIENT CONSENT FOR TRAFFIC TICKET REPRESENTATION",
    "",
    "CLIENT",
    `First name: ${firstName} | Last name: ${lastName} | Full legal name: ${legalName}`,
    "",
    "MATTER",
    `Violation ticket number(s): ${
      ticketNumbers.join(", ")
    } | Traffic charge: ${charge}`,
    matterSchedule || null,
    matterDetails ? `Matter details: ${matterDetails}` : null,
    "",
    "REPRESENTATIVE",
    `First name: ${representativeFirstName} | Last name: ${representativeLastName}`,
    `Firm: ${representativeFirm} | Phone: ${representativePhone}`,
    `Mailing address: ${
      optionalLine(invite.representative_mailing_address) || "not provided"
    } | City or town: ${
      optionalLine(invite.representative_city) || "not provided"
    } | Province: ${
      cleanLine(invite.representative_province) || "not provided"
    } | Postal code: ${
      optionalLine(invite.representative_postal_code) || "not provided"
    }`,
    "",
    "AUTHORIZATION AND SCOPE",
    `I, ${legalName}, authorize ${representativeName} of ${representativeFirm} ("Fabsy") to act for me on the matter identified above, within the scope permitted by applicable law and court rules.`,
    "For the listed ticket number(s), I authorize Fabsy to access the Traffic Ticket Digital Service; request, receive, and review full disclosure and other records; communicate with the Crown, prosecutors, court staff, enforcement agencies, and other authorized participants; discuss resolutions; prepare and submit permitted documents; attend court or arrange an authorized appearance; and take permitted procedural steps I instruct.",
    "Fabsy will not enter or change a plea, accept a resolution, make an admission, or abandon a defence without my instructions.",
    "",
    "CLIENT ACKNOWLEDGEMENTS",
    "I understand that Fabsy provides traffic-ticket agent services, is not a law firm, and does not promise or guarantee a particular result.",
    "I will provide complete and accurate information, keep Fabsy informed of relevant changes, and respond promptly when my instructions are required.",
    "This consent is matter-specific and may be revoked by written notice, subject to required notices and applicable rules.",
    "Signing does not extend a response, court, appeal, or statutory deadline. I will follow existing notices until Fabsy confirms in writing that it has assumed the matter.",
    "",
    "OFFICIAL ALBERTA FORM",
    `This Fabsy authorization maps the fields used by Alberta form ${governmentFormCode} (revision ${governmentFormRevision}) but does not complete or replace that prescribed form or its signature requirements. I may be asked to sign it separately.`,
    `Official form: ${governmentFormUrl}`,
    "The official form is Protected B when completed. This authorization continues from signing until withdrawn, including through the official withdrawal process when required.",
    "",
    "PERSONAL INFORMATION CONSENT",
    "I consent to Fabsy collecting, using, and disclosing information reasonably required for this service, including exchanging it with courts, prosecutors, enforcement agencies, service providers, and other authorized participants as needed or required by law.",
    "",
    "SIGNATURE",
    "Typing my exact full legal name confirms that I read and agree to this consent and intend it as my electronic signature for Fabsy's authorization.",
    "Using the manual-scan option confirms that the upload contains my hand signature, printed legal name, and signed date and is an accurate copy of the document I signed.",
    `A Fabsy typed signature is not a certificate-backed digital signature on Alberta form ${governmentFormCode} and does not replace that official form.`,
  ].filter((line): line is string => line !== null).join("\n");
}
