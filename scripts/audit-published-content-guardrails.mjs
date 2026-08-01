#!/usr/bin/env node

import 'dotenv/config';
import { articleViolations } from '../src/lib/published-content-guardrails-core.js';

export { articleViolations };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function fetchPublishedPosts() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase URL and a Supabase API key are required.');
  }
  const url = new URL('/rest/v1/blog_posts', SUPABASE_URL);
  url.searchParams.set('select', 'id,slug,title,meta_description,content,status');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('order', 'slug.asc');
  url.searchParams.set('limit', '1000');
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase blog audit failed (${response.status}).`);
  return response.json();
}

async function main() {
  const posts = await fetchPublishedPosts();
  const failures = [];
  for (const post of posts) {
    const violations = articleViolations(post);
    if (violations.length) failures.push({ slug: post.slug, violations });
  }

  if (failures.length) {
    console.error(`Published blog guardrails failed for ${failures.length} of ${posts.length} post(s):`);
    for (const failure of failures) {
      console.error(` - ${failure.slug}: ${failure.violations.join('; ')}`);
      if (process.env.AUDIT_SHOW_CONTEXT === '1') {
        const post = posts.find((candidate) => candidate.slug === failure.slug);
        const compact = `${post?.title || ''} ${post?.meta_description || ''} ${post?.content || ''}`
          .replace(/\s+/g, ' ');
        const match = /no[\s-]*win[\s,;-]+no[\s-]*fee|risk[\s-]*free|money[\s-]*back|guarantee(?:s|d|ing)?|zero[\s-]*risk|(?:more\s+than|over|above)\s*95%|(?:\d{1,3})%\+?\s+(?:success|win|favourable|favorable)|\$\s*\d|\d+\s*demerit|\d+\s+days?\s+to\s+(?:pay|respond|dispute|contest|file|appeal|request)/i.exec(compact);
        if (match) {
          const start = Math.max(0, match.index - 90);
          console.error(`   context: ${compact.slice(start, match.index + match[0].length + 90)}`);
        }
      }
    }
    process.exit(1);
  }
  console.log(`Published blog guardrails valid for ${posts.length} post(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
