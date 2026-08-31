#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fingerprint, isLocaleReleased, LEGAL_SOURCE_DOCUMENT_PATHS, localizePath, normalizeLocale, preferredLocale, splitLocalePath, WAVE_ONE_LOCALES } from '../src/i18n/locale-policy.mjs';

assert.equal(localizePath('/rapid-resolution?utm_source=community#fees', 'pa'), '/pa/rapid-resolution?utm_source=community#fees');
assert.equal(localizePath('/pa/faq?gclid=example#answer', 'tl'), '/tl/faq?gclid=example#answer');
assert.equal(localizePath('/ar/?utm_source=radio', 'en'), '/?utm_source=radio');
assert.equal(localizePath('/zh-hans', 'zh-hant'), '/zh-hant/');
assert.equal(localizePath('//untrusted.example/path', 'pa'), '/');
for (const input of ['/pa//untrusted.example/path', '/pa/\\untrusted.example/path', '/pa/\\/untrusted.example/path']) {
  const target = localizePath(splitLocalePath(input).path, 'en');
  assert.equal(new URL(target, 'https://fabsy.ca').origin, 'https://fabsy.ca', 'Locale fallback must remain on Fabsy');
}
assert.equal(localizePath('https://example.com/', 'pa'), 'https://example.com/');
assert.deepEqual(splitLocalePath('/pa/faq/'), { locale: 'pa', path: '/faq', hasLocalePrefix: true });
assert.deepEqual(splitLocalePath('/portal/cases'), { locale: 'en', path: '/portal/cases', hasLocalePrefix: false });
assert.equal(splitLocalePath('/ur/').hasLocalePrefix, false, 'Wave 2 must not silently publish empty pages');
assert.equal(normalizeLocale('zh-HK'), 'zh-hant');
assert.equal(normalizeLocale('zh-Hans-HK'), 'zh-hans');
assert.equal(normalizeLocale('zh-Hant-CN'), 'zh-hant');
assert.equal(normalizeLocale('fil-PH'), 'tl');
assert.equal(normalizeLocale('pa-Arab-PK'), null);
assert.equal(normalizeLocale('pa-Guru-IN'), 'pa');
assert.equal(preferredLocale('en;q=0.4, pa-IN;q=0.9, ar;q=0'), 'pa');
assert.equal(preferredLocale(['en-CA', 'pa']), 'en', 'Do not offer a secondary language over preferred English');
assert.equal(preferredLocale('pa;q=0,tl;q=0.7'), 'tl');
assert.equal(preferredLocale('pa, en;q=0.8', ['en']), 'en');
assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
const sourceDocuments = { 'src/pages/TermsOfService.tsx': 'terms-fixture', 'src/pages/TermsOfPurchase.tsx': 'purchase-fixture', 'src/components/form-steps/ConsentStep.tsx': 'consent-fixture' };
assert.deepEqual(new Set(LEGAL_SOURCE_DOCUMENT_PATHS), new Set(Object.keys(sourceDocuments)), 'Both legal agreements and the consent document must participate in approval');
const expected = { sourceVersion: 'v1', sourceFingerprint: 'source', bundleFingerprint: 'bundle', sourceDocuments };
const approval = { sourceVersion: 'v1', locales: { pa: { status: 'approved', reviewedBy: 'Test reviewer', reviewedAt: '2026-08-30', sourceFingerprint: 'source', bundleFingerprint: 'bundle', serviceReady: true, sourceDocuments } } };
assert.equal(isLocaleReleased('en', {}, expected), true);
assert.equal(isLocaleReleased('pa', approval, expected), true);
assert.equal(isLocaleReleased('ur', approval, expected), false);
assert.equal(isLocaleReleased('pa', approval, { ...expected, bundleFingerprint: 'changed translation' }), false);
assert.equal(isLocaleReleased('pa', approval, { ...expected, sourceFingerprint: 'changed offer' }), false);
assert.equal(isLocaleReleased('pa', approval, { ...expected, sourceDocuments: { ...sourceDocuments, 'src/pages/TermsOfService.tsx': 'changed terms' } }), false);
assert.equal(isLocaleReleased('pa', approval, { ...expected, sourceDocuments: { ...sourceDocuments, 'src/pages/TermsOfPurchase.tsx': 'changed written-order protections' } }), false);
const incompleteDocuments = { ...sourceDocuments };
delete incompleteDocuments['src/pages/TermsOfPurchase.tsx'];
assert.equal(isLocaleReleased('pa', { ...approval, locales: { pa: { ...approval.locales.pa, sourceDocuments: incompleteDocuments } } }, { ...expected, sourceDocuments: incompleteDocuments }), false, 'Matching incomplete records must not bypass purchase-term review');
for (const patch of [{ status: 'draft' }, { serviceReady: false }, { reviewedBy: null }, { reviewedAt: 'invalid' }]) {
  assert.equal(isLocaleReleased('pa', { ...approval, locales: { pa: { ...approval.locales.pa, ...patch } } }, expected), false);
}

// The owner may publish machine translations without asserting that a native
// reviewer or staffed language service exists. The exact-copy checks still hold.
const ownerPublication = {
  sourceVersion: expected.sourceVersion,
  locales: Object.fromEntries(WAVE_ONE_LOCALES.filter(code => code !== 'en').map(code => [code, {
    status: 'published', reviewedBy: null, reviewedAt: null, serviceReady: false,
    sourceFingerprint: expected.sourceFingerprint, bundleFingerprint: expected.bundleFingerprint, sourceDocuments,
    publication: { basis: 'owner_authorized_machine_translation', authorizedBy: 'Offline fixture owner', authorizedAt: '2026-08-31T00:00:00Z' },
  }])),
};
for (const code of WAVE_ONE_LOCALES.filter(code => code !== 'en')) {
  assert.equal(isLocaleReleased(code, ownerPublication, expected), true, `${code} owner publication must work without a claimed native review`);
  assert.equal(ownerPublication.locales[code].reviewedBy, null);
  assert.equal(ownerPublication.locales[code].serviceReady, false);
}
for (const patch of [{ publication: undefined }, { status: 'draft' }, { sourceFingerprint: 'stale' }, { bundleFingerprint: 'stale' }, { sourceDocuments: incompleteDocuments }]) {
  const record = { ...ownerPublication, locales: { ...ownerPublication.locales, pa: { ...ownerPublication.locales.pa, ...patch } } };
  assert.equal(isLocaleReleased('pa', record, expected), false, 'Publishing must not waive the explicit authorization or exact-copy checks');
}
for (const patch of [{ basis: 'automatic' }, { authorizedBy: '' }, { authorizedAt: 'invalid' }]) {
  const entry = ownerPublication.locales.pa;
  const record = { ...ownerPublication, locales: { pa: { ...entry, publication: { ...entry.publication, ...patch } } } };
  assert.equal(isLocaleReleased('pa', record, expected), false);
}
for (const file of LEGAL_SOURCE_DOCUMENT_PATHS) {
  assert.equal(isLocaleReleased('pa', ownerPublication, { ...expected, sourceDocuments: { ...sourceDocuments, [file]: 'changed agreement' } }), false);
}
assert.equal(isLocaleReleased('ur', ownerPublication, expected), false);
assert.equal(isLocaleReleased('pa', ownerPublication, { ...expected, sourceVersion: 'changed source version' }), false);

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-i18n-tests-'));
try {
  const runtimeFile = path.join(temporary, 'locale-instance.cjs');
  await build({ entryPoints: ['src/i18n/instance.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: runtimeFile, logLevel: 'silent' });
  const { createLocaleInstance } = (await import(pathToFileURL(runtimeFile).href)).default;
  const readBundle = async code => JSON.parse(await fs.readFile(`src/i18n/locales/${code}.json`, 'utf8'));
  const english = await readBundle('en');
  for (const code of WAVE_ONE_LOCALES) {
    const bundle = await readBundle(code);
    const instance = createLocaleInstance(code, english, bundle, [...WAVE_ONE_LOCALES], { price: '$198', reportPrice: '$49', bundlePrice: '$229', email: 'hello@fabsy.ca' });
    assert.equal(instance.resolvedLanguage, code, `${code} must not resolve to the English fallback`);
    assert.equal(instance.t('home.title'), bundle.home.title, `${code} must render its native homepage`);
    assert.equal(instance.t('language.selector'), bundle.language.selector);
    assert.equal(instance.t('intake.consent.confirm'), bundle.intake.consent.confirm);
    assert.ok(!instance.t('checkout.scope').includes('{{'), `${code} offer interpolation must resolve`);
  }
  // Render the actual route and document component. Isolate unrelated shell and
  // intake components; keep React Router, i18next, links and locale context real.
  const registry = JSON.parse(await fs.readFile('src/i18n/locales.json', 'utf8'));
  const review = JSON.parse(await fs.readFile('src/i18n/review-status.json', 'utf8'));
  const handoffFile = path.join(temporary, 'purchase-handoff.cjs');
  await build({
    stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { StaticRouter } from 'react-router-dom/server';
      import { Route, Routes } from 'react-router-dom';
      import { I18nextProvider } from 'react-i18next';
      import LocalizedPage from './src/pages/LocalizedPage';
      import { LocaleContext } from './src/i18n/locale-context';
      import { createLocaleInstance } from './src/i18n/instance';
      import { localizePath } from './src/i18n/locale-policy.mjs';
      import { lastHead } from '@/hooks/useSafeHead';
      export function render(code, english, bundle, basePath, isReleased = false) {
        const instance = createLocaleInstance(code, english, bundle, [code, 'en'], { price: '$198', reportPrice: '$49', bundlePrice: '$229', email: 'hello@fabsy.ca' });
        const context = { locale: code, basePath, isReleased, direction: code === 'ar' ? 'rtl' : 'ltr', href: path => localizePath(path, code), availableLocales: [], intakeHandoff: null, setIntakeHandoff: () => undefined };
        const html = renderToStaticMarkup(<StaticRouter location={localizePath(basePath, code) + '?source=review#purchase'}><I18nextProvider i18n={instance}><LocaleContext.Provider value={context}><Routes><Route path="/:locale/*" element={<LocalizedPage />} /></Routes></LocaleContext.Provider></I18nextProvider></StaticRouter>);
        return { html, head: lastHead };
      }
    ` },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: handoffFile, logLevel: 'silent',
    plugins: [{ name: 'purchase-route-boundary', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (['@/components/Header', '@/components/Footer'].includes(args.path)) return { path: 'empty-shell', namespace: 'purchase-fixture' };
        if (['./TicketFormPage', './LocalizedPaymentReturn', './NotFound'].includes(args.path) && args.importer.endsWith('/src/pages/LocalizedPage.tsx')) return { path: 'empty-shell', namespace: 'purchase-fixture' };
        if (args.path === '@/i18n/config' || args.path === '@/hooks/useSafeHead') return { path: args.path, namespace: 'purchase-fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'purchase-fixture' }, args => ({ contents: args.path === 'empty-shell'
        ? 'export default function Shell() { return null; }'
        : args.path === '@/hooks/useSafeHead'
          ? 'export let lastHead; export default function useSafeHead(value) { lastHead = value; }'
          : 'export const registry = ' + JSON.stringify(registry) + '; export const review = ' + JSON.stringify(review) + ';' }));
    } }],
  });
  const { render: renderLocalizedRoute } = (await import(pathToFileURL(handoffFile).href)).default;
  for (const code of WAVE_ONE_LOCALES.filter(code => code !== 'en')) {
    const bundle = await readBundle(code);
    const { html, head } = renderLocalizedRoute(code, english, bundle, '/terms-of-purchase');
    assert.match(html, /data-purchase-terms-handoff="english"/, `${code} purchase route must render a handoff, not a redirect`);
    assert.match(html, /href="\/terms-of-purchase\?source=review#purchase"/, `${code} must link to the actual English purchase document and preserve the URL suffix`);
    assert.match(html, /data-translation-status="draft"/);
    assert.ok(html.includes(bundle.language.readEnglish), `${code} handoff link must use the native English-version label`);
    assert.match(html, /<h1[^>]*lang="en"[^>]*dir="ltr"[^>]*>Terms of Purchase \(English\)<\/h1>/);
    assert.doesNotMatch(html, /<h2\b/, 'Purchase handoff must not render service terms as a translated purchase agreement');
    assert.equal(head.canonical, `https://fabsy.ca/${code}/terms-of-purchase`);
    assert.match(head.robots, /noindex/);
    const approved = renderLocalizedRoute(code, english, bundle, '/terms-of-purchase', true);
    assert.match(approved.head.robots, /noindex/, 'Interface approval must not publish untranslated purchase terms');
    assert.doesNotMatch(approved.html, /data-translation-status="draft"/, 'A future approved interface must not be falsely called a draft');
    const service = renderLocalizedRoute(code, english, bundle, '/terms-of-service');
    assert.ok(service.html.includes(bundle.terms.title), `${code} service terms must retain their own document title`);
    assert.match(service.html, new RegExp('href="/' + code + '/terms-of-purchase"'), `${code} service terms must link to the purchase handoff`);
    assert.equal((service.html.match(/<h2\b/g) || []).length, 16, 'The complete service-term sections must remain intact');
  }
  const outfile = path.join(temporary, 'intake-validation.mjs');
  await build({ entryPoints: ['src/i18n/intake-validation.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  const { validateLocalizedIntakeStep: validate, buildIntakeAdditionalNotes, buildIntakeDefenseStrategy, LOCALIZED_INTAKE_FIELD_LIMITS: limits } = await import(pathToFileURL(outfile).href);
  const valid = {
    sourceAssessmentId: '', ticketImage: { name: 'test-ticket.pdf', size: 128, type: 'application/pdf' },
    ticketNumber: 'TEST-100', location: 'Calgary', offenceDescription: 'Test offence', fineAmount: '$198.00',
    issueDate: new Date('2026-01-01T12:00:00Z'), courtDate: undefined, vehicleSeized: false,
    firstName: 'Test', lastName: 'Driver', email: 'test@example.com', phone: '4035550100', driversLicense: 'TEST',
    address: 'Test address', city: 'Calgary', province: 'AB', postalCode: 'T2P 1A1', dateOfBirth: new Date('1990-01-01T12:00:00Z'),
    pleaType: 'ਮੈਂ ਆਪਣੇ ਵਿਕਲਪ ਜਾਣਨਾ ਚਾਹੁੰਦਾ ਹਾਂ', explanation: 'ਇਹ ਟੈਸਟ ਲਈ ਹੈ।', consentGiven: true, digitalSignature: 'Test Driver',
  };
  for (const step of [1, 2, 3, 4]) assert.deepEqual(validate(step, valid), {});
  assert.ok(validate(1, { ...valid, ticketImage: null }).ticketImage);
  assert.ok(validate(1, { ...valid, fineAmount: 'NaN' }).fineAmount);
  assert.ok(validate(1, { ...valid, fineAmount: '-1' }).fineAmount);
  assert.ok(validate(1, { ...valid, ticketImage: { name: 'fake.pdf', type: 'text/html', size: 100 } }).ticketImage);
  assert.ok(validate(1, { ...valid, vehicleSeized: true }).vehicleSeized);
  assert.ok(validate(2, { ...valid, email: 'not-email' }).email);
  assert.ok(validate(2, { ...valid, phone: '123' }).phone);
  assert.ok(validate(2, { ...valid, dateOfBirth: new Date('invalid') }).dateOfBirth);
  assert.ok(validate(3, { ...valid, explanation: '   ' }).explanation);
  assert.ok(validate(4, { ...valid, consentGiven: false }).consentGiven);
  assert.ok(validate(4, { ...valid, digitalSignature: 'Different Person' }).digitalSignature);
  assert.equal(valid.explanation, 'ਇਹ ਟੈਸਟ ਲਈ ਹੈ।', 'Validation must preserve original native text');
  const packed = {
    ...valid,
    ...Object.fromEntries(['additionalNotes', 'offenceSection', 'offenceSubSection', 'officer', 'officerBadge', 'location', 'pleaType', 'explanation', 'circumstances'].map(key => [key, 'ਪ'.repeat(limits[key])])),
  };
  assert.deepEqual(validate(3, packed), {});
  assert.ok(buildIntakeAdditionalNotes(packed).length <= 2000, 'Valid combined notes must fit the submit-ticket API budget, including labels');
  assert.ok(buildIntakeDefenseStrategy(packed).length <= 1000, 'Valid account fields must fit the submit-ticket API budget, including labels');
  assert.ok(buildIntakeAdditionalNotes(packed).includes(packed.additionalNotes), 'Packing must not truncate the original notes');
  assert.equal(validate(3, { ...packed, additionalNotes: packed.additionalNotes + 'ਪ' }).additionalNotes, 'intake.validation.length', 'Overlong route-state prefills must fail before submission');
  assert.equal(validate(1, { ...valid, courtJurisdiction: 'A'.repeat(201) }).courtJurisdiction, 'intake.validation.length');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
console.log('i18n runtime dictionaries, routing, English purchase handoffs, language negotiation, reviewed/owner publication gates and intake validation passed.');
