import React from 'react';
import StaticJsonLd from '@/components/StaticJsonLd';

type HowToStep = {
  name: string;
  text: string;
  image?: string;
  url?: string;
};

type Props = {
  name: string;
  description?: string;
  url?: string;
  steps: HowToStep[];
  totalTime?: string; // e.g., PT3M
  estimatedCost?: string | number;
};

/**
 * HowToSchema emits a HowTo JSON-LD script for step-by-step guide pages.
 * The visible UI should reuse the same step.name and step.text strings to maintain parity.
 */
const HowToSchema: React.FC<Props> = ({
  name,
  description,
  url,
  steps = [],
  totalTime = 'PT3M',
  estimatedCost,
}) => {
  if (!name || !steps.length) return null;

  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    ...(description ? { description } : {}),
    ...(totalTime ? { totalTime } : {}),
    ...(typeof estimatedCost !== 'undefined'
      ? {
          estimatedCost: {
            '@type': 'MonetaryAmount',
            currency: 'CAD',
            value: estimatedCost,
          },
        }
      : {}),
    step: steps.map((step, idx) => {
      const s: any = {
        '@type': 'HowToStep',
        position: idx + 1,
        name: step.name,
        text: step.text,
      };
      if (step.image) s.image = step.image;
      if (step.url) s.url = step.url;
      return s;
    }),
    ...(url ? { url } : {}),
  };

  return <StaticJsonLd schema={schema} dataAttr="howto" />;
};

export default HowToSchema;
