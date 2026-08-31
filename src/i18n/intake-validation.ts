import type { FormData } from '@/components/TicketForm';
import { validateTicketCaptureFile } from '@/lib/ticket/ticketCapture';

export type IntakeErrors = Partial<Record<keyof FormData, string>>;

export const LOCALIZED_INTAKE_FIELD_LIMITS: Partial<Record<keyof FormData, number>> = {
  ticketNumber: 50, location: 200, fineAmount: 20, offenceDescription: 500,
  offenceSection: 200, offenceSubSection: 200, officer: 200, officerBadge: 200, courtJurisdiction: 200,
  firstName: 50, lastName: 50, email: 100, phone: 20, driversLicense: 50,
  address: 200, city: 100, province: 50, postalCode: 20,
  pleaType: 120, explanation: 550, circumstances: 250, additionalNotes: 900, digitalSignature: 101,
};
const fieldsByStep: Record<number, (keyof FormData)[]> = {
  1: ['ticketNumber', 'location', 'fineAmount', 'offenceDescription', 'offenceSection', 'offenceSubSection', 'officer', 'officerBadge', 'courtJurisdiction'],
  2: ['firstName', 'lastName', 'email', 'phone', 'driversLicense', 'address', 'city', 'province', 'postalCode'],
  3: ['pleaType', 'explanation', 'circumstances', 'additionalNotes'],
  4: ['digitalSignature'],
};

export function buildIntakeAdditionalNotes(data: FormData) {
  return [
    data.additionalNotes,
    data.offenceSection ? `Section: ${data.offenceSection}${data.offenceSubSection ? `(${data.offenceSubSection})` : ''}` : '',
    data.officer ? `Officer: ${data.officer}${data.officerBadge ? ` (${data.officerBadge})` : ''}` : '',
    data.location ? `Offence location: ${data.location}` : '',
  ].filter(Boolean).join('\n');
}

export function buildIntakeDefenseStrategy(data: FormData) {
  return `${data.pleaType}\n\nExplanation: ${data.explanation}\n\nCircumstances: ${data.circumstances}`;
}

export function validateLocalizedIntakeStep(step: number, data: FormData): IntakeErrors {
  const errors: IntakeErrors = {};
  for (const key of fieldsByStep[step] || []) {
    const value = data[key];
    if (typeof value === 'string' && value.length > (LOCALIZED_INTAKE_FIELD_LIMITS[key] ?? Infinity)) errors[key] = 'intake.validation.length';
  }
  const requireText = (fields: (keyof FormData)[]) => {
    for (const key of fields) {
      if (typeof data[key] !== 'string' || !String(data[key]).trim()) errors[key] = 'intake.validation.required';
    }
  };
  const validDate = (value: unknown) => value instanceof Date && Number.isFinite(value.getTime());
  if (step === 1) {
    requireText(['ticketNumber', 'location', 'offenceDescription', 'fineAmount']);
    if (!data.sourceAssessmentId && (!data.ticketImage || !validateTicketCaptureFile(data.ticketImage).valid)) errors.ticketImage = 'intake.validation.ticketImage';
    if (!validDate(data.issueDate) || data.issueDate > new Date()) errors.issueDate = 'intake.validation.date';
    const amount = data.fineAmount.replace(/[$,\s]/g, '');
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) errors.fineAmount = 'intake.validation.amount';
    if (data.courtDate && !validDate(data.courtDate)) errors.courtDate = 'intake.validation.date';
    if (data.vehicleSeized) errors.vehicleSeized = 'rapid.excluded.scope';
  }
  if (step === 2) {
    requireText(['firstName', 'lastName', 'email', 'phone', 'driversLicense', 'address', 'city', 'province', 'postalCode']);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = 'intake.validation.email';
    const phone = data.phone.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) errors.phone = 'intake.validation.phone';
    if (!validDate(data.dateOfBirth) || data.dateOfBirth >= new Date()) errors.dateOfBirth = 'intake.validation.date';
  }
  if (step === 3) {
    requireText(['pleaType', 'explanation']);
    if (buildIntakeAdditionalNotes(data).length > 2000) errors.additionalNotes = 'intake.validation.length';
    if (buildIntakeDefenseStrategy(data).length > 1000) errors.explanation = 'intake.validation.length';
  }
  if (step === 4) {
    if (!data.consentGiven) errors.consentGiven = 'intake.validation.consent';
    const expected = `${data.firstName.trim()} ${data.lastName.trim()}`.replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!data.digitalSignature.trim() || data.digitalSignature.trim().replace(/\s+/g, ' ').toLocaleLowerCase() !== expected) errors.digitalSignature = 'intake.validation.signature';
  }
  return errors;
}
