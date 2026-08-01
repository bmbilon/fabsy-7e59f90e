import React from 'react';
import StaticJsonLd from '@/components/StaticJsonLd';

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
  priceRange = 'Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.',
  telephone = '(825) 793-2279',
  email = 'hello@fabsy.ca'
}) => {
  if (!url || !cityName) return null;

  const pricing = 'Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.';
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
    description: `Traffic ticket agent representation in ${cityName}, Alberta, where paid agent representation is permitted. Fabsy is not a law firm. ${pricing}`,
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
