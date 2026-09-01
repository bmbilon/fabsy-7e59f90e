import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { curatedPageIssues } = require('./curated-content-guardrails.cjs');
const policies = JSON.parse(fs.readFileSync(path.join(root, 'src/config/seoRoutePolicies.json'), 'utf8'));
const redirectsFile = fs.readFileSync(path.join(root, 'public/_redirects'), 'utf8');
const llms = fs.readFileSync(path.join(root, 'public/llms.txt'), 'utf8');

const retired = new Map([
  ['/blog/caught-driving-over-speed-limit-alberta-fines-suspension', '/content/speeding-ticket-alberta'],
  ['/blog/caught-speeding-way-over-limit-alberta-suspension-fines-options', '/content/speeding-ticket-alberta'],
  ['/blog/construction-zone-speeding-ticket-alberta-penalties', '/content/speeding-ticket-alberta'],
  ['/blog/alberta-photo-radar-school-construction-zones-restricted', '/content/photo-radar-ticket-alberta'],
  ['/blog/alberta-rcmp-long-weekend-tickets-drivers-guide', '/content/fight-traffic-ticket-alberta'],
  ['/blog/rcmp-long-weekend-enforcement-blitz-ticket-alberta', '/content/fight-traffic-ticket-alberta'],
  ['/blog/rcmp-long-weekend-safety-campaign-ticket-alberta', '/content/fight-traffic-ticket-alberta'],
  ['/blog/rcmp-speeding-ticket-alberta-guide', '/content/speeding-ticket-alberta'],
  ['/blog/rcmp-speeding-ticket-alberta-what-to-do', '/content/speeding-ticket-alberta'],
  ['/blog/rcmp-traffic-safety-campaign-ticket-alberta', '/content/fight-traffic-ticket-alberta'],
  ['/blog/rcmp-traffic-stop-ticket-alberta-what-to-expect', '/content/fight-traffic-ticket-alberta'],
  ['/blog/high-speed-motorcycle-ticket-alberta', '/content/speeding-ticket-alberta'],
  ['/blog/speeding-182-kmh-alberta-extreme-penalties', '/content/speeding-ticket-alberta'],
  ['/blog/extreme-speeding-photo-radar-zone-alberta', '/content/speeding-ticket-alberta'],
  ['/blog/extreme-speeding-ticket-alberta-penalties', '/content/speeding-ticket-alberta'],
  ['/blog/speeding-over-230-kmh-alberta-penalties-and-options', '/content/speeding-ticket-alberta'],
  ['/blog/heritage-day-speeding-ticket-alberta-long-weekend', '/content/speeding-ticket-alberta'],
  ['/blog/photo-radar-speeding-ticket-alberta-what-to-expect', '/content/photo-radar-ticket-alberta'],
]);

for (const [source, destination] of retired) {
  assert.equal(policies.redirects[source], destination, `${source} must redirect to its reviewed canonical guide`);
  assert.ok(!policies.redirects[destination], `${source} must not create a redirect chain`);
  const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedDestination = destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(
    redirectsFile,
    new RegExp(`^${escapedSource}\\s+${escapedDestination}\\s+301$`, 'm'),
    `${source} must be mirrored for static preview hosts`,
  );
}

const speeding = JSON.parse(fs.readFileSync(path.join(root, 'ssg-pages/speeding-ticket-alberta.json'), 'utf8'));
const fight = JSON.parse(fs.readFileSync(path.join(root, 'ssg-pages/fight-traffic-ticket-alberta.json'), 'utf8'));
const photo = JSON.parse(fs.readFileSync(path.join(root, 'ssg-pages/photo-radar-ticket-alberta.json'), 'utf8'));
const offers = JSON.parse(fs.readFileSync(path.join(root, 'src/config/offers.json'), 'utf8'));

assert.match(speeding.what, /Traffic Safety Act, s\. 86/);
assert.match(speeding.what, /24-hour vehicle-seizure power in s\. 172/);
assert.match(speeding.what, /does not itself create an automatic roadside suspension or vehicle impoundment/);
assert.match(speeding.what, /Procedures Regulation, Schedule, Parts 32 and 33/);
assert.deepEqual(curatedPageIssues(speeding), [], 'the canonical speeding guide must pass crawler-snapshot guardrails');
assert.match(speeding.how, /Should I dispute the speeding ticket\?/);
assert.match(speeding.how, /Provincial Offences Procedure Act, s\. 39/);
assert.match(fight.how, /Should I dispute it\? A decision checklist/);
assert.match(fight.how, /Traffic Safety Act, ss\. 160 to 163/);
for (const page of [speeding, fight]) {
  assert.match(page.how, /relevant, non-privileged material in the prosecution's possession or control/);
  assert.match(page.how, /The prosecutor and police do not act for you or give legal advice/);
}
assert.match(photo.what, /Demerit Point Program and Service of Documents Regulation, Schedule 1/);
assert.match(photo.what, /does not list an owner contravention under Traffic Safety Act s\.160/);
assert.match(photo.what, /not a guarantee about any insurer's underwriting/);
assert.doesNotMatch(`${photo.meta_description} ${photo.hook} ${photo.what}`, /\bhas no insurance impact\b|\bOnly the fine is on the table\b/i);
for (const source of retired.keys()) assert.ok(!llms.includes(`https://fabsy.ca${source}`), `${source} must not be promoted in llms.txt`);
assert.match(llms, /current demerit schedule assigns no points to an owner conviction/);
assert.match(llms, /no insurer, premium, or underwriting result is promised/);
assert.match(offers.photoRadar.insuranceDisclaimer, /owner conviction under Traffic Safety Act s\.160 receives no demerit points/);
assert.match(offers.photoRadar.insuranceDisclaimer, /does not promise how an insurer will underwrite, price, or treat a particular record/);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-legal-sitemap-'));
try {
  const cache = path.join(temporary, 'blogs.json');
  const output = path.join(temporary, 'public');
  const posts = [
    ...Array.from(retired.keys(), source => ({ slug: source.slice('/blog/'.length), status: 'published', published_at: '2026-08-31' })),
    { slug: 'safe-current-article', status: 'published', published_at: '2026-08-31' },
  ];
  fs.writeFileSync(cache, JSON.stringify(posts), 'utf8');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/generate-sitemap-from-db.js')], {
    cwd: root,
    env: { ...process.env, SITEMAP_PUBLIC_DIR: output, SITEMAP_BLOG_CACHE: cache },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const xml = fs.readdirSync(path.join(output, 'sitemaps'))
    .filter(name => name.endsWith('.xml'))
    .map(name => fs.readFileSync(path.join(output, 'sitemaps', name), 'utf8'))
    .join('\n');
  for (const source of retired.keys()) assert.ok(!xml.includes(`https://fabsy.ca${source}`), `${source} must be absent from generated sitemaps`);
  for (const destination of new Set(retired.values())) assert.ok(xml.includes(`https://fabsy.ca${destination}`), `${destination} must remain indexable`);
  assert.ok(xml.includes('https://fabsy.ca/blog/safe-current-article'), 'unaffected current blogs remain indexable');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log('Legal content remediation redirects, citations, disclosure copy and sitemap exclusion passed.');
