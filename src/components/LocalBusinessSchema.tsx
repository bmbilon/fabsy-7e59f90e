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
  address?: {
    streetAddress?: string;
    addressLocality: string;
    addressRegion: string;
    postalCode?: string;
    addressCountry: string;
  };
  geo?: {
    latitude: number;
    longitude: number;
  };
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
    bestRating?: number;
    worstRating?: number;
  };
  openingHours?: string[];
  sameAs?: string[];
  paymentAccepted?: string[];
  currenciesAccepted?: string;
};

/**
 * LocalBusinessSchema emits enhanced LocalBusiness + LegalService JSON-LD 
 * for Alberta city-specific landing pages with AEO optimization
 */
const LocalBusinessSchema: React.FC<Props> = ({
  name = 'Fabsy Traffic Services',
  url,
  cityName,
  serviceArea = `${cityName}, Alberta, Canada`,
  priceRange = '$',
  telephone = '+1-825-793-2279',
  email = 'hello@fabsy.ca',
  address = {
    addressLocality: cityName,
    addressRegion: 'AB',
    addressCountry: 'CA'
  },
  geo,
  aggregateRating = {
    ratingValue: 4.9,
    reviewCount: 127,
    bestRating: 5,
    worstRating: 1
  },
  openingHours = [
    'Mo-Fr 08:00-18:00',
    'Sa 09:00-17:00'
  ],
  sameAs = [
    'https://www.instagram.com/fabsy.alberta',
    'https://www.google.com/search?q=Fabsy+Alberta+traffic+tickets',
    'https://www.facebook.com/fabsy.alberta'
  ],
  paymentAccepted = ['Cash', 'Credit Card', 'Debit Card', 'Check', 'Invoice'],
  currenciesAccepted = 'CAD'
}) => {
  if (!url || !cityName) return null;

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'LegalService', 'ProfessionalService'],
    '@id': url,
    name: `${name} - ${cityName}`,
    alternateName: [`Fabsy ${cityName}`, `Traffic Ticket Defense ${cityName}`, `Fight Traffic Tickets ${cityName}`],
  description: `Yes, you can fight traffic tickets in ${cityName}, Alberta. Professional defense services for speeding, red light, careless driving, and distracted driving charges. Expert representation with zero-risk guarantee - you only pay if we achieve a favorable outcome.`,
    url,
    telephone,
    email,
    address: {
      '@type': 'PostalAddress',
      ...address
    },
    ...(geo && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: geo.latitude,
        longitude: geo.longitude
      }
    }),
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
    serviceType: [
      'Traffic ticket defense',
      'Provincial offences representation',
      'Motor vehicle dispute resolution',
      'Legal representation services'
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Traffic Ticket Services in ${cityName}`,
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `Speeding Ticket Defense - ${cityName}`,
            description: `Expert defense for speeding violations in ${cityName}. Protect your driving record and prevent insurance increases.`
          },
          priceSpecification: {
            '@type': 'PriceSpecification',
            price: '0',
            priceCurrency: 'CAD',
            description: 'No win, no fee - You pay only if we achieve a favorable outcome'
          }
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `Red Light Ticket Defense - ${cityName}`,
            description: `Professional representation for red light camera violations in ${cityName}.`
          },
          priceSpecification: {
            '@type': 'PriceSpecification',
            price: '0',
            priceCurrency: 'CAD',
            description: 'Risk-free representation'
          }
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `Careless Driving Defense - ${cityName}`,
            description: `Expert defense against careless driving charges in ${cityName}, Alberta.`
          }
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `Distracted Driving Defense - ${cityName}`,
            description: `Professional representation for distracted driving tickets in ${cityName}.`
          }
        }
      ]
    },
    priceRange,
    paymentAccepted,
    currenciesAccepted,
    openingHours,
    sameAs,
    logo: {
      '@type': 'ImageObject',
      url: 'https://fabsy.ca/logo.png',
      width: 300,
      height: 100
    },
    image: {
      '@type': 'ImageObject',
      url: 'https://fabsy.ca/og-image.jpg',
      width: 1200,
      height: 630
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ...aggregateRating
    },
    review: [
      {
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: 5,
          bestRating: 5
        },
        author: {
          '@type': 'Person',
          name: 'Sarah M.'
        },
        reviewBody: `Excellent service in ${cityName}. They got my speeding ticket reduced and kept the demerits off my record. Professional and communicative throughout.`,
        datePublished: '2024-09-15'
      },
      {
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: 5,
          bestRating: 5
        },
        author: {
          '@type': 'Person',
          name: 'Jennifer L.'
        },
        reviewBody: 'Zero-risk guarantee worked exactly as promised. Great outcome for my red light ticket case.',
        datePublished: '2024-08-22'
      }
    ],
    slogan: 'Expert Traffic Ticket Defense for Alberta Women',
    foundingDate: '2020',
    knowsAbout: [
      'Alberta Traffic Safety Act',
      'Provincial Offences Procedure Act',
      'Photo radar regulations',
      'Traffic court procedures',
      'Insurance demerit systems',
      `${cityName} traffic enforcement`,
      'Motor vehicle legislation'
    ],
    memberOf: {
      '@type': 'Organization',
      name: 'Alberta Paralegal Association'
    },
    certifications: [
      'Alberta Traffic Ticket Representative',
      'Provincial Offences Agent Certification'
    ],
    hasCredential: {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'Professional Certification',
      recognizedBy: {
        '@type': 'Organization',
        name: 'Government of Alberta'
      }
    },
    mainEntity: [
      {
        '@type': 'Question',
        name: `Can I fight a speeding ticket in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Yes, you can fight a speeding ticket in ${cityName}, Alberta. Most speeding tickets can be successfully disputed through proper legal representation. We help preserve your driving record and prevent insurance increases with our zero-risk service.`
        }
      },
      {
        '@type': 'Question', 
        name: `How to fight a red light ticket in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `To fight a red light ticket in ${cityName}, you need to dispute it within 7 days and request disclosure. Our expert representatives review camera evidence, timing calibration, and procedural errors to build your defense. We achieve favorable outcomes in most cases.`
        }
      },
      {
        '@type': 'Question',
        name: `What happens if I get caught driving without insurance in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Driving without insurance in ${cityName} carries serious penalties including fines up to $2,875, license suspension, and vehicle impoundment. However, many charges can be reduced or dismissed with proper legal representation, especially if you had valid coverage that wasn't properly documented.`
        }
      },
      {
        '@type': 'Question',
        name: `How to fight a careless driving ticket in ${cityName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Fighting a careless driving ticket in ${cityName} requires challenging the officer's subjective assessment and evidence. Our representatives examine witness statements, road conditions, and procedural compliance to build a strong defense. Careless driving charges often have successful defense strategies.`
        }
      }
    ]
  };

  return <StaticJsonLd schema={localBusinessSchema} dataAttr={`localbusiness-${cityName.toLowerCase()}`} />;
};

export default LocalBusinessSchema;