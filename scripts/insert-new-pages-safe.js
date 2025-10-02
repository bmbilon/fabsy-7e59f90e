#!/usr/bin/env node
/**
 * scripts/insert-new-pages-safe.js
 *
 * Safe, insert-only page generator derived from the Sonnet 4.5 generator.
 * - By default runs in DRY_RUN mode (no writes). Set APPLY=true to perform writes.
 * - Requires SUPABASE_URL and either SUPABASE_ANON_KEY (for reads) and SUPABASE_SERVICE_ROLE_KEY (for writes).
 * - Does NOT alter DB schema and does NOT touch git.
 *
 * Usage examples:
 *  DRY run (default - no writes):
 *    DRY_RUN=true node scripts/insert-new-pages-safe.js
 *
 *  Apply (insert missing pages only):
 *    APPLY=true SUPABASE_SERVICE_ROLE_KEY="..." node scripts/insert-new-pages-safe.js
 *
 *  Control batch size:
 *    BATCH_SIZE=50 node scripts/insert-new-pages-safe.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

// Config (can be overridden with env vars)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = String(process.env.DRY_RUN || process.env.DRY || 'true').toLowerCase() !== 'false' && !Boolean(process.env.APPLY);
const APPLY = String(process.env.APPLY || 'false').toLowerCase() === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10) || 50;
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '0', 10) || 0; // 0 = unlimited

if (!SUPABASE_URL) {
  console.error('ERROR: SUPABASE_URL is required via env (SUPABASE_URL or VITE_SUPABASE_URL).');
  process.exit(2);
}

// Prefer anon for read checks, service role for write if present
const anonKey = SUPABASE_ANON_KEY || null;
const serviceKey = SUPABASE_SERVICE_ROLE_KEY || null;
const clientKey = anonKey || serviceKey;

if (!clientKey) {
  console.warn('Warning: No SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY found. You can still run DRY_RUN to preview.');
}

// create supabase client for reads (anon or service)
const supabase = clientKey ? createClient(SUPABASE_URL, clientKey) : null;

/* --- Source lists taken from your Sonnet 4.5 generator --- */
const cities = [
  'Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat', 'Fort McMurray',
  'Grande Prairie', 'Airdrie', 'Spruce Grove', 'Okotoks', 'Leduc', 'Cochrane',
  'Lloydminster', 'Camrose', 'Brooks', 'Cold Lake', 'Wetaskiwin', 'Lacombe',
  'Stony Plain', 'Sylvan Lake', 'Canmore', 'Banff', 'Jasper', 'Hinton'
];

const violations = [
  { name: 'speeding', display: 'Speeding', fine: 150, insurance: 1650, demerits: '2-6' },
  { name: 'red-light', display: 'Red Light', fine: 287, insurance: 1800, demerits: '3' },
  { name: 'distracted-driving', display: 'Distracted Driving', fine: 300, insurance: 2200, demerits: '3' },
  { name: 'careless-driving', display: 'Careless Driving', fine: 405, insurance: 2500, demerits: '6' },
  { name: 'no-insurance', display: 'No Insurance', fine: 2500, insurance: 3500, demerits: '0' },
  { name: 'suspended-license', display: 'Driving While Suspended', fine: 2000, insurance: 4000, demerits: '0' },
  { name: 'stunting', display: 'Stunting', fine: 2500, insurance: 4500, demerits: '6' },
  { name: 'racing', display: 'Street Racing', fine: 2500, insurance: 5000, demerits: '6' },
  { name: 'fail-to-stop', display: 'Fail to Stop', fine: 400, insurance: 2000, demerits: '4' },
  { name: 'unsafe-lane-change', display: 'Unsafe Lane Change', fine: 150, insurance: 1500, demerits: '2' },
  { name: 'following-too-close', display: 'Following Too Close', fine: 155, insurance: 1600, demerits: '3' },
  { name: 'fail-to-yield', display: 'Fail to Yield', fine: 175, insurance: 1700, demerits: '3' },
  { name: 'improper-turn', display: 'Improper Turn', fine: 155, insurance: 1500, demerits: '2' },
  { name: 'no-seatbelt', display: 'No Seatbelt', fine: 115, insurance: 1200, demerits: '0' },
  { name: 'tinted-windows', display: 'Illegal Window Tint', fine: 115, insurance: 1000, demerits: '0' },
];

const scenarios = [
  'first-time-offender',
  'multiple-tickets',
  'commercial-driver',
  'new-driver',
  'out-of-province',
  'photo-radar',
  'officer-error',
  'weather-conditions'
];

/* --- helpers --- */
function slugifyRaw(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function generateContent(city, violation, scenario) {
  const name = violation.display;
  const fine = violation.fine;
  const insurance = violation.insurance;
  const total = fine + insurance;
  return `## Don't Let a ${name} Ticket Destroy Your Insurance Rates in ${city}

${scenario ? `### Special Case: ${scenario.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}` : ''}

If you received a ${name} ticket in ${city}, you're facing more than just a $${fine} fine. Your insurance will increase by approximately **$${insurance} over 3 years** - bringing your total cost to **$${total}+**.

### Why ${city} Drivers Choose Fabsy

We've fought hundreds of ${name} tickets in ${city} with a **94% success rate**. We know the local Crown prosecutors, understand ${city}-specific enforcement patterns, and exploit technical errors in tickets issued here.

### The Real Cost of a ${name} Ticket in ${city}

- **Fine**: $${fine}
- **Insurance Increase**: $${insurance} (3 years)
- **Demerit Points**: ${violation.demerits} points
- **Total Real Cost**: $${total}+
- **Time Lost in Court**: 0 hours (we go for you)

### Our ${city} ${name} Ticket Defense Process

1. **Immediate Analysis**: Upload your ticket, get instant AI analysis
2. **Request Disclosure**: We obtain all police evidence from ${city} enforcement
3. **Find Technical Errors**: ${name} charges often have procedural defects
4. **Crown Negotiation**: Leverage relationships with ${city} prosecutors
5. **Court Representation**: We appear at ${city} Provincial Court on your behalf
6. **Protect Your Record**: 94% success in dismissals or reductions

### Common Defenses for ${name} in ${city}

- Radar/laser calibration issues
- Officer training deficiencies
- Disclosure gaps
- Charter rights violations
- Weather and road conditions
- Traffic flow patterns
- Equipment malfunction

### ${city}-Specific Traffic Enforcement

${city} police focus heavily on ${violation.name.includes('speed') ? 'speed enforcement zones' : violation.name.includes('red') ? 'intersection cameras' : 'patrol enforcement'}. This aggressive enforcement often leads to mistakes we can exploit.

### Ready to Fight Your ${city} ${name} Ticket?

Don't let a $${fine} ticket cost you $${total}. Our zero-risk guarantee means you only pay if we save you money.`;
}

function generatePageObject(city, violation, scenario = null) {
  const slug = scenario
    ? `${violation.name}-ticket-${city.toLowerCase().replace(/\s+/g, '-')}-${scenario}`
    : `${violation.name}-ticket-${city.toLowerCase().replace(/\s+/g, '-')}`;
  const total = violation.fine + violation.insurance;
  const faqs = [
    { q: `How much does a ${violation.display} ticket cost in ${city}?`, a: `In ${city}, a ${violation.display} ticket costs $${violation.fine} for the fine plus approximately $${violation.insurance} in insurance increases over 3 years, totaling $${total}.` },
    { q: `Can I fight a ${violation.display} ticket in ${city}?`, a: `Yes! We have a 94% success rate fighting ${violation.display} tickets in ${city}. Most cases are dismissed, reduced, or amended to protect your insurance.` },
    { q: `How long does it take to resolve a ${violation.display} ticket in ${city}?`, a: `Typically 3-6 months. We handle all court appearances in ${city}, so you never need to take time off work.` },
  ];

  return {
    slug: slugifyRaw(slug),
    city,
    violation: violation.display,
    h1: `Fight Your ${violation.display} Ticket in ${city} | 94% Success Rate`,
    meta_title: `${violation.display} Ticket ${city} | Save $${violation.insurance}+ | Fabsy`,
    meta_description: `Got a ${violation.display} ticket in ${city}? That $${violation.fine} fine will cost you $${total} total. We fight with 94% success. Zero-risk guarantee.`,
    content: generateContent(city, violation, scenario),
    stats: { avgFine: violation.fine, insuranceIncrease: violation.insurance, successRate: 94, avgSavings: total, demerits: violation.demerits },
    faqs,
    local_info: `${city} Provincial Court handles all traffic violations. We appear regularly and have strong relationships with Crown prosecutors.`,
  };
}

/* --- build candidate slugs/pages --- */
function buildCandidates() {
  const pages = [];
  // base pages for all cities x violations
  for (const city of cities) {
    for (const violation of violations) {
      pages.push(generatePageObject(city, violation));
    }
  }
  // scenario expansions for top 6 cities (like original)
  const topCities = cities.slice(0, 6);
  for (const city of topCities) {
    for (const violation of violations) {
      for (const scenario of scenarios) {
        pages.push(generatePageObject(city, violation, scenario));
      }
    }
  }
  // dedupe by slug
  const map = new Map();
  for (const p of pages) map.set(p.slug, p);
  const arr = Array.from(map.values());
  if (MAX_PAGES > 0) return arr.slice(0, MAX_PAGES);
  return arr;
}

/* --- Supabase helper functions --- */
async function fetchExistingSlugs(slugs) {
  if (!supabase) return [];
  // split into batches for query length
  const batch = 200;
  const out = new Set();
  for (let i = 0; i < slugs.length; i += batch) {
    const slice = slugs.slice(i, i + batch);
    try {
      const { data, error } = await supabase
        .from('page_content')
        .select('slug')
        .in('slug', slice)
        .limit(1000);
      if (error) {
        console.warn('Supabase read warning:', error.message || error);
        continue;
      }
      (data || []).forEach(r => out.add(String(r.slug)));
    } catch (err) {
      console.warn('Supabase read exception:', err.message || err);
    }
  }
  return Array.from(out);
}

async function insertPages(insertPagesList) {
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to perform writes. Set it in env to apply changes.');
  }
  const writeClient = createClient(SUPABASE_URL, serviceKey);
  let inserted = 0;
  for (let i = 0; i < insertPagesList.length; i += BATCH_SIZE) {
    const batch = insertPagesList.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await writeClient.from('page_content').insert(batch, { returning: 'minimal' });
      if (error) {
        console.error('Insert batch error:', error);
        // if conflict occurs, we skip and continue
      } else {
        inserted += batch.length;
        console.log(`Inserted batch ${i / BATCH_SIZE + 1}: ${batch.length} rows (total inserted: ${inserted})`);
      }
    } catch (err) {
      console.error('Insert exception:', err.message || err);
    }
  }
  return inserted;
}

/* --- main --- */
(async function main() {
  console.log(`\nSafe generator run — DRY_RUN=${DRY_RUN && !APPLY} APPLY=${APPLY}`);
  const candidates = buildCandidates();
  console.log(`Candidate pages generated: ${candidates.length}`);

  const allSlugs = candidates.map(p => p.slug);
  console.log('Checking which slugs already exist in the DB (this uses Supabase read key if available)...');

  const existing = supabase ? await fetchExistingSlugs(allSlugs) : [];
  console.log(`Existing slugs found: ${existing.length}`);

  const existingSet = new Set(existing);
  const newPages = candidates.filter(p => !existingSet.has(p.slug));
  console.log(`New pages to insert (not in DB): ${newPages.length}`);

  if (newPages.length === 0) {
    console.log('No new pages to insert. Exiting.');
    process.exit(0);
  }

  // print sample of new slugs
  console.log('\nSample of new slugs (first 30):');
  newPages.slice(0, 30).forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.slug} (${p.city} — ${p.violation})`);
  });

  console.log(`\nTo perform write: run with APPLY=true and supply SUPABASE_SERVICE_ROLE_KEY in the environment.`);
  if (!APPLY) {
    console.log('DRY_RUN mode — no writes will be performed.');
    process.exit(0);
  }

  // APPLY mode
  try {
    console.log('APPLY=true detected — attempting to insert missing pages now...');
    const inserted = await insertPages(newPages);
    console.log(`\nDone. Inserted approximately ${inserted} pages (see logs).`);
    process.exit(0);
  } catch (err) {
    console.error('Error during insert:', err.message || err);
    process.exit(1);
  }
})();