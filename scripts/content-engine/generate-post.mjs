#!/usr/bin/env node
/**
 * Fabsy Content Engine
 * Picks the next queued topic, generates an AEO-optimized blog post via the
 * Claude API, and inserts it into the Supabase blog_posts table.
 *
 * Required env:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional env:
 *   TOPIC_OVERRIDE   - generate for this topic instead of the queue
 *   PUBLISH_STATUS   - 'published' (default) or 'draft'
 *
 * No npm dependencies. Node 20+ (native fetch).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOPICS_FILE = path.join(__dirname, 'topics.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISH_STATUS = process.env.PUBLISH_STATUS || 'published';
const MODEL = 'claude-sonnet-4-6';

for (const [k, v] of Object.entries({ ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY })) {
  if (!v) {
    console.error(`Missing required env: ${k}`);
    process.exit(1);
  }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
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

function pickTopic() {
  if (process.env.TOPIC_OVERRIDE) {
    return { topic: process.env.TOPIC_OVERRIDE, target_keywords: [], override: true };
  }
  const topics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
  const next = topics
    .filter((t) => !t.used)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
  if (!next) {
    console.error('Topic queue exhausted. Add topics to scripts/content-engine/topics.json');
    process.exit(1);
  }
  return next;
}

function markTopicUsed(topic) {
  const topics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
  const t = topics.find((x) => x.topic === topic);
  if (t) {
    t.used = true;
    t.used_at = new Date().toISOString();
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2) + '\n');
  }
}

async function generateArticle(topic, keywords, existingSlugs) {
  const prompt = `You are the content writer for fabsy.ca, a traffic ticket defense service for Alberta drivers.

Business facts you must respect:
- Service: Fabsy fights traffic tickets for Alberta drivers.
- Pricing: flat $488 admin fee plus 30% contingency on fines saved. Never claim "no fee", "zero risk", or refunds.
- Success rate: 95%+ of tickets resolved favourably. Do not inflate beyond this.
- Audience: Alberta drivers generally. Do not gender the audience.
- CTA: direct readers to submit their ticket at https://fabsy.ca/submit-ticket

Write one blog post on the topic: "${topic}"
Target keywords: ${keywords.length ? keywords.join(', ') : 'choose 3-5 sensible Alberta traffic keywords'}

Style rules (hard requirements):
- Never use em-dashes anywhere. Use commas, parentheses, colons, or separate sentences.
- No cliche constructions ("It's not X, it's Y", "The reality is", "In today's landscape", "It's important to note").
- Vary sentence length. Direct assertions over hedging. Concrete over abstract.
- Accurate Alberta-specific facts only: demerit points, fine amounts, and procedures per the Alberta Traffic Safety Act. If a precise dollar figure is uncertain, describe the range or mechanism instead of inventing a number.
- This is general information, not legal advice. Include one short disclaimer line near the end.

Structure:
- 1200-1800 words of markdown
- H2/H3 sections, scannable
- Open with a one-sentence direct answer to the implicit question in the topic
- Include a "Frequently Asked Questions" H2 with 4-6 questions; each answer starts with a direct answer sentence, 20-50 words
- End with a CTA section pointing to https://fabsy.ca/submit-ticket

These slugs already exist, do not reuse them: ${existingSlugs.slice(0, 100).join(', ') || 'none'}

Return EXACTLY this JSON, no other text:
{
  "title": "<60-70 char post title>",
  "slug": "<url-friendly-slug>",
  "meta_description": "<under 155 chars>",
  "keywords": ["kw1", "kw2", "kw3"],
  "category": "<one of: how-to, guide, news, city-guide>",
  "content": "<full markdown article>"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.map((b) => b.text || '').join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in model response');
  const article = JSON.parse(jsonMatch[0]);

  for (const field of ['title', 'slug', 'meta_description', 'content']) {
    if (!article[field]) throw new Error(`Model output missing field: ${field}`);
  }
  // Hard guarantee: no em-dashes anywhere.
  for (const k of ['title', 'meta_description', 'content']) {
    article[k] = article[k].replaceAll('—', ', ');
  }
  article.slug = slugify(article.slug);
  return article;
}

(async () => {
  const picked = pickTopic();
  console.log(`Topic: ${picked.topic}`);

  const existing = await supabaseRest('blog_posts?select=slug&limit=500');
  const existingSlugs = existing.map((r) => r.slug);

  const article = await generateArticle(picked.topic, picked.target_keywords || [], existingSlugs);

  if (existingSlugs.includes(article.slug)) {
    article.slug = `${article.slug}-${new Date().toISOString().slice(0, 10)}`;
  }

  const wordCount = article.content.split(/\s+/).length;
  if (wordCount < 700) throw new Error(`Article too short (${wordCount} words), aborting insert`);

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
    source_data: { engine: 'github-actions', model: MODEL, topic: picked.topic },
  };

  const inserted = await supabaseRest('blog_posts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });

  console.log(`Inserted post: ${inserted[0].slug} (${wordCount} words, status: ${PUBLISH_STATUS})`);
  console.log(`Live at: https://fabsy.ca/blog/${inserted[0].slug}`);

  if (!picked.override) markTopicUsed(picked.topic);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
