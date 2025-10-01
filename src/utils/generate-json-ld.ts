/**
 * Generate FAQ JSON-LD from page FAQ data
 * CRITICAL: This ensures exact wording match between HTML and JSON-LD
 * Single source of truth: the faqs array passed to this function
 */

interface FAQ {
  q: string;
  a: string;
}

export function generateFaqJsonLd(faqs: FAQ[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.q, // EXACT same text as HTML
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a // EXACT same text as HTML
      }
    }))
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
    "name": data.name || "Fabsy",
    "url": data.url || "https://fabsy.ca",
    "logo": data.logo || "https://fabsy.ca/logo.png",
    "telephone": data.telephone || "",
    "email": data.email || "",
    "description": data.description || "Alberta traffic ticket help for women",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": data.address?.street || "",
      "addressLocality": data.address?.city || "Calgary",
      "addressRegion": data.address?.province || "AB",
      "postalCode": data.address?.postalCode || "",
      "addressCountry": "CA"
    },
    "areaServed": {
      "@type": "State",
      "name": data.areaServed || "Alberta"
    },
    "priceRange": data.priceRange || "$"
  };
}

export function generateVideoObjectJsonLd(data: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  duration?: string;
  transcript?: string;
  contentUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": data.name,
    "description": data.description,
    "thumbnailUrl": data.thumbnailUrl,
    "uploadDate": data.uploadDate,
    "duration": data.duration,
    "transcript": data.transcript,
    "contentUrl": data.contentUrl
  };
}
