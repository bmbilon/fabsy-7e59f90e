import StaticJsonLd from '@/components/StaticJsonLd';

const GlobalSchema = () => {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Fabsy Traffic Ticket Services',
    url: 'https://fabsy.ca',
    logo: 'https://fabsy.ca/favicon.svg',
    sameAs: ['https://www.instagram.com/fabsy.alberta'],
  };

  return <StaticJsonLd schema={organization} dataAttr="org" />;
};

export default GlobalSchema;
