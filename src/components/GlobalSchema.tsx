import { Helmet } from 'react-helmet-async';

const GlobalSchema = () => {
  const graph = [
    {
      '@type': 'Organization',
      'name': 'Fabsy',
      'url': 'https://fabsy.ca',
      'logo': 'https://fabsy.ca/logo.png'
    },
    {
      '@type': 'LegalService',
      'name': 'Fabsy Traffic Ticket Defense',
      'url': 'https://fabsy.ca',
      'image': 'https://fabsy.ca/logo.png',
      'priceRange': '$$',
      'areaServed': [
        { '@type': 'AdministrativeArea', 'name': 'Alberta, CA' },
        { '@type': 'AdministrativeArea', 'name': 'Calgary, AB' },
        { '@type': 'AdministrativeArea', 'name': 'Edmonton, AB' },
        { '@type': 'AdministrativeArea', 'name': 'Red Deer, AB' },
        { '@type': 'AdministrativeArea', 'name': 'Lethbridge, AB' }
      ],
      'address': {
        '@type': 'PostalAddress',
        'addressRegion': 'AB',
        'addressCountry': 'CA'
      },
      'serviceType': 'Traffic Ticket Defense'
    }
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': graph
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>
    </Helmet>
  );
};

export default GlobalSchema;