import React from "react";
import FAQSchema, { FAQItem } from "./FAQSchema";
import { Card, CardContent } from "@/components/ui/card";

/**
 * FAQSection
 * - Renders visible FAQ cards and injects JSON-LD using FAQSchema (same strings).
 * - Use this component wherever you want visible FAQ UI + schema.
 */

type Props = {
  faqs: FAQItem[];
  pageName: string;
  pageUrl: string;
  className?: string;
};

const FAQSection: React.FC<Props> = ({ faqs = [], pageName, pageUrl, className = "" }) => {
  if (!faqs || faqs.length === 0) return null;

  return (
    <>
      {/* JSON-LD: uses same strings as visible HTML */}
      <FAQSchema faqs={faqs} pageName={pageName} pageUrl={pageUrl} includeBreadcrumb />

      {/* Visible FAQ UI */}
      <section className={`space-y-4 ${className}`} aria-label="Frequently asked questions">
        {faqs.map((faq, idx) => (
          <Card key={idx} className="bg-white/50 dark:bg-black/10 border-primary/10">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg text-foreground mb-2">{faq.q}</h3>
              <div className="text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: toAnswerHtml(faq.a) }} />
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
};

export default FAQSection;

/* helpers: reuse same plain-text -> HTML conversion used in FAQSchema */
function toAnswerHtml(raw: string) {
  if (!raw) return "";
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return paragraphs;
}

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
