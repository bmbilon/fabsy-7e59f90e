import React from 'react';
import StaticJsonLd from '@/components/StaticJsonLd';

type Props = {
  name: string;
  serviceType: string;
  url: string;
  providerName?: string;
  providerUrl?: string;
  cityName?: string;
  offerDescription?: string;
  price?: string;
  priceCurrency?: string;
};

/**
 * ServiceSchema emits a Service JSON-LD node for intent-specific landers.
 */
const ServiceSchema: React.FC<Props> = ({
  name,
  serviceType,
  url,
  providerName = 'Fabsy',
  providerUrl = 'https://fabsy.ca',
  cityName,
  offerDescription = 'Zero-risk: pay only if we win',
  price = '0',
  priceCurrency = 'CAD',
}) => {
  if (!name || !serviceType || !url) return null;

  const serviceNode: any = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    serviceType,
    provider: { '@type': 'LegalService', name: providerName, url: providerUrl },
    url,
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency,
      description: offerDescription,
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