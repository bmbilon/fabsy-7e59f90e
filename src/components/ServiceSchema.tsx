import React from 'react';
import StaticJsonLd from '@/components/StaticJsonLd';
import { CANONICAL_OFFER_PRICING, PHOTO_RADAR, RAPID_RESOLUTION } from '@/config/offers';

type Props = {
  name: string;
  serviceType: string;
  url: string;
  providerName?: string;
  providerUrl?: string;
  cityName?: string;
  offerDescription?: string;
  photoRadar?: boolean;
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
  photoRadar = false,
}) => {
  if (!name || !serviceType || !url) return null;
  const offer = photoRadar ? PHOTO_RADAR : RAPID_RESOLUTION;

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
      price: String(offer.priceCad),
      priceCurrency: offer.currency,
      url: `https://fabsy.ca${offer.intakePath}`,
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
