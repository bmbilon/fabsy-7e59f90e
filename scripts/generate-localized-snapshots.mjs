#!/usr/bin/env node
/** Render translated Phase 1 pages and a missing English terms counterpart. Never copy content/blog pages to locale URLs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import promotionPolicy from './pro-driver-promotion-guardrail.cjs';
import {
  LOCALE_MANIFEST_NAME,
  SITE,
  assertSnapshotHead,
  escapeHtml as esc,
  loadLocaleSeoContext,
  localePath,
  localeSnapshotRecords,
  normalizeSnapshotHead,
  snapshotFile,
} from './locale-seo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEE_REFUND = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/feeRefund.json'), 'utf8'));
const EMAIL = 'hello@fabsy.ca';
const FEE_REFUND_TERMS_PATH = '/terms-of-service#fee-refund-guarantee';
const INSURER_NAMES = ['Intact Insurance', 'TD Insurance', 'Wawanesa Insurance', 'Co-operators', 'Desjardins Insurance', 'Allstate Insurance', 'Aviva Canada'];
const NAV = [
  ['/', 'nav.home'], ['/rapid-resolution', 'nav.rapid'], ['/how-it-works', 'nav.howItWorks'],
  ['/faq', 'nav.faq'], ['/contact', 'nav.contact'], ['/terms-of-service', 'nav.terms'],
];
const PAGE_KEYS = {
  '/': 'home', '/rapid-resolution': 'rapid', '/how-it-works': 'process', '/faq': 'faq',
  '/contact': 'contact', '/terms-of-service': 'terms', '/submit-ticket': 'intake',
  '/payment-canceled': 'checkout',
};

function lookup(bundle, key) {
  return key.split('.').reduce((value, part) => value?.[part], bundle);
}

function blockText(value) {
  return String(value).replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function renderInsuranceContextSnapshot(translate) {
  const p = key => `<p>${esc(translate(`insuranceContext.${key}`))}</p>`;
  return `<section aria-labelledby="insurance-context-heading">${p('eyebrow')}<h2 id="insurance-context-heading">${esc(translate('insuranceContext.title'))}</h2>${p('description')}<ul aria-label="${esc(translate('insuranceContext.listLabel'))}">${INSURER_NAMES.map(name => `<li>${esc(name)}</li>`).join('')}</ul>${p('disclaimer')}</section>`;
}

/** Keep the same translated refund trigger and payment disclosure visible as React. */
export function renderFeeRefundSnapshot(translate, code, { openTermsInNewTab = false } = {}) {
  const p = key => `<p>${esc(translate(`feeRefund.${key}`))}</p>`;
  const english = code === 'en' ? '' : ' <span lang="en">(English)</span>';
  const declinedOffer = `<p lang="en" dir="ltr">${code === 'en' ? '' : '<span class="font-semibold">Refund clarification (English): </span>'}${esc(FEE_REFUND.declinedOfferText)}</p>`;
  const target = openTermsInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<aside data-fee-refund-notice="ticket-representation"><h2>${esc(translate('feeRefund.headline'))}</h2>${p('condition')}${declinedOffer}${p('payment')}<a href="${FEE_REFUND_TERMS_PATH}"${target}>${esc(translate('feeRefund.details'))}${english}</a></aside>`;
}

/** Refresh only the two identified homepage sections; keep every other byte. */
export function refreshEnglishHomepageSections(html, context) {
  const source = String(html);
  const t = snapshotTranslator(context, 'en');
  const sections = [...source.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)];
  const insurance = sections.filter(match => /^<section\b[^>]*\baria-labelledby=["']insurance-context-heading["']/i.test(match[0]));
  const insuranceMarkers = [...source.matchAll(/\baria-labelledby\s*=\s*["']insurance-context-heading["']/gi)];
  const insuranceHeadings = [...source.matchAll(/\bid\s*=\s*["']insurance-context-heading["']/gi)];
  if (insurance.length !== 1 || insuranceMarkers.length !== 1 || insuranceHeadings.length !== 1 ||
      [...insurance[0][0].matchAll(/<section\b/gi)].length !== 1) {
    throw new Error('English homepage insurance-context marker is missing, malformed or ambiguous');
  }
  const promotionMarkers = [...source.matchAll(/\bdata-promotion\s*=/gi)];
  const promotions = sections.filter(match => /^<section\b[^>]*\bdata-promotion=["']pro-driver-20["']/i.test(match[0]));
  if (promotionMarkers.length > 1 || promotions.length !== promotionMarkers.length ||
      (promotions[0] && [...promotions[0][0].matchAll(/<section\b/gi)].length !== 1)) {
    throw new Error('English homepage promotion marker is malformed or ambiguous');
  }
  const insuranceStart = insurance[0].index;
  const insuranceEnd = insuranceStart + insurance[0][0].length;
  const promotion = promotions[0];
  if (promotion && (promotion.index < insuranceEnd || !/^\s*$/.test(source.slice(insuranceEnd, promotion.index)))) {
    throw new Error('English homepage promotion must immediately follow its insurance-context section');
  }
  const insurerHtml = renderInsuranceContextSnapshot(t);
  const promotionHtml = promotionPolicy.renderProDriverSnapshot(context.offers, t, 'en');
  const insuranceCurrent = blockText(insurance[0][0]) === blockText(insurerHtml);
  const promotionCurrent = promotion && promotionPolicy.redactProDriverPromotion(promotion[0], {
    offers: context.offers, translate: t, code: 'en', route: '/', required: true,
  }).issues.length === 0;
  // Retain fresh React markup, including its logos, SVG icons and classes.
  if (insuranceCurrent && promotionCurrent) return source;
  const end = promotion ? promotion.index + promotion[0].length : insuranceEnd;
  const between = promotion ? source.slice(insuranceEnd, promotion.index) : '';
  return source.slice(0, insuranceStart) + (insuranceCurrent ? insurance[0][0] : insurerHtml) + between +
    (promotionCurrent ? promotion[0] : promotionHtml) + source.slice(end);
}

export function snapshotTranslator(context, code) {
  const bundle = context.bundles[code];
  if (!bundle) throw new Error(`Missing translation bundle: ${code}`);
  const prices = context.offers;
  const values = {
    price: `$${prices.rapidResolution.priceCad}`,
    reportPrice: `$${prices.insuranceReport.priceCad}`,
    bundlePrice: `$${prices.bundle.priceCad}`,
    ...promotionPolicy.proDriverPromotionValues(prices).translationValues,
    email: EMAIL,
  };
  return key => {
    const raw = lookup(bundle, key);
    if (typeof raw !== 'string' || !raw.trim()) throw new Error(`Missing translated snapshot string: ${code}:${key}`);
    return raw.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name) => {
      if (!(name in values)) throw new Error(`Unresolved snapshot substitution: ${code}:${key}:${name}`);
      return values[name];
    });
  };
}

export function localizedPageTitle(context, code, basePath) {
  const prefix = PAGE_KEYS[basePath];
  if (!prefix) throw new Error(`No localized renderer exists for ${basePath}`);
  const headingKey = { '/how-it-works': 'nav.howItWorks', '/faq': 'nav.faq', '/payment-canceled': 'checkout.paymentFailed' }[basePath] || `${prefix}.title`;
  return code === 'en' && basePath === '/terms-of-service' ? 'Terms of Service' : snapshotTranslator(context, code)(headingKey);
}

/** A locale attribute on an English fallback does not make it a translation. */
export function assertLocalizedMainContent(html, context, code, basePath) {
  const title = localizedPageTitle(context, code, basePath);
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
  const decode = value => value.replace(/<[^>]*>/g, '').replace(/&#(?:x([a-f\d]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)))
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replace(/\s+/g, ' ').trim();
  if (decode(h1) !== decode(esc(title))) throw new Error(`Localized snapshot main heading does not match its bundle: ${code}${basePath}`);
  const promotion = promotionPolicy.redactProDriverPromotion(html, {
    offers: context.offers, translate: snapshotTranslator(context, code), code,
    route: localePath(code, basePath), required: basePath === '/',
  });
  if (promotion.issues.length) throw new Error(`Localized snapshot promotion is invalid: ${code}${basePath}: ${promotion.issues.join('; ')}`);
  if (context.released(code) && context.review.locales[code]?.status === 'published') {
    const notices = [...html.matchAll(/<aside\b(?=[^>]*\bdata-translation-status=["']machine-translated["'])[^>]*>([\s\S]*?)<\/aside>/gi)];
    const t = snapshotTranslator(context, code);
    const expected = ['language.translationNoteTitle', 'language.translationNoteBody'].map(key => decode(esc(t(key)))).join(' ');
    if (notices.length !== 1 || decode(notices[0][1].replace(/<[^>]*>/g, ' ')) !== expected) {
      throw new Error(`Published machine translation must retain its exact translation disclosure: ${code}${basePath}`);
    }
  }
}

export function renderLocalizedSnapshot(context, record) {
  const { code, basePath, route, canonical, indexable } = record;
  const locale = context.locales.find(item => item.code === code);
  const t = snapshotTranslator(context, code);
  const prefix = PAGE_KEYS[basePath];
  if (!prefix) throw new Error(`No translated snapshot renderer is registered for ${route}`);
  const title = localizedPageTitle(context, code, basePath);
  const metaTitle = code === 'en' && basePath === '/terms-of-service' ? 'Terms of Service | Fabsy'
    : lookup(context.bundles[code], `${prefix}.metaTitle`) ? t(`${prefix}.metaTitle`) : t('home.metaTitle');
  const descriptionKey = lookup(context.bundles[code], `${prefix}.metaDescription`) ? `${prefix}.metaDescription`
    : 'home.metaDescription';
  const description = code === 'en' && basePath === '/terms-of-service'
    ? "Terms of Service for Fabsy's Alberta traffic ticket agent services, including pricing, scope, authorization and client responsibilities."
    : t(descriptionKey);
  const p = key => `<p>${esc(t(key))}</p>`;
  const section = (heading, body) => `<section><h2>${esc(t(heading))}</h2>${body}</section>`;
  const list = key => `<ul>${Object.keys(lookup(context.bundles.en, key)).map(name => `<li>${esc(t(`${key}.${name}`))}</li>`).join('')}</ul>`;
  const cta = `<p><a class="cta" href="${localePath(code, '/submit-ticket')}">${esc(t('nav.start'))}</a></p>`;
  let body;
  let structuredData = '';

  switch (basePath) {
    case '/':
      body = `${p('home.description')}${renderFeeRefundSnapshot(t, code)}${cta}${renderInsuranceContextSnapshot(t)}${promotionPolicy.renderProDriverSnapshot(context.offers, t, code)}${section('home.educationTitle', p('home.educationBody'))}${p('home.scope')}${p('common.priceLine')}`;
      break;
    case '/rapid-resolution':
      body = `${p('rapid.description')}${renderFeeRefundSnapshot(t, code)}${section('rapid.priceLabel', p('common.priceLine') + p('common.noSuccessFee'))}${section('rapid.includedTitle', list('rapid.included'))}${section('rapid.excludedTitle', list('rapid.excluded'))}${section('rapid.speedTitle', p('rapid.speedBody') + p('rapid.speedDisclaimer'))}${cta}`;
      break;
    case '/how-it-works':
      body = `<h2>${esc(t('process.title'))}</h2>${p('process.description')}<ol class="steps">${Object.keys(context.bundles.en.process.steps).map(name => `<li>${section(`process.steps.${name}.title`, p(`process.steps.${name}.body`))}</li>`).join('')}</ol>${cta}`;
      break;
    case '/faq': {
      const items = Object.keys(context.bundles.en.faq.items).map(name => ({ question: t(`faq.items.${name}.question`), answer: t(`faq.items.${name}.answer`) }));
      body = `<h2>${esc(t('faq.title'))}</h2>${items.map(item => `<details open><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}`;
      // The markup describes exactly the visible translated questions/answers.
      structuredData = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: locale.languageTag, url: canonical, mainEntity: items.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }).replaceAll('<', '\\u003c')}</script>`;
      break;
    }
    case '/contact': {
      const configuredNumber = context.review.contact?.whatsappNumber;
      const whatsapp = context.released(code) && typeof configuredNumber === 'string' && /^\+?[1-9]\d{7,14}$/.test(configuredNumber)
        ? `<p><a href="https://wa.me/${configuredNumber.replace(/^\+/, '')}" rel="noopener noreferrer">${esc(t('contact.whatsappCta'))}</a></p>${p('contact.whatsappHint')}` : '';
      body = `${p('contact.description')}${p('contact.messageHint')}${p('contact.availability')}<p><a href="mailto:${EMAIL}">${esc(t('contact.emailCta'))}</a></p>${whatsapp}`;
      break;
    }
    case '/terms-of-service':
      body = `${code === 'en' ? '' : `${p('terms.intro')}<aside>${p('terms.englishControls')}<a href="${SITE}/terms-of-service" lang="en">${esc(t('language.readEnglish'))}</a></aside>`}<section id="fee-refund-guarantee" aria-label="${esc(t('feeRefund.details'))}">${renderFeeRefundSnapshot(t, code)}${p('feeRefund.scope')}</section>${Object.keys(context.bundles.en.terms.sections).map(name => section(`terms.sections.${name}.title`, p(`terms.sections.${name}.body`))).join('')}`;
      break;
    case '/submit-ticket':
      body = `${p('intake.description')}${section('intake.steps.ticket', `<ul>${['ticketNumber', 'issueDate', 'location', 'offenceDescription', 'fineAmount', 'ticketImage'].map(name => `<li>${esc(t(`intake.fields.${name}`))}</li>`).join('')}</ul>`)}${section('intake.steps.account', p('intake.review.languageNote'))}${section('intake.consent.title', ['scope', 'approval', 'exclusions', 'fee', 'data', 'withdrawal', 'confirm'].map(name => p(`intake.consent.${name}`)).join(''))}${section('checkout.title', p('checkout.scope') + renderFeeRefundSnapshot(t, code, { openTermsInNewTab: true }) + p('checkout.termsAcceptance'))}`;
      break;
    case '/payment-canceled':
      body = `${p('checkout.paymentFailed')}${p('checkout.scope')}${cta}`;
      break;
    default:
      throw new Error(`Unimplemented localized snapshot: ${route}`);
  }

  const translationNotice = !context.released(code)
    ? `<aside class="preview" role="note"><strong>${esc(t('language.draftTitle'))}</strong>${p('language.draftBody')}${p('language.englishControls')}<a href="${SITE}/terms-of-service">${esc(t('language.readEnglish'))}</a>${!indexable && !context.indexableRoutes.has(basePath) ? p('language.paymentBlocked') : ''}</aside>`
    : context.review.locales[code]?.status === 'published'
      ? `<aside class="translation-note" role="note" data-translation-status="machine-translated"><strong>${esc(t('language.translationNoteTitle'))}</strong>${p('language.translationNoteBody')}</aside>` : '';
  const html = `<!DOCTYPE html>
<html lang="${locale.languageTag}" dir="${locale.dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(metaTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(metaTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${structuredData}
<style>
body{font-family:system-ui,sans-serif;max-width:820px;margin:auto;padding:24px;line-height:1.7;color:#161622;background:#fff}header nav{display:flex;flex-wrap:wrap;gap:14px}a{color:#5b21b6}h1{font-size:2rem;line-height:1.3}h2{font-size:1.3rem}.preview,aside{padding:18px;border:1px solid #d5c5f7;border-inline-start:4px solid #7540c8;border-radius:10px;background:#faf7ff;margin-block:24px}section{margin-block:28px}li{margin-block:8px}.cta{display:inline-block;padding:12px 20px;border-radius:8px;background:#5b21b6;color:#fff;text-decoration:none}details{padding-block:14px;border-block-end:1px solid #ddd}summary{font-weight:600}footer{margin-block-start:40px;border-block-start:1px solid #ddd;padding-block-start:16px;font-size:.9rem}
</style>
</head>
<body>
<header><nav>${NAV.map(([href, key]) => `<a href="${localePath(code, href)}">${esc(t(key))}</a>`).join('')}</nav></header>
${translationNotice}
<main data-fabsy-locale="${code}"><h1>${esc(title)}</h1>${body}</main>
<footer>${p('common.notLawFirm')}${p('common.noOutcomePromise')}${p('common.clientDecision')}<p><a href="${localePath(code, '/terms-of-service')}">${esc(t('nav.terms'))}</a> · <a href="${FEE_REFUND_TERMS_PATH}">${esc(t('feeRefund.details'))}${code === 'en' ? '' : ' <span lang="en">(English)</span>'}</a> · <a href="${SITE}${basePath}">${esc(t('language.readEnglish'))}</a></p></footer>
</body>
</html>
`;
  const result = normalizeSnapshotHead(html, route, context);
  assertSnapshotHead(result, route, context);
  assertLocalizedMainContent(result, context, code, basePath);
  return result;
}

export function generateLocalizedSnapshots(options = {}) {
  const context = options.context || loadLocaleSeoContext();
  const outDir = path.resolve(options.outDir || process.env.LOCALE_SNAPSHOT_OUT_DIR || path.join(ROOT, 'public/prerendered'));
  const records = localeSnapshotRecords(context);
  // Finish all rendering/validation before replacing any previous snapshot.
  const rendered = records.map(record => ({ record, html: renderLocalizedSnapshot(context, record) }));
  const englishHomeFile = snapshotFile(outDir, '/');
  if (!fs.existsSync(englishHomeFile)) throw new Error('English homepage snapshot is required before localized generation');
  const englishHome = fs.readFileSync(englishHomeFile, 'utf8');
  const refreshedEnglishHome = refreshEnglishHomepageSections(englishHome, context);
  const refreshEnglishHome = refreshedEnglishHome !== englishHome;
  if (refreshEnglishHome) rendered.push({ record: { route: '/' }, html: refreshedEnglishHome });
  const createEnglishTerms = !fs.existsSync(snapshotFile(outDir, '/terms-of-service'));
  if (createEnglishTerms) {
    if (fs.existsSync(path.join(outDir, 'terms-of-service'))) throw new Error('Existing English terms directory has no snapshot; refusing to replace it');
    const record = { code: 'en', basePath: '/terms-of-service', route: '/terms-of-service', canonical: `${SITE}/terms-of-service`, indexable: true };
    rendered.push({ record, html: renderLocalizedSnapshot(context, record) });
  }
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(outDir), '.locale-snapshots-'));
  const backup = fs.mkdtempSync(path.join(path.dirname(outDir), '.locale-backup-'));
  const moved = [];
  const installed = [];
  let completed = false;
  try {
    for (const { record, html } of rendered) {
      const filename = snapshotFile(staging, record.route);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, html, 'utf8');
    }
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourceVersion: context.registry.sourceVersion,
      sourceFingerprint: context.sourceFingerprint,
      sourceDocuments: context.sourceDocuments,
      bundleFingerprints: context.bundleFingerprints,
      localeStates: Object.fromEntries(context.locales.map(locale => [locale.code, {
        released: context.released(locale.code),
        indexable: context.indexable(locale.code),
      }])),
      generatedCount: records.length,
      records,
    };
    fs.writeFileSync(path.join(staging, LOCALE_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.mkdirSync(outDir, { recursive: true });
    // These reserved locale directories are owned by this generator; all
    // English content, browser snapshots and unrelated assets stay untouched.
    for (const name of [...context.locales.filter(locale => locale.code !== 'en').map(locale => locale.code), ...(createEnglishTerms ? ['terms-of-service'] : []), ...(refreshEnglishHome ? ['index.html'] : []), LOCALE_MANIFEST_NAME]) {
      if (fs.existsSync(path.join(outDir, name))) {
        fs.renameSync(path.join(outDir, name), path.join(backup, name));
        moved.push(name);
      }
      fs.renameSync(path.join(staging, name), path.join(outDir, name));
      installed.push(name);
    }
    completed = true;
    return manifest;
  } catch (error) {
    for (const name of installed.reverse()) fs.rmSync(path.join(outDir, name), { recursive: true, force: true });
    for (const name of moved.reverse()) fs.renameSync(path.join(backup, name), path.join(outDir, name));
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    // If a filesystem error interrupts rollback, preserve any original
    // snapshots still in the backup rather than deleting the last copy.
    if (completed || fs.readdirSync(backup).length === 0) fs.rmSync(backup, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = generateLocalizedSnapshots();
    const indexed = manifest.records.filter(record => record.indexable).length;
    console.log(`Localized snapshots: ${manifest.generatedCount} translated pages, ${indexed} published/indexable, ${manifest.generatedCount - indexed} noindex previews/private pages.`);
  } catch (error) {
    console.error(`Localized snapshot generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
