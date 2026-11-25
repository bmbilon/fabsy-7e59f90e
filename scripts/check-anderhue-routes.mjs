// Focused deployment contract: public routes, private aliases, assets and SEO.
// Run after build:anderhue inside the Studio sandbox.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { startAnderhueServer } from './anderhue-qa/serve.mjs';
const root = path.resolve(process.env.ANDERHUE_OUT_DIR || 'dist-anderhue');
const config = JSON.parse(readFileSync(path.join(root, 'vercel.json')));
const server = await startAnderhueServer(root);
try {
  const home = await (await fetch(server.origin)).text();
  assert.match(home, /AnderHue Canada/);
  const legalPages = ['', '/landlords', '/traffic-tickets', '/notary', '/privacy'];
  for (const suffix of legalPages) {
    const url = '/paralegal' + suffix;
    const response = await fetch(server.origin + url);
    const html = await response.text();
    assert.equal(response.status, 200, url);
    assert.match(html, /Professional Group/);
    assert.ok(html.includes(`href="https://anderhue.ca${url}"`), `${url} canonical`);
    for (const [, asset] of html.matchAll(/(?:src|href|srcset)="(\/paralegal\/[^"?#]+\.(?:png|webp|css|js))"/g)) {
      assert.ok(existsSync(path.join(root, asset)), `${url} asset ${asset}`);
    }
  }
  for (const prefix of ['', '/paralegal']) {
    for (const route of ['/start', '/files', '/files/traffic/example', '/admin', '/admin/today', '/sign-in']) {
      const url = prefix + route;
      const response = await fetch(server.origin + url + '?preserved=1');
      const html = await response.text();
      assert.equal(response.status, 200, url);
      assert.match(html, /id="root"/);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', url);
      const rewrite = config.rewrites.find(r => r.source === url || (r.source.endsWith('/:path*') && url.startsWith(r.source.replace('/:path*', '/') )));
      assert.ok(rewrite, `${url} deployed rewrite exists`);
      for (const [, asset] of html.matchAll(/(?:src|href)="(\/paralegal\/assets\/[^"?#]+)"/g)) {
        assert.ok(existsSync(path.join(root, asset)), `${url} built asset ${asset}`);
      }
    }
  }
  for (const suffix of legalPages.filter(Boolean)) {
    const response = await fetch(server.origin + suffix + '?from=old-link', { redirect: 'manual' });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), '/paralegal' + suffix + '?from=old-link');
  }
  for (const asset of ['/crest-email.png', '/favicon-32.png', '/crest-mark.png']) {
    assert.equal((await fetch(server.origin + asset)).status, 200, `historical email asset ${asset}`);
  }
  const sitemap = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/anderhue.ca\/<\/loc>/);
  for (const suffix of legalPages) assert.ok(sitemap.includes(`https://anderhue.ca/paralegal${suffix}</loc>`));
  console.log('PASS: parent page, 5 paralegal pages, 12 private routes, old public redirects, historical email assets, canonical URLs and sitemap');
} finally {
  await server.close();
}
