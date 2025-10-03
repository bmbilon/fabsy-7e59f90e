// Cloudflare Worker for bot detection and prerendering
// Deploy this to Cloudflare Workers if _redirects doesn't work

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const userAgent = request.headers.get('User-Agent') || ''
  
  // List of bot user agents to detect
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /googlebot/i,
    /bingbot/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /gptbot/i,
    /chatgpt-user/i,
    /ccbot/i,
    /anthropic/i,
    /claude-web/i,
    /slackbot/i,
    /whatsapp/i
  ]
  
  const isBot = botPatterns.some(pattern => pattern.test(userAgent))
  
  // If accessing /faq and is a bot, serve prerendered version
  if (url.pathname === '/faq' && isBot) {
    const prerenderUrl = new URL('/prerendered/faq.html', url.origin)
    return fetch(prerenderUrl)
  }
  
  // For all other requests, fetch normally
  return fetch(request)
}

// Instructions for deployment:
// 1. Go to Cloudflare Dashboard > Workers & Pages
// 2. Create new Worker
// 3. Paste this code
// 4. Deploy
// 5. Add route: fabsy.ca/faq* -> your-worker-name