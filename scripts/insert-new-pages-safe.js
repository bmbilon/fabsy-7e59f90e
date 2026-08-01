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
const EXACT_PRICING = 'Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.';

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
  { name: 'speeding', display: 'Speeding' },
  { name: 'red-light', display: 'Red Light' },
  { name: 'distracted-driving', display: 'Distracted Driving' },
  { name: 'careless-driving', display: 'Careless Driving' },
  { name: 'no-insurance', display: 'No Insurance' },
  { name: 'suspended-license', display: 'Driving While Suspended' },
  { name: 'stunting', display: 'Stunting' },
  { name: 'racing', display: 'Street Racing' },
  { name: 'fail-to-stop', display: 'Fail to Stop' },
  { name: 'unsafe-lane-change', display: 'Unsafe Lane Change' },
  { name: 'following-too-close', display: 'Following Too Close' },
  { name: 'fail-to-yield', display: 'Fail to Yield' },
  { name: 'improper-turn', display: 'Improper Turn' },
  { name: 'no-seatbelt', display: 'No Seatbelt' },
  { name: 'tinted-windows', display: 'Illegal Window Tint' },
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
  return `## Responding to a ${name} Ticket in ${city}

${scenario ? `### Special Case: ${scenario.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}` : ''}

If you received a ${name} ticket in ${city}, check the response deadline printed on the ticket. The available options and consequences depend on the exact charge and the final outcome.

### How Fabsy Reviews the Ticket

Fabsy is a traffic ticket agent service, not a law firm. We review the ticket, explain the available steps, and confirm whether paid agent representation is permitted for the matter and court location.

### What to Do Next

- Read the ticket and note its printed deadline
- Keep a clear copy of the ticket and any related documents
- Follow the instructions on the ticket to pay or start a dispute
- Ask for an assessment before the printed deadline if you want help reviewing the options

### Pricing

${EXACT_PRICING}`;
}

function generatePageObject(city, violation, scenario = null) {
  const slug = scenario
    ? `${violation.name}-ticket-${city.toLowerCase().replace(/\s+/g, '-')}-${scenario}`
    : `${violation.name}-ticket-${city.toLowerCase().replace(/\s+/g, '-')}`;
  const faqs = [
    { q: `How do I respond to a ${violation.display} ticket in ${city}?`, a: `Follow the instructions and deadline printed on the ticket. Those instructions explain how to pay the ticket or start a dispute.` },
    { q: `Can Fabsy review a ${violation.display} ticket from ${city}?`, a: `Yes. Submit a copy for an assessment. Fabsy will confirm the available options and whether agent representation is permitted for the matter and court location.` },
    { q: `How much does Fabsy charge for representation?`, a: EXACT_PRICING },
  ];

  return {
    slug: slugifyRaw(slug),
    city,
    violation: violation.display,
    h1: `How to Dispute a ${violation.display} Ticket in ${city}`,
    meta_title: `${violation.display} Ticket ${city} | Fabsy`,
    meta_description: `Received a ${violation.display.toLowerCase()} ticket in ${city}? Review the printed deadline, dispute steps, and Fabsy's Alberta agent service.`,
    content: generateContent(city, violation, scenario),
    faqs,
    local_info: `Fabsy serves ${city} where paid traffic ticket agent representation is permitted.`,
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
  console.log(`\nSafe generator run - DRY_RUN=${DRY_RUN && !APPLY} APPLY=${APPLY}`);
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
    console.log(`${idx + 1}. ${p.slug} (${p.city} - ${p.violation})`);
  });

  console.log(`\nTo perform write: run with APPLY=true and supply SUPABASE_SERVICE_ROLE_KEY in the environment.`);
  if (!APPLY) {
    console.log('DRY_RUN mode - no writes will be performed.');
    process.exit(0);
  }

  // APPLY mode
  try {
    console.log('APPLY=true detected - attempting to insert missing pages now...');
    const inserted = await insertPages(newPages);
    console.log(`\nDone. Inserted approximately ${inserted} pages (see logs).`);
    process.exit(0);
  } catch (err) {
    console.error('Error during insert:', err.message || err);
    process.exit(1);
  }
})();
