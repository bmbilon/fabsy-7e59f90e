import React from 'react';
import StaticJsonLd from '@/components/StaticJsonLd';

type HowToStep = {
  name: string;
  text: string;
};

type Props = {
  name: string;
  description?: string;
  url: string;
  steps: HowToStep[];
  totalTime?: string; // e.g., PT3M
};

const HowToSchema: React.FC<Props> = ({ name, description, url, steps, totalTime = 'PT3M' }) => {
  if (!name || !url || !Array.isArray(steps) || steps.length === 0) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    totalTime,
    step: steps.map((s) => ({
      '@type': 'HowToStep',
      name: s.name,
      text: s.text,
    })),
    url,
  };

  return <StaticJsonLd schema={schema} dataAttr="howto" />;
};

export default HowToSchema;

import React from "react";
import { Helmet } from "react-helmet-async";

type HowToStep = {
  name: string;
  text: string;
  image?: string;
  url?: string;
};

type Props = {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTime?: string; // ISO 8601 duration e.g. "P3M"
  estimatedCost?: string; // numeric or string
};

/**
 * HowToSchema emits a HowTo JSON-LD script for step-by-step guide pages.
 * The visible UI should reuse the same step.name and step.text strings to maintain parity.
 */
const HowToSchema: React.FC<Props> = ({ name, description, steps = [], totalTime, estimatedCost }) => {
  if (!name || !steps.length) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    ...(estimatedCost
      ? {
          estimatedCost: {
            "@type": "MonetaryAmount",
            currency: "CAD",
            value: estimatedCost,
          },
        }
      : {}),
    step: steps.map((step, idx) => {
      const s: any = {
        "@type": "HowToStep",
        position: idx + 1,
        name: step.name,
        text: step.text,
      };
      if (step.image) s.image = step.image;
      if (step.url) s.url = step.url;
      return s;
    }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
};

export default HowToSchema;
