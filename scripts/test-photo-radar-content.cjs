#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalFaq,
  curatedPageIssues,
  textGuardrailIssues,
} = require('./curated-content-guardrails.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const slugs = read('src/config/photoRadarPages.json');
const shared = read('src/config/photoRadarContent.json');
assert.equal(shared.processSteps.length, 3);
assert.equal(shared.faqs.length, 6);
assert.equal(new Set(shared.faqs.map((faq) => faq.question)).size, 6);

for (const slug of slugs) {
  const page = read(`ssg-pages/${slug}.json`);
  const client = read(`src/content/pages/${slug}.json`);
  assert.deepEqual(curatedPageIssues(page), [], slug);
  assert.deepEqual(JSON.parse(page.jsonld), canonicalFaq(page.faqs), `${slug}: FAQ parity`);
  for (const key of ['hook', 'what', 'how', 'next', 'faqs', 'sources', 'jsonld', 'reviewed_at']) {
    assert.deepEqual(client[key], page[key], `${slug}: client/snapshot ${key}`);
  }
  assert.match(page.next, /href="\/photo-radar"/);
  assert.doesNotMatch(JSON.stringify(page), /\$49\b|\$198\b|\$229\b/);
  assert.ok(page.hook.includes('no insurance impact'));
  assert.ok(page.next.includes('($82.95 total)'));

  const fabricatedFine = { ...page, what: page.what.replace('$228', '$199') };
  assert.ok(curatedPageIssues(fabricatedFine).includes('what: unsupported monetary legal claim'), `${slug}: unverified fine stays blocked`);

  const fabricatedDate = { ...page, what: page.what.replace('March 13, 2026', 'March 1, 2026') };
  assert.ok(curatedPageIssues(fabricatedDate).includes('what: unsupported numeric date claim'), `${slug}: unverified date stays blocked`);

  const poisonedSource = { ...page, sources: [{ title: 'Fake official source', url: 'https://www.calgary.ca.example.org/traffic' }] };
  assert.ok(curatedPageIssues(poisonedSource).some((issue) => issue.includes('official Alberta source')), `${slug}: source hostname boundary`);
}

const verifiedFine = "Alberta's current standard speeding table lists $228 for 20 km/h over and $324 for 30 km/h over, including the 20% victim surcharge.";
assert.ok(textGuardrailIssues(verifiedFine, 'speeding-ticket-alberta').includes('unsupported monetary legal claim'), 'Photo radar exception does not approve unrelated pages');
assert.ok(textGuardrailIssues('Pay Fabsy a $79 fee.', slugs[0]).includes('partial or inexact Fabsy pricing'), 'Incomplete service pricing stays blocked');
assert.ok(textGuardrailIssues('A withdrawal is guaranteed.', slugs[0]).includes('banned phrase'), 'Outcome promise stays blocked');
assert.ok(textGuardrailIssues('All fines are $999.', slugs[0]).includes('unsupported monetary legal claim'), 'Arbitrary numeric claims stay blocked');

console.log('Photo radar content, FAQ parity and narrow legal guardrail checks passed.');
