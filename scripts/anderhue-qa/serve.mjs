// Local static server for dist-anderhue that mirrors the Vercel routing and
// headers in ontario/anderhue-paralegal-site/vercel.json (clean URLs, app
// rewrites, and the response headers, including the Content-Security-Policy,
// so browser QA catches CSP violations). Never talks to Supabase.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { makePdf } from './pdf.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

export function resolveAnderhuePath(root, pathname) {
  if (pathname === '/start' || pathname.startsWith('/start/') || pathname === '/files' || pathname.startsWith('/files/')) {
    return path.join(root, 'client.html');
  }
  if (pathname === '/sign-in' || pathname === '/admin' || pathname.startsWith('/admin/')) return path.join(root, 'portal.html');
  if (pathname === '/') return path.join(root, 'index.html');
  const direct = path.join(root, decodeURIComponent(pathname));
  if (!direct.startsWith(root)) return null;
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  if (existsSync(`${direct}.html`)) return `${direct}.html`;
  return null;
}

// Vercel source patterns used in vercel.json: literal paths, "(.*)" groups and ":name*" segments.
function sourcePattern(source) {
  const pattern = source.split('(.*)').map(part => part
    .split(/(\/:[a-z]+\*)/i)
    .map(piece => /^\/:[a-z]+\*$/i.test(piece) ? '(?:/.*)?' : piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('')).join('(.*)');
  return new RegExp(`^${pattern}$`);
}

export function vercelHeaders(root, { local = true } = {}) {
  const file = path.join(root, 'vercel.json');
  if (!existsSync(file)) return () => ({});
  const rules = (JSON.parse(readFileSync(file, 'utf8')).headers || [])
    .map(rule => ({ pattern: sourcePattern(rule.source), headers: rule.headers }));
  return pathname => {
    const result = {};
    for (const rule of rules) {
      if (!rule.pattern.test(pathname)) continue;
      for (const { key, value } of rule.headers) {
        // Plain-http localhost cannot honour HTTPS-only directives.
        if (local && key === 'Strict-Transport-Security') continue;
        result[key] = local && key === 'Content-Security-Policy'
          ? value.replace(/;\s*upgrade-insecure-requests/, '') : value;
      }
    }
    return result;
  };
}

export async function startAnderhueServer(root = path.resolve('dist-anderhue'), { headers = true } = {}) {
  const headersFor = headers ? vercelHeaders(root) : () => ({});
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    // Serve a real HTTP attachment: WebKit cannot emit download events for
    // route.fulfill() PDFs (playwright#22691). This endpoint exists only in QA.
    if (pathname === '/__qa__/download.pdf' || pathname === '/__qa__/preview.pdf') {
      const name = (url.searchParams.get('name') || 'document.pdf').replace(/[\r\n"]/g, '');
      response.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${pathname.endsWith('/download.pdf') ? 'attachment' : 'inline'}; filename="${name}"`,
      }).end(makePdf(name, ['Fixture download']));
      return;
    }
    const target = resolveAnderhuePath(root, pathname);
    if (!target) { response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    for (const [key, value] of Object.entries(headersFor(pathname))) response.setHeader(key, value);
    response.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream');
    response.end(readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise(resolve => server.close(resolve)) };
}
