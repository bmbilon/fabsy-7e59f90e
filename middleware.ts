// Vercel Edge Middleware: serve prerendered HTML to crawlers, SPA to humans.
// Port of functions/_middleware.ts (Cloudflare Pages). Both can coexist in the
// repo; each platform only picks up its own file.

import { next, rewrite } from "@vercel/edge";

export const config = {
  // Skip static assets and internals at the routing layer where possible.
  matcher: ["/((?!assets|prerendered|api|favicon|robots.txt|sitemap|og-image|_next|_vercel).*)"],
};

const BOT =
  /(bot|crawler|spider|googlebot|bingbot|duckduckbot|yandex|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|gptbot|chatgpt-user|oai-searchbot|ccbot|anthropic|claudebot|claude-web|perplexitybot|google-extended|applebot|amazonbot|bytespider|meta-externalagent)/i;

const PASSTHROUGH = /^\/(assets|prerendered|api|functions|favicon|robots\.txt|sitemap|og-image|_)/i;

function snapshotPath(pathname: string): string | null {
  if (PASSTHROUGH.test(pathname)) return null;
  if (/\.[a-z0-9]+$/i.test(pathname)) return null; // has a file extension
  if (pathname === "/" || pathname === "") return "/prerendered/index.html";
  if (pathname === "/faq" || pathname === "/faq/") return "/prerendered/faq.html";
  const clean = pathname.replace(/\/+$/, "");
  return `/prerendered${clean}/index.html`;
}

export default function middleware(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT.test(ua)) return next();

  const url = new URL(request.url);
  const target = snapshotPath(url.pathname);
  if (!target) return next();

  // Rewrite to the snapshot; if the file does not exist Vercel serves the SPA
  // fallback per vercel.json rewrites, so bots degrade to the app shell.
  return rewrite(new URL(target, request.url), {
    headers: { "x-prerendered": "true" },
  });
}
