#!/usr/bin/env node
// Offline public UI and transaction-control regression: this never presses checkout,
// submits a form, authorizes a real matter, or verifies translation quality.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fingerprint, isLocaleReleased, LEGAL_SOURCE_DOCUMENT_PATHS, WAVE_ONE_LOCALES } from '../src/i18n/locale-policy.mjs';
import { redactProDriverPromotion } from './pro-driver-promotion-guardrail.cjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const readJson = async file => JSON.parse(await fs.readFile(path.join(repoRoot, file), 'utf8'));
const [registry, review, offers, bundleEntries, documentEntries] = await Promise.all([
  readJson('src/i18n/locales.json'),
  readJson('src/i18n/review-status.json'),
  readJson('src/config/offers.json'),
  Promise.all(WAVE_ONE_LOCALES.map(async code => [code, await readJson(`src/i18n/locales/${code}.json`)])),
  Promise.all(LEGAL_SOURCE_DOCUMENT_PATHS.map(async file => [file, fingerprint(await fs.readFile(path.join(repoRoot, file), 'utf8'))])),
]);
const bundles = Object.fromEntries(bundleEntries);
const sourceDocuments = Object.fromEntries(documentEntries);
const sourceFingerprint = fingerprint({ english: bundles.en, offers });
const releaseStates = Object.fromEntries(WAVE_ONE_LOCALES.map(code => [code, isLocaleReleased(code, review, {
  sourceVersion: registry.sourceVersion, sourceFingerprint, bundleFingerprint: fingerprint(bundles[code]), sourceDocuments,
})]));
const availableLocales = registry.locales.filter(item => item.wave <= 1 && releaseStates[item.code]);
assert.equal(availableLocales.length, 8, 'The actual publication record and current source files must release English and all seven launch languages');
assert.deepEqual(new Set(availableLocales.map(item => item.code)), new Set(WAVE_ONE_LOCALES));
const values = {
  price: `$${offers.rapidResolution.priceCad}`, reportPrice: `$${offers.insuranceReport.priceCad}`,
  bundlePrice: `$${offers.bundle.priceCad}`,
  proDiscountPercent: String(offers.proDriverPromotion.percentOff),
  proDiscountPrice: `$${((offers.rapidResolution.priceCents - Math.round(offers.rapidResolution.priceCents * offers.proDriverPromotion.percentOff / 100)) / 100).toFixed(2)}`,
  proSavings: `$${(Math.round(offers.rapidResolution.priceCents * offers.proDriverPromotion.percentOff / 100) / 100).toFixed(2)}`,
  proBundlePrice: `$${((offers.bundle.priceCents - Math.round(offers.bundle.priceCents * offers.proDriverPromotion.percentOff / 100)) / 100).toFixed(2)}`,
  email: 'hello@fabsy.ca',
};

const unexpectedCalls = [];
function forbidCall(name) {
  unexpectedCalls.push(name);
  throw new Error(`Offline language regression attempted a forbidden operation: ${name}`);
}
const virtualConsole = new VirtualConsole();
const domErrors = [];
virtualConsole.on('jsdomError', error => domErrors.push(error.message));
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://offline-fabsy.invalid/', pretendToBeVisual: true, virtualConsole,
});
const descriptors = new Map();
function installGlobal(name, value) {
  descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'File']) {
  installGlobal(name, name === 'window' ? dom.window : dom.window[name]);
}
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
// Bundled React act() uses MessageChannel instead of Node's task scheduler.
// Track those test-owned ports so successful assertions cannot leave CI open.
const channels = [];
installGlobal('MessageChannel', class extends MessageChannel {
  constructor() { super(); channels.push(this); }
});
installGlobal('__fabsyOfflineForbidCall', forbidCall);
installGlobal('fetch', () => forbidCall('fetch'));
dom.window.fetch = globalThis.fetch;
for (const name of ['XMLHttpRequest', 'WebSocket']) {
  const ForbiddenConstructor = class { constructor() { forbidCall(name); } };
  installGlobal(name, ForbiddenConstructor);
  dom.window[name] = ForbiddenConstructor;
}
Object.defineProperty(dom.window.navigator, 'sendBeacon', { configurable: true, value: () => forbidCall('sendBeacon') });
dom.window.open = () => forbidCall('window.open');

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-public-language-flow-'));
try {
  const outfile = path.join(temporary, 'public-language-flow.cjs');
  await build({
    absWorkingDir: repoRoot,
    stdin: { loader: 'tsx', resolveDir: repoRoot, sourcefile: 'public-language-flow-fixture.tsx', contents: `
      import assert from 'node:assert/strict';
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter, useLocation } from 'react-router-dom';
      import { I18nextProvider } from 'react-i18next';
      import PaymentStep from './src/components/form-steps/PaymentStep';
      import LanguageSelector from './src/components/LanguageSelector';
      import LanguageMessages from './src/components/LanguageMessages';
      import InsuranceContextSection from './src/components/InsuranceContextSection';
      import ProDriverSection from './src/components/ProDriverSection';
      import type { FormData } from './src/components/TicketForm';
      import { LocaleContext } from './src/i18n/locale-context';
      import { createLocaleInstance } from './src/i18n/instance';
      import { EDITORIAL_RETURN_STATE_KEY, editorialReturnPathFromState, localizePath } from './src/i18n/locale-policy.mjs';
      import { validateLocalizedIntakeStep } from './src/i18n/intake-validation';

      function LocationProbe() {
        const location = useLocation();
        return <output data-location-probe data-pathname={location.pathname} data-search={location.search}
          data-hash={location.hash} data-editorial-return={editorialReturnPathFromState(location.state) || ''} />;
      }

      export async function runChecks({ bundles, review, offers, availableLocales, releaseStates, values, redactProDriverPromotion }) {
        const codes = availableLocales.map(item => item.code);
        const formData: FormData = {
          sourceAssessmentId: '', sourceAssessmentAccessToken: '',
          firstName: 'Offline', lastName: 'Fixture', email: 'offline-fixture@example.invalid', phone: '4035550100',
          smsOptIn: false, address: 'Synthetic test address', city: 'Calgary', province: 'AB', postalCode: 'T2P 1A1',
          dateOfBirth: new Date('1990-01-01T12:00:00Z'), driversLicense: 'OFFLINE-TEST',
          driversLicenseImage: null, addressDifferentFromLicense: false,
          ticketNumber: 'OFFLINE-100', issueDate: new Date('2026-01-01T12:00:00Z'), location: 'Calgary',
          officer: '', officerBadge: '', offenceSection: '', offenceSubSection: '',
          offenceDescription: 'Synthetic test offence', violation: '', fineAmount: '198.00', courtDate: undefined,
          courtJurisdiction: 'Calgary', agentRepresentationPermitted: true,
          ticketImage: new File(['%PDF-1.4\\n% Synthetic offline fixture only'], 'offline-ticket.pdf', { type: 'application/pdf' }),
          vehicleSeized: false, pleaType: 'Review my options', explanation: 'This is synthetic offline test data.',
          circumstances: '', witnesses: false, witnessDetails: '', evidence: false, evidenceDetails: '', priorTickets: 'none',
          consentGiven: true, digitalSignature: 'Offline Fixture', insuranceCompany: '', vehicleDetails: '', additionalNotes: '',
        };
        for (const step of [1, 2, 3, 4]) assert.deepEqual(validateLocalizedIntakeStep(step, formData), {}, 'The offline fixture must satisfy intake validation');

        for (const item of availableLocales.filter(item => item.code !== 'en')) {
          const code = item.code;
          assert.equal(releaseStates[code], true, code + ' must use the actual released policy result');
          const instance = createLocaleInstance(code, bundles.en, bundles[code], codes, values);
          const context = {
            locale: code, basePath: '/submit-ticket', isReleased: releaseStates[code], direction: item.dir,
            href: target => localizePath(target, code), availableLocales, intakeHandoff: null,
            setIntakeHandoff: () => globalThis.__fabsyOfflineForbidCall('unexpected intake handoff'),
          };
          const container = document.createElement('div');
          document.body.append(container);
          const root = createRoot(container);
          try {
            await act(async () => root.render(
              <MemoryRouter initialEntries={[localizePath('/submit-ticket', code)]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <I18nextProvider i18n={instance}><LocaleContext.Provider value={context}>
                  <LanguageSelector /><LanguageMessages />
                  <section data-offline-payment>
                    <PaymentStep formData={formData} updateFormData={() => globalThis.__fabsyOfflineForbidCall('unexpected form data mutation')} />
                  </section>
                </LocaleContext.Provider></I18nextProvider>
              </MemoryRouter>
            ));
            assert.equal(instance.resolvedLanguage, code, code + ' must not silently render English');
            const selector = container.querySelector('select');
            assert.ok(selector, code + ' must have a language selector');
            assert.equal(selector.disabled, false);
            assert.equal(selector.value, code);
            assert.deepEqual([...selector.options].map(option => option.value), codes, code + ' must offer all eight actually released choices');
            for (const option of selector.options) {
              const expected = availableLocales.find(item => item.code === option.value);
              assert.equal(option.textContent, expected.nativeName);
              assert.equal(option.lang, expected.languageTag);
              assert.equal(option.dir, expected.dir);
            }

            assert.equal(container.querySelector('[data-translation-status="draft"]'), null);
            for (const key of ['language.draftTitle', 'language.draftBody', 'language.paymentBlocked']) {
              assert.ok(!container.textContent.includes(instance.t(key)), code + ' must not show ' + key);
            }
            const notes = container.querySelectorAll('[data-translation-status="machine-translated"]');
            if (review.locales[code].status === 'published') {
              assert.equal(notes.length, 1, code + ' must disclose machine translation once');
              assert.equal(notes[0].getAttribute('role'), 'note');
              assert.equal(notes[0].querySelector('strong')?.textContent, instance.t('language.translationNoteTitle'));
              assert.equal(notes[0].querySelector('p')?.textContent, instance.t('language.translationNoteBody'));
            } else {
              assert.equal(notes.length, 0, 'A reviewed locale must not be falsely labelled a machine publication');
            }

            const payment = container.querySelector('[data-offline-payment]');
            assert.ok(payment.textContent.includes(instance.t('checkout.termsAcceptance')));
            for (const href of ['/terms-of-purchase', '/privacy-policy']) {
              const link = payment.querySelector('a[href="' + href + '"]');
              assert.ok(link, code + ' must link to the actual English ' + href);
              assert.equal(link.lang, 'en');
              assert.ok(link.textContent.includes('(English)'));
            }
            assert.ok(payment.querySelector('a[href="/terms-of-service"]'), 'English service terms must remain accessible');
            assert.ok(payment.querySelector('a[href="/' + code + '/terms-of-service"]'), 'Localized service terms must remain accessible');
            const terms = payment.querySelector('#localized-payment-terms');
            const checkout = payment.querySelector('button');
            assert.ok(terms instanceof HTMLInputElement && terms.type === 'checkbox');
            assert.equal(terms.disabled, false, code + ' terms checkbox must be usable');
            assert.equal(terms.checked, false, code + ' purchase terms must not be preaccepted');
            assert.ok(checkout?.textContent.includes(instance.t('checkout.pay')));
            assert.equal(checkout.disabled, true, code + ' checkout must start disabled');
            // Only toggle the terms checkbox. Never click checkout or a link.
            await act(async () => terms.click());
            assert.equal(terms.checked, true);
            assert.equal(checkout.disabled, false, code + ' checkout must enable after explicit terms acceptance');
            await act(async () => terms.click());
            assert.equal(terms.checked, false);
            assert.equal(checkout.disabled, true, code + ' withdrawing terms acceptance must disable checkout again');
          } finally {
            await act(async () => root.unmount());
            container.remove();
          }
        }

        const englishInstance = createLocaleInstance('en', bundles.en, bundles.en, codes, values);
        const englishContext = {
          locale: 'en', basePath: '/blog/offline-editorial-fixture', isReleased: true, direction: 'ltr',
          href: target => localizePath(target, 'en'), availableLocales, intakeHandoff: null,
          setIntakeHandoff: () => globalThis.__fabsyOfflineForbidCall('unexpected editorial intake handoff'),
        };
        for (const editorialPath of ['/blog/offline-editorial-fixture', '/content/speeding-ticket-alberta']) {
          const container = document.createElement('div');
          document.body.append(container);
          const root = createRoot(container);
          try {
            await act(async () => root.render(
              <MemoryRouter initialEntries={[{ pathname: editorialPath, search: '?discard=1', hash: '#discard', state: { untrusted: 'discard' } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <I18nextProvider i18n={englishInstance}><LocaleContext.Provider value={{ ...englishContext, basePath: editorialPath }}>
                  <LanguageSelector /><LocationProbe />
                </LocaleContext.Provider></I18nextProvider>
              </MemoryRouter>
            ));
            const selector = container.querySelector('select');
            await act(async () => {
              selector.value = 'pa';
              selector.dispatchEvent(new Event('change', { bubbles: true }));
              await Promise.resolve();
            });
            const probe = container.querySelector('[data-location-probe]');
            assert.equal(probe.dataset.pathname, '/pa/', editorialPath + ' must hand off to the localized overview');
            assert.equal(probe.dataset.search, '', 'Editorial query parameters must not leak into the handoff');
            assert.equal(probe.dataset.hash, '', 'Editorial fragments must not leak into the handoff');
            assert.equal(probe.dataset.editorialReturn, editorialPath, 'The exact validated English return path must survive in router state');
            assert.ok(!probe.dataset.pathname.includes('/blog') && !probe.dataset.pathname.includes('/content'), 'The handoff must never invent a localized editorial route');
          } finally {
            await act(async () => root.unmount());
            container.remove();
          }
        }

        const paItem = availableLocales.find(item => item.code === 'pa');
        const paInstance = createLocaleInstance('pa', bundles.en, bundles.pa, codes, values);
        const returnPath = '/blog/offline-editorial-fixture';
        const localizedContainer = document.createElement('div');
        document.body.append(localizedContainer);
        const localizedRoot = createRoot(localizedContainer);
        try {
          await act(async () => localizedRoot.render(
            <MemoryRouter initialEntries={[{ pathname: '/pa/', state: { [EDITORIAL_RETURN_STATE_KEY]: returnPath } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <I18nextProvider i18n={paInstance}><LocaleContext.Provider value={{
                locale: 'pa', basePath: '/', isReleased: releaseStates.pa, direction: paItem.dir,
                href: target => localizePath(target, 'pa'), availableLocales, intakeHandoff: null,
                setIntakeHandoff: () => globalThis.__fabsyOfflineForbidCall('unexpected handoff intake mutation'),
              }}>
                <LanguageSelector /><LanguageMessages /><LocationProbe />
              </LocaleContext.Provider></I18nextProvider>
            </MemoryRouter>
          ));
          const notice = localizedContainer.querySelector('[data-editorial-language-handoff="true"]');
          assert.ok(notice, 'The localized overview must explain that the editorial page is unavailable in this language');
          assert.ok(notice.textContent.includes(paInstance.t('common.notFound')));
          assert.ok(notice.textContent.includes(paInstance.t('language.readEnglish')));
          assert.equal(notice.querySelector('a')?.getAttribute('href'), returnPath);
          assert.ok(localizedContainer.querySelector('[data-translation-status="machine-translated"]'), 'The machine-translation disclosure must remain visible beside the handoff');
          const selector = localizedContainer.querySelector('select');
          await act(async () => {
            selector.value = 'en';
            selector.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();
          });
          const probe = localizedContainer.querySelector('[data-location-probe]');
          assert.equal(probe.dataset.pathname, returnPath, 'Choosing English from the handoff must restore the exact editorial page');
          assert.equal(probe.dataset.editorialReturn, '', 'The consumed return path must not persist into the English page');
        } finally {
          await act(async () => localizedRoot.unmount());
          localizedContainer.remove();
        }

        // Render the actual homepage sections in every language, including the
        // English source. Inspect links and prices without following a CTA.
        const insurerNames = ['Intact Insurance', 'TD Insurance', 'Wawanesa Insurance', 'Co-operators', 'Desjardins Insurance', 'Allstate Insurance', 'Aviva Canada'];
        const promotionKeys = ['eyebrow', 'title', 'description', 'regularPrice', 'discountedPrice', 'savings', 'bundlePrice', 'claimHint', 'scope', 'cta', 'englishDetails'];
        const savingsCents = Math.round(offers.rapidResolution.priceCents * offers.proDriverPromotion.percentOff / 100);
        const discountedPrice = '$' + ((offers.rapidResolution.priceCents - savingsCents) / 100).toFixed(2);
        const discountedBundle = '$' + ((offers.bundle.priceCents - Math.round(offers.bundle.priceCents * offers.proDriverPromotion.percentOff / 100)) / 100).toFixed(2);
        const normalizeText = text => String(text).replace(/\\s+/g, ' ').trim();
        assert.equal(values.proDiscountPrice, discountedPrice);
        assert.equal(values.proBundlePrice, discountedBundle);
        assert.equal(values.proSavings, '$' + (savingsCents / 100).toFixed(2));

        for (const item of availableLocales) {
          const code = item.code;
          for (const key of promotionKeys) {
            assert.equal(typeof bundles[code].proDriver?.[key], 'string', code + ' must provide its own proDriver.' + key + ' without an English fallback');
            assert.ok(bundles[code].proDriver[key].trim(), code + ' proDriver.' + key + ' must not be blank');
          }
          const instance = createLocaleInstance(code, bundles.en, bundles[code], codes, values);
          const route = localizePath('/', code);
          const context = {
            locale: code, basePath: '/', isReleased: releaseStates[code], direction: item.dir,
            href: target => localizePath(target, code), availableLocales, intakeHandoff: null,
            setIntakeHandoff: () => globalThis.__fabsyOfflineForbidCall('unexpected homepage intake handoff'),
          };
          const container = document.createElement('div');
          document.body.append(container);
          const root = createRoot(container);
          try {
            await act(async () => root.render(
              <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <I18nextProvider i18n={instance}><LocaleContext.Provider value={context}>
                  <InsuranceContextSection /><ProDriverSection />
                </LocaleContext.Provider></I18nextProvider>
              </MemoryRouter>
            ));
            assert.equal(instance.resolvedLanguage, code);
            const insurance = container.querySelector('section[aria-labelledby="insurance-context-heading"]');
            assert.ok(insurance, code + ' must render the actual insurance context section');
            assert.equal(insurance.querySelector('h2')?.textContent, instance.t('insuranceContext.title'));
            const insurerList = insurance.querySelector('ul');
            assert.equal(insurerList?.getAttribute('aria-label'), instance.t('insuranceContext.listLabel'));
            const insurerItems = [...insurerList.querySelectorAll('li')];
            assert.deepEqual(insurerItems.map(item => item.querySelector('span')?.textContent), insurerNames, code + ' must visibly identify Allstate alongside the other six insurers');
            for (const item of insurerItems) {
              const logo = item.querySelector('img');
              assert.ok(logo?.getAttribute('src')?.startsWith('data:image/'), 'The actual bundled logo must be present without an external image request');
              assert.equal(logo.getAttribute('alt'), '');
              assert.equal(logo.getAttribute('aria-hidden'), 'true');
            }
            const allstate = insurerItems.find(item => item.querySelector('span')?.textContent === 'Allstate Insurance');
            assert.ok(allstate.querySelector('img').getAttribute('src').startsWith('data:image/svg+xml'), 'Allstate must use its actual SVG asset');
            assert.ok([...insurance.querySelectorAll('p')].some(node => node.textContent === instance.t('insuranceContext.disclaimer')), code + ' must preserve the insurance affiliation and outcome disclaimer');

            const promotion = container.querySelector('section[data-promotion="' + offers.proDriverPromotion.id + '"]');
            assert.ok(promotion, code + ' must render the actual Pro Driver section');
            assert.equal(promotion.getAttribute('aria-labelledby'), 'pro-driver-heading');
            assert.equal(promotion.querySelector('h2')?.textContent, instance.t('proDriver.title'));
            assert.ok(promotion.querySelector('h2').textContent.includes(String(offers.proDriverPromotion.percentOff)));
            assert.equal(promotion.querySelector('s')?.textContent, '$' + offers.rapidResolution.priceCad + ' CAD');
            assert.equal(promotion.querySelector('s')?.getAttribute('dir'), 'ltr');
            assert.equal(normalizeText(promotion.querySelector('p[dir="ltr"]')?.textContent), discountedPrice + ' CAD + GST', code + ' must show the configured discounted service fee with currency and GST');
            const paragraphs = [...promotion.querySelectorAll('p')];
            for (const key of ['eyebrow', 'description', 'scope', 'discountedPrice', 'savings', 'bundlePrice', 'claimHint']) {
              assert.ok(paragraphs.some(node => node.textContent === instance.t('proDriver.' + key)), code + ' must preserve its complete proDriver.' + key);
            }
            assert.ok(instance.t('proDriver.savings').includes(values.proSavings));
            assert.ok(instance.t('proDriver.savings').includes(values.price));
            assert.ok(instance.t('proDriver.bundlePrice').includes(discountedBundle), code + ' must discount the full bundle price');
            assert.equal(paragraphs.filter(node => node.textContent === instance.t('proDriver.englishDetails')).length, code === 'en' ? 0 : 1, code + ' must disclose that eligibility and claim details are in English');
            assert.ok(!/\\{\\{|\\}\\}|proDriver\\./.test(promotion.textContent), code + ' must not expose an unresolved interpolation or translation key');
            const links = [...promotion.querySelectorAll('a')];
            assert.equal(links.length, 1, code + ' must have one details CTA');
            assert.equal(links[0].getAttribute('href'), '/pro-drivers', code + ' must link to the English verified-program route without preselecting checkout eligibility');
            assert.equal(links[0].textContent, instance.t('proDriver.cta'));
            assert.equal(promotion.querySelector('form, input, select, button'), null, 'The homepage must not introduce self-attestation checkout controls');
            assert.deepEqual(redactProDriverPromotion(promotion.outerHTML, {
              offers, translate: key => instance.t(key), code, route, required: true,
            }).issues, [], code + ' actual React markup must satisfy the exact promotion snapshot contract');
          } finally {
            await act(async () => root.unmount());
            container.remove();
          }
        }
      }
    ` },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"test"' },
    loader: { '.png': 'dataurl', '.svg': 'dataurl' },
    plugins: [{ name: 'offline-language-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@\/(?:i18n\/config|integrations\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'offline-language' }));
      builder.onLoad({ filter: /.*/, namespace: 'offline-language' }, args => ({ resolveDir: repoRoot, contents: args.path.includes('/supabase/')
        ? `export const supabase = {
            functions: { invoke: () => globalThis.__fabsyOfflineForbidCall('supabase.functions.invoke') },
            storage: { from: () => globalThis.__fabsyOfflineForbidCall('supabase.storage.from') },
          };`
        // Adapt Vite's import.meta.glob loader to the exact files read above.
        // Components, i18next, the selector and the release policy stay real.
        : `import { createLocaleInstance } from './src/i18n/instance';
           export const registry = ${JSON.stringify(registry)};
           export const review = ${JSON.stringify(review)};
           export const locales = registry.locales.filter(item => item.wave <= 1);
           const bundles = ${JSON.stringify(bundles)};
           const instances = new Map();
           export function getLocaleInstance(code) { return instances.get(code); }
           export async function loadLocale(code) {
             if (!instances.has(code)) instances.set(code, createLocaleInstance(code, bundles.en, bundles[code], locales.map(item => item.code), ${JSON.stringify(values)}));
             return instances.get(code);
           }` }));
    } }],
  });
  const { runChecks } = (await import(pathToFileURL(outfile).href)).default;
  await runChecks({ bundles, review, offers, availableLocales, releaseStates, values, redactProDriverPromotion });
  assert.deepEqual(unexpectedCalls, [], 'Rendering and accepting terms must never invoke a backend, payment, or network operation');
  assert.deepEqual(domErrors, [], 'The real React DOM flow must not produce unhandled browser errors');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
  dom.window.close();
  for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
console.log('Offline public language flow passed: 7 payment steps, 8 selector choices, publication notes, explicit terms gating, English legal links, 8 actual Allstate/Pro Driver sections with scoped prices and English details CTAs, and zero backend/network calls.');
