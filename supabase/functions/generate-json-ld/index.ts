import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FAQItem {
  q: string;
  a: string;
}

interface FAQPageData {
  faqs: FAQItem[];
  pageUrl?: string;
}

interface LocalBusinessData {
  name: string;
  address: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
  };
  phone?: string;
  email?: string;
  url?: string;
  description?: string;
}

interface ArticleData {
  headline: string;
  description: string;
  author: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  url?: string;
}

interface ProfessionalServiceData {
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
}

const FABSY = {
  name: "Fabsy Traffic Ticket Services",
  url: "https://fabsy.ca",
  logo: "https://fabsy.ca/favicon.svg",
  telephone: "(825) 793-2279",
  email: "hello@fabsy.ca",
  areaServed: "Alberta, Canada",
} as const;

const EXACT_PRICING = "Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.";
const SERVICE_DESCRIPTION = `Traffic ticket agent services for Alberta drivers. Fabsy is not a law firm. ${EXACT_PRICING}`;

const unsafeClaimReplacements: Array<[RegExp, string]> = [
  [/\b(?:no[- ]win[- ]no[- ]fee|money[- ]back|risk[- ]free|zero[- ]risk)\b/gi, "case-specific service"],
  [/\b(?:women|woman|female|girls?|gender-targeted)\b/gi, "Alberta drivers"],
  [/\b(?:lawyers?|attorneys?)\b/gi, "traffic ticket agents"],
  [/\bexpertise\b/gi, "service"],
  [/\bexperts?\b/gi, "traffic ticket agents"],
  [/\bguarantee(?:d|s|ing)?\b/gi, "case-specific"],
];

const pricingSignal = /(?:\$|\b(?:price|pricing|fee|fees|cost|costs)\b|\b30\s*%|\b488\b)/i;

function sanitizeText(value: unknown, fallback = ""): string {
  let text = typeof value === "string" ? value : fallback;

  text = text.replace(/\u2014/g, ",");
  for (const [pattern, replacement] of unsafeClaimReplacements) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim() || fallback;
}

function sanitizeProse(value: unknown, fallback = ""): string {
  const text = sanitizeText(value, fallback);

  if (!pricingSignal.test(text)) {
    return text;
  }

  const nonPricingSentences = text
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !pricingSignal.test(sentence))
    .join(" ")
    .trim();

  return `${nonPricingSentences ? `${nonPricingSentences} ` : ""}${EXACT_PRICING}`;
}

function optionalPublicUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const url = value.trim();
  if (!/^https?:\/\//i.test(url)) return undefined;
  if (/(?:placeholder|path\/to|example\.com|dummy|fake)/i.test(url)) return undefined;

  return url;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, data } = await req.json();
    
    if (!type || !data) {
      return new Response(
        JSON.stringify({ error: 'type and data are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let jsonLd: Record<string, unknown>;

    switch (type) {
      case 'FAQPage':
        jsonLd = generateFAQPage(data as FAQPageData);
        break;
      case 'ProfessionalService':
        jsonLd = generateProfessionalService(data as ProfessionalServiceData);
        break;
      case 'LocalBusiness':
        jsonLd = generateLocalBusiness(data as LocalBusinessData);
        break;
      case 'Article':
        jsonLd = generateArticle(data as ArticleData);
        break;
      case 'Organization':
        jsonLd = generateOrganization(data);
        break;
      case 'WebPage':
        jsonLd = generateWebPage(data);
        break;
      case 'BreadcrumbList':
        jsonLd = generateBreadcrumbs(data);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Generated ${type} JSON-LD schema`);

    return new Response(
      JSON.stringify({ 
        jsonLd: JSON.stringify(jsonLd, null, 2),
        scriptTag: `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-json-ld function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateFAQPage(data: FAQPageData) {
  // Visible FAQ copy should use the same guarded source text so HTML and JSON-LD stay aligned.
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": data.faqs.map(faq => ({
      "@type": "Question",
      "name": sanitizeText(faq.q, "Fabsy traffic ticket services"),
      "acceptedAnswer": {
        "@type": "Answer",
        "text": sanitizeProse(faq.a, "Information depends on the ticket and court instructions.")
      }
    }))
  };
}

function generateProfessionalService(_data: ProfessionalServiceData) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${FABSY.url}/#organization`,
    "name": FABSY.name,
    "url": FABSY.url,
    "logo": FABSY.logo,
    "telephone": FABSY.telephone,
    "email": FABSY.email,
    "description": SERVICE_DESCRIPTION,
    "areaServed": {
      "@type": "AdministrativeArea",
      "name": FABSY.areaServed
    },
    "priceRange": EXACT_PRICING
  };
}

function generateLocalBusiness(_data: LocalBusinessData) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${FABSY.url}/#organization`,
    "name": FABSY.name,
    "description": SERVICE_DESCRIPTION,
    "url": FABSY.url,
    "logo": FABSY.logo,
    "telephone": FABSY.telephone,
    "email": FABSY.email,
    "areaServed": {
      "@type": "AdministrativeArea",
      "name": FABSY.areaServed
    },
    "priceRange": EXACT_PRICING
  };
}

function generateArticle(data: ArticleData) {
  const image = optionalPublicUrl(data.image);
  const url = optionalPublicUrl(data.url);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": sanitizeText(data.headline, "Alberta traffic ticket information"),
    "description": sanitizeProse(data.description, "General information about Alberta traffic tickets and agent services."),
    "author": {
      "@type": "Organization",
      "name": FABSY.name,
      "url": FABSY.url
    },
    "publisher": {
      "@type": "Organization",
      "name": FABSY.name,
      "logo": {
        "@type": "ImageObject",
        "url": FABSY.logo
      }
    },
    "datePublished": data.datePublished,
    "dateModified": data.dateModified || data.datePublished,
    ...(image ? { "image": image } : {}),
    ...(url ? {
      "url": url,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": url
      }
    } : {})
  };
}

function generateOrganization(data: Record<string, unknown>) {
  const socialLinks = Array.isArray(data.socialLinks)
    ? data.socialLinks.map(optionalPublicUrl).filter((url): url is string => Boolean(url))
    : [];

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${FABSY.url}/#organization`,
    "name": FABSY.name,
    "url": FABSY.url,
    "logo": FABSY.logo,
    "telephone": FABSY.telephone,
    "email": FABSY.email,
    "description": SERVICE_DESCRIPTION,
    "areaServed": FABSY.areaServed,
    "sameAs": socialLinks
  };
}

function generateWebPage(data: Record<string, unknown>) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": sanitizeText(data.title, "Fabsy Traffic Ticket Services"),
    "description": sanitizeProse(data.description, "Traffic ticket agent services for Alberta drivers. Fabsy is not a law firm."),
    "url": optionalPublicUrl(data.url) || FABSY.url,
    "inLanguage": "en-CA",
    "isPartOf": {
      "@type": "WebSite",
      "name": FABSY.name,
      "url": FABSY.url
    }
  };
}

function generateBreadcrumbs(data: Record<string, unknown>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": (data.items as Array<Record<string, unknown>>).map((item: Record<string, unknown>, index: number) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": sanitizeText(item.name, "Fabsy"),
      "item": optionalPublicUrl(item.url) || FABSY.url
    }))
  };
}
