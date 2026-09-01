import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  canonicalFromHtml,
  collectChangedUrls,
  indexNowPayload,
  isIndexableHtml,
  normalizePublicUrl,
  parseNameStatus,
  submitIndexNow,
} from './submit-indexnow.mjs';

const indexable = '<html><head><meta content="index, follow" name="robots"><link href="https://fabsy.ca/content/speeding-ticket-alberta" rel="canonical"></head></html>';
const hidden = indexable.replace('index, follow', 'noindex, follow');
assert.equal(canonicalFromHtml(indexable), 'https://fabsy.ca/content/speeding-ticket-alberta');
assert.equal(isIndexableHtml(indexable), true);
assert.equal(isIndexableHtml(hidden), false);
assert.equal(normalizePublicUrl('/blog/example'), 'https://fabsy.ca/blog/example');
assert.throws(() => normalizePublicUrl('https://example.com/page'), /fabsy\.ca/);

assert.deepEqual(
  parseNameStatus(Buffer.from('M\0public/prerendered/content/a/index.html\0D\0public/prerendered/blog/b/index.html\0R100\0old\0new\0')),
  [
    { status: 'M', path: 'public/prerendered/content/a/index.html' },
    { status: 'D', path: 'public/prerendered/blog/b/index.html' },
    { status: 'R100', oldPath: 'old', path: 'new' },
  ],
);

const payload = indexNowPayload([
  'https://fabsy.ca/content/speeding-ticket-alberta',
  '/content/speeding-ticket-alberta',
  '/blog/example',
]);
assert.equal(payload.host, 'fabsy.ca');
assert.equal(payload.key, INDEXNOW_KEY);
assert.equal(payload.keyLocation, INDEXNOW_KEY_LOCATION);
assert.deepEqual(payload.urlList, [
  'https://fabsy.ca/blog/example',
  'https://fabsy.ca/content/speeding-ticket-alberta',
]);

let request;
const accepted = await submitIndexNow(payload.urlList, async (url, options) => {
  request = { url, options };
  return new Response('', { status: 202 });
});
assert.equal(accepted.status, 202);
assert.equal(request.url, INDEXNOW_ENDPOINT);
assert.deepEqual(JSON.parse(request.options.body), payload);

await assert.rejects(
  () => submitIndexNow(['/blog/example'], async () => new Response('bad key', { status: 403 })),
  /key verification failed/,
);

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-indexnow-'));
const git = (...args) => execFileSync('git', args, { cwd: fixtureRoot, stdio: 'ignore' });
const snapshot = (canonical, robots = 'index, follow', marker = '') =>
  `<html><head><meta name="robots" content="${robots}"><link rel="canonical" href="https://fabsy.ca${canonical}"></head><body>${marker}</body></html>`;
const write = (filename, value) => {
  const target = path.join(fixtureRoot, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
};

try {
  git('init', '-q');
  git('config', 'user.name', 'IndexNow Test');
  git('config', 'user.email', 'indexnow@example.test');
  write('public/prerendered/index.html', snapshot('/'));
  write('public/prerendered/faq.html', snapshot('/faq'));
  write('public/prerendered/blog/hide/index.html', snapshot('/blog/hide'));
  write('public/prerendered/blog/rename-old/index.html', snapshot('/blog/rename-old'));
  write('public/prerendered/blog/delete/index.html', snapshot('/blog/delete'));
  git('add', '.');
  git('commit', '-qm', 'fixture baseline');

  write('public/prerendered/index.html', snapshot('/', 'index, follow', 'updated'));
  write('public/prerendered/faq.html', snapshot('/faq', 'index, follow', 'updated'));
  write('public/prerendered/blog/hide/index.html', snapshot('/blog/hide', 'noindex, follow'));
  fs.renameSync(
    path.join(fixtureRoot, 'public/prerendered/blog/rename-old'),
    path.join(fixtureRoot, 'public/prerendered/blog/rename-new'),
  );
  write('public/prerendered/blog/rename-new/index.html', snapshot('/blog/rename-new'));
  fs.rmSync(path.join(fixtureRoot, 'public/prerendered/blog/delete'), { recursive: true });

  assert.deepEqual(
    collectChangedUrls({ repoRoot: fixtureRoot, fromRef: 'HEAD', toRef: 'WORKTREE' }),
    [
      'https://fabsy.ca/',
      'https://fabsy.ca/blog/delete',
      'https://fabsy.ca/blog/hide',
      'https://fabsy.ca/blog/rename-new',
      'https://fabsy.ca/blog/rename-old',
      'https://fabsy.ca/faq',
    ],
  );

  git('add', '-A');
  git('commit', '-qm', 'fixture content changes');
  write(`public/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
  assert.deepEqual(
    collectChangedUrls({ repoRoot: fixtureRoot, fromRef: 'HEAD', toRef: 'WORKTREE' }),
    ['https://fabsy.ca/'],
  );
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('IndexNow tests passed.');
