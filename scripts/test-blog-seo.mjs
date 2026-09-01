import assert from 'node:assert/strict';
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

console.log('Blog SEO tests passed.');
