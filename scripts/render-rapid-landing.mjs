import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Render the actual React page into the built shell, without a browser or network. */
export async function renderRapidLanding(dist = path.join(root, 'dist')) {
  const cache = path.join(root, 'node_modules/.cache');
  await fs.mkdir(cache, { recursive: true });
  const renderPath = path.join(cache, `rapid-landing-${process.pid}.mjs`);
  try {
    await build({
      stdin: { contents: `import React from 'react'; import { renderToString } from 'react-dom/server'; import { StaticRouter } from 'react-router-dom/server.js'; import Page from './src/pages/RapidResolutionAlternate'; import { createInstance } from 'i18next'; import { I18nextProvider } from 'react-i18next'; const i18n = createInstance(); i18n.init({ lng: 'en', resources: { en: { translation: {} } }, initImmediate: false }); export const html = renderToString(React.createElement(I18nextProvider, { i18n }, React.createElement(StaticRouter, { location: '/rapid-resolution-alt' }, React.createElement(Page))));`, resolveDir: root, loader: 'tsx' },
      outfile: renderPath, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      alias: { '@': path.join(root, 'src') },
      define: { 'import.meta.env': JSON.stringify({ VITE_WHATSAPP_ENABLED: process.env.VITE_WHATSAPP_ENABLED || 'false' }) },
      logLevel: 'silent',
    });
    const { html } = await import(`${pathToFileURL(renderPath).href}?time=${Date.now()}`);
    const dom = new JSDOM(await fs.readFile(path.join(dist, 'index.html'), 'utf8'));
    const doc = dom.window.document;
    doc.getElementById('root').innerHTML = html;
    doc.getElementById('root').setAttribute('data-rapid-prerender', 'true');
    doc.title = 'Rapid Resolution | Alberta Ticket Help | $198 CAD + GST';
    const setMeta = (name, content) => {
      let el = doc.querySelector(`meta[name="${name}"],meta[property="${name}"]`);
      if (!el) { el = doc.createElement('meta'); el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name); doc.head.append(el); }
      el.setAttribute('content', content);
    };
    const description = 'Fight your Alberta traffic ticket. Fabsy negotiates for a lower fine, fewer demerits or withdrawal. $198 + GST ($207.90 total). Fee-refund conditions apply.';
    for (const key of ['description', 'og:description', 'twitter:description']) setMeta(key, description);
    for (const key of ['og:title', 'twitter:title']) setMeta(key, doc.title);
    setMeta('og:url', 'https://fabsy.ca/rapid-resolution');
    setMeta('robots', 'noindex, follow');
    let canonical = doc.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = doc.createElement('link'); canonical.rel = 'canonical'; doc.head.append(canonical); }
    canonical.href = 'https://fabsy.ca/rapid-resolution';
    const output = path.join(dist, '_landing/rapid-resolution-alt');
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'index.html'), dom.serialize());
    dom.window.close();
    console.log('Rendered Rapid Resolution HTML from the current React page.');
  } finally { await fs.rm(renderPath, { force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await renderRapidLanding();
