#!/usr/bin/env node
/** Deterministic public program pages only; no network, portal data or global regeneration. */
const fs = require('node:fs');
const path = require('node:path');
const offers = require('../src/config/offers.json');
const source = require('../src/config/proReferralContent.json');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://fabsy.ca';
const ROUTES = Object.freeze(['pro-drivers', 'refer']);
// This is the reviewed program percentage; the regression test compares the
// resolved copy with the frontend's PRO_DRIVER_DISCOUNT_PERCENT and prices.
const DISCOUNT_PERCENT = 20;
const pricing = Object.freeze({
  discountPercent: String(DISCOUNT_PERCENT),
  rapidPrice: (Math.round(offers.rapidResolution.priceCents * (100 - DISCOUNT_PERCENT) / 100) / 100).toFixed(2),
  bundlePrice: (Math.round(offers.bundle.priceCents * (100 - DISCOUNT_PERCENT) / 100) / 100).toFixed(2),
  regularRapidPrice: String(offers.rapidResolution.priceCad),
  regularBundlePrice: String(offers.bundle.priceCad),
});

function interpolate(value) {
  if (typeof value === 'string') return value.replace(/\{([a-zA-Z]+)\}/g, (_, key) => {
    if (!(key in pricing)) throw new Error(`Unknown public copy placeholder: ${key}`);
    return pricing[key];
  });
  if (Array.isArray(value)) return value.map(interpolate);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, interpolate(child)]));
  return value;
}

const publicContent = { pro: interpolate(source.pro), referral: source.referral };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
const paragraphs = items => items.map(item => `<p>${esc(item)}</p>`).join('\n');

function faqSchema(faqs) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) };
}

function faqMarkup(heading, faqs) {
  return `<section aria-label="${esc(heading)}"><h2>${esc(heading)}</h2>${faqs.map(({ question, answer }) => `<details><summary><h3>${esc(question)}</h3></summary><p>${esc(answer)}</p></details>`).join('\n')}</section>`;
}

function shell(route, copy, body, schemas) {
  const canonical = `${SITE}/${route}`;
  return `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(copy.title)}</title><meta name="description" content="${esc(copy.description)}"><link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow"><link rel="alternate" hreflang="en" href="${canonical}"><link rel="alternate" hreflang="x-default" href="${canonical}">
<meta property="og:title" content="${esc(copy.title)}"><meta property="og:description" content="${esc(copy.description)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(copy.title)}"><meta name="twitter:description" content="${esc(copy.description)}">
${schemas.map(schema => `<script type="application/ld+json">${safeJson(schema)}</script>`).join('\n')}
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:24px;line-height:1.7;color:#162033;overflow-wrap:break-word}a{color:#6d28d9}nav{display:flex;flex-wrap:wrap;gap:18px}section{margin:36px 0;scroll-margin-top:24px}h1{font-size:2.6rem;line-height:1.15}details{border-bottom:1px solid #ddd;padding:16px 0}summary{cursor:pointer}summary h3{display:inline;font-size:1rem}.price{font-size:1.6rem;font-weight:700}.cta{display:inline-block;background:#6d28d9;color:#fff;border-radius:8px;padding:12px 20px}footer{border-top:1px solid #ddd;padding-top:24px;font-size:.875rem}</style>
</head><body><header><nav aria-label="Main"><a href="/">Fabsy</a><a href="/services">Services</a><a href="/pro-drivers">Pro drivers</a><a href="/refer">Refer a driver</a><a href="/contact">Contact</a></nav></header>
<main>${body}</main><footer><p>Fabsy is an Alberta traffic ticket agent service, not a law firm. Government fines and trial representation are separate. No outcome is promised.</p><p><a href="/terms-of-service">Terms of Service</a> · <a href="/privacy-policy">Privacy Policy</a></p></footer></body></html>\n`;
}

function renderProDrivers() {
  const copy = publicContent.pro;
  const service = {
    '@context': 'https://schema.org', '@type': 'Service', name: copy.serviceName, url: `${SITE}/pro-drivers`,
    provider: { '@type': 'Organization', name: 'Fabsy', url: SITE },
    areaServed: { '@type': 'AdministrativeArea', name: 'Alberta, Canada' },
    description: copy.serviceDescription,
    offers: [{ name: copy.rapidLabel, price: pricing.rapidPrice }, { name: copy.bundleLabel, price: pricing.bundlePrice }].map(({ name, price }) => ({
      '@type': 'Offer', name, price, priceCurrency: 'CAD', url: `${SITE}/pro-drivers`, description: copy.offerDescription,
      priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'CAD', valueAddedTaxIncluded: false },
    })),
  };
  const intake = `${offers.rapidResolution.intakePath}?ticket_type=officer_issued`;
  return shell('pro-drivers', copy, `
<section><p>${esc(copy.badge)}</p><h1>${esc(copy.heading)}</h1><p>${esc(copy.intro)}</p><a class="cta" href="${esc(intake)}">Upload your ticket</a><p>${esc(copy.scope)}</p>
<h2>${esc(copy.pricingLabel)}</h2><p>${esc(copy.pricingHeading)}</p><h3>${esc(copy.rapidLabel)}</h3><p class="price">$${pricing.rapidPrice} CAD + GST</p><p>${esc(copy.rapidRegularLine)}</p><h3>${esc(copy.bundleLabel)}</h3><p class="price">$${pricing.bundlePrice} CAD + GST</p>${paragraphs([copy.bundleRegularLine, copy.bundleNote])}</section>
<section aria-labelledby="pro-eligibility"><h2 id="pro-eligibility">${esc(copy.eligibilityHeading)}</h2><p>${esc(copy.eligibilityIntro)}</p>${copy.licenceClasses.map(item => `<h3>${esc(item.licence)}: ${esc(item.title)}</h3><p>${esc(item.detail)}</p>`).join('\n')}<p>${esc(copy.exclusions)}</p></section>
<section aria-labelledby="pro-work"><h2 id="pro-work">${esc(copy.abstractHeading)}</h2><p>${esc(copy.abstractText)}</p><p><a href="${esc(copy.abstractSource.url)}">${esc(copy.abstractSource.title)}</a></p><h3>${esc(copy.amendmentHeading)}</h3>${paragraphs([copy.amendmentText, copy.outcomeDisclaimer])}</section>
<section aria-labelledby="pro-verification"><h2 id="pro-verification">${esc(copy.verificationHeading)}</h2><ol>${copy.verificationSteps.map(item => `<li><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></li>`).join('\n')}</ol><h3>${esc(copy.unverifiedHeading)}</h3><p>${esc(copy.unverifiedText)}</p><p><a class="cta" href="${esc(intake)}">Start Rapid Resolution</a></p><p><a href="/terms-of-service#pro-driver-terms">Read the pro driver terms</a></p></section>
${faqMarkup('Pro driver questions', copy.faqs)}`, [service, faqSchema(copy.faqs)]);
}

function renderRefer() {
  const copy = publicContent.referral;
  return shell('refer', copy, `
<section><p>${esc(copy.badge)}</p><h1>${esc(copy.heading)}</h1><p>${esc(copy.intro)}</p><a class="cta" href="/portal/referrals">Get your referral link</a><p><a href="#referral-terms">See the terms</a></p>${copy.rewards.map(item => `<h2>${esc(item.label)}</h2><p class="price">$${item.amount} CAD</p>`).join('\n')}<p>${esc(copy.scope)}</p></section>
<section aria-labelledby="referral-process"><h2 id="referral-process">${esc(copy.processHeading)}</h2>${copy.steps.map(item => `<h3>${esc(item.title)}</h3><p>${esc(item.text)}</p>`).join('\n')}</section>
<section id="referral-terms"><h2>${esc(copy.termsHeading)}</h2><p>${esc(copy.termsEffective)}</p>${copy.rules.map(item => `<h3>${esc(item.title)}</h3><p>${esc(item.text)}</p>`).join('\n')}<p>${esc(copy.termsPrivacy)} See <a href="/terms-of-service#referral-terms">Terms of Service section 5E</a> and our <a href="/privacy-policy">Privacy Policy</a>.</p></section>
${faqMarkup('Referral questions', copy.faqs)}
<section><h2>${esc(copy.signupHeading)}</h2><p>${esc(copy.signupText)}</p><a class="cta" href="/portal/referrals">Open Refer a driver</a></section>`, [{ '@context': 'https://schema.org', '@type': 'WebPage', name: copy.schemaName, description: copy.schemaDescription, url: `${SITE}/refer` }, faqSchema(copy.faqs)]);
}

function generateProReferralSnapshots(outDir = path.join(ROOT, 'public/prerendered'), routes = ROUTES) {
  if (!Array.isArray(routes) || !routes.length || routes.some(route => !ROUTES.includes(route)) || new Set(routes).size !== routes.length) {
    throw new Error('Only unique public snapshot routes pro-drivers and refer are allowed.');
  }
  const renderers = { 'pro-drivers': renderProDrivers, refer: renderRefer };
  const rendered = routes.map(route => ({ file: path.join(outDir, route, 'index.html'), html: renderers[route]() }));
  for (const { file, html } of rendered) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html, 'utf8');
  }
  return rendered.length;
}

if (require.main === module) {
  const routes = process.argv.slice(2).map(route => route.replace(/^\//, ''));
  try {
    const count = generateProReferralSnapshots(process.env.PRO_REFERRAL_SNAPSHOT_OUT_DIR, routes.length ? routes : ROUTES);
    console.log(`Generated ${count} public pro/referral snapshot(s).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { ROUTES, publicContent, pricing, faqSchema, renderProDrivers, renderRefer, generateProReferralSnapshots };
