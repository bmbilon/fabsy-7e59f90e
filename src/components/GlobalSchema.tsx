import { Helmet } from 'react-helmet-async';

const GlobalSchema = () => {
  const graph = [
    {
      '@type': 'Organization',
      'name': 'Fabsy',
      'url': 'https://fabsy.ca',
      'logo': 'https://fabsy.ca/_assets/logo.png',
'sameAs': [
        'https://www.google.com/search?q=Fabsy+Alberta',
        'https://www.instagram.com/fabsy.alberta'
      ]
    },
    {
      '@type': 'LegalService',
      'name': 'Fabsy',
      'url': 'https://fabsy.ca',
      'image': 'https://fabsy.ca/_assets/logo.png',
      'priceRange': '$',
      'telephone': '+1-XXX-XXX-XXXX',
      'areaServed': [
        { '@type': 'AdministrativeArea', 'name': 'Alberta, Canada' }
      ],
      'address': {
        '@type': 'PostalAddress',
        'addressRegion': 'AB',
        'addressCountry': 'CA'
      },
      'serviceType': 'Traffic ticket dispute assistance'
    }
  ];'}],

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