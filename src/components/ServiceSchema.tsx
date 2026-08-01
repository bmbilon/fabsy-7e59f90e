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
  offerDescription = 'Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.',
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
