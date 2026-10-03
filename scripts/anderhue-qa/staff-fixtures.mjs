// Playwright fixtures for the AnderHue staff workspace (/sign-in and /admin).
//
// Everything is local: Supabase auth, PostgREST tables and RPCs, and storage
// are answered by an in-memory, stateful mock of the contract in
// ontario/anderhue-paralegal-site/ARCHITECTURE.md (sections 3 and 5.3). No real
// accounts, emails, membership changes or production reads happen.
//
// Exports:
//   buildStaffFixtureData({ now })      realistic data across all three areas
//   createMockState(options)            mutable copy used by one browser context
//   installSupabaseMocks(context, opts) routes auth, rest, rpc and storage
//   openStaffContext(browser, origin, options)
//   assertPracticeScoping(requests)     throws when a request breaks the rules
//   runStaffQaFlow({ origin, browser, screenshotDir, fontsDir, log })
//   launchQaBrowser(), startStaffServer(outDir)
//
// Run directly against a build:
//   ANDERHUE_OUT_DIR=/tmp/ah-build node scripts/build-anderhue.mjs
//   node scripts/anderhue-qa/staff-fixtures.mjs /tmp/ah-build [screenshotDir] [fontsDir]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROJECT_REF = 'gcasbisxfrssonllpqrw';
export const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
export const PRACTICE_ID = 'anderhue-paralegal';
export const STAFF_USER = {
  id: '10000000-0000-4000-8000-000000000001', email: 'don@anderhue.example', aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};

/** Practice tables: every request must carry practice_id=eq.anderhue-paralegal. */
export const PRACTICE_TABLES = [
  'ltb_clients', 'ltb_cases', 'ltb_case_documents', 'ltb_case_events',
  'practice_matters', 'practice_matter_documents', 'practice_matter_events', 'practice_notices',
];
/** ltb_practices is keyed by id, so it is scoped with id=eq.anderhue-paralegal. */
export const ALLOWED_TABLES = ['ltb_practices', ...PRACTICE_TABLES];
export const STAFF_RPCS = [
  'ltb_my_practices', 'practice_set_stage', 'practice_request_documents', 'practice_clear_request',
  'practice_staff_add_document', 'practice_staff_confirm_document', 'practice_set_document_shared',
  'practice_cancel_notice', 'practice_create_matter', 'practice_revoke_portal_access', 'practice_set_client_email',
  'ltb_set_client_registration',
];
export const NOTICE_COLUMNS = ['id', 'area', 'case_id', 'audience', 'kind', 'detail', 'status', 'next_attempt_at', 'sent_at', 'failure_code', 'created_at'];
export const UPDATE_GRANTS = {
  ltb_clients: ['client_type', 'first_name', 'last_name', 'organization_name', 'business_number', 'contact_title', 'phone',
    'mailing_address', 'city', 'province', 'postal_code', 'occupation', 'field_sources'],
  ltb_cases: ['issue', 'notice_served', 'rental_unit_address', 'unit_city', 'tenant_names', 'rent_amount_cents', 'rent_period',
    'rent_due_day', 'lease_start_date', 'arrears_claimed_cents', 'notice_form', 'notice_served_on', 'notice_service_method',
    'notice_termination_date', 'hearing_date', 'review_notes', 'field_sources', 'intake_review_status'],
  practice_matters: ['ticket_type', 'ticket_city', 'ticket_received_on', 'option_chosen', 'offence_number', 'offence_date',
    'offence_description', 'statute_section', 'set_fine_cents', 'total_payable_cents', 'court_location', 'option_deadline',
    'disclosure_requested_on', 'meeting_date', 'trial_date', 'category', 'deadline_date', 'other_party', 'client_city',
    'review_notes', 'field_sources', 'intake_review_status'],
};
/** Fabsy traffic tables the AnderHue workspace must never touch. */
export const FABSY_TABLES = ['ticket_submissions', 'clients', 'case_statuses', 'ticket_upload_alerts', 'user_roles', 'idr_reports'];
/** Copy for a file held out of the client portal (portal_visible false). */
export const PORTAL_HOLD_LABEL = 'Not shown to the client yet';
export const PORTAL_HOLD_HELP = 'This file came in under an email that already has a file. The client sees it once you move it out of New intake.';

// Catalog values the mock needs (mirror of supabase/functions/_shared/practice-catalog.ts).
const STAGES = {
  ltb: ['new_intake', 'under_review', 'quoted', 'retained', 'notice_served', 'filed', 'hearing_scheduled', 'order_issued', 'closed', 'declined'],
  traffic: ['new_intake', 'under_review', 'quoted', 'retained', 'option_filed', 'disclosure_requested', 'resolution_meeting', 'offer_received', 'trial_scheduled', 'closed', 'declined'],
  general: ['new_intake', 'under_review', 'quoted', 'retained', 'in_progress', 'closed', 'declined'],
};
const OUTCOMES = {
  ltb: ['order_obtained', 'settled', 'tenant_paid', 'withdrawn', 'dismissed', 'other'],
  traffic: ['withdrawn', 'amended', 'not_guilty', 'convicted', 'client_paid', 'other'],
  general: ['resolved', 'settled', 'judgment', 'withdrawn', 'referred_out', 'other'],
};
const QUIET_STAGES = new Set(['new_intake']);
const CONTENT_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
const BUCKET = { ltb: 'ltb-documents', traffic: 'practice-documents', general: 'practice-documents' };

// ---------------------------------------------------------------------------
// Time helpers (Ontario deadlines run on Toronto time)
// ---------------------------------------------------------------------------

export function torontoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function addDays(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Realistic practice data relative to `now`: 20 files across Landlord, Traffic
 * and Other in varied stages, with documents, events and client updates,
 * including an open request, a client upload, due-soon and overdue dates, a
 * file ready for its L1, a failed client update, a scheduled one, one waiting
 * to retry, a file held out of the client portal (portal_visible false) and
 * client documents whose names disguise their type.
 */
export function buildStaffFixtureData({ now = new Date() } = {}) {
  const today = torontoDate(now);
  const day = n => addDays(today, n);
  const ago = ({ days = 0, hours = 0, minutes = 0, seconds = 0 } = {}) =>
    new Date(now.getTime() - (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000).toISOString();
  const ahead = seconds => new Date(now.getTime() + seconds * 1000).toISOString();
  // 16:00 UTC is midday in Toronto all year, so calendar-day counts stay stable.
  const midday = n => `${day(n)}T16:00:00.000Z`;

  const practice = {
    id: PRACTICE_ID, name: 'AnderHue Paralegal Professional Corporation', display_name: 'AnderHue Paralegal',
    site_url: 'https://anderhue.ca', client_updates_enabled: true,
  };

  const client = (n, fields) => ({
    id: id('c1000000', n), practice_id: PRACTICE_ID, client_type: 'individual', first_name: null, last_name: null,
    organization_name: null, business_number: null, contact_title: null, email: '', phone: null, mailing_address: null,
    city: null, province: 'ON', postal_code: null, occupation: null, registration_status: 'provisional', registered_at: null,
    identity_verified_at: null, identity_document_type: null, portal_revoked_before: null,
    field_sources: { first_name: { source: 'form' }, last_name: { source: 'form' }, phone: { source: 'form' }, email: { source: 'form' } },
    created_at: ago({ days: 30 }), updated_at: ago({ days: 30 }), ...fields,
  });
  const clients = [
    client(1, { first_name: 'Priya', last_name: 'Raman', email: 'priya.raman@example.com', phone: '(905) 555-0142', city: 'Hamilton',
      mailing_address: '112 Aberdeen Ave, Hamilton ON', postal_code: 'L8P 2R3', occupation: 'Pharmacist', created_at: ago({ days: 2 }) }),
    client(2, { client_type: 'organization', organization_name: 'Lakeshore Rentals Inc.', first_name: 'Mark', last_name: 'Ellis',
      contact_title: 'Property manager', business_number: '81234 5678', email: 'rentals@lakeshore-rentals.example.ca', phone: '(289) 555-0178',
      mailing_address: '2020 Lakeshore Rd, Burlington ON', city: 'Burlington', registration_status: 'registered', registered_at: ago({ days: 200 }) }),
    client(3, { first_name: 'Marcus', last_name: 'Bell', email: 'marcus.bell@example.com', phone: '(905) 555-0119', city: 'Burlington',
      mailing_address: '58 Elgin St, Burlington ON', postal_code: 'L7R 1E2', occupation: 'Electrician', registration_status: 'verified',
      registered_at: ago({ days: 70 }), identity_verified_at: ago({ days: 69 }), identity_document_type: 'Ontario driver’s licence',
      field_sources: { mailing_address: { source: 'document', kind: 'government_id', confidence: 'high' }, first_name: { source: 'form' } } }),
    client(4, { first_name: 'Olena', last_name: 'Kovalenko', email: 'olena.k@example.com', phone: '(416) 555-0163', city: 'Oakville',
      mailing_address: '301 Navy St, Oakville ON', registration_status: 'registered', registered_at: ago({ days: 40 }) }),
    client(5, { first_name: 'Daniel', last_name: 'Okafor', email: 'd.okafor@example.com', phone: '(647) 555-0108', city: 'Mississauga' }),
    client(6, { client_type: 'organization', organization_name: 'Hughes Property Group Ltd.', email: 'accounts@hughespg.example.ca',
      phone: '(905) 555-0100', mailing_address: '1 King St W, Hamilton ON', registration_status: 'registered', registered_at: ago({ days: 120 }) }),
    client(7, { first_name: 'Jordan', last_name: 'Mitchell', email: 'jordan.mitchell@example.com', phone: '(416) 555-0137', city: 'Toronto' }),
    client(8, { first_name: 'Aisha', last_name: 'Rahman', email: 'aisha.rahman@example.com', phone: '(905) 555-0181', city: 'Brampton',
      mailing_address: '44 Queen St E, Brampton ON', registration_status: 'registered', registered_at: ago({ days: 20 }) }),
    client(9, { first_name: 'Kevin', last_name: 'Tran', email: 'kevin.tran@example.com', phone: '(647) 555-0122', city: 'Vaughan',
      mailing_address: '7 Rutherford Rd, Vaughan ON', registration_status: 'verified', registered_at: ago({ days: 33 }),
      identity_verified_at: ago({ days: 33 }), identity_document_type: 'Canadian passport' }),
    client(10, { first_name: 'Sofia', last_name: 'Moretti', email: 'sofia.moretti@example.com', phone: '(416) 555-0190', city: 'Toronto',
      mailing_address: '88 Ossington Ave, Toronto ON', registration_status: 'registered', registered_at: ago({ days: 90 }) }),
    client(11, { first_name: 'Liam', last_name: 'O’Connor', email: 'liam.oconnor@example.com', phone: '(905) 555-0155', city: 'Markham',
      mailing_address: '5 Main St, Markham ON', registration_status: 'registered', registered_at: ago({ days: 80 }) }),
    client(12, { first_name: 'Harpreet', last_name: 'Singh', email: 'harpreet.singh@example.com', phone: '(289) 555-0147', city: 'Milton' }),
    client(13, { first_name: 'Grace', last_name: 'Thompson', email: 'grace.t@example.com', phone: '(905) 555-0173', city: 'Hamilton' }),
    client(14, { client_type: 'organization', organization_name: 'Northline Contracting Ltd.', email: 'office@northline.example.ca',
      phone: '(905) 555-0111', mailing_address: '400 Burlington St E, Hamilton ON', registration_status: 'registered', registered_at: ago({ days: 50 }) }),
    client(15, { first_name: 'Ethan', last_name: 'Clarke', email: 'ethan.clarke@example.com', phone: '(289) 555-0126', city: 'Burlington' }),
    client(16, { first_name: 'Maria', last_name: 'Gonzalez', email: 'maria.gonzalez@example.com', phone: '(416) 555-0184' }),
    client(17, { first_name: 'Robert', last_name: 'Chen', email: 'robert.chen@example.com', phone: '(905) 555-0102', city: 'Stoney Creek' }),
    client(18, { first_name: 'Amelia', last_name: 'Brooks', email: 'amelia.brooks@example.com', phone: '(905) 555-0196', city: 'Dundas' }),
  ];
  const C = n => clients[n - 1].id;

  const ltbCase = (n, fields) => ({
    id: id('a1000000', n), practice_id: PRACTICE_ID, client_id: null, case_number: `LTB-2026-${String(n).padStart(4, '0')}`,
    stage: 'new_intake', stage_changed_at: ago({ days: 1 }), issue: 'arrears', notice_served: 'unsure', rental_unit_address: null,
    unit_city: null, tenant_names: [], rent_amount_cents: null, rent_period: null, rent_due_day: null, lease_start_date: null,
    arrears_claimed_cents: null, arrears_reported_text: null, notice_form: null, notice_served_on: null, notice_service_method: null,
    notice_termination_date: null, hearing_date: null, intake_review_status: 'ready', intake_scan_started_at: null, review_notes: null,
    client_notes: null, field_sources: {}, returning_client: false, intake_token_hash: 'f'.repeat(64), intake_finalized_at: ago({ days: 1 }),
    source: 'ltb-landing', user_agent: null, outcome: null, closed_at: null, client_request_message: null, client_request_at: null,
    client_uploaded_at: null, portal_visible: true, created_at: ago({ days: 1 }), updated_at: ago({ days: 1 }), ...fields,
  });
  const ltbCases = [
    ltbCase(12, { client_id: C(1), stage: 'new_intake', intake_review_status: 'needs_review', unit_city: 'Hamilton', notice_served: 'yes',
      rental_unit_address: '48 Locke St S, Unit 2, Hamilton ON', tenant_names: ['Kyle Barrett'], rent_amount_cents: 185000, rent_period: 'monthly',
      rent_due_day: 1, lease_start_date: '2024-09-01', arrears_claimed_cents: 555000, arrears_reported_text: 'About $5,500',
      notice_form: 'N4', notice_served_on: day(-12), notice_service_method: 'mailbox', notice_termination_date: day(2),
      client_notes: 'My tenant has not paid rent since July. I served an N4 about two weeks ago and want to know when I can file with the Board.',
      review_notes: 'Ledger shows three missed payments. Confirm how the N4 was served before quoting.',
      field_sources: {
        unit_city: { source: 'form' }, rental_unit_address: { source: 'document', kind: 'lease', confidence: 'high' },
        rent_amount_cents: { source: 'document', kind: 'lease', confidence: 'high' },
        arrears_claimed_cents: { source: 'document', kind: 'rent_ledger', confidence: 'high' },
        notice_form: { source: 'document', kind: 'notice', confidence: 'high' },
        notice_termination_date: { source: 'document', kind: 'notice', confidence: 'low' },
      },
      created_at: ago({ days: 2, hours: 3 }), stage_changed_at: ago({ days: 2, hours: 3 }), updated_at: ago({ days: 2, hours: 3 }) }),
    ltbCase(11, { client_id: C(2), stage: 'new_intake', intake_review_status: 'scanning', issue: 'n12_own_use', unit_city: 'Burlington',
      intake_finalized_at: ago({ minutes: 3 }), intake_scan_started_at: ago({ minutes: 2 }), returning_client: true,
      client_notes: 'Our owner needs the unit for his daughter. We have not served anything yet.',
      created_at: ago({ minutes: 4 }), stage_changed_at: ago({ minutes: 4 }), updated_at: ago({ minutes: 2 }) }),
    ltbCase(10, { client_id: C(3), stage: 'notice_served', unit_city: 'Burlington', notice_served: 'yes', notice_form: 'N4',
      rental_unit_address: '1290 Brant St, Unit 5, Burlington ON', tenant_names: ['Dana Price', 'Leo Price'], rent_amount_cents: 210000,
      rent_period: 'monthly', rent_due_day: 1, arrears_claimed_cents: 420000, notice_served_on: day(-20), notice_service_method: 'hand',
      notice_termination_date: day(-3), created_at: ago({ days: 34 }), stage_changed_at: ago({ days: 18 }), updated_at: ago({ days: 18 }) }),
    ltbCase(9, { client_id: C(4), stage: 'hearing_scheduled', issue: 'n5_damage', unit_city: 'Oakville', notice_form: 'N5',
      hearing_date: day(4), created_at: ago({ days: 61 }), stage_changed_at: ago({ days: 1, hours: 2 }), updated_at: ago({ days: 1, hours: 2 }) }),
    ltbCase(8, { client_id: C(5), stage: 'quoted', issue: 'persistent_late', unit_city: 'Mississauga',
      client_request_message: 'Please upload your signed lease.\nPlease upload the rent ledger.', client_request_at: midday(-6),
      created_at: ago({ days: 9 }), stage_changed_at: ago({ days: 7 }), updated_at: midday(-6) }),
    ltbCase(6, { client_id: C(6), stage: 'closed', outcome: 'order_obtained', unit_city: 'Hamilton', closed_at: ago({ days: 12 }),
      created_at: ago({ days: 140 }), stage_changed_at: ago({ days: 12 }), updated_at: ago({ days: 12 }) }),
    ltbCase(4, { client_id: C(17), stage: 'declined', outcome: 'declined', issue: 'other', unit_city: 'Stoney Creek', closed_at: ago({ days: 25 }),
      created_at: ago({ days: 27 }), stage_changed_at: ago({ days: 25 }), updated_at: ago({ days: 25 }) }),
  ];
  const L = n => ltbCases.find(row => row.case_number.endsWith(String(n).padStart(4, '0'))).id;

  const matter = (area, n, fields) => ({
    id: id(area === 'traffic' ? 'b2000000' : 'b3000000', n), practice_id: PRACTICE_ID, client_id: null, area,
    matter_number: `${area === 'traffic' ? 'TKT' : 'MAT'}-2026-${String(n).padStart(4, '0')}`,
    stage: 'new_intake', stage_changed_at: ago({ days: 1 }), outcome: null, closed_at: null, intake_review_status: 'ready',
    intake_scan_started_at: null, client_notes: null, review_notes: null, field_sources: {}, returning_client: false,
    intake_token_hash: 'e'.repeat(64), intake_finalized_at: ago({ days: 1 }), source: 'anderhue-site', user_agent: null,
    ticket_type: null, ticket_city: null, ticket_received_on: null, option_chosen: area === 'traffic' ? 'unsure' : 'unsure',
    offence_number: null, offence_date: null, offence_description: null, statute_section: null, set_fine_cents: null,
    total_payable_cents: null, court_location: null, option_deadline: null, disclosure_requested_on: null, meeting_date: null,
    trial_date: null, category: null, deadline_date: null, other_party: null, client_city: null, client_request_message: null,
    client_request_at: null, client_uploaded_at: null, portal_visible: true, created_at: ago({ days: 1 }), updated_at: ago({ days: 1 }),
    ...fields,
  });
  const matters = [
    matter('traffic', 24, { client_id: C(7), stage: 'new_intake', intake_review_status: 'needs_review', ticket_type: 'speeding',
      ticket_city: 'Toronto', ticket_received_on: day(-13), option_chosen: 'none', offence_number: '4071 893 21', offence_date: day(-13),
      offence_description: 'Speeding 82 km/h in a posted 60 km/h zone', statute_section: 'HTA 128', set_fine_cents: 9500,
      total_payable_cents: 12500, court_location: 'Toronto Provincial Offences Court, 1530 Markham Rd', option_deadline: day(2),
      client_notes: 'Stopped on Lake Shore Blvd. I drive for work and cannot afford the demerit points.',
      review_notes: 'Statute section read with low confidence. Check the back of the ticket.',
      field_sources: {
        ticket_city: { source: 'form' }, ticket_received_on: { source: 'form' }, option_deadline: { source: 'form' },
        offence_number: { source: 'document', kind: 'ticket', confidence: 'high' }, offence_date: { source: 'document', kind: 'ticket', confidence: 'high' },
        offence_description: { source: 'document', kind: 'ticket', confidence: 'high' },
        statute_section: { source: 'document', kind: 'ticket', confidence: 'low' },
        set_fine_cents: { source: 'document', kind: 'ticket', confidence: 'high' }, total_payable_cents: { source: 'document', kind: 'ticket', confidence: 'high' },
        court_location: { source: 'document', kind: 'ticket', confidence: 'high' },
      },
      created_at: ago({ days: 1, hours: 4 }), stage_changed_at: ago({ days: 1, hours: 4 }), updated_at: ago({ days: 1, hours: 4 }) }),
    matter('traffic', 23, { client_id: C(8), stage: 'retained', ticket_type: 'distracted', ticket_city: 'Brampton', option_chosen: 'trial',
      offence_number: '5512 004 87', offence_date: day(-48), offence_description: 'Drive while holding a handheld device',
      client_request_message: 'Please upload any court notice you received.', client_request_at: ago({ days: 2, hours: 2 }),
      client_uploaded_at: ago({ hours: 3 }), created_at: ago({ days: 15 }), stage_changed_at: ago({ days: 4 }), updated_at: ago({ hours: 3 }) }),
    matter('traffic', 21, { client_id: C(9), stage: 'disclosure_requested', ticket_type: 'careless', ticket_city: 'Vaughan', option_chosen: 'trial',
      offence_date: day(-70), disclosure_requested_on: day(-20), meeting_date: day(12), created_at: ago({ days: 45 }),
      stage_changed_at: ago({ seconds: 20 }), updated_at: ago({ seconds: 20 }) }),
    matter('traffic', 19, { client_id: C(10), stage: 'trial_scheduled', ticket_type: 'red_light_stop', ticket_city: 'Toronto', option_chosen: 'trial',
      trial_date: day(6), court_location: 'Toronto Old City Hall, 60 Queen St W', created_at: ago({ days: 120 }),
      stage_changed_at: ago({ days: 30 }), updated_at: ago({ days: 30 }) }),
    matter('traffic', 25, { client_id: C(12), stage: 'new_intake', intake_review_status: 'scanning', ticket_type: 'commercial', ticket_city: 'Milton',
      ticket_received_on: day(-1), option_deadline: day(14), field_sources: { option_deadline: { source: 'form' } },
      intake_scan_started_at: ago({ seconds: 40 }), created_at: ago({ minutes: 1 }), stage_changed_at: ago({ minutes: 1 }), updated_at: ago({ seconds: 40 }) }),
    matter('traffic', 15, { client_id: C(11), stage: 'closed', outcome: 'withdrawn', ticket_type: 'camera', ticket_city: 'Markham',
      closed_at: ago({ days: 30 }), created_at: ago({ days: 95 }), stage_changed_at: ago({ days: 30 }), updated_at: ago({ days: 30 }) }),
    matter('traffic', 18, { client_id: C(3), stage: 'closed', outcome: 'amended', ticket_type: 'speeding', ticket_city: 'Burlington',
      returning_client: true, closed_at: ago({ days: 60 }), created_at: ago({ days: 150 }), stage_changed_at: ago({ days: 60 }), updated_at: ago({ days: 60 }) }),
    matter('general', 7, { client_id: C(13), stage: 'under_review', category: 'small_claims', other_party: 'Brightway Renovations Inc.',
      deadline_date: day(5), client_city: 'Hamilton',
      client_notes: 'A contractor took a $6,000 deposit and never started the kitchen. I want to sue in Small Claims Court.',
      created_at: ago({ days: 3 }), stage_changed_at: ago({ days: 2 }), updated_at: ago({ days: 2 }) }),
    matter('general', 6, { client_id: C(14), stage: 'in_progress', category: 'tribunal', other_party: 'City of Hamilton', deadline_date: day(-1),
      client_city: 'Hamilton', created_at: ago({ days: 40 }), stage_changed_at: ago({ days: 21 }), updated_at: ago({ days: 21 }) }),
    matter('general', 5, { client_id: C(15), stage: 'quoted', category: 'notary', client_city: 'Burlington',
      created_at: ago({ days: 10 }), stage_changed_at: ago({ days: 8 }), updated_at: ago({ days: 8 }) }),
    matter('general', 8, { client_id: C(18), stage: 'new_intake', intake_review_status: 'needs_review', category: 'other', client_city: 'Dundas',
      client_notes: 'I need help with a dispute over a parking ticket on private property.',
      review_notes: 'No documents uploaded. Ask the client for any notice or claim.',
      created_at: ago({ hours: 5 }), stage_changed_at: ago({ hours: 5 }), updated_at: ago({ hours: 5 }) }),
    matter('general', 3, { client_id: C(16), stage: 'declined', outcome: 'declined', category: 'offence',
      closed_at: ago({ days: 16 }), created_at: ago({ days: 18 }), stage_changed_at: ago({ days: 16 }), updated_at: ago({ days: 16 }) }),
    // A public intake under an email that already has a file: held out of the client portal (portal_visible false).
    matter('general', 9, { client_id: C(15), stage: 'new_intake', intake_review_status: 'needs_review', category: 'small_claims',
      other_party: 'Kingsway Auto Repair', client_city: 'Burlington', returning_client: true, portal_visible: false,
      client_notes: 'The garage charged me for repairs I never approved and will not return my car until I pay.',
      created_at: ago({ minutes: 40 }), stage_changed_at: ago({ minutes: 40 }), updated_at: ago({ minutes: 40 }) }),
  ];
  const M = number => matters.find(row => row.matter_number === number).id;

  let docN = 0;
  const document = (owner, caseId, fields) => {
    docN += 1;
    const docId = id('d4000000', docN);
    const ext = CONTENT_TYPES[fields.content_type || 'application/pdf'];
    return {
      id: docId, practice_id: PRACTICE_ID, [owner === 'ltb' ? 'case_id' : 'matter_id']: caseId,
      storage_path: `${caseId}/${docId}.${ext}`, original_name: null, content_type: 'application/pdf', size_bytes: 240_000,
      uploaded_at: ago({ days: 1 }), kind: null, extraction_status: 'skipped', extracted: null, extracted_at: null,
      uploaded_by: 'client', shared_with_client: false, created_at: ago({ days: 1 }), ...fields,
    };
  };
  const ltbDocuments = [
    document('ltb', L(12), { original_name: 'Signed lease 2024.pdf', kind: 'lease', size_bytes: 412_000, extraction_status: 'extracted',
      uploaded_at: ago({ days: 2, hours: 3 }), created_at: ago({ days: 2, hours: 3 }),
      extracted: { fields: { rentalUnitAddress: '48 Locke St S, Unit 2, Hamilton ON', rentAmountCents: 185000, tenantNames: ['Kyle Barrett'] }, lowConfidence: [] } }),
    document('ltb', L(12), { original_name: 'Rent ledger.png', content_type: 'image/png', kind: 'rent_ledger', size_bytes: 188_000,
      extraction_status: 'extracted', uploaded_at: ago({ days: 2, hours: 3 }), created_at: ago({ days: 2, hours: 3 }),
      extracted: { fields: { arrearsCents: 555000, lastPaymentDate: day(-92) }, lowConfidence: [], notes: 'Three months unpaid (July to September).' } }),
    document('ltb', L(12), { original_name: 'N4 notice photo.jpg', content_type: 'image/jpeg', kind: 'notice', size_bytes: 1_240_000,
      extraction_status: 'extracted', uploaded_at: ago({ days: 2, hours: 3 }), created_at: ago({ days: 2, hours: 3 }),
      extracted: { fields: { noticeForm: 'N4', terminationDate: day(2) }, lowConfidence: ['terminationDate'] } }),
    document('ltb', L(11), { original_name: 'Lease.pdf', kind: 'lease', extraction_status: 'pending', uploaded_at: ago({ minutes: 3 }), created_at: ago({ minutes: 4 }) }),
    document('ltb', L(11), { original_name: 'Owner declaration.pdf', kind: null, extraction_status: 'pending', uploaded_at: ago({ minutes: 3 }), created_at: ago({ minutes: 4 }) }),
    document('ltb', L(10), { original_name: 'Lease and schedule A.pdf', kind: 'lease', created_at: ago({ days: 34 }), uploaded_at: ago({ days: 34 }) }),
    document('ltb', L(10), { original_name: 'Rent ledger March to September.pdf', kind: 'rent_ledger', created_at: ago({ days: 34 }), uploaded_at: ago({ days: 34 }) }),
    document('ltb', L(10), { original_name: 'N4 as served with certificate.pdf', kind: 'notice', uploaded_by: 'staff', shared_with_client: true,
      created_at: ago({ days: 18 }), uploaded_at: ago({ days: 18 }), extraction_status: 'skipped' }),
    document('ltb', L(10), { original_name: 'Draft L1 application.pdf', kind: 'ltb_document', uploaded_by: 'staff', shared_with_client: false,
      created_at: ago({ days: 1 }), uploaded_at: ago({ days: 1 }), extraction_status: 'skipped' }),
    document('ltb', L(9), { original_name: 'Notice of hearing.pdf', kind: 'ltb_document', uploaded_by: 'staff', shared_with_client: true,
      created_at: ago({ days: 1, hours: 2 }), uploaded_at: ago({ days: 1, hours: 2 }) }),
  ];
  const matterDocuments = [
    document('matter', M('TKT-2026-0024'), { original_name: 'Ticket front.jpg', content_type: 'image/jpeg', kind: 'ticket', size_bytes: 2_310_000,
      extraction_status: 'extracted', uploaded_at: ago({ days: 1, hours: 4 }), created_at: ago({ days: 1, hours: 4 }),
      extracted: { fields: { offenceNumber: '4071 893 21', offenceDate: day(-13), statuteSection: 'HTA 128', setFineCents: 9500 }, lowConfidence: ['statuteSection'] } }),
    document('matter', M('TKT-2026-0024'), { original_name: 'Ticket back.jpg', content_type: 'image/jpeg', kind: 'ticket', size_bytes: 1_870_000,
      extraction_status: 'extracted', uploaded_at: ago({ days: 1, hours: 4 }), created_at: ago({ days: 1, hours: 4 }) }),
    // Uploader-supplied names that disguise the type: a double extension, and a
    // right-to-left override that displays "fdp.exe" reversed as "exe.pdf".
    // Both were stored as PDFs, so they must show and download as .pdf.
    document('matter', M('TKT-2026-0024'), { original_name: 'Ticket scan.pdf.exe', kind: 'ticket', size_bytes: 310_000,
      uploaded_at: ago({ days: 1, hours: 4 }), created_at: ago({ days: 1, hours: 4 }) }),
    document('matter', M('TKT-2026-0024'), { original_name: 'Court notice\u202Efdp.exe', kind: 'court_document', size_bytes: 120_000,
      uploaded_at: ago({ days: 1, hours: 4 }), created_at: ago({ days: 1, hours: 4 }) }),
    document('matter', M('TKT-2026-0023'), { original_name: 'Ticket.jpg', content_type: 'image/jpeg', kind: 'ticket', size_bytes: 1_400_000,
      uploaded_at: ago({ days: 15 }), created_at: ago({ days: 15 }) }),
    document('matter', M('TKT-2026-0023'), { original_name: 'Notice of trial.pdf', kind: 'court_document', size_bytes: 96_000,
      uploaded_at: ago({ hours: 3 }), created_at: ago({ hours: 3 }) }),
    document('matter', M('TKT-2026-0023'), { original_name: 'Retainer agreement (signed).pdf', kind: 'correspondence', uploaded_by: 'staff',
      shared_with_client: true, uploaded_at: ago({ days: 4 }), created_at: ago({ days: 4 }) }),
    document('matter', M('TKT-2026-0019'), { original_name: 'Disclosure package.pdf', kind: 'disclosure', uploaded_by: 'staff', size_bytes: 3_900_000,
      shared_with_client: false, uploaded_at: ago({ days: 9 }), created_at: ago({ days: 9 }) }),
    document('matter', M('TKT-2026-0019'), { original_name: 'Ticket.jpg', content_type: 'image/jpeg', kind: 'ticket', uploaded_at: ago({ days: 120 }), created_at: ago({ days: 120 }) }),
    document('matter', M('TKT-2026-0025'), { original_name: 'IMG_4471.heic', content_type: 'image/heic', kind: 'ticket', extraction_status: 'pending',
      uploaded_at: ago({ seconds: 50 }), created_at: ago({ minutes: 1 }) }),
    document('matter', M('MAT-2026-0007'), { original_name: 'Contract and deposit receipt.pdf', kind: 'evidence', uploaded_at: ago({ days: 3 }), created_at: ago({ days: 3 }) }),
    document('matter', M('MAT-2026-0007'), { original_name: 'Text messages.png', content_type: 'image/png', kind: 'correspondence', uploaded_at: ago({ days: 3 }), created_at: ago({ days: 3 }) }),
    document('matter', M('MAT-2026-0006'), { original_name: 'Notice of hearing (tribunal).pdf', kind: 'court_document', uploaded_at: ago({ days: 40 }), created_at: ago({ days: 40 }) }),
    document('matter', M('MAT-2026-0006'), { original_name: 'Reply submissions draft.pdf', kind: 'correspondence', uploaded_by: 'staff',
      shared_with_client: true, uploaded_at: ago({ days: 22 }), created_at: ago({ days: 22 }) }),
  ];

  let eventN = 0;
  const event = (caseId, event, at, detail = {}, staff = false) => ({ id: ++eventN, practice_id: PRACTICE_ID, case_id: caseId,
    actor_id: staff ? STAFF_USER.id : null, event, detail, at });
  const ltbEvents = [
    event(L(12), 'intake_received', ago({ days: 2, hours: 3, minutes: 1 }), { documents: 3, returningClient: false, source: 'ltb-landing' }),
    event(L(12), 'documents_uploaded', ago({ days: 2, hours: 3 }), { count: 3 }),
    event(L(11), 'intake_received', ago({ minutes: 4 }), { documents: 2, returningClient: true, source: 'ltb-landing' }),
    event(L(11), 'documents_uploaded', ago({ minutes: 3 }), { count: 2 }),
    event(L(10), 'intake_received', ago({ days: 34 }), { documents: 2, source: 'ltb-landing' }),
    event(L(10), 'stage_changed', ago({ days: 33 }), { stage: 'under_review' }, true),
    event(L(10), 'stage_changed', ago({ days: 31 }), { stage: 'quoted' }, true),
    event(L(10), 'stage_changed', ago({ days: 28 }), { stage: 'retained', note: 'Retainer signed by email.' }, true),
    event(L(10), 'client_registration_changed', ago({ days: 69 }), { status: 'verified' }, true),
    event(L(10), 'staff_uploaded', ago({ days: 18 }), { name: 'N4 as served with certificate.pdf' }, true),
    event(L(10), 'document_shared', ago({ days: 18 }), { documentName: 'N4 as served with certificate.pdf' }, true),
    event(L(10), 'stage_changed', ago({ days: 18 }), { stage: 'notice_served' }, true),
    event(L(10), 'staff_uploaded', ago({ days: 1 }), { name: 'Draft L1 application.pdf' }, true),
    event(L(9), 'intake_received', ago({ days: 61 }), { documents: 4, source: 'ltb-landing' }),
    event(L(9), 'stage_changed', ago({ days: 1, hours: 2 }), { stage: 'hearing_scheduled', note: 'Hearing by video. Evidence due 7 days before.' }, true),
    event(L(8), 'intake_received', ago({ days: 9 }), { documents: 0, source: 'ltb-landing' }),
    event(L(8), 'stage_changed', ago({ days: 7 }), { stage: 'quoted' }, true),
    event(L(8), 'documents_requested', midday(-6), { message: 'Please upload your signed lease.\nPlease upload the rent ledger.' }, true),
    event(L(6), 'stage_changed', ago({ days: 12 }), { stage: 'closed', outcome: 'order_obtained', note: 'Eviction order issued; enforcement filed.' }, true),
    event(L(4), 'stage_changed', ago({ days: 25 }), { stage: 'declined', outcome: 'declined', note: 'Commercial tenancy; referred to a lawyer.' }, true),
  ];
  const mEvent = (matterId, name, at, detail = {}, staff = false) => {
    const row = event(matterId, name, at, detail, staff);
    delete row.case_id;
    return { ...row, matter_id: matterId };
  };
  const matterEvents = [
    mEvent(M('TKT-2026-0024'), 'intake_received', ago({ days: 1, hours: 4 }), { documents: 4, source: 'anderhue-site' }),
    mEvent(M('TKT-2026-0024'), 'documents_uploaded', ago({ days: 1, hours: 4 }), { count: 4 }),
    mEvent(M('TKT-2026-0023'), 'intake_received', ago({ days: 15 }), { documents: 1, source: 'anderhue-site' }),
    mEvent(M('TKT-2026-0023'), 'stage_changed', ago({ days: 12 }), { stage: 'quoted' }, true),
    mEvent(M('TKT-2026-0023'), 'staff_uploaded', ago({ days: 4 }), { name: 'Retainer agreement (signed).pdf' }, true),
    mEvent(M('TKT-2026-0023'), 'stage_changed', ago({ days: 4 }), { stage: 'retained' }, true),
    mEvent(M('TKT-2026-0023'), 'documents_requested', ago({ days: 2, hours: 2 }), { message: 'Please upload any court notice you received.' }, true),
    mEvent(M('TKT-2026-0023'), 'client_uploaded', ago({ hours: 3 }), { count: 1, note: 'This came in the mail yesterday.' }),
    mEvent(M('TKT-2026-0021'), 'intake_received', ago({ days: 45 }), { documents: 1, source: 'anderhue-site' }),
    mEvent(M('TKT-2026-0021'), 'stage_changed', ago({ seconds: 20 }), { stage: 'disclosure_requested', note: 'Disclosure request faxed to York Region prosecutors.' }, true),
    mEvent(M('TKT-2026-0019'), 'stage_changed', ago({ days: 30 }), { stage: 'trial_scheduled' }, true),
    mEvent(M('TKT-2026-0025'), 'intake_received', ago({ minutes: 1 }), { documents: 1, source: 'anderhue-site' }),
    mEvent(M('MAT-2026-0007'), 'intake_received', ago({ days: 3 }), { documents: 2, source: 'anderhue-site' }),
    mEvent(M('MAT-2026-0007'), 'stage_changed', ago({ days: 2 }), { stage: 'under_review' }, true),
    mEvent(M('MAT-2026-0006'), 'stage_changed', ago({ days: 21 }), { stage: 'in_progress' }, true),
    mEvent(M('MAT-2026-0006'), 'document_shared', ago({ minutes: 6 }), { documentName: 'Reply submissions draft.pdf' }, true),
    mEvent(M('MAT-2026-0008'), 'intake_received', ago({ hours: 5 }), { documents: 0, source: 'anderhue-site' }),
    mEvent(M('MAT-2026-0009'), 'intake_received', ago({ minutes: 40 }), { documents: 0, returningClient: true, source: 'anderhue-site' }),
  ];

  let noticeN = 0;
  const clientOf = (area, caseId) => (area === 'ltb' ? ltbCases : matters).find(row => row.id === caseId)?.client_id || null;
  const notice = (area, caseId, kind, status, createdAt, extra = {}) => ({
    id: id('e5000000', ++noticeN), practice_id: PRACTICE_ID, area, case_id: caseId, client_id: clientOf(area, caseId),
    audience: kind.startsWith('staff_') ? 'staff' : 'client', kind, detail: {}, status, next_attempt_at: createdAt,
    sent_at: status === 'sent' ? createdAt : null, failure_code: null, created_at: createdAt,
    // Columns staff can never read (the mock must never return them).
    snapshot: { secret: 'snapshot-never-exposed' }, email_payload: { html: '<p>portal link</p>' }, recipients: ['client@example.com'],
    ...extra,
  });
  const notices = [
    notice('ltb', L(12), 'intake_received', 'sent', ago({ days: 2, hours: 3 })),
    notice('ltb', L(12), 'staff_new_intake', 'sent', ago({ days: 2, hours: 3 })),
    notice('ltb', L(10), 'stage_changed', 'sent', ago({ days: 31 }), { detail: { stage: 'quoted' } }),
    notice('ltb', L(10), 'stage_changed', 'sent', ago({ days: 18 }), { detail: { stage: 'notice_served' } }),
    notice('ltb', L(10), 'document_shared', 'sent', ago({ days: 18 }), { detail: { documentName: 'N4 as served with certificate.pdf' } }),
    notice('ltb', L(9), 'stage_changed', 'failed', ago({ days: 1, hours: 2 }), { detail: { stage: 'hearing_scheduled', message: 'Your hearing is by video. I will send the link.' }, failure_code: 'recipient_rejected' }),
    notice('ltb', L(8), 'stage_changed', 'sent', ago({ days: 7 }), { detail: { stage: 'quoted' } }),
    notice('ltb', L(8), 'documents_requested', 'sent', midday(-6), { detail: { message: 'Please upload your signed lease.\nPlease upload the rent ledger.' } }),
    notice('traffic', M('TKT-2026-0024'), 'intake_received', 'sent', ago({ days: 1, hours: 4 })),
    notice('traffic', M('TKT-2026-0023'), 'stage_changed', 'superseded', ago({ days: 12 }), { detail: { stage: 'under_review' } }),
    notice('traffic', M('TKT-2026-0023'), 'stage_changed', 'sent', ago({ days: 4 }), { detail: { stage: 'retained' } }),
    notice('traffic', M('TKT-2026-0023'), 'documents_requested', 'sent', ago({ days: 2, hours: 2 }), { detail: { message: 'Please upload any court notice you received.' } }),
    notice('traffic', M('TKT-2026-0023'), 'staff_client_uploaded', 'sent', ago({ hours: 3 })),
    notice('traffic', M('TKT-2026-0021'), 'stage_changed', 'pending', ago({ seconds: 20 }), { detail: { stage: 'disclosure_requested' }, next_attempt_at: ahead(70) }),
    notice('traffic', M('TKT-2026-0019'), 'stage_changed', 'sent', ago({ days: 30 }), { detail: { stage: 'trial_scheduled' } }),
    notice('general', M('MAT-2026-0007'), 'stage_changed', 'cancelled', ago({ days: 2 }), { detail: { stage: 'under_review' } }),
    notice('general', M('MAT-2026-0006'), 'stage_changed', 'sent', ago({ days: 21 }), { detail: { stage: 'in_progress' } }),
    // First delivery attempt bounced with a temporary error; the sender tries again in a few minutes.
    notice('general', M('MAT-2026-0006'), 'document_shared', 'retry', ago({ minutes: 6 }), {
      detail: { documentName: 'Reply submissions draft.pdf' }, next_attempt_at: ahead(4 * 60 + 10), failure_code: 'smtp_temporary' }),
  ];

  return {
    today, practice, clients, ltbCases, matters, ltbDocuments, matterDocuments, ltbEvents, matterEvents, notices,
    // Files the QA flow opens.
    keyFiles: {
      ltbReview: L(12), ltbReady: L(10), ltbFailedUpdate: L(9), ltbRequest: L(8),
      trafficNew: M('TKT-2026-0024'), trafficUploaded: M('TKT-2026-0023'), trafficScheduled: M('TKT-2026-0021'), trafficTrial: M('TKT-2026-0019'),
      trafficClosed: M('TKT-2026-0015'), generalDue: M('MAT-2026-0007'), generalOverdue: M('MAT-2026-0006'), generalHeld: M('MAT-2026-0009'),
    },
  };
}

/** A practice with no files yet (first-run empty states). */
export function emptyFixtureData(now = new Date()) {
  const data = buildStaffFixtureData({ now });
  for (const key of ['ltbCases', 'matters', 'ltbDocuments', 'matterDocuments', 'ltbEvents', 'matterEvents', 'notices']) data[key] = [];
  return data;
}

// ---------------------------------------------------------------------------
// Mock state and PostgREST evaluator
// ---------------------------------------------------------------------------

export function createMockState({ now = new Date(), membership = 'member', updatesEnabled = true, data } = {}) {
  const source = data || buildStaffFixtureData({ now });
  const state = JSON.parse(JSON.stringify(source));
  state.practice.client_updates_enabled = updatesEnabled;
  state.membership = membership;
  state.storage = new Map();
  for (const doc of [...state.ltbDocuments, ...state.matterDocuments]) {
    if (doc.uploaded_at) state.storage.set(doc.storage_path, { contentType: doc.content_type, size: doc.size_bytes });
  }
  state.next = { ltb: 13, traffic: 26, general: 10 };
  return state;
}

function tableRows(state, table) {
  switch (table) {
    case 'ltb_practices': return [state.practice];
    case 'ltb_clients': return state.clients;
    case 'ltb_cases': return state.ltbCases;
    case 'ltb_case_documents': return state.ltbDocuments;
    case 'ltb_case_events': return state.ltbEvents;
    case 'practice_matters': return state.matters;
    case 'practice_matter_documents': return state.matterDocuments;
    case 'practice_matter_events': return state.matterEvents;
    case 'practice_notices': return state.notices;
    default: return null;
  }
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char;
  }
  if (current) parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

export function parseSelect(select) {
  return splitTopLevel(select || '*').map(item => {
    const match = item.match(/^([a-z_]+)\((.*)\)$/);
    return match ? { embed: match[1], columns: parseSelect(match[2]) } : { column: item };
  });
}

function project(state, row, select) {
  const out = {};
  for (const item of select) {
    if (item.column === '*') Object.assign(out, row);
    else if (item.column) out[item.column] = row[item.column] === undefined ? null : row[item.column];
    else if (item.embed === 'ltb_clients') {
      const client = state.clients.find(candidate => candidate.id === row.client_id);
      out.ltb_clients = client ? project(state, client, item.columns) : null;
    }
  }
  return out;
}

function compare(a, b) {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (typeof a === 'string' && typeof b === 'string' && Number.isFinite(left) && Number.isFinite(right) && /\d{4}-\d{2}-\d{2}/.test(a)) return left - right;
  if (typeof a === 'number') return a - Number(b);
  return String(a).localeCompare(String(b));
}

function filters(params) {
  const list = [];
  for (const [key, raw] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const value = raw.slice(dot + 1);
    list.push(row => {
      const cell = row[key];
      switch (op) {
        case 'eq': return cell !== null && cell !== undefined && String(cell) === value;
        case 'neq': return String(cell) !== value;
        case 'gt': return cell !== null && compare(cell, value) > 0;
        case 'gte': return cell !== null && compare(cell, value) >= 0;
        case 'lt': return cell !== null && compare(cell, value) < 0;
        case 'lte': return cell !== null && compare(cell, value) <= 0;
        case 'in': return value.replace(/^\(|\)$/g, '').split(',').map(item => item.replace(/^"|"$/g, '')).includes(String(cell));
        case 'is': return value === 'null' ? cell === null || cell === undefined : String(cell) === value;
        default: throw new Error(`Unsupported filter ${key}=${raw}`);
      }
    });
  }
  return list;
}

function order(rows, spec) {
  if (!spec) return rows;
  const keys = spec.split(',').map(part => { const [column, direction] = part.split('.'); return { column, desc: direction === 'desc' }; });
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const left = a[key.column];
      const right = b[key.column];
      if (left === right) continue;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      const result = compare(left, right);
      if (result) return key.desc ? -result : result;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Generated document content (images as SVG, PDFs as a tiny valid PDF)
// ---------------------------------------------------------------------------

function escapeXml(text) {
  return String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

export function documentSvg(doc) {
  const kind = doc.kind || 'document';
  const title = kind === 'ticket' ? 'PROVINCIAL OFFENCES ACT · OFFENCE NOTICE'
    : kind === 'rent_ledger' ? 'RENT LEDGER' : kind === 'notice' ? 'N4 · NOTICE TO END YOUR TENANCY FOR NON-PAYMENT OF RENT'
      : (doc.original_name || 'Document').toUpperCase();
  const rows = Array.from({ length: 11 }, (_, index) => `<rect x="70" y="${250 + index * 62}" width="${index % 3 === 2 ? 420 : 660}" height="16" rx="3" fill="#d8d2cb"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1160" viewBox="0 0 900 1160">
  <rect width="900" height="1160" fill="#fbfaf7"/>
  <rect x="40" y="40" width="820" height="1080" fill="none" stroke="#c9c2b8" stroke-width="2"/>
  <text x="70" y="120" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#2b2b2b">${escapeXml(title.slice(0, 52))}</text>
  <text x="70" y="165" font-family="Arial, sans-serif" font-size="18" fill="#6b6b6b">${escapeXml(doc.original_name || '')}</text>
  <line x1="70" y1="195" x2="830" y2="195" stroke="#c9c2b8" stroke-width="2"/>
  ${rows}
  <rect x="560" y="960" width="230" height="110" rx="6" fill="none" stroke="#b28d54" stroke-width="3" stroke-dasharray="8 6"/>
  <text x="586" y="1022" font-family="Arial, sans-serif" font-size="18" fill="#9a7641">Fixture image</text>
</svg>`;
}

export function documentPdf(title = 'Fixture document') {
  const text = String(title).replace(/[()\\]/g, '');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 20 Tf 72 720 Td (${text}) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

function fixtureSession(user = STAFF_USER) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp, role: 'authenticated', email: user.email })}.fixture`,
    refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user,
  };
}
export { fixtureSession };

class RpcError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

function findCase(state, area, caseId) {
  const row = area === 'ltb'
    ? state.ltbCases.find(item => item.id === caseId)
    : state.matters.find(item => item.id === caseId && item.area === area);
  if (!row || row.practice_id !== PRACTICE_ID) throw new RpcError('PRACTICE_CASE_NOT_FOUND');
  return row;
}

function eventsFor(state, area) { return area === 'ltb' ? state.ltbEvents : state.matterEvents; }
function documentsFor(state, area) { return area === 'ltb' ? state.ltbDocuments : state.matterDocuments; }

function logEvent(state, area, caseId, name, detail, staff = true) {
  const list = eventsFor(state, area);
  const nextId = Math.max(0, ...state.ltbEvents.map(row => row.id), ...state.matterEvents.map(row => row.id)) + 1;
  const row = { id: nextId, practice_id: PRACTICE_ID, actor_id: staff ? STAFF_USER.id : null, event: name, detail, at: new Date().toISOString() };
  list.push(area === 'ltb' ? { ...row, case_id: caseId } : { ...row, matter_id: caseId });
}

/** practice_enqueue_notice: no client email while updates are off or the file is held out of the portal. */
function enqueue(state, area, caseId, kind, detail, delaySeconds = 0) {
  const staffAlert = kind.startsWith('staff_');
  if (!state.practice.client_updates_enabled && !staffAlert) return null;
  const file = caseId ? (area === 'ltb' ? state.ltbCases : state.matters).find(row => row.id === caseId) : null;
  if (!staffAlert && file && file.portal_visible === false) return null;
  const now = new Date();
  const row = {
    id: randomUUID(), practice_id: PRACTICE_ID, area, case_id: caseId, client_id: file?.client_id || null,
    audience: staffAlert ? 'staff' : 'client', kind, detail, status: 'pending',
    next_attempt_at: new Date(now.getTime() + delaySeconds * 1000).toISOString(), sent_at: null, failure_code: null,
    created_at: now.toISOString(), snapshot: { secret: 'snapshot-never-exposed' }, email_payload: null, recipients: ['client@example.com'],
  };
  state.notices.push(row);
  return row.id;
}

/** practice_reveal_file: a deliberate staff step puts a held file into the client portal. */
function reveal(row) {
  if (row.portal_visible === false) row.portal_visible = true;
}

/** Client emails that have not gone out (pending, or waiting to retry) matching `test` are cancelled. */
function cancelUnsent(state, test, failureCode) {
  for (const notice of state.notices) {
    if (notice.audience !== 'client' || !['pending', 'retry'].includes(notice.status) || !test(notice)) continue;
    notice.status = 'cancelled';
    notice.failure_code = failureCode;
  }
}

/** practice_is_email: lower case, at most 254 characters, no controls, one @ and a dot in the domain. */
function isPracticeEmail(value) {
  return typeof value === 'string' && value === value.toLowerCase() && value.length <= 254
    && !/[\u0000-\u001f\u007f]/.test(value) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value); // eslint-disable-line no-control-regex
}

function touch(row) { row.updated_at = new Date().toISOString(); }

const RPC = {
  ltb_my_practices: (state) => {
    if (state.membership === 'fail') throw new RpcError('Fixture access failure', 503);
    if (state.membership === 'none') return [];
    if (state.membership === 'other') return [{ practice_id: 'another-practice', practice_name: 'Another Practice', member_role: 'clerk' }];
    return [{ practice_id: PRACTICE_ID, practice_name: 'AnderHue Paralegal Professional Corporation', member_role: 'licensee' }];
  },
  practice_set_stage: (state, args) => {
    const row = findCase(state, args.p_area, args.p_case_id);
    if (!STAGES[args.p_area].includes(args.p_stage)) throw new RpcError('PRACTICE_STAGE_INVALID');
    if (args.p_stage === 'closed' && !args.p_outcome) throw new RpcError('PRACTICE_OUTCOME_REQUIRED');
    if (args.p_stage === 'closed' && !OUTCOMES[args.p_area].includes(args.p_outcome)) throw new RpcError('PRACTICE_OUTCOME_INVALID');
    if (args.p_note && args.p_note.length > 1000) throw new RpcError('PRACTICE_NOTE_TOO_LONG');
    if (args.p_client_message && args.p_client_message.length > 1000) throw new RpcError('PRACTICE_MESSAGE_TOO_LONG');
    const outcome = args.p_stage === 'closed' ? args.p_outcome : args.p_stage === 'declined' ? 'declined' : null;
    if (row.stage === args.p_stage && (row.outcome || null) === outcome) return { stage: row.stage, outcome: row.outcome, noticeId: null };
    const detail = Object.fromEntries(Object.entries({ stage: args.p_stage, outcome, note: args.p_note }).filter(([, value]) => value));
    const notify = args.p_notify !== false && !QUIET_STAGES.has(args.p_stage) && row.source !== 'smoke-test';
    const update = { stage: args.p_stage, outcome, message: args.p_client_message || '' };
    if (row.stage === args.p_stage) {
      // Same stage: a closed file's outcome is corrected, and with p_notify the client gets a fresh update.
      row.outcome = outcome;
      touch(row);
      logEvent(state, args.p_area, row.id, 'outcome_changed', detail);
      return { stage: row.stage, outcome, noticeId: notify ? enqueue(state, args.p_area, row.id, 'stage_changed', update, 90) : null };
    }
    row.stage = args.p_stage;
    row.outcome = outcome;
    row.stage_changed_at = new Date().toISOString();
    row.closed_at = ['closed', 'declined'].includes(args.p_stage) ? row.closed_at || row.stage_changed_at : null;
    // practice_reveal_on_stage: leaving new_intake puts a held file into the client portal.
    if (args.p_stage !== 'new_intake') reveal(row);
    touch(row);
    logEvent(state, args.p_area, row.id, 'stage_changed', detail);
    const noticeId = notify ? enqueue(state, args.p_area, row.id, 'stage_changed', update, 90) : null;
    return { stage: row.stage, outcome: row.outcome, noticeId };
  },
  practice_request_documents: (state, args) => {
    const row = findCase(state, args.p_area, args.p_case_id);
    const message = String(args.p_message || '').trim();
    if (!message) throw new RpcError('PRACTICE_MESSAGE_REQUIRED');
    if (message.length > 1000) throw new RpcError('PRACTICE_MESSAGE_TOO_LONG');
    if (['closed', 'declined'].includes(row.stage)) throw new RpcError('PRACTICE_FILE_CLOSED');
    row.client_request_message = message;
    row.client_request_at = new Date().toISOString();
    reveal(row);
    touch(row);
    logEvent(state, args.p_area, row.id, 'documents_requested', { message });
    return enqueue(state, args.p_area, row.id, 'documents_requested', { message });
  },
  practice_clear_request: (state, args) => {
    const row = findCase(state, args.p_area, args.p_case_id);
    if (!row.client_request_message) return null;
    row.client_request_message = null;
    row.client_request_at = null;
    touch(row);
    cancelUnsent(state, notice => notice.area === args.p_area && notice.case_id === row.id && notice.kind === 'documents_requested', 'request_cleared');
    logEvent(state, args.p_area, row.id, 'request_cleared', {});
    return null;
  },
  practice_staff_add_document: (state, args) => {
    const row = findCase(state, args.p_area, args.p_case_id);
    const ext = CONTENT_TYPES[args.p_content_type];
    if (!ext || !(args.p_size > 0 && args.p_size <= 10 * 1024 * 1024)) throw new RpcError('PRACTICE_DOCUMENT_INVALID');
    const documentId = randomUUID();
    const storagePath = `${row.id}/${documentId}.${ext}`;
    const doc = {
      id: documentId, practice_id: PRACTICE_ID, [args.p_area === 'ltb' ? 'case_id' : 'matter_id']: row.id, storage_path: storagePath,
      original_name: args.p_name, content_type: args.p_content_type, size_bytes: args.p_size, uploaded_at: null, kind: args.p_kind || null,
      extraction_status: 'skipped', extracted: null, extracted_at: null, uploaded_by: 'staff', shared_with_client: Boolean(args.p_share),
      created_at: new Date().toISOString(),
    };
    documentsFor(state, args.p_area).push(doc);
    return [{ document_id: documentId, bucket: BUCKET[args.p_area], storage_path: storagePath }];
  },
  practice_staff_confirm_document: (state, args) => {
    const doc = documentsFor(state, args.p_area).find(item => item.id === args.p_document_id);
    if (!doc) throw new RpcError('PRACTICE_DOCUMENT_NOT_FOUND');
    if (!state.storage.has(doc.storage_path)) throw new RpcError('PRACTICE_UPLOAD_MISSING');
    const caseId = doc.case_id || doc.matter_id;
    if (doc.uploaded_by !== 'staff' || doc.uploaded_at) return false;
    doc.uploaded_at = new Date().toISOString();
    logEvent(state, args.p_area, caseId, 'staff_uploaded', { documentId: doc.id, documentName: doc.original_name });
    if (doc.shared_with_client) {
      reveal(findCase(state, args.p_area, caseId));
      logEvent(state, args.p_area, caseId, 'document_shared', { documentId: doc.id, documentName: doc.original_name });
      enqueue(state, args.p_area, caseId, 'document_shared', { documentId: doc.id, documentName: doc.original_name }, 90);
    }
    return true;
  },
  practice_set_document_shared: (state, args) => {
    const doc = documentsFor(state, args.p_area).find(item => item.id === args.p_document_id);
    if (!doc) throw new RpcError('PRACTICE_DOCUMENT_NOT_FOUND');
    const caseId = doc.case_id || doc.matter_id;
    if (typeof args.p_shared !== 'boolean' || doc.uploaded_by !== 'staff') throw new RpcError('PRACTICE_DOCUMENT_INVALID');
    if (doc.shared_with_client === args.p_shared) return false;
    doc.shared_with_client = args.p_shared;
    const announces = notice => notice.kind === 'document_shared' && notice.detail?.documentId === doc.id;
    if (!args.p_shared) {
      // A pending announcement is withdrawn; one waiting to retry may have been delivered, so it is cancelled.
      state.notices = state.notices.filter(notice => !(announces(notice) && notice.status === 'pending'));
      cancelUnsent(state, announces, 'document_unshared');
      logEvent(state, args.p_area, caseId, 'document_unshared', { documentId: doc.id });
    } else if (doc.uploaded_at) {
      reveal(findCase(state, args.p_area, caseId));
      logEvent(state, args.p_area, caseId, 'document_shared', { documentId: doc.id, documentName: doc.original_name });
      enqueue(state, args.p_area, caseId, 'document_shared', { documentId: doc.id, documentName: doc.original_name }, 90);
    }
    return true;
  },
  practice_cancel_notice: (state, args) => {
    const row = state.notices.find(item => item.id === args.p_notice_id && item.practice_id === PRACTICE_ID);
    if (!row) throw new RpcError('PRACTICE_CASE_NOT_FOUND');
    if (row.audience !== 'client' || !['pending', 'retry'].includes(row.status)) return false;
    row.status = 'cancelled';
    row.failure_code = 'cancelled_by_staff';
    if (row.case_id) logEvent(state, row.area, row.case_id, 'notice_cancelled', { noticeId: row.id, kind: row.kind });
    return true;
  },
  practice_create_matter: (state, args) => {
    if (args.p_practice_id !== PRACTICE_ID) throw new RpcError('PRACTICE_CASE_NOT_FOUND');
    const area = args.p_area;
    if (!['ltb', 'traffic', 'general'].includes(area)) throw new RpcError('PRACTICE_AREA_INVALID');
    const email = String(args.p_client?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new RpcError('PRACTICE_EMAIL_INVALID');
    let client = state.clients.find(item => item.email === email);
    const now = new Date().toISOString();
    if (!client) {
      client = {
        id: randomUUID(), practice_id: PRACTICE_ID, client_type: args.p_client.organizationName ? 'organization' : 'individual',
        first_name: args.p_client.firstName || null, last_name: args.p_client.lastName || null,
        organization_name: args.p_client.organizationName || null, business_number: null, contact_title: null, email,
        phone: args.p_client.phone || null, mailing_address: null, city: null, province: null, postal_code: null, occupation: null,
        registration_status: 'provisional', registered_at: null, identity_verified_at: null, identity_document_type: null,
        portal_revoked_before: null, field_sources: { first_name: { source: 'staff' }, last_name: { source: 'staff' } },
        created_at: now, updated_at: now,
      };
      state.clients.push(client);
    }
    const details = args.p_details || {};
    const caseId = randomUUID();
    const n = state.next[area]++;
    const number = `${area === 'ltb' ? 'LTB' : area === 'traffic' ? 'TKT' : 'MAT'}-2026-${String(n).padStart(4, '0')}`;
    const base = {
      id: caseId, practice_id: PRACTICE_ID, client_id: client.id, stage: 'new_intake', stage_changed_at: now, outcome: null, closed_at: null,
      intake_review_status: 'needs_review', intake_scan_started_at: null, client_notes: null, review_notes: details.notes || null,
      field_sources: {}, returning_client: false, intake_token_hash: null, intake_finalized_at: now, source: 'staff', user_agent: null,
      client_request_message: null, client_request_at: null, client_uploaded_at: null, created_at: now, updated_at: now,
    };
    if (area === 'ltb') {
      state.ltbCases.push({ ...base, case_number: number, issue: details.issue || 'other', notice_served: 'unsure', rental_unit_address: null,
        unit_city: details.city || null, tenant_names: [], rent_amount_cents: null, rent_period: null, rent_due_day: null, lease_start_date: null,
        arrears_claimed_cents: null, arrears_reported_text: null, notice_form: null, notice_served_on: null, notice_service_method: null,
        notice_termination_date: null, hearing_date: null });
    } else {
      state.matters.push({ ...base, area, matter_number: number, ticket_type: area === 'traffic' ? details.ticketType || 'other' : null,
        ticket_city: details.ticketCity || null, ticket_received_on: details.ticketReceivedOn || null, option_chosen: 'unsure',
        offence_number: null, offence_date: null, offence_description: null, statute_section: null, set_fine_cents: null, total_payable_cents: null,
        court_location: null, option_deadline: details.ticketReceivedOn ? addDays(details.ticketReceivedOn, 15) : null,
        field_sources: details.ticketReceivedOn ? { option_deadline: { source: 'staff', confidence: 'low' } } : {},
        disclosure_requested_on: null, meeting_date: null, trial_date: null, category: area === 'general' ? details.category || 'other' : null,
        deadline_date: details.deadline || null, other_party: details.otherParty || null, client_city: null });
    }
    logEvent(state, area, caseId, 'intake_received', { documents: 0, returningClient: false, source: 'staff' });
    const noticeId = args.p_send_invite ? enqueue(state, area, caseId, 'upload_invite', {}) : null;
    return [{ case_id: caseId, case_number: number, client_id: client.id, notice_id: noticeId }];
  },
  practice_revoke_portal_access: (state, args) => {
    const client = state.clients.find(item => item.id === args.p_client_id && item.practice_id === PRACTICE_ID);
    if (!client) throw new RpcError('PRACTICE_CASE_NOT_FOUND');
    client.portal_revoked_before = new Date().toISOString();
    cancelUnsent(state, notice => notice.client_id === client.id, 'portal_access_revoked');
    for (const row of state.ltbCases.filter(item => item.client_id === client.id)) logEvent(state, 'ltb', row.id, 'portal_access_revoked', {});
    for (const row of state.matters.filter(item => item.client_id === client.id)) logEvent(state, row.area, row.id, 'portal_access_revoked', {});
    return client.portal_revoked_before;
  },
  practice_set_client_email: (state, args) => {
    const client = state.clients.find(item => item.id === args.p_client_id);
    if (!client || client.practice_id !== PRACTICE_ID) throw new RpcError('PRACTICE_CLIENT_NOT_FOUND');
    const email = String(args.p_email ?? '').trim().toLowerCase();
    if (!isPracticeEmail(email)) throw new RpcError('PRACTICE_EMAIL_INVALID');
    if (email === client.email) return email;
    if (state.clients.some(item => item.practice_id === client.practice_id && item.email === email && item.id !== client.id)) {
      throw new RpcError('PRACTICE_EMAIL_TAKEN');
    }
    const now = new Date().toISOString();
    client.email = email;
    client.portal_revoked_before = now;
    client.field_sources = { ...(client.field_sources || {}), email: { source: 'staff' } };
    client.updated_at = now;
    cancelUnsent(state, notice => notice.client_id === client.id, 'client_email_changed');
    // ltb_log_client_edit logs the changed column on every file of the client.
    for (const row of state.ltbCases.filter(item => item.client_id === client.id)) logEvent(state, 'ltb', row.id, 'client_updated', { fields: ['email'] });
    for (const row of state.matters.filter(item => item.client_id === client.id)) logEvent(state, row.area, row.id, 'client_updated', { fields: ['email'] });
    return email;
  },
  ltb_set_client_registration: (state, args) => {
    const client = state.clients.find(item => item.id === args.p_client_id && item.practice_id === PRACTICE_ID);
    if (!client) throw new RpcError('LTB_CLIENT_NOT_FOUND');
    if (!['provisional', 'registered', 'verified'].includes(args.p_status)) throw new RpcError('LTB_REGISTRATION_STATUS_INVALID');
    if (args.p_status !== 'provisional' && ((!client.first_name && !client.organization_name) || !client.mailing_address || !client.phone)) {
      throw new RpcError('LTB_REGISTRATION_INCOMPLETE');
    }
    if (args.p_status === 'verified' && !(args.p_identity_document_type || client.identity_document_type)) throw new RpcError('LTB_IDENTITY_DOCUMENT_REQUIRED');
    const now = new Date().toISOString();
    client.registration_status = args.p_status;
    client.registered_at = args.p_status === 'provisional' ? null : client.registered_at || now;
    client.identity_verified_at = args.p_status === 'verified' ? client.identity_verified_at || now : null;
    if (args.p_status === 'verified') client.identity_document_type = args.p_identity_document_type || client.identity_document_type;
    for (const row of state.ltbCases.filter(item => item.client_id === client.id)) logEvent(state, 'ltb', row.id, 'client_registration_changed', { status: args.p_status });
    return client;
  },
};

const EDIT_LOG_IGNORED = new Set(['updated_at', 'stage', 'stage_changed_at', 'outcome', 'closed_at', 'field_sources']);

function applyPatch(state, table, params, body) {
  const rows = tableRows(state, table);
  const tests = filters(params);
  const matched = rows.filter(row => tests.every(test => test(row)));
  const changed = [];
  for (const row of matched) {
    const next = { ...row, ...body };
    if ((table === 'ltb_cases' || table === 'practice_matters') && !['needs_review', 'ready'].includes(next.intake_review_status)) {
      throw Object.assign(new Error(`new row violates row-level security policy for table "${table}"`), { pgCode: '42501' });
    }
    const fields = Object.keys(body).filter(key => !EDIT_LOG_IGNORED.has(key) && JSON.stringify(row[key]) !== JSON.stringify(body[key]));
    Object.assign(row, body);
    if ('updated_at' in row) touch(row);
    changed.push(row);
    if (fields.length && table === 'ltb_cases') logEvent(state, 'ltb', row.id, 'case_updated', { fields });
    if (fields.length && table === 'practice_matters') logEvent(state, row.area, row.id, 'case_updated', { fields });
    if (fields.length && table === 'ltb_clients') {
      for (const item of state.ltbCases.filter(candidate => candidate.client_id === row.id)) logEvent(state, 'ltb', item.id, 'client_updated', { fields });
      for (const item of state.matters.filter(candidate => candidate.client_id === row.id)) logEvent(state, item.area, item.id, 'client_updated', { fields });
    }
  }
  return changed;
}

/**
 * Routes every request of a browser context. Records each Supabase request in
 * `requests` (method, path, table or rpc, params, body, headers, order).
 */
export async function installSupabaseMocks(context, { origin, state, requests = [], fontsDir = null, holdMembership = null, externals = [], latencyMs = 0 }) {
  let sequence = 0;
  let signedCounter = 0;
  const nativePdfRedirect = context.browser().browserType().name() === 'chromium';
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    // Branded Chromium browsers load their built-in PDF viewer from an
    // internal extension. Do not replace its module scripts with a 204 mock.
    if (['chrome-extension:', 'chrome:', 'edge:'].includes(url.protocol)) return route.continue();
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: fontCss(fontsDir) });
    if (url.hostname === 'fonts.gstatic.com') {
      const file = fontsDir && path.join(fontsDir, path.basename(url.pathname));
      if (file && existsSync(file)) return route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(file) });
      return route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(0) });
    }
    if (!url.hostname.endsWith('.supabase.co')) {
      externals.push(url.toString());
      return route.fulfill({ status: 204, body: '' });
    }
    const method = request.method();
    const headers = request.headers();
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': headers['access-control-request-headers'] || 'authorization, apikey, content-type, prefer, x-client-info, x-supabase-api-version, x-upsert',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    let body = null;
    const raw = request.postData();
    if (raw && (headers['content-type'] || '').includes('application/json')) {
      try { body = JSON.parse(raw); } catch { body = raw; }
    }
    const entry = {
      seq: ++sequence, at: Date.now(), method, url: url.toString(), path: url.pathname, params: Object.fromEntries(url.searchParams.entries()),
      body, headers: { prefer: headers.prefer || null, accept: headers.accept || null, 'x-upsert': headers['x-upsert'] || null, 'content-type': headers['content-type'] || null },
      table: null, rpc: null, status: 200,
    };
    requests.push(entry);
    const json = (value, status = 200, extra = {}) => {
      entry.status = status;
      return route.fulfill({ status, contentType: 'application/json', body: value === undefined ? '' : JSON.stringify(value), headers: { ...cors, ...extra } });
    };

    try {
      // Auth -----------------------------------------------------------------
      if (url.pathname.startsWith('/auth/v1/')) {
        if (url.pathname.endsWith('/signup')) return json({ user: { ...STAFF_USER, email: body?.email || STAFF_USER.email }, session: null });
        if (url.pathname.endsWith('/logout')) { entry.status = 204; return route.fulfill({ status: 204, headers: cors, body: '' }); }
        if (url.pathname.endsWith('/user')) return json(STAFF_USER);
        if (url.pathname.endsWith('/token')) {
          if (state.authFail) return json({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
          return json(fixtureSession());
        }
        return json(fixtureSession());
      }

      // RPC -----------------------------------------------------------------
      const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (rpcMatch) {
        entry.rpc = rpcMatch[1];
        if (entry.rpc === 'ltb_my_practices' && holdMembership) await holdMembership;
        const handler = RPC[entry.rpc];
        if (!handler) return json({ code: 'PGRST202', message: `Could not find the function public.${entry.rpc}` }, 404);
        const result = handler(state, body || {});
        entry.result = result;
        if (entry.rpc === 'ltb_my_practices') entry.membershipOk = result.some(row => row.practice_id === PRACTICE_ID);
        if (result === null || result === undefined) { entry.status = 204; return route.fulfill({ status: 204, headers: cors, body: '' }); }
        return json(result);
      }

      // Tables ----------------------------------------------------------------
      const tableMatch = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (tableMatch) {
        entry.table = tableMatch[1];
        const rows = tableRows(state, entry.table);
        if (!rows) return json({ code: '42P01', message: `relation "public.${entry.table}" does not exist` }, 404);
        const select = parseSelect(url.searchParams.get('select') || '*');
        if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs));
        if (method === 'GET' || method === 'HEAD') {
          let result = rows.filter(row => filters(url.searchParams).every(test => test(row)));
          result = order(result, url.searchParams.get('order'));
          const limit = Number(url.searchParams.get('limit') || 0);
          if (limit) result = result.slice(0, limit);
          const projected = result.map(row => project(state, row, select));
          if ((headers.accept || '').includes('vnd.pgrst.object+json')) {
            return projected.length === 1 ? json(projected[0]) : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
          }
          return json(projected);
        }
        if (method === 'PATCH') {
          const changed = applyPatch(state, entry.table, url.searchParams, body || {});
          if ((headers.prefer || '').includes('return=representation')) return json(changed.map(row => project(state, row, select)));
          entry.status = 204;
          return route.fulfill({ status: 204, body: '' });
        }
        return json({ code: '42501', message: `permission denied for table ${entry.table}` }, 403);
      }

      // Storage -------------------------------------------------------------
      const signMatch = url.pathname.match(/^\/storage\/v1\/object\/sign\/([a-z-]+)\/(.+)$/);
      if (signMatch && method === 'POST') {
        const storagePath = decodeURIComponent(signMatch[2]);
        const doc = [...state.ltbDocuments, ...state.matterDocuments].find(item => item.storage_path === storagePath);
        if (!doc || !state.storage.has(storagePath)) return json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400);
        signedCounter += 1;
        return json({ signedURL: `/object/sign/${signMatch[1]}/${storagePath}?token=fixture-${signedCounter}` });
      }
      if (signMatch && method === 'GET') {
        const storagePath = decodeURIComponent(signMatch[2]);
        const doc = [...state.ltbDocuments, ...state.matterDocuments].find(item => item.storage_path === storagePath);
        if (!doc) return json({ error: 'not_found' }, 404);
        const disposition = url.searchParams.has('download') ? { 'content-disposition': `attachment; filename="${(url.searchParams.get('download') || 'document').replace(/"/g, '')}"` } : {};
        // Real HTTP PDFs avoid browser-specific hangs in intercepted PDF
        // navigations, and exercise the native download manager as well.
        if (doc.content_type === 'application/pdf' && nativePdfRedirect) return route.fulfill({ status: 302, headers: {
          location: `${origin}/__qa__/${url.searchParams.has('download') ? 'download' : 'preview'}.pdf?name=${encodeURIComponent(url.searchParams.get('download') || 'document.pdf')}`,
        } });
        // Firefox and WebKit reject redirects from route.fulfill. Their
        // native attachment downloads are covered by the client portal's
        // real HTTP fixture; staff checks still assert the authorized URL.
        if (doc.content_type === 'application/pdf') return route.fulfill({ status: 200, contentType: 'application/pdf', headers: disposition, body: documentPdf(doc.original_name || 'Document') });
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: disposition, body: documentSvg(doc) });
      }
      const uploadMatch = url.pathname.match(/^\/storage\/v1\/object\/([a-z-]+)\/(.+)$/);
      if (uploadMatch && method === 'POST') {
        const storagePath = decodeURIComponent(uploadMatch[2]);
        const doc = [...state.ltbDocuments, ...state.matterDocuments].find(item => item.storage_path === storagePath);
        if (!doc || doc.uploaded_by !== 'staff' || doc.uploaded_at) return json({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 400);
        if (state.storage.has(storagePath)) return json({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, 400);
        state.storage.set(storagePath, { contentType: doc.content_type, size: doc.size_bytes });
        return json({ Key: `${uploadMatch[1]}/${storagePath}`, Id: randomUUID() });
      }

      if (url.pathname.startsWith('/functions/v1/')) return json({ error: 'The staff workspace must not call edge functions.' }, 404);
      return json({ message: 'Unhandled fixture route' }, 404);
    } catch (error) {
      if (error instanceof RpcError) return json({ code: 'P0001', message: error.message, details: null, hint: null }, error.status);
      if (error?.pgCode) return json({ code: error.pgCode, message: error.message, details: null, hint: null }, 403);
      throw error;
    }
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  return requests;
}

function fontCss(fontsDir) {
  if (!fontsDir || !existsSync(fontsDir)) return '/* fonts unavailable offline */';
  const faces = [];
  for (const file of readdirSync(fontsDir).filter(name => name.endsWith('.woff2'))) {
    const match = file.match(/^(public-sans|newsreader|ibm-plex-mono)-latin-(\d{3})-(normal|italic)\.woff2$/);
    if (!match) continue;
    const family = { 'public-sans': 'Public Sans', newsreader: 'Newsreader', 'ibm-plex-mono': 'IBM Plex Mono' }[match[1]];
    faces.push(`@font-face{font-family:'${family}';font-style:${match[3]};font-weight:${match[2]};font-display:swap;src:url(https://fonts.gstatic.com/qa/${file}) format('woff2');}`);
  }
  return faces.join('\n');
}

// ---------------------------------------------------------------------------
// Scoping rules
// ---------------------------------------------------------------------------

/** Problems with the recorded requests; empty when every rule holds. */
export function practiceScopingProblems(requests) {
  const problems = [];
  const membershipIndex = requests.findIndex(entry => entry.rpc === 'ltb_my_practices' && entry.membershipOk);
  requests.forEach((entry, index) => {
    if (entry.path.startsWith('/functions/v1/')) problems.push(`Edge function called: ${entry.path}`);
    if (entry.path.startsWith('/rest/v1/rpc/')) {
      if (!STAFF_RPCS.includes(entry.rpc)) problems.push(`RPC outside the staff contract: ${entry.rpc}`);
      if (entry.rpc !== 'ltb_my_practices' && (membershipIndex < 0 || index < membershipIndex)) problems.push(`RPC ${entry.rpc} before membership`);
      return;
    }
    if (entry.path.startsWith('/storage/v1/object/sign/') && entry.method === 'POST' && entry.body?.expiresIn !== 300) {
      problems.push(`Signed URL must last 300 s, got ${entry.body?.expiresIn}`);
    }
    if (entry.path.startsWith('/storage/v1/object/') && !entry.path.includes('/sign/') && entry.method === 'POST' && entry.headers['x-upsert'] !== 'false') {
      problems.push(`Storage upload must not upsert: ${entry.path}`);
    }
    if (!entry.path.startsWith('/rest/v1/')) return;
    const table = entry.table || entry.path.replace('/rest/v1/', '');
    if (FABSY_TABLES.includes(table)) problems.push(`Fabsy traffic table requested: ${table}`);
    if (!ALLOWED_TABLES.includes(table)) { problems.push(`Unexpected table: ${table}`); return; }
    if (membershipIndex < 0 || index < membershipIndex) problems.push(`${table} requested before membership was confirmed`);
    if (table === 'ltb_practices') {
      if (entry.params.id !== `eq.${PRACTICE_ID}`) problems.push(`ltb_practices without id=eq.${PRACTICE_ID}`);
    } else if (entry.params.practice_id !== `eq.${PRACTICE_ID}`) {
      problems.push(`${entry.method} ${table} without practice_id=eq.${PRACTICE_ID}: ${entry.url}`);
    }
    if (table === 'practice_notices') {
      const columns = parseSelect(entry.params.select || '*');
      for (const item of columns) {
        if (item.embed || item.column === '*' || !NOTICE_COLUMNS.includes(item.column)) problems.push(`practice_notices column not allowed: ${item.column || item.embed}`);
      }
    }
    if (entry.method === 'PATCH') {
      const grants = UPDATE_GRANTS[table];
      if (!grants) problems.push(`Update on a table without grants: ${table}`);
      else for (const key of Object.keys(entry.body || {})) if (!grants.includes(key)) problems.push(`Update of ungranted column ${table}.${key}`);
      if (!entry.params.id) problems.push(`Update without an id filter on ${table}`);
    } else if (!['GET', 'HEAD'].includes(entry.method)) {
      problems.push(`${entry.method} on ${table} is not allowed`);
    }
  });
  return problems;
}

export function assertPracticeScoping(requests) {
  const problems = practiceScopingProblems(requests);
  assert.deepEqual(problems, [], `Practice scoping problems:\n${problems.join('\n')}`);
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

export async function launchQaBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    // Fall back to any Chromium already present (never download browsers here).
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const name of readdirSync(root).filter(entry => entry.startsWith('chromium')).sort().reverse()) {
        for (const candidate of [path.join(root, name, 'chrome-linux/headless_shell'), path.join(root, name, 'chrome-linux/chrome')]) {
          if (existsSync(candidate)) return chromium.launch({ headless: true, executablePath: candidate });
        }
      }
    }
    throw error;
  }
}

export async function startStaffServer(outDir) {
  const { startAnderhueServer } = await import('./serve.mjs');
  return startAnderhueServer(path.resolve(outDir));
}

/**
 * One isolated browser context with the Supabase mock installed.
 * options: signedIn, membership ('member' | 'none' | 'other' | 'fail'), hold,
 * updatesEnabled, authFail, viewport, fontsDir, data, now.
 */
const pendingStaffRequests = new WeakMap();

async function waitForStaffRequests(page) {
  const pending = pendingStaffRequests.get(page);
  const deadline = Date.now() + 15_000;
  while (pending?.size && Date.now() < deadline) await page.waitForTimeout(50);
  assert.equal(pending?.size || 0, 0, `Unfinished staff API requests: ${[...(pending || [])].map(request => request.url()).join(', ')}`);
}

export async function openStaffContext(browser, origin, options = {}) {
  const {
    signedIn = true, membership = 'member', hold = false, updatesEnabled = true, authFail = false,
    viewport = { width: 1440, height: 900 }, fontsDir = null, now = new Date(), data, allowConsole = [], latencyMs = 0, empty = false,
  } = options;
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', locale: 'en-CA', timezoneId: 'America/Toronto' });
  context.setDefaultTimeout(30_000);
  const state = createMockState({ now, membership, updatesEnabled, data: empty ? emptyFixtureData(now) : data });
  state.authFail = authFail;
  const requests = [];
  const externals = [];
  let release = () => undefined;
  const holdMembership = hold ? new Promise(resolve => { release = resolve; }) : null;
  await installSupabaseMocks(context, { origin, state, requests, fontsDir, holdMembership, externals, latencyMs });
  if (signedIn) await context.addInitScript(([appOrigin, key, value]) => {
    // Never seed authentication into a PDF viewer or a cross-origin frame.
    if (window === window.top && location.origin === appOrigin && localStorage) localStorage.setItem(key, JSON.stringify(value));
  }, [origin, AUTH_STORAGE_KEY, fixtureSession()]);
  const page = await context.newPage();
  const pending = new Set();
  pendingStaffRequests.set(page, pending);
  page.on('request', request => {
    if (['fetch', 'xhr'].includes(request.resourceType()) && new URL(request.url()).hostname.endsWith('.supabase.co')) pending.add(request);
  });
  page.on('requestfinished', request => pending.delete(request));
  page.on('requestfailed', request => pending.delete(request));
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!allowConsole.some(pattern => pattern.test(text))) errors.push(`console: ${text} (${message.location().url})`);
  });
  return {
    context, page, state, requests, externals, errors, release: () => release(),
    rpcCalls: name => requests.filter(entry => entry.rpc === name),
    async close() { await context.close(); },
  };
}

export async function expectNoFabsy(page, label = page.url()) {
  const text = await page.evaluate(() => `${document.title}\n${document.body.innerText}`);
  assert.doesNotMatch(text, /fabsy/i, `"Fabsy" must not appear on ${label}`);
}

export async function expectNoHorizontalOverflow(page, label = page.url()) {
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  assert.ok(sizes.scroll <= sizes.width, `${label} overflows horizontally (${sizes.scroll} > ${sizes.width})`);
}

export async function waitForQuiet(page) {
  await page.waitForFunction(() => !document.querySelector('.ahs-skel'), null, { timeout: 15_000 });
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// QA flow
// ---------------------------------------------------------------------------

/**
 * Full staff workspace QA against a served build. Asserts behaviour, practice
 * scoping, copy rules, console cleanliness and phone layout, and saves
 * screenshots (1440x900 and 390x844) when screenshotDir is set.
 */
export async function runStaffQaFlow({ origin, browser, screenshotDir = null, fontsDir = null, log = console.log }) {
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
  const shots = [];
  let shotIndex = 0;
  const shoot = async (page, name, { full = true } = {}) => {
    if (!screenshotDir) return;
    const size = page.viewportSize();
    const suffix = size && size.width < 600 ? 'mobile' : 'desktop';
    const file = path.join(screenshotDir, `${String(++shotIndex).padStart(2, '0')}-${name}-${suffix}.png`);
    await page.waitForTimeout(full ? 120 : 350); // let entry animations settle
    await page.screenshot({ path: file, fullPage: full });
    shots.push(file);
  };
  const DESKTOP = { width: 1440, height: 900 };
  const MOBILE = { width: 390, height: 844 };
  const checkPage = async (page, label) => {
    await expectNoFabsy(page, label);
    if ((page.viewportSize()?.width || 0) < 600) await expectNoHorizontalOverflow(page, label);
  };
  const steps = [];
  const step = async (name, task) => {
    const started = Date.now();
    try { await task(); steps.push({ name, ok: true, ms: Date.now() - started }); log(`  ok  ${name}`); } catch (error) {
      steps.push({ name, ok: false, error: error.message });
      log(`  FAIL ${name}: ${error.message}`);
      throw error;
    }
  };
  // Finish fixture requests before replacing the document. WebKit reports
  // requests cancelled by rapid test navigation as access-control page errors.
  // App errors remain asserted; nothing is filtered from the console.
  const visit = async (page, url) => {
    // Let post-click React effects enqueue their invalidated queries before
    // checking network idle; a previously idle load state can resolve at once.
    await waitForQuiet(page);
    // WebKit leaves intercepted attachment navigations pending. Wait for
    // application API requests specifically, not the browser download.
    await waitForStaffRequests(page);
    await page.goto(url);
  };
  const allRequests = [];
  const finish = async session => {
    await waitForQuiet(session.page);
    await waitForStaffRequests(session.page);
    assert.deepEqual(session.errors, [], `Console or page errors:\n${session.errors.join('\n')}`);
    assert.deepEqual(session.externals, [], `Unexpected external requests:\n${session.externals.join('\n')}`);
    assertPracticeScoping(session.requests);
    allRequests.push(...session.requests);
    await session.close();
  };

  // 1. Signed out: sign-in page, sign-up notice, sign in --------------------
  await step('sign-in page, sign-up and sign-in', async () => {
    const session = await openStaffContext(browser, origin, { signedIn: false, fontsDir });
    const { page } = session;
    await visit(page, `${origin}/admin/landlord`);
    await page.waitForURL(`${origin}/sign-in`);
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.match(await page.title(), /AnderHue Paralegal/);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
    await checkPage(page, '/sign-in');
    await shoot(page, 'sign-in', { full: false });
    await page.setViewportSize(MOBILE);
    await checkPage(page, '/sign-in mobile');
    await shoot(page, 'sign-in', { full: false });
    await page.getByRole('button', { name: 'First time here? Create an account' }).click();
    await page.getByLabel('Email address').fill('new.clerk@anderhue.example');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Check your email' }).waitFor();
    const signup = session.requests.find(entry => entry.path.endsWith('/signup'));
    assert.equal(new URL(signup.url).searchParams.get('redirect_to'), `${origin}/sign-in`);
    assert.ok(!session.requests.some(entry => entry.table), 'No table reads while signed out');
    await page.setViewportSize(DESKTOP);
    await page.getByLabel('Email address').fill(STAFF_USER.email);
    await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(`${origin}/admin/landlord`);
    await page.getByRole('heading', { name: 'Landlord files' }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(`${origin}/sign-in`);
    await finish(session);
  });

  // 2. Membership states: no file data before membership succeeds -----------
  await step('membership states (checking, error, not a member)', async () => {
    for (const options of [{ hold: true }, { membership: 'fail' }, { membership: 'none' }, { membership: 'other' }]) {
      // The failing membership check is a deliberate 503; the browser logs it as a resource error.
      const allowConsole = options.membership === 'fail' ? [/status of 503/] : [];
      const session = await openStaffContext(browser, origin, { ...options, fontsDir, allowConsole });
      const { page } = session;
      await visit(page, `${origin}/admin/today`);
      const text = options.hold ? 'Checking practice access…' : options.membership === 'fail' ? 'Access could not be verified' : 'Your account is ready';
      await page.getByText(text, { exact: true }).waitFor();
      assert.ok(!session.requests.some(entry => entry.table), 'No table reads before membership succeeds');
      await checkPage(page, `membership ${text}`);
      await shoot(page, `access-${options.hold ? 'checking' : options.membership}`, { full: false });
      if (options.membership === 'fail') {
        session.state.membership = 'member';
        await page.getByRole('button', { name: 'Retry access check' }).click();
        await page.getByRole('heading', { name: 'Today' }).waitFor();
      }
      if (options.hold) {
        session.release();
        await page.getByRole('heading', { name: 'Today' }).waitFor();
      }
      await finish(session);
    }
  });

  // 3. Signed-in member: Today, boards, palette, files ----------------------
  const member = await openStaffContext(browser, origin, { fontsDir });
  const { page, state } = member;
  const keys = state.keyFiles;

  await step('legacy redirects', async () => {
    await visit(page, `${origin}/admin/ltb`);
    await page.waitForURL(`${origin}/admin/landlord`);
    await waitForQuiet(page);
    await visit(page, `${origin}/admin/ltb/cases/${keys.ltbReview}`);
    await page.waitForURL(`${origin}/admin/files/ltb/${keys.ltbReview}`);
    await waitForQuiet(page);
    await visit(page, `${origin}/admin/not-a-page`);
    await page.waitForURL(`${origin}/admin/today`);
    await waitForQuiet(page);
    await visit(page, `${origin}/admin`);
    await page.waitForURL(`${origin}/admin/today`);
    await waitForQuiet(page);
  });

  await step('Today: KPIs, attention queue and activity', async () => {
    await visit(page, `${origin}/admin/today`);
    await page.getByRole('heading', { name: 'Today' }).waitFor();
    await waitForQuiet(page);
    const queue = page.getByRole('list', { name: 'Needs attention' });
    const text = await queue.innerText();
    for (const reason of ['Client update failed', 'Overdue', 'Ready to file L1', 'Client uploaded', 'Needs review', 'Request open 6 days', 'Reading documents', 'Due in 2 days']) {
      assert.ok(text.includes(reason), `Attention queue shows "${reason}"`);
    }
    const first = await queue.locator('li').first().innerText();
    assert.match(first, /MAT-2026-0006/, 'Overdue file is first in the queue');
    const tiles = await page.getByRole('region', { name: 'Key numbers' }).innerText();
    assert.match(tiles, /Needs review\s*4/);
    assert.match(tiles, /Client uploads waiting\s*1/);
    assert.match(tiles, /Due within 7 days\s*6/);
    assert.match(tiles, /Active files\s*15/);
    assert.ok((await page.getByRole('heading', { name: 'Recent activity' }).count()) === 1);
    await checkPage(page, 'Today');
    await shoot(page, 'today');
    await page.getByRole('button', { name: /^Client uploads waiting/ }).click();
    assert.equal(await page.getByRole('list', { name: 'Client uploads' }).locator('li').count(), 1);
    await page.getByRole('button', { name: /^Client uploads waiting/ }).click();
  });

  await step('boards in board and list views', async () => {
    for (const [route, title, area] of [['landlord', 'Landlord files', 'ltb'], ['traffic', 'Traffic tickets', 'traffic'], ['other', 'Other matters', 'general']]) {
      await visit(page, `${origin}/admin/${route}`);
      await page.getByRole('heading', { name: title, level: 1 }).waitFor();
      await waitForQuiet(page);
      if (await page.getByRole('button', { name: 'Board', exact: true }).getAttribute('aria-pressed') !== 'true') {
        await page.getByRole('button', { name: 'Board', exact: true }).click();
      }
      await page.getByRole('region', { name: new RegExp(`${title} by stage`) }).waitFor();
      await checkPage(page, `${title} board`);
      await shoot(page, `board-${area}`);
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await page.locator('table.ahs-table').waitFor();
      await shoot(page, `list-${area}`);
    }
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.locator('table.ahs-table').waitFor();
    assert.equal(await page.getByRole('button', { name: 'List', exact: true }).getAttribute('aria-pressed'), 'true', 'List view is remembered');
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await visit(page, `${origin}/admin/traffic`);
    await waitForQuiet(page);
    await page.getByRole('button', { name: /^Due soon/ }).click();
    assert.match(await page.getByRole('status').filter({ hasText: 'Showing' }).innerText(), /Showing 2 of 7 files/);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await page.getByRole('searchbox', { name: /Search traffic tickets/ }).fill('Moretti');
    assert.match(await page.getByRole('status').filter({ hasText: 'Showing' }).innerText(), /Showing 1 of 7 files/);
    await page.getByRole('searchbox', { name: /Search traffic tickets/ }).fill('');
  });

  await step('command palette (keyboard)', async () => {
    await visit(page, `${origin}/admin/today`);
    await waitForQuiet(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Search files and actions' });
    await dialog.waitFor();
    await page.keyboard.type('Moretti');
    await dialog.getByRole('option', { name: /TKT-2026-0019/ }).waitFor();
    await shoot(page, 'command-palette', { full: false });
    await page.keyboard.press('Enter');
    await page.waitForURL(`${origin}/admin/files/traffic/${keys.trafficTrial}`);
    await page.getByRole('heading', { name: 'Sofia Moretti' }).waitFor();
  });

  await step('file detail in each area', async () => {
    for (const [area, fileId, name] of [['ltb', keys.ltbReview, 'Priya Raman'], ['traffic', keys.trafficNew, 'Jordan Mitchell'], ['general', keys.generalOverdue, 'Northline Contracting Ltd.']]) {
      await visit(page, `${origin}/admin/files/${area}/${fileId}`);
      await page.getByRole('heading', { name, level: 1 }).waitFor();
      await waitForQuiet(page);
      for (const heading of ['Review', 'Client', 'Stage', 'Client request', 'Documents', 'Client updates', 'Activity']) {
        assert.equal(await page.getByRole('heading', { name: heading, exact: true }).count(), 1, `${area} file shows ${heading}`);
      }
      await checkPage(page, `${area} file`);
      await shoot(page, `file-${area}`);
    }
    await visit(page, `${origin}/admin/files/traffic/${keys.trafficNew}`);
    await waitForQuiet(page);
    await page.getByText('(estimate)').first().waitFor();
  });

  await step('change stage with email preview, then Undo', async () => {
    await visit(page, `${origin}/admin/files/traffic/${keys.trafficUploaded}`);
    await page.getByRole('heading', { name: 'Aisha Rahman', level: 1 }).waitFor();
    await waitForQuiet(page);
    await page.getByRole('button', { name: 'Change stage' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Change stage' });
    await dialog.waitFor();
    await dialog.getByLabel('New stage').selectOption('option_filed');
    await dialog.getByLabel('Personal message (optional)').fill('I filed your trial request this morning.');
    const subject = await dialog.getByTestId('email-preview-subject').innerText();
    assert.equal(subject, 'TKT-2026-0023 · Request filed with the court');
    const preview = await dialog.getByLabel('Email preview').innerText();
    assert.match(preview, /We have filed your request with the court office/);
    assert.match(preview, /I filed your trial request this morning\./);
    assert.match(preview, /Hi Aisha,/);
    await shoot(page, 'change-stage', { full: false });
    await dialog.getByRole('button', { name: 'Update stage' }).click();
    const toast = page.locator('.ahs-toast').filter({ hasText: 'Stage updated. The client update goes out in about 90 seconds.' });
    await toast.waitFor();
    await shoot(page, 'stage-toast', { full: false });
    const call = member.rpcCalls('practice_set_stage').at(-1);
    assert.deepEqual({ ...call.body }, {
      p_area: 'traffic', p_case_id: keys.trafficUploaded, p_stage: 'option_filed', p_outcome: null, p_note: null,
      p_client_message: 'I filed your trial request this morning.', p_notify: true,
    });
    await toast.getByRole('button', { name: 'Undo' }).click();
    await page.locator('.ahs-toast').filter({ hasText: 'Client update cancelled' }).waitFor();
    const cancel = member.rpcCalls('practice_cancel_notice').at(-1);
    assert.equal(cancel.body.p_notice_id, call.result.noticeId);
    await page.getByRole('region', { name: 'Client updates', exact: true }).getByText('Cancelled').first().waitFor();
    // Closing needs an outcome.
    await page.getByRole('button', { name: 'Change stage' }).first().click();
    await dialog.getByLabel('New stage').selectOption('closed');
    assert.equal(await dialog.getByRole('button', { name: 'Update stage' }).isDisabled(), true, 'Closing requires an outcome');
    await dialog.getByLabel('Outcome').selectOption('withdrawn');
    assert.match(await dialog.getByTestId('email-preview-subject').innerText(), /File closed: Charge withdrawn/);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  await step('keyboard only: search, open a file, change stage', async () => {
    await visit(page, `${origin}/admin/today`);
    await waitForQuiet(page);
    await page.keyboard.press('/');
    await page.getByRole('dialog', { name: 'Search files and actions' }).waitFor();
    await page.keyboard.type('Thompson');
    await page.keyboard.press('Enter');
    await page.waitForURL(`${origin}/admin/files/general/${keys.generalDue}`);
    await waitForQuiet(page);
    const trigger = page.getByRole('button', { name: 'Change stage' }).first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Change stage' });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'stage-select', 'The stage select has focus first');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'stage-note');
    await page.keyboard.type('Decision received by mail.');
    await page.keyboard.press('Control+Enter');
    await page.locator('.ahs-toast').filter({ hasText: 'Stage updated' }).waitFor();
    const call = member.rpcCalls('practice_set_stage').at(-1);
    assert.equal(call.body.p_case_id, keys.generalDue);
    assert.equal(call.body.p_stage, 'quoted');
    assert.equal(call.body.p_note, 'Decision received by mail.');
    assert.equal(await dialog.count(), 0, 'Dialog closes after saving');
    await page.keyboard.press('Escape');
  });

  await step('request documents with suggestion chips', async () => {
    await visit(page, `${origin}/admin/files/ltb/${keys.ltbReview}`);
    await page.getByRole('heading', { name: 'Priya Raman', level: 1 }).waitFor();
    await waitForQuiet(page);
    await page.getByRole('button', { name: 'Request documents' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Request documents' });
    await dialog.waitFor();
    for (const chip of ['Signed lease', 'Rent ledger', 'N4 and certificate of service', 'Photo ID']) {
      assert.equal(await dialog.getByRole('button', { name: chip }).count(), 1, `Landlord chip ${chip}`);
    }
    await dialog.getByRole('button', { name: 'N4 and certificate of service' }).click();
    await dialog.getByRole('button', { name: 'Photo ID' }).click();
    assert.equal(await dialog.getByLabel('Message to the client').inputValue(), 'Please upload the N4 and the certificate of service.\nPlease upload a photo ID.');
    await shoot(page, 'request-documents', { full: false });
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await page.locator('.ahs-toast').filter({ hasText: 'Request sent' }).waitFor();
    const call = member.rpcCalls('practice_request_documents').at(-1);
    assert.equal(call.body.p_area, 'ltb');
    assert.equal(call.body.p_case_id, keys.ltbReview);
    await page.getByRole('region', { name: 'Client request', exact: true }).getByText(/Please upload a photo ID\./).waitFor();
  });

  await step('staff upload, share toggle and document viewer', async () => {
    const documents = page.getByRole('region', { name: 'Documents', exact: true });
    await documents.getByLabel('Document kind').selectOption('notice');
    await documents.getByLabel('Share with client').check();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await documents.getByLabel('Choose files to upload').setInputFiles({ name: 'Certificate of service.png', mimeType: 'image/png', buffer: png });
    await page.locator('.ahs-toast').filter({ hasText: '1 document added' }).waitFor();
    const add = member.rpcCalls('practice_staff_add_document').at(-1);
    assert.equal(add.body.p_kind, 'notice');
    assert.equal(add.body.p_share, true);
    const upload = member.requests.find(entry => entry.method === 'POST' && entry.path.startsWith('/storage/v1/object/ltb-documents/'));
    assert.ok(upload && upload.seq > add.seq, 'Upload goes to the registered path after practice_staff_add_document');
    const confirm = member.rpcCalls('practice_staff_confirm_document').at(-1);
    assert.ok(confirm.seq > upload.seq && confirm.body.p_document_id === add.result[0].document_id);
    // The finished upload also lingers in the Uploads progress list, so wait for the document row itself.
    await documents.getByTitle('Certificate of service.png').waitFor();
    const toggle = documents.getByRole('switch', { name: 'Share Certificate of service.png with the client' });
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await toggle.click();
    await page.locator('.ahs-toast').filter({ hasText: 'No longer shared' }).waitFor();
    assert.equal(member.rpcCalls('practice_set_document_shared').at(-1).body.p_shared, false);
    await documents.getByRole('button', { name: 'View Rent ledger.png' }).click();
    const viewer = page.getByRole('dialog', { name: 'Rent ledger.png' });
    await viewer.waitFor();
    const image = viewer.getByRole('img', { name: 'Rent ledger.png' });
    await image.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('img')].some(img => img.alt === 'Rent ledger.png' && img.complete && img.naturalWidth > 0));
    await shoot(page, 'document-viewer', { full: false });
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'detached' });
    await documents.getByRole('button', { name: 'View Signed lease 2024.pdf' }).click();
    const pdf = page.getByRole('dialog', { name: 'Signed lease 2024.pdf' });
    await pdf.locator('iframe[title="Signed lease 2024.pdf"]').waitFor();
    await page.keyboard.press('Escape');
  });

  await step('details, client registration and revoke links', async () => {
    const details = page.getByRole('region', { name: 'Tenancy and notice', exact: true });
    await details.getByLabel('Rental unit city').fill('Hamilton (Westdale)');
    await details.getByRole('button', { name: 'Save details' }).click();
    await page.locator('.ahs-toast').filter({ hasText: 'Tenancy and notice saved' }).waitFor();
    const patch = member.requests.filter(entry => entry.method === 'PATCH' && entry.table === 'ltb_cases').at(-1);
    assert.deepEqual(Object.keys(patch.body).sort(), ['field_sources', 'unit_city']);
    assert.equal(patch.body.field_sources.unit_city.source, 'staff');
    const client = page.getByRole('region', { name: 'Client', exact: true });
    await client.getByLabel('Occupation or business type').fill('Pharmacist, hospital');
    await client.getByRole('button', { name: 'Save client details' }).click();
    await page.locator('.ahs-toast').filter({ hasText: 'Client details saved' }).waitFor();
    const clientPatch = member.requests.filter(entry => entry.method === 'PATCH' && entry.table === 'ltb_clients').at(-1);
    assert.deepEqual(Object.keys(clientPatch.body).sort(), ['field_sources', 'occupation']);
    await client.getByRole('button', { name: 'Confirm registration' }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Save client details' && !button.disabled));
    await client.getByRole('button', { name: 'Confirm registration' }).click();
    await page.locator('.ahs-toast').filter({ hasText: 'Registration confirmed' }).waitFor();
    assert.equal(member.rpcCalls('ltb_set_client_registration').at(-1).body.p_status, 'registered');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Copy file number' }).waitFor();
    await shoot(page, 'more-menu', { full: false });
    await page.getByRole('menuitem', { name: 'Revoke client links' }).click();
    const confirm = page.getByRole('dialog', { name: 'Revoke client links?' });
    await confirm.waitFor();
    await shoot(page, 'revoke-confirm', { full: false });
    await confirm.getByRole('button', { name: 'Revoke links' }).click();
    await page.locator('.ahs-toast').filter({ hasText: 'Client links revoked' }).waitFor();
    assert.equal(member.rpcCalls('practice_revoke_portal_access').at(-1).body.p_client_id, state.clients[0].id);
  });

  await step('scheduled client update shows a countdown and can be cancelled', async () => {
    const scheduled = state.notices.find(item => item.case_id === keys.trafficScheduled && item.status === 'pending');
    scheduled.next_attempt_at = new Date(Date.now() + 85_000).toISOString();
    await visit(page, `${origin}/admin/files/traffic/${keys.trafficScheduled}`);
    await waitForQuiet(page);
    const updates = page.getByRole('region', { name: 'Client updates', exact: true });
    await updates.getByText('Scheduled').waitFor();
    await updates.getByText(/Sends in \d:\d{2}/).waitFor();
    await updates.getByRole('button', { name: /Cancel the stage update email/ }).click();
    await page.locator('.ahs-toast').filter({ hasText: 'Client update cancelled' }).waitFor();
  });

  await step('file held out of the client portal: badge, tooltip, reveal', async () => {
    const held = 'MAT-2026-0009';
    await visit(page, `${origin}/admin/other`);
    await page.getByRole('heading', { name: 'Other matters', level: 1 }).waitFor();
    await waitForQuiet(page);
    const board = member.requests.filter(entry => entry.method === 'GET' && entry.table === 'practice_matters' && entry.params.area === 'eq.general').at(-1);
    assert.ok(parseSelect(board.params.select).some(item => item.column === 'portal_visible'), 'Boards select portal_visible');
    if (await page.getByRole('button', { name: 'Board', exact: true }).getAttribute('aria-pressed') !== 'true') {
      await page.getByRole('button', { name: 'Board', exact: true }).click();
    }
    const card = page.locator('a.ahs-file-card', { hasText: held });
    const badge = card.locator('.ahs-hold');
    assert.equal((await badge.innerText()).trim(), PORTAL_HOLD_LABEL);
    assert.equal(await badge.getAttribute('title'), PORTAL_HOLD_HELP);
    assert.match(await card.getAttribute('aria-label'), /not shown to the client yet/);
    assert.equal(await page.locator('a.ahs-file-card .ahs-hold').count(), 1, 'Only the held file carries the badge');
    await shoot(page, 'board-held', { full: false });
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.locator('table.ahs-table tr', { hasText: held }).locator('.ahs-hold').waitFor();
    assert.equal(await page.locator('table.ahs-table .ahs-hold').count(), 1);
    await page.setViewportSize(MOBILE);
    await page.getByRole('list', { name: 'Other matters' }).locator('li', { hasText: held }).locator('.ahs-hold').waitFor();
    await checkPage(page, 'held file in the list at 390 px');
    await shoot(page, 'list-held', { full: false });
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await card.locator('.ahs-hold').waitFor();
    await checkPage(page, 'held file on the board at 390 px');
    await page.setViewportSize(DESKTOP);

    await visit(page, `${origin}/admin/files/general/${keys.generalHeld}`);
    await page.getByRole('heading', { name: 'Ethan Clarke', level: 1 }).waitFor();
    await waitForQuiet(page);
    const detail = member.requests.filter(entry => entry.method === 'GET' && entry.table === 'practice_matters' && entry.params.id === `eq.${keys.generalHeld}`).at(-1);
    assert.ok(parseSelect(detail.params.select).some(item => item.column === 'portal_visible'), 'The file page selects portal_visible');
    const headerBadge = page.locator('.ahs-hold[tabindex="0"]');
    await headerBadge.hover();
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor();
    assert.equal((await tooltip.textContent()).trim(), PORTAL_HOLD_HELP);
    await shoot(page, 'file-held', { full: false });
    // Leave the badge (Radix keeps the tooltip open while the pointer travels toward it).
    await page.mouse.move(700, 600, { steps: 4 });
    await page.mouse.move(705, 610, { steps: 2 });
    await tooltip.waitFor({ state: 'detached' });
    await headerBadge.focus();
    await page.getByRole('tooltip').waitFor();
    await page.keyboard.press('Escape');
    await headerBadge.blur();
    const stageCard = page.getByRole('region', { name: 'Stage', exact: true });
    assert.match(await stageCard.innerText(), new RegExp(PORTAL_HOLD_HELP.replace(/[.]/g, '\\.')));
    await page.setViewportSize(MOBILE);
    await waitForQuiet(page);
    await checkPage(page, 'held file at 390 px');
    await shoot(page, 'file-held', { full: false });
    await page.setViewportSize(DESKTOP);

    // Asking for documents, or a stage move out of New intake, puts the file into the client portal.
    await page.getByRole('button', { name: 'Request documents' }).first().click();
    const request = page.getByRole('dialog', { name: 'Request documents' });
    await request.getByText(`${PORTAL_HOLD_LABEL}. Sending this request adds it to the client’s files.`).waitFor();
    await request.getByRole('button', { name: 'Cancel' }).click();
    await request.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Change stage' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Change stage' });
    await dialog.getByText(`${PORTAL_HOLD_LABEL}. Moving it out of New intake adds it to the client’s files.`).waitFor();
    assert.equal(await dialog.getByLabel('New stage').inputValue(), 'under_review');
    await shoot(page, 'change-stage-held', { full: false });
    await dialog.getByRole('button', { name: 'Update stage' }).click();
    await dialog.waitFor({ state: 'detached' });
    await headerBadge.waitFor({ state: 'detached' });
    const row = state.matters.find(item => item.id === keys.generalHeld);
    assert.equal(row.portal_visible, true, 'Leaving New intake shows the file to the client');
    assert.ok(member.rpcCalls('practice_set_stage').at(-1).result.noticeId, 'The client is told once the file is shown');
    assert.equal(await stageCard.getByText(PORTAL_HOLD_LABEL).count(), 0);
  });

  await step('change client email: explanation, errors, refresh', async () => {
    const daniel = state.clients.find(item => item.email === 'd.okafor@example.com');
    await visit(page, `${origin}/admin/files/ltb/${keys.ltbRequest}`);
    await page.getByRole('heading', { name: 'Daniel Okafor', level: 1 }).waitFor();
    await waitForQuiet(page);
    // Queue a client update first, so the change has an unsent email to cancel.
    await page.getByRole('button', { name: 'Change stage' }).first().click();
    const stageDialog = page.getByRole('dialog', { name: 'Change stage' });
    await stageDialog.getByRole('button', { name: 'Update stage' }).click();
    await stageDialog.waitFor({ state: 'detached' });
    const updates = page.getByRole('region', { name: 'Client updates', exact: true });
    await updates.getByText('Scheduled', { exact: true }).waitFor();
    const queued = member.rpcCalls('practice_set_stage').at(-1).result.noticeId;

    const client = page.getByRole('region', { name: 'Client', exact: true });
    await client.getByRole('button', { name: 'Change email' }).click();
    const dialog = page.getByRole('dialog', { name: 'Change client email' });
    await dialog.getByText('The client is signed out of every link we sent, and unsent updates are cancelled. New updates go to the new address.').waitFor();
    const input = dialog.getByLabel('New email address');
    assert.equal(await input.inputValue(), 'd.okafor@example.com');
    const save = dialog.getByRole('button', { name: 'Change email' });
    assert.equal(await save.isDisabled(), true, 'The current address cannot be saved again');
    const attempt = async (value, message) => {
      await input.fill(value);
      const response = page.waitForResponse(item => item.url().endsWith('/rest/v1/rpc/practice_set_client_email'));
      await save.click();
      assert.equal((await response).status(), 400, 'A refused email change returns 400');
      await dialog.getByText(message, { exact: true }).waitFor();
      assert.equal(member.rpcCalls('practice_set_client_email').at(-1).body.p_email, value.trim());
    };
    const logged = member.errors.length;
    await attempt('daniel@okafor', 'Enter a valid email address, like name@example.com.');
    await attempt('priya.raman@example.com', 'Another client of the practice already uses this email address.');
    daniel.practice_id = 'another-practice';
    await attempt('daniel.okafor@example.org', 'This client is not available to your account.');
    daniel.practice_id = PRACTICE_ID;
    // Each refused change is a deliberate 400 from the RPC, which the browser logs as a resource error.
    const added = member.errors.splice(logged);
    const refused = added.filter(message => /status of 400 \(Bad Request\)/.test(message));
    member.errors.push(...added.filter(message => !refused.includes(message)));
    await input.fill('  Daniel.Okafor@Example.org ');
    await shoot(page, 'change-email', { full: false });
    await save.click();
    await page.locator('.ahs-toast').filter({ hasText: 'Client email changed' }).waitFor();
    const call = member.rpcCalls('practice_set_client_email').at(-1);
    assert.deepEqual(call.body, { p_client_id: daniel.id, p_email: 'Daniel.Okafor@Example.org' });
    assert.equal(call.result, 'daniel.okafor@example.org');
    await client.getByRole('link', { name: 'daniel.okafor@example.org' }).waitFor();
    await client.getByText(/Client links issued before .* were revoked\./).waitFor();
    assert.equal(state.notices.find(item => item.id === queued).failure_code, 'client_email_changed');
    await updates.getByText('Not sent. The client email changed').waitFor();
    await page.getByRole('region', { name: 'Activity', exact: true }).getByText('Client details edited').first().waitFor();
    // Boards and search use the new address.
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Search files and actions' });
    await palette.waitFor();
    await page.keyboard.type('daniel.okafor@example.org');
    await palette.getByRole('option', { name: /LTB-2026-0008/ }).waitFor();
    await page.keyboard.press('Escape');
    await page.setViewportSize(MOBILE);
    await client.getByRole('button', { name: 'Change email' }).click();
    await dialog.waitFor();
    await checkPage(page, 'change email at 390 px');
    await shoot(page, 'change-email', { full: false });
    await page.keyboard.press('Escape');
    await page.setViewportSize(DESKTOP);
  });

  await step('client update waiting to retry can be cancelled', async () => {
    const retry = state.notices.find(item => item.case_id === keys.generalOverdue && item.status === 'retry');
    retry.next_attempt_at = new Date(Date.now() + 4 * 60_000).toISOString();
    await visit(page, `${origin}/admin/files/general/${keys.generalOverdue}`);
    await page.getByRole('heading', { name: 'Northline Contracting Ltd.', level: 1 }).waitFor();
    await waitForQuiet(page);
    const updates = page.getByRole('region', { name: 'Client updates', exact: true });
    await updates.getByText('Retrying', { exact: true }).waitFor();
    await updates.getByText(/^Not sent yet\. It will be retried in \d+ min unless you cancel it\.$/).waitFor();
    await updates.scrollIntoViewIfNeeded();
    await shoot(page, 'update-retrying', { full: false });
    const response = page.waitForResponse(item => item.url().endsWith('/rest/v1/rpc/practice_cancel_notice'));
    await updates.getByRole('button', { name: 'Cancel the document shared email' }).click();
    await response;
    assert.equal(member.rpcCalls('practice_cancel_notice').at(-1).body.p_notice_id, retry.id);
    assert.equal(retry.status, 'cancelled');
    await updates.getByText('Cancelled', { exact: true }).waitFor();
  });

  await step('outcome correction on a closed file: update and Undo', async () => {
    await visit(page, `${origin}/admin/files/traffic/${keys.trafficClosed}`);
    await page.getByRole('heading', { name: 'Liam O’Connor', level: 1 }).waitFor();
    await waitForQuiet(page);
    await page.getByRole('button', { name: 'Change stage' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Change stage' });
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel('New stage').inputValue(), 'closed');
    assert.equal(await dialog.getByLabel('Outcome').inputValue(), 'withdrawn');
    assert.equal(await dialog.getByRole('button', { name: 'Update stage' }).isDisabled(), true, 'Nothing to save until the outcome changes');
    await dialog.getByLabel('Outcome').selectOption('amended');
    assert.equal(await dialog.getByRole('switch').getAttribute('aria-checked'), 'true', 'The corrected outcome is emailed by default');
    assert.match(await dialog.getByTestId('email-preview-subject').innerText(), /^TKT-2026-0015 · File closed: /);
    await dialog.getByRole('button', { name: 'Update stage' }).click();
    const toast = page.locator('.ahs-toast').filter({ hasText: 'Outcome corrected. The client update goes out in about 90 seconds.' });
    await toast.waitFor();
    await shoot(page, 'outcome-toast', { full: false });
    const call = member.rpcCalls('practice_set_stage').at(-1);
    assert.deepEqual([call.body.p_stage, call.body.p_outcome, call.body.p_notify], ['closed', 'amended', true]);
    assert.ok(call.result.noticeId, 'The correction queues a fresh client update');
    // The first delivery attempt failed: Undo still stops an update waiting to retry.
    const notice = state.notices.find(item => item.id === call.result.noticeId);
    notice.status = 'retry';
    const response = page.waitForResponse(item => item.url().endsWith('/rest/v1/rpc/practice_cancel_notice'));
    await toast.getByRole('button', { name: 'Undo' }).click();
    await response;
    assert.equal(member.rpcCalls('practice_cancel_notice').at(-1).body.p_notice_id, call.result.noticeId);
    assert.equal(notice.status, 'cancelled');
    await page.locator('.ahs-toast').filter({ hasText: 'Client update cancelled' }).last().waitFor();
    await page.getByRole('region', { name: 'Activity', exact: true }).getByText('Outcome corrected').first().waitFor();
  });

  await step('document names cannot disguise their type', async () => {
    await visit(page, `${origin}/admin/files/traffic/${keys.trafficNew}`);
    await page.getByRole('heading', { name: 'Jordan Mitchell', level: 1 }).waitFor();
    await waitForQuiet(page);
    const documents = page.getByRole('region', { name: 'Documents', exact: true });
    await documents.getByTitle('Ticket scan.pdf.exe.pdf', { exact: true }).waitFor();
    await documents.getByTitle('Court noticefdp.exe.pdf', { exact: true }).waitFor();
    const hidden = await page.evaluate(() => /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/.test(document.body.innerText));
    assert.equal(hidden, false, 'No bidi or zero-width characters reach the page');
    const downloadAs = async (button, expected) => {
      const request = member.context.waitForEvent('request', {
        predicate: item => item.method() === 'GET' && item.url().includes('/storage/v1/object/sign/') && new URL(item.url()).searchParams.has('download'),
        timeout: 15_000,
      });
      const downloaded = browser.browserType().name() === 'chromium'
        ? page.waitForEvent('download', {
          // Headless Shell downloads inline PDF previews too. Match the
          // attachment caused by this button, not a late preview download.
          predicate: item => new URL(item.url()).pathname === '/__qa__/download.pdf',
          timeout: 15_000,
        }) : null;
      await button.click();
      assert.equal(new URL((await request).url()).searchParams.get('download'), expected);
      if (downloaded) assert.equal((await downloaded).suggestedFilename(), expected);
    };
    await documents.getByRole('button', { name: 'View Court noticefdp.exe.pdf' }).click();
    const viewer = page.getByRole('dialog', { name: 'Court noticefdp.exe.pdf' });
    await viewer.locator('iframe[title="Court noticefdp.exe.pdf"]').waitFor();
    await shoot(page, 'document-safe-name', { full: false });
    await downloadAs(viewer.getByRole('button', { name: 'Download' }), 'Court noticefdp.exe.pdf');
    // Close the viewer through the same control available to staff.
    await viewer.getByRole('button', { name: 'Close', exact: true }).click();
    await viewer.waitFor({ state: 'detached' });
    await downloadAs(documents.getByRole('button', { name: 'Download Ticket scan.pdf.exe.pdf' }), 'Ticket scan.pdf.exe.pdf');
  });

  await step('new file opened by staff', async () => {
    await page.getByRole('button', { name: 'New file' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New file' });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('radio').count(), 2, 'only LTB and traffic can be opened');
    await dialog.getByText('Traffic', { exact: true }).click();
    await dialog.getByLabel('Email', { exact: true }).fill('chloe.martin@example.com');
    await dialog.getByLabel('First name').fill('Chloé');
    await dialog.getByLabel('Last name').fill('Martin');
    await dialog.getByLabel('Phone').fill('(905) 555-0170');
    await dialog.getByLabel('Ticket type').selectOption('red_light_stop');
    await dialog.getByLabel('Ticket city').fill('Hamilton');
    await shoot(page, 'new-file', { full: false });
    await dialog.getByRole('button', { name: 'Open file' }).click();
    await page.waitForURL(/\/admin\/files\/traffic\/[0-9a-f-]{36}$/);
    await page.getByRole('heading', { name: 'Chloé Martin', level: 1 }).waitFor();
    const call = member.rpcCalls('practice_create_matter').at(-1);
    assert.equal(call.body.p_practice_id, PRACTICE_ID);
    assert.equal(call.body.p_area, 'traffic');
    assert.deepEqual(call.body.p_client, { email: 'chloe.martin@example.com', firstName: 'Chloé', lastName: 'Martin', phone: '(905) 555-0170' });
    assert.equal(call.body.p_send_invite, true);
    await page.locator('.ahs-toast').filter({ hasText: 'TKT-2026-0026 opened' }).waitFor();
  });

  await step('phone layout at 390 px', async () => {
    await page.setViewportSize(MOBILE);
    for (const [route, name] of [['/admin/today', 'today'], ['/admin/landlord', 'board-ltb'], ['/admin/traffic', 'board-traffic'],
      ['/admin/other', 'board-general'], [`/admin/files/ltb/${keys.ltbReview}`, 'file-ltb'],
      [`/admin/files/traffic/${keys.trafficUploaded}`, 'file-traffic'], [`/admin/files/general/${keys.generalDue}`, 'file-general']]) {
      await visit(page, `${origin}${route}`);
      await waitForQuiet(page);
      await checkPage(page, `${route} at 390 px`);
      await shoot(page, name);
    }
    await visit(page, `${origin}/admin/landlord`);
    await waitForQuiet(page);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await checkPage(page, 'landlord list at 390 px');
    await shoot(page, 'list-ltb');
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.getByRole('button', { name: 'Open the menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /Traffic/ }).waitFor();
    await shoot(page, 'menu', { full: false });
    await page.keyboard.press('Escape');
    await visit(page, `${origin}/admin/files/traffic/${keys.trafficUploaded}`);
    await waitForQuiet(page);
    await page.getByRole('button', { name: 'Change stage' }).first().click();
    await page.getByRole('dialog', { name: 'Change stage' }).waitFor();
    await checkPage(page, 'change stage at 390 px');
    await shoot(page, 'change-stage', { full: false });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Search files' }).click();
    await page.getByRole('dialog', { name: 'Search files and actions' }).waitFor();
    await page.keyboard.type('Hamilton');
    await shoot(page, 'command-palette', { full: false });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'New file' }).click();
    await page.getByRole('dialog', { name: 'New file' }).waitFor();
    await shoot(page, 'new-file', { full: false });
    await page.keyboard.press('Escape');
    await page.setViewportSize(DESKTOP);
  });
  await finish(member);

  // 4. First run and slow network -------------------------------------------
  await step('empty practice and loading skeletons', async () => {
    const empty = await openStaffContext(browser, origin, { empty: true, fontsDir });
    await visit(empty.page, `${origin}/admin/today`);
    await empty.page.getByText('No files yet').waitFor();
    await checkPage(empty.page, 'empty Today');
    await shoot(empty.page, 'today-empty', { full: false });
    await visit(empty.page, `${origin}/admin/landlord`);
    await empty.page.getByText('No landlord files yet').waitFor();
    await shoot(empty.page, 'board-empty', { full: false });
    await finish(empty);
    const slow = await openStaffContext(browser, origin, { latencyMs: 2500, fontsDir });
    await visit(slow.page, `${origin}/admin/today`);
    await slow.page.getByRole('heading', { name: 'Today' }).waitFor();
    await slow.page.locator('.ahs-skel').first().waitFor();
    await shoot(slow.page, 'today-loading', { full: false });
    await visit(slow.page, `${origin}/admin/files/ltb/${slow.state.keyFiles.ltbReview}`);
    await slow.page.locator('.ahs-skel').first().waitFor();
    await shoot(slow.page, 'file-loading', { full: false });
    await waitForQuiet(slow.page);
    await finish(slow);
  });

  // 5. Client emails switched off -------------------------------------------
  await step('client emails off: stage dialog explains nothing is sent', async () => {
    const session = await openStaffContext(browser, origin, { updatesEnabled: false, fontsDir });
    await visit(session.page, `${origin}/admin/files/general/${session.state.keyFiles.generalDue}`);
    await session.page.getByRole('heading', { name: 'Grace Thompson', level: 1 }).waitFor();
    await waitForQuiet(session.page);
    await session.page.getByRole('button', { name: 'Change stage' }).first().click();
    const dialog = session.page.getByRole('dialog', { name: 'Change stage' });
    await dialog.getByText('Client emails are off for this practice. Nothing will be sent.').waitFor();
    assert.equal(await dialog.getByRole('switch').isDisabled(), true);
    await shoot(session.page, 'change-stage-emails-off', { full: false });
    await dialog.getByRole('button', { name: 'Update stage' }).click();
    await session.page.locator('.ahs-toast').filter({ hasText: 'Stage updated.' }).waitFor();
    assert.equal(session.rpcCalls('practice_set_stage').at(-1).body.p_notify, false);
    await finish(session);
  });

  const scoped = allRequests.filter(entry => entry.table);
  assert.ok(scoped.length > 20, 'The flow exercised the practice tables');
  for (const table of PRACTICE_TABLES) assert.ok(scoped.some(entry => entry.table === table), `The flow read ${table}`);
  log(`PASS: ${steps.length} staff workspace checks, ${scoped.length} scoped table requests, ${shots.length} screenshots`);
  return { steps, screenshots: shots, requests: allRequests };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const outDir = process.argv[2] || process.env.ANDERHUE_OUT_DIR || 'dist-anderhue';
  const screenshotDir = process.argv[3] || process.env.ANDERHUE_QA_SCREENSHOTS || null;
  const fontsDir = process.argv[4] || process.env.ANDERHUE_QA_FONTS || null;
  const server = await startStaffServer(outDir);
  const browser = await launchQaBrowser();
  try {
    await runStaffQaFlow({ origin: server.origin, browser, screenshotDir, fontsDir });
  } finally {
    await browser.close();
    await server.close();
  }
}
