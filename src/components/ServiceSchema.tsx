import React, { useEffect } from 'react';

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
  useEffect(() => {
    if (!name || !serviceType || !url) return;
    if (typeof document === 'undefined') return;

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
      // Fallback to provincial scope if city is unknown
      serviceNode.areaServed = { '@type': 'AdministrativeArea', name: 'Alberta, Canada' };
    }

    // Remove any existing service schema
    const existing = document.querySelector('script[data-service-schema]');
    if (existing) existing.remove();

    // Add new schema
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-service-schema', 'true');
    script.textContent = JSON.stringify(serviceNode);
    document.head.appendChild(script);

    return () => {
      const toRemove = document.querySelector('script[data-service-schema]');
      if (toRemove) toRemove.remove();
    };
  }, [name, serviceType, url, providerName, providerUrl, cityName, offerDescription, price, priceCurrency]);

  return null;
};

export default ServiceSchema;