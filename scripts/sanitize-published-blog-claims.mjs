#!/usr/bin/env node

import 'dotenv/config';
import { articleViolations, fetchPublishedPosts } from './audit-published-content-guardrails.mjs';
import { guardPublishedBlogFields } from '../src/lib/published-content-guardrails-core.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY_BLOG_SANITIZATION === '1';

if (APPLY && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to apply changes.');
  process.exit(1);
}

function sanitizePost(post) {
  const guarded = guardPublishedBlogFields(post);
  return {
    title: guarded.title,
    meta_description: guarded.meta_description,
    content: guarded.content,
  };
}

async function updatePost(id, fields) {
  const url = new URL('/rest/v1/blog_posts', SUPABASE_URL);
  url.searchParams.set('id', `eq.${id}`);
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Supabase update failed (${response.status}).`);
}

async function main() {
  const posts = await fetchPublishedPosts();
  const changes = [];

  for (const post of posts) {
    const next = sanitizePost(post);
    const changedFields = Object.keys(next).filter((field) => next[field] !== String(post[field] || ''));
    if (!changedFields.length) continue;
    const candidate = { ...post, ...next };
    const violations = articleViolations(candidate);
    if (violations.length) {
      throw new Error(`${post.slug} remains unsafe: ${violations.join('; ')}`);
    }
    changes.push({ post, next, changedFields });
  }

  console.log(`${APPLY ? 'Applying' : 'Dry run:'} ${changes.length} published post update(s).`);
  for (const change of changes) {
    console.log(` - ${change.post.slug}: ${change.changedFields.join(', ')}`);
    if (APPLY) await updatePost(change.post.id, change.next);
  }
  if (!APPLY) console.log('Set APPLY_BLOG_SANITIZATION=1 to apply these reviewed transformations.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
