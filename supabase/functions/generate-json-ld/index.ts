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
  // CRITICAL FOR AEO: FAQ wording in HTML must match JSON-LD exactly
  // AI engines use exact text matching for featured snippets
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": data.faqs.map(faq => ({
      "@type": "Question",
      "name": faq.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a
      }
    }))
  };
}

function generateProfessionalService(data: ProfessionalServiceData) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": data.name || "Fabsy",
    "url": data.url || "https://fabsy.ca",
    "logo": data.logo || "https://fabsy.ca/path/to/logo.png",
    "telephone": data.telephone || "+1-825-793-2279",
    "email": data.email || "hello@fabsy.ca",
    "description": data.description || "Alberta traffic ticket help for women. Expert defense, reduced fines, and peace of mind.",
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

function generateLocalBusiness(data: LocalBusinessData) {
  return {
    "@context": "https://schema.org",
    "@type": "LegalService",
    "name": data.name || "Fabsy - Alberta Traffic Ticket Help",
    "description": data.description || "Professional traffic ticket defense services for women in Alberta",
    "url": data.url || "https://fabsy.ca",
    "telephone": data.phone || "(825) 793-2279",
    "email": data.email || "hello@fabsy.ca",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": data.address?.street || "",
      "addressLocality": data.address?.city || "Alberta",
      "addressRegion": data.address?.province || "AB",
      "postalCode": data.address?.postalCode || "",
      "addressCountry": "CA"
    },
    "areaServed": {
      "@type": "State",
      "name": "Alberta"
    },
    "priceRange": "$$"
  };
}

function generateArticle(data: ArticleData) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": data.headline,
    "description": data.description,
    "author": {
      "@type": "Organization",
      "name": data.author || "Fabsy"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Fabsy",
      "logo": {
        "@type": "ImageObject",
        "url": "https://fabsy.ca/logo.png"
      }
    },
    "datePublished": data.datePublished,
    "dateModified": data.dateModified || data.datePublished,
    "image": data.image || "",
    "url": data.url || "",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": data.url || ""
    }
  };
}

function generateOrganization(data: Record<string, unknown>) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": data.name || "Fabsy",
    "url": data.url || "https://fabsy.ca",
    "logo": data.logo || "https://fabsy.ca/logo.png",
    "description": data.description || "Alberta traffic ticket help for women",
    "sameAs": data.socialLinks || []
  };
}

function generateWebPage(data: Record<string, unknown>) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": data.title,
    "description": data.description,
    "url": data.url,
    "inLanguage": "en-CA",
    "isPartOf": {
      "@type": "WebSite",
      "name": "Fabsy",
      "url": "https://fabsy.ca"
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
      "name": item.name,
      "item": item.url
    }))
  };
}
