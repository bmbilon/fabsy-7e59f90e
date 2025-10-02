import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';

const ContentPage = () => {
  const { slug } = useParams();

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>Content Page - {slug}</title>
        <meta name="description" content="Test content page" />
      </Helmet>

      <Header />

      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-4">Test Content Page</h1>
        <p className="text-lg mb-4">Slug: {slug}</p>
        <p className="text-lg mb-4">This is a simplified test version to debug the blank page issue.</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>

      <Footer />
    </main>
  );
};

export default ContentPage;
