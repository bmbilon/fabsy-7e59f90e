// Local static server for dist-anderhue that mirrors the Vercel routing in
// ontario/anderhue-paralegal-site/vercel.json (clean URLs plus app rewrites).
// Used by Playwright QA scripts; never talks to Supabase.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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

export async function startAnderhueServer(root = path.resolve('dist-anderhue')) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const target = resolveAnderhuePath(root, pathname);
    if (!target) { response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    response.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream');
    response.end(readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise(resolve => server.close(resolve)) };
}
