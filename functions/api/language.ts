import { preferredLocale } from '../../src/i18n/locale-policy.mjs';

/** Read-only preference hint. The client decides whether to offer a reviewed locale. */
export const onRequestGet: PagesFunction = async ({ request }) => new Response(
  JSON.stringify({ locale: preferredLocale(request.headers.get('Accept-Language') || '') }),
  {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Vary': 'Accept-Language',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  },
);
