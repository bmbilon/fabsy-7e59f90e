import React from 'react';
import StaticJsonLd from '@/components/StaticJsonLd';
import { CANONICAL_OFFER_PRICING, RAPID_RESOLUTION } from '@/config/offers';

type Props = {
  name: string;
  serviceType: string;
  url: string;
  providerName?: string;
  providerUrl?: string;
  cityName?: string;
  offerDescription?: string;
};

/**
 * ServiceSchema emits a Service JSON-LD node for intent-specific landers.
 */
const ServiceSchema: React.FC<Props> = ({
  name,
  serviceType,
  url,
  providerName = 'Fabsy Traffic Ticket Services',
  providerUrl = 'https://fabsy.ca',
  cityName,
  offerDescription = CANONICAL_OFFER_PRICING,
}) => {
  if (!name || !serviceType || !url) return null;

  const serviceNode: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    serviceType,
    provider: { '@type': 'ProfessionalService', name: providerName, url: providerUrl },
    url,
    offers: {
      '@type': 'Offer',
      description: offerDescription,
      price: RAPID_RESOLUTION.priceCad.toFixed(2),
      priceCurrency: RAPID_RESOLUTION.currency,
      url: `https://fabsy.ca${RAPID_RESOLUTION.intakePath}`,
    },
  };

  if (cityName) {
    serviceNode.areaServed = { '@type': 'City', name: cityName };
  } else {
    serviceNode.areaServed = { '@type': 'AdministrativeArea', name: 'Alberta, Canada' };
  }

  return <StaticJsonLd schema={serviceNode} dataAttr="service" />;
};

export default ServiceSchema;
