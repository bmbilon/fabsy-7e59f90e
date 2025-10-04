import StaticJsonLd from '@/components/StaticJsonLd';

const GlobalSchema = () => {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Fabsy',
    url: 'https://fabsy.ca',
    logo: 'https://fabsy.ca/_assets/logo.png',
    sameAs: [
      'https://www.google.com/search?q=Fabsy+Alberta',
      'https://www.instagram.com/fabsy.alberta',
    ],
  };

  const legalService = {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: 'Fabsy',
    url: 'https://fabsy.ca',
    image: 'https://fabsy.ca/_assets/logo.png',
    priceRange: '$',
    telephone: '+1-XXX-XXX-XXXX',
    areaServed: [{ '@type': 'AdministrativeArea', name: 'Alberta, Canada' }],
    address: { '@type': 'PostalAddress', addressRegion: 'AB', addressCountry: 'CA' },
    serviceType: 'Traffic ticket dispute assistance',
  };

  return (
    <>
      <StaticJsonLd schema={organization} dataAttr="org" />
      <StaticJsonLd schema={legalService} dataAttr="legalservice" />
    </>
  );
};

export default GlobalSchema;
