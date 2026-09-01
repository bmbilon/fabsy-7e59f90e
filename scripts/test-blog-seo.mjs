import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  blogEditorialDateDisplay,
  blogEditorialDateKey,
  blogCanonical,
  blogSeoTitle,
  buildBlogPostingSchema,
  formatBlogEditorialDate,
  latestEditorialDate,
  officialBlogSources,
} from '../src/lib/blog-seo.js';

const post = {
  slug: 'alberta-traffic-trial-evidence-self-represented',
  title: 'Alberta Traffic Trial Evidence: What Self-Represented Drivers Face',
  meta_description: 'A source-backed guide to evidence and procedure.',
  author: 'Fabsy Editorial Team',
  category: 'guide',
  keywords: ['Alberta traffic trial', 'traffic ticket evidence'],
  published_at: '2026-08-31T20:00:00.000Z',
  updated_at: '2026-08-31T21:00:00.000Z',
  reviewed_at: '2026-08-31T20:30:00.000Z',
  source_data: {
    official_sources: [
      'https://albertacourts.ca/cj/areas-of-law/traffic',
      'https://albertacourts.ca/cj/areas-of-law/traffic',
      'javascript:alert(1)',
    ],
  },
};

assert.equal(
  blogSeoTitle(post.title),
  'Alberta Traffic Trial Evidence: What Self-Represented Drivers Face | Fabsy',
  'SEO titles must retain the complete editorial headline',
);
assert.equal(blogCanonical(post.slug), `https://fabsy.ca/blog/${post.slug}`);
assert.equal(latestEditorialDate(post), post.updated_at, 'the latest truthful editorial timestamp must win');
assert.equal(formatBlogEditorialDate('2026-09-01T00:18:27.000Z'), 'August 31, 2026');
assert.equal(
  blogEditorialDateKey('2026-09-01T00:18:27.000Z'),
  blogEditorialDateKey('2026-08-31T20:30:00.000Z'),
  'same Edmonton calendar dates must share one display key',
);
assert.deepEqual(blogEditorialDateDisplay(post), {
  published: { value: post.published_at, reviewed: true },
  modified: null,
  reviewed: null,
});
assert.deepEqual(officialBlogSources(post.source_data), ['https://albertacourts.ca/cj/areas-of-law/traffic']);

const schema = buildBlogPostingSchema(post);
assert.equal(schema.headline, post.title);
assert.equal(schema.url, blogCanonical(post.slug));
assert.equal(schema.mainEntityOfPage['@id'], schema.url);
assert.equal(schema.author.name, post.author);
assert.equal(schema.author.url, 'https://fabsy.ca/about');
assert.equal(schema.datePublished, post.published_at);
assert.equal(schema.dateModified, post.updated_at);
assert.deepEqual(schema.citation, ['https://albertacourts.ca/cj/areas-of-law/traffic']);

const blogIndex = fs.readFileSync(new URL('../src/pages/Blog.tsx', import.meta.url), 'utf8');
const blogPost = fs.readFileSync(new URL('../src/pages/BlogPost.tsx', import.meta.url), 'utf8');
const header = fs.readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
for (const guide of ['/content/speeding-ticket-alberta', '/content/fight-traffic-ticket-alberta']) {
  assert.equal(blogIndex.split(guide).length - 1, 1, `${guide} must be featured exactly once on the blog index`);
}
assert(blogIndex.includes('Essential Alberta ticket guides'));
assert(blogIndex.indexOf('<FeaturedGuides />') < blogIndex.indexOf('Latest Articles'), 'featured guides must precede the latest-post grid');
assert(header.includes('data-editorial-language-notice="english-only"'));
assert(header.includes('Articles and guides are currently published in English.'));
assert(header.includes('englishEditorialReturnPath(location.pathname)'), 'the English-only notice must be limited to validated editorial routes');
assert(blogIndex.includes('RETIRED_BLOG_SLUGS.has(post.slug)'), 'retired blog posts must be removed from the index grid');
assert(blogPost.includes('BLOG_REDIRECTS[blogPath]'), 'client-side article navigation must honor canonical redirects');
assert(blogPost.includes('GONE_BLOG_PATHS.has(blogPath)'), 'client-side article navigation must honor removed routes');

console.log('Blog SEO tests passed.');
