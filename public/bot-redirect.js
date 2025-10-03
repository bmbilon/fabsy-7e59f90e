// Client-side bot detection and redirect
// This runs immediately when any page loads to serve bots prerendered content

(function() {
  const userAgent = navigator.userAgent.toLowerCase();
  const botPatterns = [
    'bot', 'crawler', 'spider', 'googlebot', 'bingbot', 
    'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'gptbot', 'chatgpt-user', 'ccbot', 'anthropic', 'claude-web'
  ];
  
  const isBot = botPatterns.some(pattern => userAgent.includes(pattern));
  
  // If this is the FAQ page and we detect a bot, redirect to prerendered version
  if (isBot && window.location.pathname === '/faq') {
    window.location.replace('/prerendered/faq.html');
  }
})();

console.log('Bot detection script loaded for', window.location.pathname);