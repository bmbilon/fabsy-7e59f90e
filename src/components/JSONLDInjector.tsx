import React from 'react';
import { Helmet } from 'react-helmet-async';

type Props = { jsonld?: string | null };

const JSONLDInjector: React.FC<Props> = ({ jsonld }) => {
  if (!jsonld) return null;
  return (
    <Helmet>
      <script type="application/ld+json">{jsonld}</script>
    </Helmet>
  );
};

export default JSONLDInjector;
