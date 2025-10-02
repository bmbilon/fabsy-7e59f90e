import React from "react";
import { Helmet } from "react-helmet-async";

export type FAQItem = {
  q: string; // exact visible question text
  a: string; // exact visible answer text (may contain simple HTML)
};

type Props = {
  faqs: FAQItem[];
  pageName?: string;
  pageUrl?: string;
  includeBreadcrumb?: boolean;
  className?: string;
};

/**
 * FAQSchema
 * - Renders visible FAQ HTML and server-side JSON-LD (via Helmet).
 * - Uses the SAME strings for visible HTML and JSON-LD to guarantee exact-match parity.
 *
 * IMPORTANT:
 * - Do NOT mutate faq q/a strings after generation (smart quotes, trimming, formatting).
 * - This component is SSR-friendly and should be included in the SSG/SSR render so JSON-LD is present in initial HTML.
 */
const FAQSchema: React.FC<Props> = ({ faqs = [], pageName = "", pageUrl = "", includeBreadcrumb = true, className }) => {
  if (!Array.isArray(faqs) || faqs.length === 0) return null;

  // Use up to 10 FAQs visually but at least 6 are recommended for AEO; JSON-LD will include the first 6.
  const visualFaqs = faqs.slice(0, 10);
  const ldFaqs = faqs.slice(0, Math.min(6, faqs.length));

  // Convert a plain-text answer to consistent HTML; if raw contains tags, treat as HTML and use verbatim.
  function toAnswerHtml(raw: string) {
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    const paragraphs = raw
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
      .join("");
    return paragraphs;
  }

  // Build mainEntity array for JSON-LD using exact HTML strings that will appear on the page.
  const mainEntity = ldFaqs.map((f) => {
    const visibleAnswerHtml = toAnswerHtml(f.a);
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

  return (
    <div className={className ?? "faq-schema"}>
      {/* Visible FAQ HTML (same strings feed JSON-LD) */}
      <section className="faq-list" aria-label="Frequently asked questions">
        {visualFaqs.map((f, i) => (
          <details key={i} className="faq-item" data-faq-index={i}>
            <summary className="faq-question" role="button" aria-expanded="false">
              {f.q}
            </summary>
            <div className="faq-answer" dangerouslySetInnerHTML={{ __html: toAnswerHtml(f.a) }} />
          </details>
        ))}
      </section>

      {/* JSON-LD in head (server-rendered via Helmet) */}
      <Helmet>
        <script type="application/ld+json">{faqJsonLdString}</script>
        {breadcrumbJsonLdString && <script type="application/ld+json">{breadcrumbJsonLdString}</script>}
      </Helmet>
    </div>
  );
};

export default FAQSchema;

/* helpers */
function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
