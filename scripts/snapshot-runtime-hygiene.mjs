/** Remove capture-generated Google analytics scripts, never page content. */
import { JSDOM } from 'jsdom';

export function stripCapturedTrackingScripts(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, block => {
    // External runtime scripts are empty elements. Never erase inline source,
    // JSON-LD or a content claim merely because a tag also names a provider.
    if (!/>\s*<\/script\s*>$/i.test(block)) return block;
    const src = JSDOM.fragment(block).querySelector('script')?.getAttribute('src');
    if (!src) return block;
    let url;
    try { url = new URL(src); } catch { return block; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return block;
    const tagLoader = url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js';
    const conversion = ['googleads.g.doubleclick.net', 'www.googleadservices.com'].includes(url.hostname) &&
      /^\/pagead\/(?:viewthroughconversion|conversion)\/\d+\/?$/.test(url.pathname);
    return tagLoader || conversion ? '' : block;
  });
}
