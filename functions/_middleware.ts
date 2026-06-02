// Cloudflare Pages middleware: serve prerendered HTML to crawlers, SPA to humans.
// Replaces functions/faq.ts and cloudflare-worker.js. Runs on every request.

const BOT = /(bot|crawler|spider|googlebot|bingbot|duckduckbot|yandex|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|gptbot|chatgpt-user|oai-searchbot|ccbot|anthropic|claudebot|claude-web|perplexitybot|google-extended|applebot|amazonbot|bytespider|meta-externalagent)/i;

// Paths that are real assets or app internals: never rewrite these.
const PASSTHROUGH = /^\/(assets|prerendered|api|functions|favicon|robots\.txt|sitemap|og-image|_)/i;

function snapshotPath(pathname: string): string | null {
  if (PASSTHROUGH.test(pathname)) return null;
  if (/\.[a-z0-9]+$/i.test(pathname)) return null;        // has a file extension
  if (pathname === "/" || pathname === "") return "/prerendered/index.html";
  if (pathname === "/faq" || pathname === "/faq/") return "/prerendered/faq.html";
  const clean = pathname.replace(/\/+$/,"");               // strip trailing slash
  return `/prerendered${clean}/index.html`;
}

export const onRequest: PagesFunction = async (context) => {
  const { request, env, next } = context;
  const ua = request.headers.get("User-Agent") || "";
  if (!BOT.test(ua)) return next();

  const target = snapshotPath(new URL(request.url).pathname);
  if (!target) return next();

  try {
    // env.ASSETS serves files from the deployed static output (dist/).
    const res = await env.ASSETS.fetch(new URL(target, request.url));
    if (res.ok && res.status === 200) {
      const h = new Headers(res.headers);
      h.set("X-Prerendered", "true");
      h.set("X-Robots-Tag", "index, follow");
      return new Response(res.body, { status: 200, headers: h });
    }
  } catch (_) { /* fall through to SPA */ }
  return next();
};
