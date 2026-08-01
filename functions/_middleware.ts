// Cloudflare Pages middleware: serve prerendered HTML to crawlers, SPA to humans.
// Replaces functions/faq.ts and cloudflare-worker.js. Runs on every request.

const BOT = /(bot|crawler|spider|googlebot|bingbot|duckduckbot|yandex|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|gptbot|chatgpt-user|oai-searchbot|ccbot|anthropic|claudebot|claude-web|perplexitybot|google-extended|applebot|amazonbot|bytespider|meta-externalagent)/i;

// Paths that are real assets or app internals: never rewrite these.
const PASSTHROUGH = /^\/(assets|prerendered|api|functions|favicon|robots\.txt|sitemap|og-image|_)/i;
const LEGACY_CONTENT_PATHS = new Set([
  "/fight-careless-ticket-calgary",
  "/fight-careless-ticket-edmonton",
  "/fight-careless-ticket-fort-mcmurray",
  "/fight-careless-ticket-lethbridge",
  "/fight-careless-ticket-medicine-hat",
  "/fight-careless-ticket-red-deer",
  "/fight-distracted-ticket-calgary",
  "/fight-distracted-ticket-edmonton",
  "/fight-distracted-ticket-fort-mcmurray",
  "/fight-distracted-ticket-lethbridge",
  "/fight-distracted-ticket-medicine-hat",
  "/fight-distracted-ticket-red-deer",
  "/fight-photo-radar-ticket-calgary",
  "/fight-red-light-ticket-calgary",
  "/fight-red-light-ticket-edmonton",
  "/fight-red-light-ticket-fort-mcmurray",
  "/fight-red-light-ticket-lethbridge",
  "/fight-red-light-ticket-medicine-hat",
  "/fight-red-light-ticket-red-deer",
  "/fight-speeding-ticket-calgary",
  "/fight-speeding-ticket-edmonton",
  "/fight-speeding-ticket-fort-mcmurray",
  "/fight-speeding-ticket-lethbridge",
  "/fight-speeding-ticket-medicine-hat",
  "/fight-speeding-ticket-red-deer",
  "/fight-stop-sign-ticket-alberta",
]);

function canonicalFor(pathname: string): string {
  const clean = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return `https://fabsy.ca${clean}`;
}

function canonicalFromHtml(html: string): string | null {
  const tag = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0];
  return tag?.match(/\bhref=["']([^"']+)["']/i)?.[1] || null;
}

function snapshotPath(pathname: string): string | null {
  if (PASSTHROUGH.test(pathname)) return null;
  if (/\.[a-z0-9]+$/i.test(pathname)) return null;        // has a file extension
  // Pages' ASSETS binding expects pretty paths rather than direct HTML file
  // paths (for example, /users/ instead of /users/index.html).
  if (pathname === "/" || pathname === "") return "/prerendered/";
  if (pathname === "/faq" || pathname === "/faq/") return "/prerendered/faq";
  const clean = pathname.replace(/\/+$/, "");              // strip trailing slash
  return `/prerendered${clean}/`;
}

export const onRequest: PagesFunction = async (context) => {
  const { request, env, next } = context;
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname === "/" ? "/" : requestUrl.pathname.replace(/\/+$/, "");

  // `_redirects` rules do not run for routes handled by Pages Functions, so
  // these redirects must happen in middleware for every user agent.
  if (LEGACY_CONTENT_PATHS.has(pathname)) {
    const destination = new URL(request.url);
    destination.pathname = `/content${pathname}`;
    return Response.redirect(destination, 301);
  }

  const ua = request.headers.get("User-Agent") || "";
  if (!BOT.test(ua)) return next();

  const target = snapshotPath(pathname);
  if (!target) return next();

  const noindexFallback = async (): Promise<Response> => {
    const fallback = await next();
    const fallbackHeaders = new Headers(fallback.headers);
    fallbackHeaders.set("X-Robots-Tag", "noindex, nofollow");
    fallbackHeaders.delete("X-Prerendered");
    return new Response(fallback.body, {
      status: fallback.status,
      statusText: fallback.statusText,
      headers: fallbackHeaders,
    });
  };

  try {
    // env.ASSETS serves files from the deployed static output (dist/).
    const res = await env.ASSETS.fetch(new URL(target, request.url));
    if (res.ok && res.status === 200) {
      // Cloudflare applies the SPA wildcard fallback to missing asset paths.
      // Only accept a snapshot whose self-canonical matches the requested
      // public route, otherwise the app shell could masquerade as a rendered
      // 200 and bypass redirects or create a soft-404 duplicate.
      const html = await res.clone().text();
      if (canonicalFromHtml(html) !== canonicalFor(pathname)) {
        return noindexFallback();
      }
      const h = new Headers(res.headers);
      // Direct /prerendered/* asset URLs are noindex via public/_headers. Do
      // not forward that internal-path directive when serving the same HTML at
      // its public canonical URL; the document's own robots meta remains the
      // source of truth for indexability.
      h.delete("X-Robots-Tag");
      h.set("X-Prerendered", "true");
      return new Response(res.body, { status: 200, headers: h });
    }
  } catch (_) { /* fall through to SPA */ }
  return noindexFallback();
};
