/** Editable field definitions for the file detail forms (granted columns only). */
import { GENERAL_CATEGORIES, LTB_ISSUES, TICKET_OPTION_CHOSEN, TICKET_TYPES, type PracticeArea } from '../catalog';
import { centsToInput, inputToCents } from '../format';

export type FieldType = 'text' | 'date' | 'money' | 'int' | 'list' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly { value: string; label: string }[];
  /** Select fields whose column is NOT NULL have no empty choice. */
  required?: boolean;
  wide?: boolean;
  mono?: boolean;
  max?: number;
  group: string;
}

const NOT_SET = { value: '', label: 'Not set' };

export const MATTER_FIELDS: Record<PracticeArea, FieldDef[]> = {
  ltb: [
    { key: 'issue', label: 'Issue', type: 'select', options: LTB_ISSUES, required: true, group: 'Tenancy' },
    { key: 'notice_served', label: 'Notice already served', type: 'select', required: true, group: 'Tenancy',
      options: [{ value: 'unsure', label: 'Not sure' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    { key: 'rental_unit_address', label: 'Rental unit address', type: 'text', wide: true, max: 300, group: 'Tenancy' },
    { key: 'unit_city', label: 'Rental unit city', type: 'text', max: 100, group: 'Tenancy' },
    { key: 'tenant_names', label: 'Tenants (comma separated)', type: 'list', group: 'Tenancy' },
    { key: 'rent_amount_cents', label: 'Rent ($)', type: 'money', group: 'Tenancy' },
    { key: 'rent_period', label: 'Rent period', type: 'select', group: 'Tenancy', options: [
      NOT_SET, { value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' },
      { value: 'daily', label: 'Daily' }, { value: 'yearly', label: 'Yearly' }] },
    { key: 'rent_due_day', label: 'Rent due day', type: 'int', group: 'Tenancy' },
    { key: 'lease_start_date', label: 'Lease start', type: 'date', group: 'Tenancy' },
    { key: 'arrears_claimed_cents', label: 'Arrears claimed ($)', type: 'money', group: 'Notice and hearing' },
    { key: 'notice_form', label: 'Notice form', type: 'select', group: 'Notice and hearing', options: [
      NOT_SET, ...['N4', 'N5', 'N7', 'N8', 'N12', 'N13'].map(value => ({ value, label: value })), { value: 'other', label: 'Other' }] },
    { key: 'notice_served_on', label: 'Notice served on', type: 'date', group: 'Notice and hearing' },
    { key: 'notice_service_method', label: 'Service method', type: 'select', group: 'Notice and hearing', options: [
      NOT_SET, { value: 'hand', label: 'By hand' }, { value: 'mailbox', label: 'Mailbox or under the door' },
      { value: 'mail', label: 'Mail' }, { value: 'courier', label: 'Courier' }, { value: 'email', label: 'Email' },
      { value: 'other', label: 'Other' }] },
    { key: 'notice_termination_date', label: 'Termination date', type: 'date', group: 'Notice and hearing' },
    { key: 'hearing_date', label: 'Hearing date', type: 'date', group: 'Notice and hearing' },
  ],
  traffic: [
    { key: 'ticket_type', label: 'Ticket type', type: 'select', options: [NOT_SET, ...TICKET_TYPES], group: 'Ticket' },
    { key: 'ticket_city', label: 'City', type: 'text', max: 100, group: 'Ticket' },
    { key: 'ticket_received_on', label: 'Received on', type: 'date', group: 'Ticket' },
    { key: 'option_chosen', label: 'Option chosen', type: 'select', options: TICKET_OPTION_CHOSEN, required: true, group: 'Ticket' },
    { key: 'offence_number', label: 'Offence number', type: 'text', mono: true, max: 40, group: 'Offence' },
    { key: 'offence_date', label: 'Offence date', type: 'date', group: 'Offence' },
    { key: 'offence_description', label: 'Description', type: 'text', wide: true, max: 300, group: 'Offence' },
    { key: 'statute_section', label: 'Statute and section', type: 'text', max: 80, group: 'Offence' },
    { key: 'set_fine_cents', label: 'Set fine ($)', type: 'money', group: 'Offence' },
    { key: 'total_payable_cents', label: 'Total payable ($)', type: 'money', group: 'Offence' },
    { key: 'court_location', label: 'Court location', type: 'text', wide: true, max: 200, group: 'Court and dates' },
    { key: 'option_deadline', label: 'Response deadline', type: 'date', group: 'Court and dates' },
    { key: 'disclosure_requested_on', label: 'Disclosure requested on', type: 'date', group: 'Court and dates' },
    { key: 'meeting_date', label: 'Meeting date', type: 'date', group: 'Court and dates' },
    { key: 'trial_date', label: 'Trial date', type: 'date', group: 'Court and dates' },
  ],
  general: [
    { key: 'category', label: 'Category', type: 'select', options: [NOT_SET, ...GENERAL_CATEGORIES], group: 'Matter' },
    { key: 'deadline_date', label: 'Deadline', type: 'date', group: 'Matter' },
    { key: 'other_party', label: 'Other party', type: 'text', wide: true, max: 200, group: 'Matter' },
    { key: 'client_city', label: 'Client city', type: 'text', max: 100, group: 'Matter' },
  ],
};

export const DETAILS_TITLE: Record<PracticeArea, string> = {
  ltb: 'Tenancy and notice', traffic: 'Ticket details', general: 'Matter details',
};

export function toFormValue(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (field.type === 'money') return centsToInput(value);
  if (field.type === 'list') return Array.isArray(value) ? value.join(', ') : '';
  return String(value);
}

/** Parsed value, or undefined when the text is not valid for the field. */
export function fromFormValue(field: FieldDef, value: string): unknown {
  const text = value.trim();
  if (field.type === 'list') return text ? text.split(',').map(item => item.trim()).filter(Boolean).slice(0, 10) : [];
  if (!text) return field.required ? undefined : null;
  if (field.type === 'money') return inputToCents(text);
  if (field.type === 'int') {
    const day = Number(text);
    return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
  }
  if (field.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
  return field.max ? text.slice(0, field.max) : text;
}

export function fieldError(field: FieldDef): string {
  if (field.type === 'money') return 'Enter an amount, for example 1250.00.';
  if (field.type === 'int') return 'Enter a day from 1 to 31.';
  if (field.type === 'date') return 'Enter a full date.';
  return 'Choose a value.';
}

export const CLIENT_FIELDS: { key: string; label: string; wide?: boolean; max: number }[] = [
  { key: 'first_name', label: 'First name', max: 100 },
  { key: 'last_name', label: 'Last name', max: 100 },
  { key: 'organization_name', label: 'Organization', max: 200 },
  { key: 'business_number', label: 'Business or incorporation number', max: 40 },
  { key: 'contact_title', label: 'Title of person instructing', max: 100 },
  { key: 'phone', label: 'Phone', max: 40 },
  { key: 'mailing_address', label: 'Mailing address', wide: true, max: 300 },
  { key: 'city', label: 'City', max: 100 },
  { key: 'province', label: 'Province', max: 50 },
  { key: 'postal_code', label: 'Postal code', max: 12 },
  { key: 'occupation', label: 'Occupation or business type', max: 120 },
];
