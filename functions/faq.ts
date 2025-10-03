// Cloudflare Pages Functions for bot detection
// This runs on Cloudflare's edge and serves prerendered content to bots

export async function onRequest(context: any): Promise<Response> {
  const { request, env, next } = context;
  const userAgent = request.headers.get('User-Agent') || '';
  
  // Bot detection patterns
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
  ];
  
  const isBot = botPatterns.some(pattern => pattern.test(userAgent));
  
  // If it's a bot, serve prerendered content
  if (isBot) {
    try {
      const prerenderUrl = new URL('/prerendered/faq.html', request.url);
      const prerenderResponse = await fetch(prerenderUrl);
      
      if (prerenderResponse.ok) {
        // Clone response and add bot detection header
        const response = new Response(prerenderResponse.body, {
          status: prerenderResponse.status,
          statusText: prerenderResponse.statusText,
          headers: {
            ...Object.fromEntries(prerenderResponse.headers.entries()),
            'X-Prerendered': 'true',
            'X-Bot-Detected': userAgent.substring(0, 100)
          }
        });
        return response;
      }
    } catch (error) {
      console.error('Failed to serve prerendered content:', error);
    }
  }
  
  // For regular users, continue to normal React app
  return next();
}