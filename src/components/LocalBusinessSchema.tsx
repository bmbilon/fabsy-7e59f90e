import React from 'react';
import StaticJsonLd from '@/components/StaticJsonLd';
import { CANONICAL_OFFER_PRICING, RAPID_RESOLUTION } from '@/config/offers';

type Props = {
  name?: string;
  url: string;
  cityName: string;
  serviceArea?: string;
  priceRange?: string;
  telephone?: string;
  email?: string;
};

/**
 * LocalBusinessSchema emits service-area business data for city landing pages.
 */
const LocalBusinessSchema: React.FC<Props> = ({
  name = 'Fabsy Traffic Ticket Services',
  url,
  cityName,
  serviceArea = 'Alberta, Canada',
  priceRange = '$49–$229 CAD plus applicable GST',
  telephone = '(825) 793-2279',
  email = 'hello@fabsy.ca'
}) => {
  if (!url || !cityName) return null;

  const pricing = CANONICAL_OFFER_PRICING;
  const services = [
    'Speeding ticket agent representation',
    'Red light ticket agent representation',
    'Careless driving ticket agent representation',
    'Distracted driving ticket agent representation'
  ];

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'ProfessionalService'],
    '@id': `${url}#business`,
    name,
    description: `${RAPID_RESOLUTION.name} is an eligible pre-trial traffic ticket agent service in ${cityName}, Alberta, where paid agent services are permitted. Fabsy is not a law firm. ${pricing}`,
    url,
    telephone,
    email,
    areaServed: [
      {
        '@type': 'City',
        name: cityName,
        containedInPlace: {
          '@type': 'AdministrativeArea',
          name: 'Alberta',
          containedInPlace: {
            '@type': 'Country',
            name: 'Canada'
          }
        }
      },
      {
        '@type': 'AdministrativeArea',
        name: serviceArea
      }
    ],
    serviceType: services,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Traffic Ticket Services in ${cityName}`,
      itemListElement: services.map(serviceName => ({
        '@type': 'Offer',
        description: pricing,
        itemOffered: {
          '@type': 'Service',
          name: serviceName
        }
      }))
    },
    priceRange
  };

  return <StaticJsonLd schema={localBusinessSchema} dataAttr={`localbusiness-${cityName.toLowerCase()}`} />;
};

export default LocalBusinessSchema;
