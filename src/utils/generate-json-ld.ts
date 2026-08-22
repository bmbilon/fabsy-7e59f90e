/**
 * Generate FAQ JSON-LD from page FAQ data
 * CRITICAL: This ensures exact wording match between HTML and JSON-LD
 * Single source of truth: the faqs array passed to this function
 */

interface FAQ {
  q: string;
  a: string;
}

/**
 * Generate FAQ Page schema with EXACT text matching
 * The strings in JSON-LD are verbatim equal to HTML FAQ text
 */
export function generateFaqJsonLd(faqs: FAQ[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,  // EXACT same text as HTML
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.a  // EXACT same text as HTML
      }
    }))
  };
}

/**
 * Generate Video Object schema with transcript for AEO
 */
export function generateVideoJsonLd({ youtubeUrl, transcript, title }: {
  youtubeUrl: string;
  transcript?: string;
  title: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": title,
    "embedUrl": youtubeUrl,
    "transcript": transcript || ""
  };
}

export function generateProfessionalServiceJsonLd(data: {
  name?: string;
  url?: string;
  logo?: string;
  telephone?: string;
  email?: string;
  description?: string;
  address?: {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  priceRange?: string;
  areaServed?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": data.name || "Fabsy Traffic Ticket Services",
    "url": data.url || "https://fabsy.ca",
    "logo": data.logo || "https://fabsy.ca/favicon.svg",
    "telephone": data.telephone || "(825) 793-2279",
    "email": data.email || "hello@fabsy.ca",
    "description": data.description || "Traffic ticket agent services for Alberta drivers. Fabsy is not a law firm.",
    "areaServed": {
      "@type": "AdministrativeArea",
      "name": data.areaServed || "Alberta"
    },
    "priceRange": data.priceRange || "Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced."
  };
}

export function generateArticleJsonLd(data: {
  headline: string;
  description: string;
  author?: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  url?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": data.headline,
    "description": data.description,
    "author": {
      "@type": "Organization",
      "name": data.author || "Fabsy Traffic Ticket Services"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Fabsy Traffic Ticket Services",
      "logo": {
        "@type": "ImageObject",
        "url": "https://fabsy.ca/favicon.svg"
      }
    },
    "datePublished": data.datePublished,
    "dateModified": data.dateModified || data.datePublished,
    ...(data.image ? { "image": data.image } : {}),
    ...(data.url ? { "url": data.url } : {})
  };
}
