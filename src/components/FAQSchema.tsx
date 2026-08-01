import React, { useEffect } from "react";
import { faqAnswerHtml } from '@/lib/faq-format';

export type FAQItem = {
  q: string; // exact visible question text
  a: string; // exact visible answer text (may contain simple HTML)
};

type Props = {
  faqs: FAQItem[];
  pageName?: string;
  pageUrl?: string;
  includeBreadcrumb?: boolean;
};

/**
 * FAQSchema
 * - Injects FAQ JSON-LD for FAQSection.
 * - Uses the same answer formatter as the visible FAQ UI to enforce exact-match parity.
 *
 * IMPORTANT:
 * - Do NOT mutate faq q/a strings after generation (smart quotes, trimming, formatting).
 * - This component is SSR-friendly and should be included in the SSG/SSR render so JSON-LD is present in initial HTML.
 */
const FAQSchema: React.FC<Props> = ({ faqs = [], pageName = "", pageUrl = "", includeBreadcrumb = true }) => {
  const hasFaqs = Array.isArray(faqs) && faqs.length > 0;
  const safeFaqs = hasFaqs ? faqs : [];

  // Build mainEntity array for JSON-LD using exact HTML strings that will appear on the page.
  const mainEntity = safeFaqs.map((f) => {
    const visibleAnswerHtml = faqAnswerHtml(f.a);
    return {
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: visibleAnswerHtml,
      },
    };
  });

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };

  const breadcrumbLd = includeBreadcrumb && pageUrl
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://fabsy.ca" },
          { "@type": "ListItem", position: 2, name: pageName || pageUrl, item: pageUrl },
        ],
      }
    : null;

  const faqJsonLdString = JSON.stringify(faqLd);
  const breadcrumbJsonLdString = breadcrumbLd ? JSON.stringify(breadcrumbLd) : null;

  // Safe DOM manipulation for JSON-LD
  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Remove any existing FAQ schemas
    const existingFaq = document.querySelector('script[data-faq-schema]');
    if (existingFaq) {
      existingFaq.remove();
    }
    const existingBreadcrumb = document.querySelector('script[data-breadcrumb-schema]');
    if (existingBreadcrumb) {
      existingBreadcrumb.remove();
    }

    if (!hasFaqs) return;

    // Add FAQ schema
    const faqScript = document.createElement('script');
    faqScript.type = 'application/ld+json';
    faqScript.setAttribute('data-faq-schema', 'true');
    faqScript.textContent = faqJsonLdString;
    document.head.appendChild(faqScript);

    // Add breadcrumb schema if present
    if (breadcrumbJsonLdString) {
      const breadcrumbScript = document.createElement('script');
      breadcrumbScript.type = 'application/ld+json';
      breadcrumbScript.setAttribute('data-breadcrumb-schema', 'true');
      breadcrumbScript.textContent = breadcrumbJsonLdString;
      document.head.appendChild(breadcrumbScript);
    }

    // Cleanup
    return () => {
      const faqToRemove = document.querySelector('script[data-faq-schema]');
      if (faqToRemove) {
        faqToRemove.remove();
      }
      const breadcrumbToRemove = document.querySelector('script[data-breadcrumb-schema]');
      if (breadcrumbToRemove) {
        breadcrumbToRemove.remove();
      }
    };
  }, [faqJsonLdString, breadcrumbJsonLdString, hasFaqs]);

  return null;
};

export default FAQSchema;
