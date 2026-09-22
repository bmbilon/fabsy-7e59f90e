#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCsv,
  readGscAiPageExport,
  readGscPageExport,
  scoreManifest,
} from './score-content-consolidation.mjs';

const COLUMNS = [
  'review_bucket', 'url', 'slug', 'reason', 'index_status', 'last_crawled',
  'gsc_evidence_status', 'gsc_clicks', 'gsc_impressions',
  'gsc_ai_evidence_status', 'gsc_ai_impressions', 'content_shape',
  'manifest_source', 'possible_merge_target', 'snapshot_words', 'topic_words',
  'target_overlap_percent', 'pilot_decision', 'review_queries',
  'review_backlinks', 'review_conversions', 'review_unique_facts',
  'review_legal_accuracy', 'final_decision',
];

function argsFrom(argv) {
  const options = {
    manifest: 'public/prerendered/content-manifest.json',
    snapshots: 'public/prerendered/content',
    pilot: 'docs/seo-research/content-consolidation-pilot.csv',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--help') options.help = true;
    else if (['--manifest', '--snapshots', '--pilot', '--gsc', '--gsc-ai', '--indexing', '--out', '--priority-out', '--summary', '--gsc-through', '--indexing-as-of'].includes(key)) {
      if (!argv[i + 1]) throw new Error(`Missing value for ${key}`);
      options[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[++i];
    } else throw new Error(`Unknown argument: ${key}`);
  }
  return options;
}

function slugFromUrl(raw) {
  try {
    const url = new URL(raw, 'https://fabsy.ca');
    if (url.hostname !== 'fabsy.ca') return null;
    const match = url.pathname.replace(/\/$/, '').match(/^\/content\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}

function readIndexing(text) {
  const { headers, records } = parseCsv(text);
  if (!headers.includes('URL') || !headers.includes('Index reason')) {
    throw new Error('Indexing CSV requires URL and Index reason columns');
  }
  const bySlug = new Map();
  for (const record of records) {
    const slug = slugFromUrl(record.URL);
    if (!slug) continue;
    if (bySlug.has(slug)) throw new Error(`Conflicting index status rows for ${slug}`);
    bySlug.set(slug, {
      status: record['Index reason'],
      lastCrawled: record['Last crawled'] ?? '',
    });
  }
  return bySlug;
}

function readPilot(text) {
  const { records } = parseCsv(text);
  return new Map(records.filter((row) => row.source_url && row.decision)
    .map((row) => [slugFromUrl(row.source_url), row.decision]));
}

function visibleArticle(html) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '';
  return article.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|#39|lt|gt);/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function topicIntro(html) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '';
  const beforeService = article.split(/<h2[^>]*>How Rapid Resolution works<\/h2>|<section[^>]*class="triage"/i)[0];
  return beforeService.replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|amp|quot|#39|lt|gt);/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function shingles(text) {
  const words = text.match(/[a-z0-9]+/g) ?? [];
  const result = new Set();
  for (let i = 0; i <= words.length - 5; i += 1) {
    result.add(words.slice(i, i + 5).join(' '));
  }
  return { words: words.length, grams: result };
}

function overlap(source, target) {
  if (!source?.grams.size || !target?.grams.size) return '';
  let common = 0;
  for (const gram of source.grams) if (target.grams.has(gram)) common += 1;
  return Math.round(100 * common / source.grams.size);
}

export function classifyReview(row, index, pilotDecision, overlapPercent, topicWords) {
  if (pilotDecision) return {
    bucket: 'ALREADY_IN_PILOT', reason: 'Existing reversible redirect cohort; measure before changing.',
  };
  if (row.is_curated === 'yes') return {
    bucket: 'PROTECT', reason: 'Curated page; review quality and legal accuracy, preserve its route.',
  };
  if (Number(row.gsc_clicks) > 0 || Number(row.gsc_ai_impressions) > 0) return {
    bucket: 'PROTECT', reason: 'Observed search clicks or AI feature visibility.',
  };
  if (index?.status === 'indexed') return {
    bucket: 'PROTECT', reason: 'Google currently indexes this URL, even if clicks are low.',
  };
  if (Number(row.gsc_impressions) >= 1000) return {
    bucket: 'PROTECT', reason: 'At least 1,000 observed search impressions.',
  };
  if (row.recommendation === 'ENRICH' || Number(row.gsc_impressions) >= 10) return {
    bucket: 'IMPROVE', reason: 'Destination page or observed search opportunity; review query intent and unique value.',
  };
  if (row.gsc_evidence_status !== 'observed_page_row') return {
    bucket: 'EVIDENCE_GAP', reason: 'Absent from the performance export; demand is unknown, not zero.',
  };
  if (!index) return {
    bucket: 'EVIDENCE_GAP', reason: 'No page-level index status in the supplied indexing examples.',
  };
  if (row.recommendation === 'MERGE_CANDIDATE' && row.possible_merge_target &&
      ['discovered_not_indexed', 'crawled_not_indexed', 'google_chose_other_canonical'].includes(index.status) &&
      topicWords !== '' && topicWords < 180 &&
      overlapPercent !== '' && overlapPercent >= 60) return {
    bucket: 'RETIRE_REVIEW', reason: 'Low observed search signal, excluded by Google, short topic section and shared service copy; manually verify intent, links, conversions and legal facts against the target.',
  };
  return {
    bucket: 'MANUAL_REVIEW', reason: 'Structural overlap or indexing issue requires URL-level judgment.',
  };
}

export function buildQueue({ manifest, gscBySlug, aiBySlug, indexingBySlug, pilotBySlug, snapshotDir }) {
  const scored = scoreManifest(manifest, { gscBySlug, aiBySlug });
  const snapshotCache = new Map();
  const snapshot = (slug) => {
    if (snapshotCache.has(slug)) return snapshotCache.get(slug);
    const file = path.join(snapshotDir, slug, 'index.html');
    let content = null;
    if (fs.existsSync(file)) {
      const html = fs.readFileSync(file, 'utf8');
      content = { ...shingles(visibleArticle(html)), topicWords: shingles(topicIntro(html)).words };
    }
    snapshotCache.set(slug, content);
    return content;
  };

  return scored.map((row) => {
    const index = indexingBySlug?.get(row.slug);
    const pilotDecision = pilotBySlug?.get(row.slug) ?? '';
    const source = snapshot(row.slug);
    const targetSlug = row.possible_merge_target?.replace('/content/', '');
    const target = targetSlug ? snapshot(targetSlug) : null;
    const overlapPercent = overlap(source, target);
    const decision = classifyReview(row, index, pilotDecision, overlapPercent, source?.topicWords ?? '');
    return {
      review_bucket: decision.bucket, url: row.url, slug: row.slug,
      reason: decision.reason, index_status: index?.status ?? 'unknown_not_in_export',
      last_crawled: index?.lastCrawled ?? '',
      gsc_evidence_status: row.gsc_evidence_status, gsc_clicks: row.gsc_clicks,
      gsc_impressions: row.gsc_impressions,
      gsc_ai_evidence_status: row.gsc_ai_evidence_status,
      gsc_ai_impressions: row.gsc_ai_impressions,
      content_shape: row.content_shape, manifest_source: row.manifest_source,
      possible_merge_target: row.possible_merge_target,
      snapshot_words: source?.words ?? '', topic_words: source?.topicWords ?? '',
      target_overlap_percent: overlapPercent,
      pilot_decision: pilotDecision,
      review_queries: '', review_backlinks: '', review_conversions: '',
      review_unique_facts: '', review_legal_accuracy: '', final_decision: '',
    };
  }).sort((a, b) => {
    const order = ['RETIRE_REVIEW', 'IMPROVE', 'MANUAL_REVIEW', 'EVIDENCE_GAP', 'PROTECT', 'ALREADY_IN_PILOT'];
    return order.indexOf(a.review_bucket) - order.indexOf(b.review_bucket) ||
      Number(b.gsc_impressions || 0) - Number(a.gsc_impressions || 0) ||
      a.slug.localeCompare(b.slug);
  });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(rows) {
  return [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((key) => csvEscape(row[key])).join(','))].join('\n') + '\n';
}

function run(argv = process.argv.slice(2)) {
  const options = argsFrom(argv);
  if (options.help) {
    process.stdout.write('Usage: node scripts/seo-evidence/build-content-review-queue.mjs --gsc Pages.csv --gsc-ai AI-Pages.csv --indexing Indexing.csv --gsc-through YYYY-MM-DD --indexing-as-of YYYY-MM-DD --out review.csv --priority-out priority.csv --summary summary.json\nAll inputs except manifest/snapshots/pilot are optional. This is advisory and never changes public pages.\n');
    return;
  }
  if (!options.out) throw new Error('--out is required');
  const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
  const gsc = options.gsc ? readGscPageExport(fs.readFileSync(options.gsc, 'utf8')) : null;
  const ai = options.gscAi ? readGscAiPageExport(fs.readFileSync(options.gscAi, 'utf8')) : null;
  const indexing = options.indexing ? readIndexing(fs.readFileSync(options.indexing, 'utf8')) : null;
  const pilot = options.pilot && fs.existsSync(options.pilot) ? readPilot(fs.readFileSync(options.pilot, 'utf8')) : null;
  const rows = buildQueue({ manifest, gscBySlug: gsc?.bySlug, aiBySlug: ai?.bySlug,
    indexingBySlug: indexing, pilotBySlug: pilot, snapshotDir: options.snapshots });
  fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  fs.writeFileSync(options.out, writeCsv(rows));
  if (options.priorityOut) {
    fs.mkdirSync(path.dirname(path.resolve(options.priorityOut)), { recursive: true });
    fs.writeFileSync(options.priorityOut, writeCsv(rows.filter((row) => row.review_bucket === 'RETIRE_REVIEW')));
  }
  const summary = {
    generatedAt: new Date().toISOString(), manifestGeneratedAt: manifest.generatedAt,
    gscThrough: options.gscThrough ?? null, indexingAsOf: options.indexingAsOf ?? null,
    inputs: { manifest: path.resolve(options.manifest), gsc: options.gsc ? path.resolve(options.gsc) : null,
      gscAi: options.gscAi ? path.resolve(options.gscAi) : null,
      indexing: options.indexing ? path.resolve(options.indexing) : null },
    coverage: { manifestUrls: rows.length, observedPerformanceUrls: rows.filter((r) => r.gsc_evidence_status === 'observed_page_row').length,
      observedAiUrls: rows.filter((r) => r.gsc_ai_evidence_status === 'observed_ai_page_row').length,
      observedIndexStatuses: rows.filter((r) => r.index_status !== 'unknown_not_in_export').length,
      missingSnapshots: rows.filter((r) => r.snapshot_words === '').length },
    buckets: Object.fromEntries([...new Set(rows.map((r) => r.review_bucket))]
      .map((bucket) => [bucket, rows.filter((r) => r.review_bucket === bucket).length])),
    guardrails: { retireReviewWithClicks: rows.filter((r) => r.review_bucket === 'RETIRE_REVIEW' && Number(r.gsc_clicks) > 0).length,
      retireReviewIndexed: rows.filter((r) => r.review_bucket === 'RETIRE_REVIEW' && r.index_status === 'indexed').length,
      retireReviewInPilot: rows.filter((r) => r.review_bucket === 'RETIRE_REVIEW' && r.pilot_decision).length },
    caveats: [
      'Search Console Pages rows omit some URLs; missing rows are unknown, not zero.',
      'Indexing examples may omit URLs and reflect the report date rather than current live state.',
      'Text overlap includes repeated service language; topic_words counts the introduction before the service section. Neither proves duplicate intent or legal equivalence.',
      'Backlinks, conversions, queries and legal accuracy require manual evidence before a redirect.',
    ],
  };
  if (options.summary) {
    fs.mkdirSync(path.dirname(path.resolve(options.summary)), { recursive: true });
    fs.writeFileSync(options.summary, JSON.stringify(summary, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) {
    process.stderr.write(`content review queue failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
