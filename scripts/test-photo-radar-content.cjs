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
const feeRefund = read('src/config/feeRefund.json');
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
  assert.ok(page.next.includes(feeRefund.photoHeadline));
  assert.ok(page.next.includes(feeRefund.photoCondition));
  assert.ok(page.next.includes(feeRefund.payment));
  assert.ok(page.next.includes(`href="${feeRefund.termsPath}"`));

  for (const [from, to] of [
    [feeRefund.payment, 'No payment is required.'],
    [feeRefund.photoCondition, feeRefund.photoCondition.replace('30 days', '60 days')],
    [feeRefund.photoCondition, feeRefund.photoCondition.replace('of receiving the rejection', 'after checkout')],
    [feeRefund.photoCondition, feeRefund.photoCondition.replace('of receiving the rejection', 'of receiving a preliminary Crown offer')],
    [feeRefund.termsPath, '/submit-ticket'],
  ]) {
    const changed = { ...page, next: page.next.replace(from, to) };
    assert.notEqual(changed.next, page.next, `${slug}: refund mutation must apply`);
    assert.ok(curatedPageIssues(changed).includes('next: complete reviewed Photo Radar fee-refund notice is required'), `${slug}: refund conditions and link stay complete`);
  }

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
assert.deepEqual(textGuardrailIssues(feeRefund.photoCondition, slugs[0]), [], 'The entire reviewed Crown-rejection business-policy bullet is admitted');
assert.ok(textGuardrailIssues(feeRefund.photoCondition, 'speeding-ticket-alberta').includes('unsupported duration or deadline claim'), 'The camera-only clause does not migrate to an officer guide');
for (const [copy, issue] of [
  [feeRefund.photoCondition.replace('30 days', '31 days'), 'unsupported duration or deadline claim'],
  [feeRefund.photoCondition.replace('of receiving the rejection', 'after checkout'), 'unsupported duration or deadline claim'],
  [feeRefund.photoCondition.replace('of receiving the rejection', 'of receiving a preliminary Crown offer'), 'unsupported duration or deadline claim'],
  ['If a Crown offer does not reduce the original fine on your photo radar or red-light camera notice, Fabsy refunds the service fee you paid within 30 days of receiving that offer. These notices have no demerits.', 'unsupported duration or deadline claim'],
  [`${feeRefund.photoCondition} A withdrawal is guaranteed.`, 'banned phrase'],
  [`${feeRefund.photoCondition} The statutory fine is $79.`, 'unsupported monetary legal claim'],
  ['We guarantee fewer demerits within 30 days.', 'banned phrase'],
  ['Your response deadline is 30 days.', 'unsupported duration or deadline claim'],
]) assert.ok(textGuardrailIssues(copy, slugs[0]).includes(issue), `Only a complete exact refund clause is approved: ${copy}`);

console.log('Photo radar content, FAQ parity and narrow legal guardrail checks passed.');
