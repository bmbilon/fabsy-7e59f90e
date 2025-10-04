import React from 'react';

type StaticJsonLdProps = {
  schema: unknown;
  dataAttr?: string;
};

const StaticJsonLd: React.FC<StaticJsonLdProps> = ({ schema, dataAttr = 'jsonld' }) => (
  <script
    type="application/ld+json"
    suppressHydrationWarning
    {...{ [`data-${dataAttr}`]: 'true' }}
    dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
  />
);

export default StaticJsonLd;