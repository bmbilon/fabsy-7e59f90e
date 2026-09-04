#!/usr/bin/env node
/** Offline conversion-copy and mobile-CTA contract. No browser or network use. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-homepage-conversion-'));
const feeRefund = require('../src/config/feeRefund.json');
const offers = require('../src/config/offers.json');
let checks = 0;
const check = (name, operation) => { operation(); checks += 1; };

try {
  const outfile = path.join(temporary, 'homepage-conversion.cjs');
  await build({
    absWorkingDir: ROOT,
    stdin: {
      sourcefile: 'homepage-conversion-render.tsx',
      resolveDir: ROOT,
      loader: 'tsx',
      contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { StaticRouter } from 'react-router-dom/server';
        import Hero from './src/components/Hero';
        import CallBar from './src/components/CallBar';
        export const renderHero = () => renderToStaticMarkup(<StaticRouter location="/"><Hero /></StaticRouter>);
        export const renderCallBar = route => renderToStaticMarkup(<StaticRouter location={route}><CallBar /></StaticRouter>);
      `,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile,
    logLevel: 'silent',
    loader: { '.webp': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' },
  });
  const render = require(outfile);
  const parse = html => new JSDOM(html).window.document;

  const hero = parse(render.renderHero());
  check('hero uses the policy headline', () => assert.equal(hero.querySelector('#homepage-hero-heading')?.textContent, feeRefund.headline));
  check('hero states the legal-outcome boundary', () => assert.match(hero.body.textContent, /No legal outcome is guaranteed\./));
  check('hero removes the superseded promises', () => assert.doesNotMatch(hero.body.textContent, /success guaranteed|you don[’']t pay/i));
  check('hero displays the complete upfront price', () => assert.match(hero.body.textContent, new RegExp(`\\$${offers.rapidResolution.priceCad} CAD \\+ GST`)));
  check('hero CTA is measurable and enters intake', () => {
    const cta = hero.querySelector('a[data-funnel-action="primary_cta"]');
    assert.equal(cta?.getAttribute('href'), offers.rapidResolution.intakePath);
    assert.equal(cta?.getAttribute('data-funnel-position'), 'hero');
  });

  const homeBar = parse(render.renderCallBar('/'));
  check('homepage sticky CTA has action and full price', () => {
    const cta = homeBar.querySelector('a[data-funnel-action="primary_cta"]');
    assert.equal(cta?.getAttribute('href'), offers.rapidResolution.intakePath);
    assert.equal(cta?.getAttribute('data-funnel-position'), 'sticky');
    assert.equal(cta?.textContent?.trim(), `Start online · $${offers.rapidResolution.priceCad} CAD + GST`);
  });
  check('sticky CTA preserves a 44px-plus target', () => assert.match(homeBar.querySelector('a')?.className || '', /min-h-14/));

  const photoBar = parse(render.renderCallBar('/photo-radar'));
  check('photo sticky CTA keeps product routing and GST', () => {
    const cta = photoBar.querySelector('a[data-funnel-action="primary_cta"]');
    assert.equal(cta?.getAttribute('href'), offers.photoRadar.intakePath);
    assert.equal(cta?.textContent?.trim(), `Start online · $${offers.photoRadar.priceCad} CAD + GST`);
  });

  const contactBar = parse(render.renderCallBar('/about'));
  check('non-offer mobile bar uses the verified phone', () => {
    const phone = contactBar.querySelector('a[data-funnel-action="phone"]');
    assert.equal(phone?.getAttribute('href'), 'tel:+18257932279');
    assert.equal(phone?.getAttribute('data-funnel-position'), 'sticky');
    assert.match(phone?.textContent || '', /\(825\) 793-2279/);
  });

  const headerSource = fs.readFileSync(path.join(ROOT, 'src/components/Header.tsx'), 'utf8');
  check('header CTAs expose full CAD and GST context', () => {
    assert.match(headerSource, /activePriceLabel = `\$\$\{activeOffer\.priceCad\} CAD \+ GST`/);
    assert.match(headerSource, /data-funnel-action=\{isFleet \? undefined : "primary_cta"\}/);
    assert.match(headerSource, /data-funnel-position=\{isFleet \? undefined : "header"\}/);
  });
  check('header phone actions use the same verified number', () => {
    assert.match(headerSource, /const PHONE_HREF = "tel:\+18257932279"/);
    assert.ok((headerSource.match(/data-funnel-action="phone"/g) || []).length >= 2);
  });

  console.log(`Homepage conversion-readiness checks passed: ${checks}.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
