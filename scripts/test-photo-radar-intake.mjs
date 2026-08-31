import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Exercise the real React screens without mounting browser effects or allowing
// any backend request. Test fixtures are synthetic and never submitted.
const directory = await mkdtemp(join(tmpdir(), "fabsy-photo-radar-intake-"));
try {
  const bundle = join(directory, "intake-render-tests.cjs");
  await build({
    absWorkingDir: resolve(import.meta.dirname, ".."),
    stdin: {
      sourcefile: "photo-radar-intake-render-tests.tsx",
      resolveDir: resolve(import.meta.dirname, ".."),
      loader: "tsx",
      contents: `
        import assert from 'node:assert/strict';
        import test from 'node:test';
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { StaticRouter } from 'react-router-dom/server';
        import { createInstance } from 'i18next';
        import { I18nextProvider } from 'react-i18next';
        import PaymentStep from './src/components/form-steps/PaymentStep';
        import ReviewStep from './src/components/form-steps/ReviewStep';
        import ConsentStep from './src/components/form-steps/ConsentStep';
        import DefenseStep from './src/components/form-steps/DefenseStep';
        import TicketDetailsStep from './src/components/form-steps/TicketDetailsStep';
        import TicketTypeFields from './src/components/TicketTypeFields';
        import { ticketDateFromExtraction, ticketDateAsLocalDate } from './src/lib/ticket/ticketType';

        const noop = () => {};
        const base = {
          firstName: 'Example', lastName: 'Owner', email: 'example@example.invalid', phone: '7805550100',
          address: '1 Example Street', city: 'Edmonton', province: 'Alberta', postalCode: 'T5J 0N3',
          driversLicense: 'SYNTHETIC', dateOfBirth: new Date('1980-01-01T12:00:00'),
          ticketNumber: 'SYNTHETIC-NOT-A-TICKET', issueDate: new Date('2026-06-01T12:00:00'),
          violation: 'Owner of Motor Vehicle Involved', fineAmount: '200', offenceSection: '160', offenceSubSection: '(1)',
          offenceDescription: 'Owner of Motor Vehicle Involved', location: 'Example intersection', officer: '', officerBadge: '',
          insuranceCompany: 'Stale insurance data must stay hidden', explanation: '', circumstances: '', additionalNotes: '',
          sourceAssessmentId: '', sourceAssessmentAccessToken: '', ticketImage: null,
          pleaType: 'not_guilty', consentGiven: false, digitalSignature: '', ticketTypeSource: 'manual',
          registeredOwnerOnOffenceDate: 'yes', ticketType: 'photo_radar',
        };
        const i18n = createInstance();
        i18n.init({ lng: 'en', initImmediate: false, resources: { en: { translation: {} } } });
        const render = element => renderToStaticMarkup(<I18nextProvider i18n={i18n}><StaticRouter location="/submit-ticket">{element}</StaticRouter></I18nextProvider>);

        test('photo checkout displays exact base, tax and total without an insurance upsell', () => {
          const html = render(<PaymentStep formData={base} updateFormData={noop} />);
          assert.ok(html.includes('$79 + 5% GST ($82.95 total)'));
          assert.ok(html.includes('$79 + GST'));
          assert.ok(html.includes('GST is $3.95'));
          assert.ok(html.includes('You approve any deal. No trial. No success fee.'));
          assert.ok(!html.includes('id="idr-addon"'));
          assert.ok(!html.includes('id="insurance-company"'));
          assert.ok(!html.includes('Stale insurance data'));
          assert.ok(!html.includes('$198'));
        });

        test('officer checkout keeps the existing report option and $198 base price', () => {
          const html = render(<PaymentStep formData={{ ...base, ticketType: 'officer_issued', registeredOwnerOnOffenceDate: '' }} updateFormData={noop} />);
          assert.ok(html.includes('id="idr-addon"'));
          assert.ok(html.includes('id="insurance-company"'));
          assert.ok(html.includes('198'));
          assert.ok(!html.includes('$82.95'));
        });

        test('review and authorization agree on the Photo Radar price and controlled scope', () => {
          const review = render(<ReviewStep formData={base} onSubmit={noop} />);
          const consent = render(<ConsentStep formData={base} updateFormData={noop} />);
          for (const html of [review, consent]) {
            assert.ok(html.includes('Rapid Resolution: Photo Radar'));
            assert.ok(html.includes('$79 + 5% GST ($82.95 total)'));
            assert.ok(!html.includes('$198'));
            assert.ok(!html.includes('Stale insurance data'));
          }
          assert.ok(consent.includes('Enter a not-guilty plea'));
          assert.ok(consent.includes('within 30 days of receiving the rejection'));
          assert.ok(consent.includes('If the Crown rejects'));
          assert.ok(consent.includes('efforts to reduce the original fine or obtain a withdrawal'));
          assert.ok(consent.includes('neither improvement is obtained'));
          assert.ok(consent.includes('Payment does not start the 30-day refund clock'));
          assert.ok(!consent.includes('within 30 days of receiving that offer'));
          assert.ok(consent.includes('service fee is paid upfront'));
          assert.ok(!consent.includes('fee is not refunded based on outcome'));
          assert.ok((consent.match(/<a[^>]+>/g) || []).some(link =>
            link.includes('href="/terms-of-service#fee-refund-guarantee"') &&
            link.includes('target="_blank"') && link.includes('rel="noopener noreferrer"')));
          assert.ok(consent.includes('final resolution step that I expressly authorize'));
        });

        test('Photo Radar account step does not request a driving record or a guilty plea choice', () => {
          const html = render(<DefenseStep formData={base} updateFormData={noop} />);
          assert.ok(html.includes('$79 + 5% GST ($82.95 total)'));
          assert.ok(html.includes('Anything else we should know? (optional)'));
          assert.ok(!html.includes('Guilty with Explanation'));
          assert.ok(!html.includes('Have you received any traffic tickets'));
          assert.ok(!html.includes('How do you wish to plead?'));
        });

        test('owner choices remain visible and a sold vehicle becomes a review flag', () => {
          const html = render(<TicketTypeFields ticketType="photo_radar" ticketTypeSource="manual" registeredOwnerOnOffenceDate="sold_before" onTicketTypeChange={noop} onOwnerChange={noop} />);
          assert.ok(html.includes('Was this vehicle registered to you on the offence date?'));
          assert.ok(html.includes('Sold before'));
          assert.ok(html.includes('Stolen'));
          assert.ok(html.includes('does not by itself guarantee a withdrawal'));
        });

        test('camera details show the offence date rather than the later issue date', () => {
          const captured = { offenceDate: '2025-03-31', issueDate: '2025-04-14' };
          const issueDate = ticketDateAsLocalDate(ticketDateFromExtraction(captured, 'photo_radar'));
          const html = render(<TicketDetailsStep formData={{ ...base, issueDate, vehicleSeized: true }} updateFormData={noop} />);
          assert.ok(html.includes('Offence Date *'));
          assert.ok(html.includes('Mar 31, 2025'));
          assert.ok(!html.includes('Apr 14, 2025'));
          assert.ok(html.includes('Notice details'));
          assert.ok(html.includes('not its issue or mailing date'));
          assert.ok(!html.includes('Officer Details'));
          assert.ok(!html.includes('id="vehicleSeized"'));
          assert.ok(!html.includes('My vehicle was seized'));
        });

        test('an unreadable photo offence date stays blank and officer controls remain unchanged', () => {
          const issueDate = ticketDateAsLocalDate(ticketDateFromExtraction({ issueDate: '2025-04-14' }, 'photo_radar'));
          const photo = render(<TicketDetailsStep formData={{ ...base, issueDate }} updateFormData={noop} />);
          assert.ok(!photo.includes('Apr 14, 2025'));
          assert.ok(photo.includes('Enter it manually if the scan could not read it.'));
          const officer = render(<TicketDetailsStep formData={{ ...base, ticketType: 'officer_issued', registeredOwnerOnOffenceDate: '' }} updateFormData={noop} />);
          assert.ok(officer.includes('Issue Date *'));
          assert.ok(officer.includes('Officer Details'));
          assert.ok(officer.includes('id="vehicleSeized"'));
        });
      `,
    },
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [{
      name: "disable-backend-for-intake-tests",
      setup(build) {
        build.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: "disabled-backend", namespace: "test-backend" }));
        build.onLoad({ filter: /.*/, namespace: "test-backend" }, () => ({ contents: "export const supabase = { functions: { invoke() { throw new Error('Backend access is disabled in intake tests'); } } };", loader: "js" }));
      },
    }],
  });
  await import(pathToFileURL(bundle).href);
} finally {
  await rm(directory, { recursive: true, force: true });
}
