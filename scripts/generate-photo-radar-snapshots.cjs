#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const offers = require('../src/config/offers.json');
const content = require('../src/config/photoRadarContent.json');
const feeRefund = require('../src/config/feeRefund.json');
const fleet = require('../src/config/fleetContent.json');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://fabsy.ca';
const ROUTES = ['photo-radar', 'fleet', 'free-ticket-check'];
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const photo = offers.photoRadar;

function service(name, route, description) {
  return {
    '@context': 'https://schema.org', '@type': 'Service', name, description, url: `${SITE}/${route}`,
    provider: { '@type': 'Organization', name: 'Fabsy Traffic Ticket Services', url: SITE },
    areaServed: { '@type': 'AdministrativeArea', name: 'Alberta, Canada' },
    offers: {
      '@type': 'Offer', price: String(photo.priceCad), priceCurrency: 'CAD',
      url: route === 'fleet' ? `${SITE}/fleet#fleet-intake` : `${SITE}${photo.intakePath}`,
      priceSpecification: { '@type': 'UnitPriceSpecification', price: String(photo.priceCad), priceCurrency: 'CAD', valueAddedTaxIncluded: false },
    },
  };
}

function shell(route, title, description, body, schemas = []) {
  const canonical = `${SITE}/${route}`;
  return `<!doctype html>
<html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${canonical}"><link rel="alternate" hreflang="x-default" href="${canonical}"><meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">
${schemas.map(schema => `<script type="application/ld+json">${json(schema)}</script>`).join('\n')}
<style>body{font-family:system-ui,sans-serif;max-width:850px;margin:auto;padding:24px;line-height:1.7;color:#162033}a{color:#6d28d9}nav{display:flex;flex-wrap:wrap;gap:18px}section{margin:36px 0}h1{font-size:2.6rem;line-height:1.15}details{border-bottom:1px solid #ddd;padding:16px 0}summary h3{display:inline;font-size:1rem}.price{font-size:1.5rem;font-weight:700}.cta{display:inline-block;background:#6d28d9;color:#fff;border-radius:8px;padding:12px 20px}footer{border-top:1px solid #ddd;padding-top:24px;font-size:.875rem}</style>
</head><body><header><nav><a href="/">Fabsy</a><a href="/services">Services</a><a href="/photo-radar">Photo Radar</a><a href="/fleet">Fleet</a><a href="/contact">Contact</a></nav></header>
<main>${body}</main><footer><p>Free Ticket Check / Photo Radar $79 / Rapid Resolution $198 / Bundle $229 / Trial representation quoted. Paid prices are CAD plus GST. Government fines are separate.</p><p>Fabsy is an Alberta traffic ticket agent service, not a law firm. No outcome is promised.</p><p><a href="/terms-of-service#photo-radar-terms">Terms of Service</a> · <a href="${esc(feeRefund.termsPath)}">${esc(feeRefund.details)}</a> · <a href="/privacy-policy">Privacy Policy</a></p></footer></body></html>\n`;
}

function renderPhotoRadar() {
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: content.faqs.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) };
  return shell('photo-radar', 'Photo Radar Ticket in Alberta? $79 + GST | Fabsy', 'Alberta photo radar and red-light owner notices: $79 + GST. No demerits or insurance impact. Fee refund terms apply. You approve any Crown deal.', `
<h1>Photo radar ticket in the mail? $79 flat.</h1>
<p>Alberta automated enforcement notices mailed to a registered owner under Traffic Safety Act s.160(1), including photo radar speeding and red-light camera notices.</p>
<section aria-labelledby="photo-fee-refund-heading"><h2 id="photo-fee-refund-heading">${esc(feeRefund.photoHeadline)}</h2><p>${esc(feeRefund.photoCondition)}</p><p>${esc(feeRefund.payment)}</p><p><a href="${esc(feeRefund.termsPath)}">${esc(feeRefund.details)}</a></p></section>
<section aria-label="Three facts">${content.heroFacts.map(fact => `<h2>${esc(fact.title)}</h2><p>${esc(fact.description)}</p>`).join('')}</section>
<section><h2>Rapid Resolution: Photo Radar</h2><p class="price">$79 + 5% GST ($82.95 total)</p><p>No trial. No success surcharge. No Insurance Impact Report: these owner notices have no insurance impact. Government fines are separate.</p><a class="cta" href="${esc(photo.intakePath)}">Start Photo Radar · $79 + GST</a><p>${esc(photo.outcomeDisclaimer)}</p></section>
<section><h2>How it works</h2><ol>${content.processSteps.map(step => `<li><h3>${esc(step.title)}</h3><p>${esc(step.description)}</p></li>`).join('')}</ol><p>${esc(photo.speedDisclaimer)}</p></section>
<section><h2>What we check in disclosure</h2><ul>${content.reviewChecks.map(check => `<li>${esc(check)}</li>`).join('')}</ul><p>A missing item becomes a review question or request to the Crown; it does not prove that a notice must be withdrawn.</p></section>
<section><h2>Frequently asked questions</h2>${content.faqs.map(item => `<details><summary><h3>${esc(item.question)}</h3></summary><p>${esc(item.answer)}</p></details>`).join('')}</section>
<section><h2>More than one vehicle?</h2><p><a href="/fleet">One intake, all your plates.</a> $79 + GST per ticket, account pricing at 5+ per month, monthly QuickBooks invoicing by arrangement.</p></section>
<section><h2>Official sources</h2><ul>${content.sourceLinks.map(source => `<li><a href="${esc(source.url)}">${esc(source.title)}</a></li>`).join('')}</ul></section>`, [service(photo.name, 'photo-radar', photo.description), faq]);
}

function renderFleet() {
  return shell('fleet', 'Alberta Fleet Photo Radar Help | $79 per Ticket | Fabsy', fleet.description, `
<h1>${esc(fleet.headline)}</h1><p>${esc(fleet.description)}</p><p>${fleet.segments.map(esc).join(' · ')}</p><p class="price">$79 + GST per ticket</p><p>No demerits. No insurance impact. No success fee. You approve each Crown deal.</p>
<section><h2>One account. A decision on every ticket.</h2><ol>${fleet.steps.map(step => `<li><h3>${esc(step.title)}</h3><p>${esc(step.description)}</p></li>`).join('')}</ol></section>
<section><h2>5+ tickets a month?</h2><p>${esc(fleet.accountPricing)}</p></section><section><h2>Fine-only service, clearly scoped</h2><p>This service covers Alberta automated notices mailed to a registered owner under TSA 160(1). Officer-issued tickets, trial representation and government fines are separate.</p><p>${esc(photo.speedDisclaimer)}</p></section>
<section id="fleet-intake"><h2>Introduce your fleet</h2><p>The live fleet intake accepts your business, contact, monthly volume and an optional list of plates in one enquiry. No payment is taken. Fabsy confirms eligibility, authorization, pricing and invoicing before work starts.</p><a class="cta" href="${SITE}/fleet#fleet-intake">Open fleet account intake</a><p>Do not include driver licence or payment details in an enquiry. It does not pause ticket deadlines.</p></section>`, [service('Fabsy Fleet Photo Radar', 'fleet', fleet.description)]);
}

function renderFreeCheck() {
  return shell('free-ticket-check', 'Free Alberta Ticket Check | Fabsy', 'Check an Alberta ticket and service eligibility before choosing paid help. No payment is required.', '<h1>Free Ticket Check</h1><p>Upload your Alberta ticket and check its details and service eligibility before choosing paid help. No payment is required.</p><p>This check does not retain Fabsy, enter a plea, request disclosure or pause a ticket deadline. Verify extracted details against the notice.</p><p><a class="cta" href="https://fabsy.ca/free-ticket-check">Open the free ticket checker</a></p><p><a href="/photo-radar">Photo radar or red-light owner notice? $79 + GST.</a> No demerits and no insurance impact.</p>');
}

function generatePhotoRadarSnapshots(outDir = path.join(ROOT, 'public/prerendered'), routes = ROUTES) {
  if (!Array.isArray(routes) || !routes.length || routes.some(route => !ROUTES.includes(route)) || new Set(routes).size !== routes.length) {
    throw new Error('Only unique public photo-radar, fleet and free-ticket-check snapshot routes are allowed.');
  }
  const renderers = { 'photo-radar': renderPhotoRadar, fleet: renderFleet, 'free-ticket-check': renderFreeCheck };
  const rendered = routes.map(route => [route, renderers[route]()]);
  for (const [route, html] of rendered) {
    const file = path.join(outDir, route, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html, 'utf8');
  }
  return routes.length;
}

if (require.main === module) {
  const args = process.argv.slice(2).map(route => route.replace(/^\//, ''));
  console.log(`Generated ${generatePhotoRadarSnapshots(process.env.OFFER_SNAPSHOT_OUT_DIR, args.length ? args : ROUTES)} offer snapshots.`);
}
module.exports = { generatePhotoRadarSnapshots, ROUTES, renderPhotoRadar, renderFleet, renderFreeCheck };
