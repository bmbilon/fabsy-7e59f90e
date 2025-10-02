import React from "react";
import { Helmet } from "react-helmet-async";

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
  if (!headline || !description || !url) return null;

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

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
};

export default ArticleSchema;
