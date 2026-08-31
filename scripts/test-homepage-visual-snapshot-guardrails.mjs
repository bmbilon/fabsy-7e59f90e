#!/usr/bin/env node
/** Offline regressions against the actual English homepage, never a live API. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const { publicSnapshotGuardrailIssues } = require('./validate-snapshot-guardrails.cjs');
const { redactProDriverPromotion, proDriverPromotionValues } = require('./pro-driver-promotion-guardrail.cjs');
const offers = require('../src/config/offers.json');
const feeRefund = require('../src/config/feeRefund.json');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-homepage-visual-guards-'));
const compact = value => String(value ?? '').replace(/\s+/g, '');
let checks = 0;

try {
  const bundle = path.join(temporary, 'homepage.cjs');
  await build({
    absWorkingDir: ROOT,
    stdin: { sourcefile: 'homepage-visual-render-check.tsx', resolveDir: ROOT, loader: 'tsx', contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { StaticRouter } from 'react-router-dom/server';
      import { createInstance } from 'i18next';
      import { I18nextProvider } from 'react-i18next';
      import Index from './src/pages/Index';
      import en from './src/i18n/locales/en.json';
      const i18n = createInstance();
      export function render(variables) {
        i18n.init({ lng: 'en', fallbackLng: 'en', initImmediate: false,
          interpolation: { escapeValue: false, defaultVariables: variables },
          resources: { en: { translation: en } } });
        return renderToStaticMarkup(<I18nextProvider i18n={i18n}><StaticRouter location="/"><Index /></StaticRouter></I18nextProvider>);
      }
      export const translate = key => i18n.t(key);
    ` },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: bundle, logLevel: 'silent',
    loader: { '.webp': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' },
    plugins: [{ name: 'offline-homepage', setup(builder) {
      builder.onResolve({ filter: /^@\/components\/(?:Header|Footer)$/ }, args => ({ path: args.path, namespace: 'navigation' }));
      builder.onLoad({ filter: /.*/, namespace: 'navigation' }, () => ({ contents: 'export default function Navigation() { return null; }', loader: 'js' }));
      builder.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, args => ({ path: args.path, namespace: 'no-network' }));
      builder.onLoad({ filter: /.*/, namespace: 'no-network' }, () => ({ contents: 'export const supabase = new Proxy({}, { get() { throw new Error("Network access is forbidden in homepage tests"); } });', loader: 'js' }));
    } }],
  });
  const actual = require(bundle);
  const html = actual.render({
    price: `$${offers.rapidResolution.priceCad}`, reportPrice: `$${offers.insuranceReport.priceCad}`,
    bundlePrice: `$${offers.bundle.priceCad}`, ...proDriverPromotionValues(offers).translationValues,
  });
  function issues(value, route = '/') {
    // Match the real validator pipeline: the unchanged promotion has its own
    // complete price/eligibility contract before homepage-copy admission.
    const promotion = redactProDriverPromotion(value, { offers, translate: actual.translate, code: 'en', route, required: route === '/' });
    return [...promotion.issues, ...publicSnapshotGuardrailIssues(promotion.html, route)];
  }
  function check(name, operation) { operation(); checks += 1; }
  function edit(operation) {
    const dom = new JSDOM(html);
    operation(dom.window.document);
    const result = dom.serialize();
    dom.window.close();
    assert.notEqual(result, html, 'Mutation must change the rendered homepage');
    return result;
  }
  const exactNode = (document, selector, text) => {
    const node = [...document.querySelectorAll(selector)].find(item => compact(item.textContent) === compact(text));
    assert(node, `Fixture node exists: ${text}`);
    return node;
  };

  check('actual homepage retains complete policy', () => assert.deepEqual(issues(html), []));
  check('insurance, promotion and driver remain in their required order', () => {
    const dom = new JSDOM(html);
    const insurance = dom.window.document.querySelector('section[aria-labelledby="insurance-context-heading"]');
    assert.equal(insurance.nextElementSibling.getAttribute('data-promotion'), 'pro-driver-20');
    assert.equal(insurance.nextElementSibling.nextElementSibling.id, 'back-to-your-day');
    dom.window.close();
  });

  const mutations = [
    ['missing policy', document => document.querySelector('#money-back-guarantee').remove()],
    ['missing policy condition', document => exactNode(document, '#money-back-guarantee p', feeRefund.condition).remove()],
    ['hidden policy condition', document => exactNode(document, '#money-back-guarantee p', feeRefund.condition).hidden = true],
    ['CSS-hidden policy qualification', document => exactNode(document, '#money-back-guarantee p', feeRefund.payment).classList.add('hidden')],
    ['hidden policy ancestor', document => document.querySelector('#money-back-guarantee').setAttribute('aria-hidden', 'true')],
    ['missing decline boundary', document => exactNode(document, '#money-back-guarantee p', feeRefund.declinedOfferText).remove()],
    ['missing decision-boundary copy', document => exactNode(document, 'section[aria-labelledby="homepage-outcomes-heading"] p', feeRefund.declinedOfferText).remove()],
    ['wrong full-policy destination', document => document.querySelector('#money-back-guarantee a').setAttribute('href', '/submit-ticket')],
    ['missing upfront disclosure', document => exactNode(document, '#money-back-guarantee p', feeRefund.payment).remove()],
    ['customer rejection cannot start the clock', document => {
      const node = exactNode(document, '#money-back-guarantee p', feeRefund.condition);
      assert(node.textContent.includes('receiving the rejection'));
      node.textContent = node.textContent.replace('receiving the rejection', 'your written rejection of an offer');
    }],
    ['stale offer-receipt clock', document => {
      const node = exactNode(document, '#money-back-guarantee p', feeRefund.condition);
      node.textContent = 'If a Crown offer reduces neither your original fine nor your original demerits, Fabsy refunds the service fee you paid within 30 days of receiving that offer.';
    }],
    ['wrong refund window', document => {
      const node = exactNode(document, '#money-back-guarantee p', feeRefund.condition);
      node.textContent = node.textContent.replace('30 days', '60 days');
    }],
    ['wrong bundle boundary', document => {
      const node = [...document.querySelectorAll('#money-back-guarantee p')].find(node => node.textContent.startsWith(feeRefund.scope));
      node.textContent = 'Only the Rapid Resolution portion of a bundle is refunded.';
    }],
    ['wrong hero price', document => {
      const node = document.querySelector('section[aria-labelledby="homepage-hero-heading"] strong');
      node.textContent = '$199 CAD + GST';
    }],
    ['wrong driver tax treatment', document => {
      const node = [...document.querySelectorAll('#back-to-your-day p')].find(node => node.textContent.includes('CAD + GST'));
      node.textContent = node.textContent.replace('CAD + GST', 'CAD including GST');
    }],
    ['wrong service clock', document => {
      const node = exactNode(document, 'aside[aria-labelledby="homepage-speed-heading"] p', String(offers.rapidResolution.actionCommitmentHours));
      node.textContent = '24';
    }],
    ['missing service-clock boundary', document => exactNode(document, 'aside[aria-labelledby="homepage-speed-heading"] p', offers.rapidResolution.speedDisclaimer).remove()],
    ['new guaranteed outcome', document => document.querySelector('#homepage-hero-heading').append(' A dismissal is guaranteed.')],
    ['added unsupported price', document => document.querySelector('#money-back-guarantee').insertAdjacentHTML('beforeend', '<p>The statutory fine is $79.</p>')],
    ['added unqualified headline', document => document.querySelector('main').insertAdjacentHTML('beforeend', '<p>Success guaranteed or your money back.</p>')],
    ['added hidden claim', document => exactNode(document, '#money-back-guarantee p', feeRefund.condition).insertAdjacentHTML('beforeend', '<span hidden>We guarantee a withdrawal.</span>')],
    ['added accessibility claim', document => exactNode(document, '#money-back-guarantee p', feeRefund.condition).setAttribute('aria-label', 'We guarantee a withdrawal')],
    ['added ancestor accessibility claim', document => document.querySelector('#money-back-guarantee').setAttribute('aria-label', 'We guarantee a withdrawal')],
    ['duplicated policy', document => document.querySelector('main').append(document.querySelector('#money-back-guarantee').cloneNode(true))],
  ];
  for (const [name, mutate] of mutations) check(name, () => assert(issues(edit(mutate)).length > 0, `${name} must fail`));

  for (const selector of [
    'section[aria-labelledby="homepage-hero-heading"] a[href="#money-back-guarantee"]',
    'section[aria-labelledby="homepage-outcomes-heading"] a[href="#money-back-guarantee"]',
    '#back-to-your-day a[href="#money-back-guarantee"]',
    'section[aria-labelledby="homepage-pricing-heading"] a[href="#money-back-guarantee"]',
  ]) check(`wrong internal policy link: ${selector}`, () => assert(issues(edit(document => document.querySelector(selector).setAttribute('href', '/about'))).length > 0));

  for (const route of ['/rapid-resolution', '/insurance-damage-report', '/content/speeding-ticket-alberta', '/pa/']) {
    check(`homepage admission cannot migrate to ${route}`, () => assert(issues(html, route).length > 0));
  }
  for (const claim of ['Our service is risk-free.', 'We guarantee a withdrawal.', 'Success guaranteed or your money back.']) {
    check(`unqualified claim is still rejected: ${claim}`, () => assert(publicSnapshotGuardrailIssues(`<main><p>${claim}</p></main>`, '/').length > 0));
  }
  console.log(`Homepage visual snapshot guardrails passed: ${checks} checks.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
