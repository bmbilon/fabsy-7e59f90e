#!/usr/bin/env node
// Read-only HTTP audit. A simulated user agent does not verify OpenAI IP access
// or prove that a page is indexed, cited, or recommended in consumer ChatGPT.
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const base = 'https://fabsy.ca';
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/audit-chatgpt-crawl.mjs <report.json>');
const routes = [
  '/', '/hubs/alberta-tickets-101', '/hubs/court-options-and-deadlines',
  '/hubs/photo-radar-vs-officer-issued', '/content/alberta-tickets-101',
  '/content/speeding-ticket-alberta', '/rapid-resolution', '/photo-radar',
  '/ai-info', '/founder',
];
const agents = {
  browser: 'Mozilla/5.0 (compatible; FabsyReadOnlyAudit/1.0)',
  simulatedSearchBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot)',
};

async function inspect(route, agent) {
  const url = new URL(route, base).href;
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': agents[agent] },
      signal: AbortSignal.timeout(20000),
    });
    const html = await response.text();
    const dom = new JSDOM(html, { url: response.url });
    const doc = dom.window.document;
    const canonical = doc.querySelector('link[rel="canonical"]')?.href ?? null;
    const robots = [...doc.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')]
      .map(node => node.getAttribute('content'));
    const schemas = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(node => {
      try { return { valid: true, data: JSON.parse(node.textContent) }; }
      catch { return { valid: false }; }
    });
    const h1 = [...doc.querySelectorAll('h1')].map(node => node.textContent.trim());
    const main = doc.querySelector('article') || doc.querySelector('main') || doc.body;
    main.querySelectorAll('script,style,header,footer,nav').forEach(node => node.remove());
    const content = main.textContent.replace(/\s+/g, ' ').trim();
    const officialLinks = [...main.querySelectorAll('a[href]')].map(node => node.href)
      .filter(href => /^https:\/\/(?:[\w-]+\.)?(?:alberta\.ca|albertacourts\.ca)\//.test(href));
    const result = {
      route, agent, url, finalUrl: response.url, status: response.status,
      contentType: response.headers.get('content-type'),
      prerendered: response.headers.get('x-prerendered'),
      robotsHeader: response.headers.get('x-robots-tag'),
      canonical, selfCanonical: canonical === url, robots, title: doc.title, h1,
      mainWordCount: content ? content.split(/\s+/).length : 0,
      excerpt: content.slice(0, 1000), officialLinks: [...new Set(officialLinks)], schemas,
    };
    dom.window.close();
    return result;
  } catch (error) {
    return { route, agent, url, error: error.message };
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  methodology: 'Unauthenticated HTTP GETs from the local machine, without JavaScript execution. User-agent simulation only; not evidence of verified OpenAI crawler access or ChatGPT ranking.',
  robots: null,
  pages: [],
};
try {
  const response = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(20000) });
  report.robots = { status: response.status, text: await response.text() };
} catch (error) { report.robots = { error: error.message }; }
for (const route of routes) {
  const results = await Promise.all(Object.keys(agents).map(agent => inspect(route, agent)));
  report.pages.push(...results);
  for (const result of results) console.log(JSON.stringify({
    route, agent: result.agent, status: result.status, error: result.error,
    selfCanonical: result.selfCanonical, words: result.mainWordCount, h1: result.h1,
  }));
}
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Saved ${report.pages.length} HTTP observations to ${output}`);
