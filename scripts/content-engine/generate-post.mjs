#!/usr/bin/env node
/**
 * Fabsy Content Engine (daily, search-demand driven)
 * Publishes one evergreen Alberta traffic-ticket post per run.
 *
 * Topic source priority:
 *   1. TOPIC_OVERRIDE env (manual run)
 *   2. Search-demand: Google News RSS -> deterministic scoring/quality filter
 *      -> Claude reframes the strongest signal into an EVERGREEN search topic
 *   3. Evergreen queue fallback (topics.json), with auto-refill when low
 *
 * A post always ships. Trending candidates are logged to trending-log.json
 * for audit. No paid APIs, no new secrets.
 *
 * Required env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional env: TOPIC_OVERRIDE, PUBLISH_STATUS ('published'|'draft'), TREND_MODE ('on'|'off')
 *
 * No npm dependencies. Node 20+ (native fetch).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOPICS_FILE = path.join(__dirname, 'topics.json');
const TREND_LOG = path.join(__dirname, 'trending-log.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISH_STATUS = process.env.PUBLISH_STATUS || 'published';
const TREND_MODE = (process.env.TREND_MODE || 'on').toLowerCase();
const MODEL = 'claude-sonnet-4-6';
const CTA_URL = 'https://fabsy.ca/submit-ticket';
const QUEUE_MIN = 7;
const REFILL_COUNT = 20;
const ALLOWED_CATEGORIES = new Set(['guide', 'how-to']);
const CATEGORY_ALIASES = new Map([
  ['city-guide', 'guide'],
  ['city_guide', 'guide'],
  ['city guide', 'guide'],
  ['news', 'guide'],
  ['howto', 'how-to'],
  ['how_to', 'how-to'],
  ['how to', 'how-to'],
]);

for (const [k, v] of Object.entries({ ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY })) {
  if (!v) {
    console.error(`Missing required env: ${k}`);
    process.exit(1);
  }
}

// ---------- helpers ----------
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function normalizeCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  if (ALLOWED_CATEGORIES.has(category)) return category;
  return CATEGORY_ALIASES.get(category) || 'guide';
}

function tokens(s) {
  return new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
}

function overlapRatio(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let hit = 0;
  for (const t of aSet) if (bSet.has(t)) hit++;
  return hit / aSet.size;
}

async function supabaseRest(pathAndQuery, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      ...(SERVICE_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function callClaude(prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content.map((b) => b.text || '').join('');
}

function parseJsonBlock(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found in model response');
  return JSON.parse(m[0]);
}

// ---------- source quality ----------
const TRUSTED = [
  'cbc', 'ctv', 'global news', 'globalnews', 'citynews', 'calgary herald', 'edmonton journal',
  '660 news', '630 ched', 'rcmp', 'police service', 'government of alberta', 'alberta.ca',
  'court of', 'city of calgary', 'city of edmonton', 'lethbridge', 'red deer advocate',
];
const NON_ALBERTA = [
  'ontario', 'toronto', 'ottawa', 'british columbia', 'vancouver', 'quebec', 'montreal',
  'manitoba', 'winnipeg', 'saskatchewan', 'saskatoon', 'regina', 'nova scotia', 'halifax',
  'new brunswick', 'newfoundland', 'u.s.', 'united states', 'florida', 'california', 'texas',
];
const ALBERTA = ['alberta', 'calgary', 'edmonton', 'red deer', 'lethbridge', 'fort mcmurray', 'medicine hat', 'airdrie', 'grande prairie', 'st. albert'];
const TICKET = ['ticket', 'fine', 'demerit', 'speeding', 'photo radar', 'speed camera', 'impaired', 'distracted', 'suspension', 'suspended', 'court', 'charge', 'traffic safety act', 'licence', 'license', 'careless driving', 'stunting', 'red light', 'enforcement'];
const STALE_RISK = ['charged', 'arrested', 'crash', 'collision', 'fatal', 'killed', 'dead', 'injured', 'pursuit', 'manhunt'];

// ---------- trending: fetch + deterministic scoring ----------
async function fetchTrendingHeadlines() {
  const q = 'Alberta (traffic OR speeding OR "photo radar" OR "impaired driving" OR "distracted driving" OR ticket OR demerits OR "driver licence" OR "traffic safety act") when:14d';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-CA&gl=CA&ceid=CA:en`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (fabsy-content-engine)' } });
  if (!res.ok) throw new Error(`Google News RSS ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const b = m[1];
      const pick = (tag) => {
        const t = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return t ? t[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
      };
      let title = pick('title');
      let source = pick('source');
      // Google News titles often end with " - Source"
      if (!source && / - [^-]+$/.test(title)) source = title.split(' - ').pop();
      return { title, source, pubDate: pick('pubDate') };
    })
    .filter((i) => i.title);
}

function scoreHeadline(h, existingTitleSets) {
  const text = `${h.title} ${h.source}`.toLowerCase();
  const albertaRel = ALBERTA.some((a) => text.includes(a)) ? 1 : 0;
  const ticketRel = TICKET.filter((t) => text.includes(t)).length;
  const src = h.source.toLowerCase();
  const sourceScore = TRUSTED.some((t) => src.includes(t) || text.includes(t)) ? 2 : h.source ? 1 : 0;
  const nonAlberta = !albertaRel && NON_ALBERTA.some((n) => text.includes(n));
  const staleRisk = STALE_RISK.some((s) => text.includes(s));
  const titleSet = tokens(h.title);
  let maxOverlap = 0;
  for (const set of existingTitleSets) maxOverlap = Math.max(maxOverlap, overlapRatio(titleSet, set));
  const novelty = 1 - maxOverlap;

  let score = 0;
  score += albertaRel * 3;
  score += Math.min(ticketRel, 3) * 2;
  score += sourceScore * 1.5;
  score += novelty * 2;
  if (nonAlberta) score -= 6;
  if (staleRisk) score -= 2; // event recaps make weak evergreen topics
  if (!ticketRel) score -= 2;

  return {
    title: h.title,
    source: h.source || null,
    pubDate: h.pubDate || null,
    score: Number(score.toFixed(2)),
    scores: { albertaRel, ticketRel, sourceScore, novelty: Number(novelty.toFixed(2)), nonAlberta, staleRisk },
  };
}

function dedupeCandidates(cands) {
  const seen = new Map();
  for (const c of cands) {
    const key = [...tokens(c.title)].sort().slice(0, 6).join('-');
    const prev = seen.get(key);
    if (!prev || c.score > prev.score) seen.set(key, c);
  }
  return [...seen.values()];
}

async function getTrendingTopic(existingTitles) {
  let headlines;
  try {
    headlines = await fetchTrendingHeadlines();
  } catch (e) {
    console.log(`Trending fetch failed (${e.message}); falling back to queue.`);
    return { none: true, candidates: [] };
  }
  if (!headlines.length) {
    console.log('No trending headlines; falling back to queue.');
    return { none: true, candidates: [] };
  }

  const existingTitleSets = existingTitles.map(tokens);
  let candidates = dedupeCandidates(headlines.map((h) => scoreHeadline(h, existingTitleSets)))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const shortlist = candidates.slice(0, 12);
  if (!shortlist.length) {
    console.log('No headline cleared the quality bar; falling back to queue.');
    return { none: true, candidates };
  }

  const recentLog = fs.existsSync(TREND_LOG) ? JSON.parse(fs.readFileSync(TREND_LOG, 'utf8')) : [];
  const recentTopics = recentLog.slice(-40).map((r) => r.topic).filter(Boolean);

  const prompt = `You select ONE blog topic for fabsy.ca, a traffic-ticket defense service for Alberta drivers.

You are given pre-scored Alberta news signals (higher score = more Alberta + ticket relevant, more novel, better source). Use the news only as INSPIRATION for an EVERGREEN, search-intent topic. Reject weak "news recap" framings.

BAD (news recap, reject): "New Alberta photo radar enforcement story", "Driver charged after crash on QEII"
GOOD (evergreen search intent, pick this style):
- "What Happens If You Get a Distracted Driving Ticket in Alberta?"
- "Can You Fight a Photo Radar Ticket in Alberta?"
- "How Demerit Points Work in Alberta"
- "What To Do After Getting a Speeding Ticket in Alberta"

Scored signals:
${shortlist.map((c, i) => `${i + 1}. [score ${c.score}] ${c.title}${c.source ? ' (' + c.source + ')' : ''}`).join('\n')}

Existing post titles (avoid overlap): ${existingTitles.slice(0, 120).join(' | ') || 'none'}
Recent engine topics (avoid repeats): ${recentTopics.join(' | ') || 'none'}

Rules:
- The topic must be evergreen and match what an Alberta driver would actually search.
- Do not rely on any single headline for specific legal facts; the article will use cautious general language.
- If no signal supports a strong evergreen ticket topic, return {"none": true}.

Return EXACTLY this JSON, no other text:
{ "topic": "<evergreen search-intent topic>", "news_hook": "<the signal it was inspired by, one line>", "target_keywords": ["kw1","kw2","kw3"] }`;

  let pick;
  try {
    pick = parseJsonBlock(await callClaude(prompt, 600));
  } catch (e) {
    console.log(`Trending selection failed (${e.message}); falling back to queue.`);
    return { none: true, candidates };
  }
  if (pick.none || !pick.topic) {
    console.log('Claude rejected all signals as non-evergreen; falling back to queue.');
    return { none: true, candidates };
  }
  return { topic: pick.topic, news_hook: pick.news_hook || '', target_keywords: pick.target_keywords || [], source: 'trending', candidates };
}

// ---------- evergreen queue + auto-refill ----------
function readQueue() {
  return JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
}

async function refillQueueIfLow(existingSlugs, existingTitles) {
  const topics = readQueue();
  const unused = topics.filter((t) => !t.used);
  if (unused.length >= QUEUE_MIN) return;

  console.log(`Queue low (${unused.length} unused < ${QUEUE_MIN}); refilling.`);
  const existing = new Set([
    ...existingSlugs,
    ...existingTitles.map(slugify),
    ...topics.map((t) => slugify(t.topic)),
  ]);
  const recentLog = fs.existsSync(TREND_LOG) ? JSON.parse(fs.readFileSync(TREND_LOG, 'utf8')) : [];
  recentLog.slice(-40).forEach((r) => r.topic && existing.add(slugify(r.topic)));

  const prompt = `Generate ${REFILL_COUNT} fresh EVERGREEN blog topics for fabsy.ca, a traffic-ticket defense service for Alberta drivers.
Each must be a distinct, high search-intent topic an Alberta driver would search (tickets, fines, demerits, enforcement, licence, court process, specific offences, city-specific variants).
Avoid these existing topics (by meaning): ${[...existing].slice(0, 150).join(', ')}

Return EXACTLY this JSON array, no other text:
[ { "topic": "...", "priority": <50-90>, "target_keywords": ["kw1","kw2","kw3"] }, ... ]`;

  let fresh;
  try {
    const text = await callClaude(prompt, 2000);
    const m = text.match(/\[[\s\S]*\]/);
    fresh = m ? JSON.parse(m[0]) : [];
  } catch (e) {
    console.log(`Refill generation failed (${e.message}); continuing without refill.`);
    return;
  }
  let added = 0;
  for (const f of fresh) {
    if (!f.topic) continue;
    const s = slugify(f.topic);
    if (existing.has(s)) continue;
    existing.add(s);
    topics.push({ topic: f.topic, priority: f.priority || 60, target_keywords: f.target_keywords || [], used: false, added_at: new Date().toISOString() });
    added++;
  }
  if (added) {
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2) + '\n');
    console.log(`Auto-refill added ${added} topics.`);
  }
}

function getQueueTopic() {
  const topics = readQueue();
  const next = topics.filter((t) => !t.used).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
  if (!next) {
    console.error('Topic queue exhausted and refill produced nothing.');
    process.exit(1);
  }
  return { ...next, source: 'queue' };
}

function markTopicUsed(topic) {
  const topics = readQueue();
  const t = topics.find((x) => x.topic === topic);
  if (t) {
    t.used = true;
    t.used_at = new Date().toISOString();
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2) + '\n');
  }
}

function logTrending(entry) {
  const log = fs.existsSync(TREND_LOG) ? JSON.parse(fs.readFileSync(TREND_LOG, 'utf8')) : [];
  log.push(entry);
  fs.writeFileSync(TREND_LOG, JSON.stringify(log.slice(-200), null, 2) + '\n');
}

async function pickTopic(existingTitles) {
  if (process.env.TOPIC_OVERRIDE) {
    return { topic: process.env.TOPIC_OVERRIDE, target_keywords: [], source: 'override', candidates: [] };
  }
  if (TREND_MODE !== 'off') {
    const trending = await getTrendingTopic(existingTitles);
    if (!trending.none) return trending;
    return { ...getQueueTopic(), candidates: trending.candidates };
  }
  return { ...getQueueTopic(), candidates: [] };
}

// ---------- article generation + validation ----------
const META_MAX = 150;
const FORBIDDEN = [
  // "no win, no fee" / "no-win no-fee" only - not bare "no win"/"window"/"no fee"
  { re: /no[\s-]?win[\s,-]+no[\s-]?fee/i, label: 'no-win-no-fee claim' },
  { re: /\bzero[\s-]?risk\b/i, label: 'zero-risk claim' },
  { re: /\brisk[\s-]?free\b/i, label: 'risk-free claim' },
  { re: /\bmoney[\s-]?back\b/i, label: 'money-back claim' },
  { re: /\brefund/i, label: 'refund claim' },
  // promissory guarantee only - allow honest "no outcome can be guaranteed"
  { re: /\bwe\s+guarantee\b/i, label: 'guarantee promise' },
  { re: /\bguarantee(s|d)?\s+(you\s+)?(a\s+)?(win|results?|outcomes?|success|dismissal|victory)/i, label: 'guarantee-of-outcome claim' },
];

function normalizeMeta(s) {
  let m = String(s || '').replace(/—/g, ', ').trim();
  if (m.length > META_MAX) {
    m = m.slice(0, META_MAX);
    const sp = m.lastIndexOf(' ');
    if (sp > 60) m = m.slice(0, sp);
    m = m.replace(/[\s,;:.]+$/, '');
  }
  return m;
}

function validateArticle(a) {
  const errs = [];
  if (!a.title) errs.push('missing title');
  if (!a.slug) errs.push('missing slug');
  if (!a.meta_description) errs.push('missing meta_description');
  else if (a.meta_description.length > META_MAX) errs.push(`meta_description ${a.meta_description.length} > ${META_MAX}`);
  const wc = (a.content || '').split(/\s+/).filter(Boolean).length;
  if (wc < 900) errs.push(`content ${wc} words < 900`);
  const blob = `${a.title} ${a.meta_description} ${a.content}`;
  if (blob.includes('—')) errs.push('contains em-dash');
  for (const f of FORBIDDEN) if (f.re.test(blob)) errs.push(`forbidden: ${f.label}`);
  if (!(a.content || '').includes('fabsy.ca/submit-ticket')) errs.push('missing CTA URL');
  if (!['published', 'draft'].includes(PUBLISH_STATUS)) errs.push(`bad status: ${PUBLISH_STATUS}`);
  return errs;
}

async function generateArticleOnce(picked, existingSlugs, corrective) {
  const newsLine = picked.news_hook
    ? `\nThis topic was inspired by a current Alberta signal: "${picked.news_hook}". Use it only as framing. The article must remain EVERGREEN and must not recap the news event or depend on its specifics.`
    : '';
  const prompt = `You are the content writer for fabsy.ca, a traffic ticket defense service for Alberta drivers.

Business facts (must respect exactly):
- Service: Fabsy fights traffic tickets for Alberta drivers.
- Pricing: flat $488 admin fee plus 30% contingency on fines saved.
- Never use "no win, no fee", "no-fee", "zero risk", "risk-free", "money back", "refund", or any guarantee-of-outcome language.
- Success rate: 95%+ of tickets resolved favourably. Do not inflate.
- Audience: Alberta drivers generally. Do not gender the audience.
- CTA: direct readers to submit their ticket at ${CTA_URL}

Topic: "${picked.topic}"
Target keywords: ${(picked.target_keywords || []).length ? picked.target_keywords.join(', ') : 'choose 3-5 sensible Alberta traffic keywords'}${newsLine}

Accuracy rules (critical):
- Do NOT fabricate fine amounts, demerit point counts, limitation periods, court deadlines, or procedural steps.
- If exact Alberta-law details are uncertain, use cautious general language ("often", "typically", "in many cases", "check the current Alberta rules") instead of inventing specifics.
- This is general information, not legal advice. Include one short disclaimer line near the end.

Style rules:
- Never use em-dashes. Use commas, parentheses, colons, or separate sentences.
- No cliche constructions ("It's not X, it's Y", "The reality is", "In today's landscape", "It's important to note").
- Vary sentence length. Direct assertions over hedging where facts are safe.

Structure:
- 1200-1800 words of markdown, H2/H3, scannable
- Open with a one-sentence direct answer to the implicit question
- "Frequently Asked Questions" H2 with 4-6 Q&As; each answer opens with a direct answer sentence, 20-50 words
- End with a CTA section linking ${CTA_URL}
${corrective ? `\nFIX THESE ISSUES from the previous attempt: ${corrective}` : ''}

These slugs exist, do not reuse: ${existingSlugs.slice(0, 100).join(', ') || 'none'}

Return EXACTLY this JSON, no other text:
{ "title": "<60-70 chars>", "slug": "<slug>", "meta_description": "<120-150 chars, hard max 150>", "keywords": ["kw1","kw2","kw3"], "category": "<how-to|guide>", "content": "<markdown>" }`;

  const a = parseJsonBlock(await callClaude(prompt, 8000));
  for (const k of ['title', 'content']) if (a[k]) a[k] = a[k].replaceAll('—', ', ');
  if (a.meta_description) a.meta_description = normalizeMeta(a.meta_description);
  if (a.slug) a.slug = slugify(a.slug);
  a.category = normalizeCategory(a.category);
  return a;
}

async function generateValidArticle(picked, existingSlugs) {
  let corrective = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const a = await generateArticleOnce(picked, existingSlugs, corrective);
    const errs = validateArticle(a);
    if (!errs.length) return a;
    corrective = errs.join('; ');
    console.log(`Validation failed (attempt ${attempt}): ${corrective}`);
  }
  throw new Error(`Article failed validation after 2 attempts: ${corrective}`);
}

// ---------- main ----------
(async () => {
  const existing = await supabaseRest('blog_posts?select=slug,title&limit=500');
  const existingSlugs = existing.map((r) => r.slug);
  const existingTitles = existing.map((r) => r.title).filter(Boolean);

  if (!process.env.TOPIC_OVERRIDE) await refillQueueIfLow(existingSlugs, existingTitles);

  const picked = await pickTopic(existingTitles);
  console.log(`Source: ${picked.source} | Topic: ${picked.topic}${picked.news_hook ? ` | Hook: ${picked.news_hook}` : ''}`);

  const article = await generateValidArticle(picked, existingSlugs);
  if (existingSlugs.includes(article.slug)) article.slug = `${article.slug}-${new Date().toISOString().slice(0, 10)}`;

  const wordCount = article.content.split(/\s+/).filter(Boolean).length;
  const now = new Date().toISOString();
  const row = {
    title: article.title,
    slug: article.slug,
    content: article.content,
    meta_description: article.meta_description,
    keywords: article.keywords || [],
    category: article.category || 'guide',
    author: 'Fabsy Team',
    status: PUBLISH_STATUS,
    published_at: PUBLISH_STATUS === 'published' ? now : null,
    ai_generated_at: now,
    source_data: { engine: 'github-actions', model: MODEL, topic: picked.topic, source: picked.source, news_hook: picked.news_hook || null },
  };

  const inserted = await supabaseRest('blog_posts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });

  console.log(`Inserted: ${inserted[0].slug} (${wordCount} words, ${PUBLISH_STATUS})`);
  console.log(`Live at: https://fabsy.ca/blog/${inserted[0].slug}`);

  if (picked.source === 'queue') markTopicUsed(picked.topic);

  // Audit log: what was considered, plus what was published
  if (picked.candidates && picked.candidates.length) {
    logTrending({
      at: now,
      chosen: picked.source === 'trending' ? picked.topic : null,
      published_slug: inserted[0].slug,
      fell_back_to: picked.source !== 'trending' ? picked.source : null,
      news_hook: picked.news_hook || null,
      topic: picked.source === 'trending' ? picked.topic : null,
      trend_candidates: picked.candidates,
    });
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
