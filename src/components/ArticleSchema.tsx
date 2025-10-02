import React, { useEffect } from "react";

type Props = {
  headline: string;
  description: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
  url: string;
};

/**
 * ArticleSchema emits Article JSON-LD for content pages. Keep headline & description identical to page copy.
 */
const ArticleSchema: React.FC<Props> = ({
  headline,
  description,
  author = "Fabsy Traffic Services",
  datePublished = new Date().toISOString(),
  dateModified = new Date().toISOString(),
  image = "https://fabsy.ca/og-image.jpg",
  url,
}) => {
  useEffect(() => {
    if (!headline || !description || !url) return;
    if (typeof document === 'undefined') return;

    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline,
      description,
      image,
      author: { "@type": "Organization", name: author },
      publisher: {
        "@type": "Organization",
        name: "Fabsy Traffic Services",
        logo: { "@type": "ImageObject", url: "https://fabsy.ca/logo.png" },
      },
      datePublished,
      dateModified,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
    };

    // Remove any existing article schema
    const existing = document.querySelector('script[data-article-schema]');
    if (existing) {
      existing.remove();
    }

    // Add new schema
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-article-schema', 'true');
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    // Cleanup
    return () => {
      const toRemove = document.querySelector('script[data-article-schema]');
      if (toRemove) {
        toRemove.remove();
      }
    };
  }, [headline, description, author, datePublished, dateModified, image, url]);

  return null; // No DOM rendering needed
};

export default ArticleSchema;
