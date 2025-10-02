import { useParams, Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';

const ContentPageMinimal = () => {
  const { slug } = useParams();

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>{slug ? `Content Page - ${slug}` : 'Content Page - Test'}</title>
        <meta name="description" content="Test content page" />
      </Helmet>

      <Header />

      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-4">Content Page Works!</h1>
        <p className="text-lg mb-4">Slug: {slug || 'undefined (static route)'}</p>
        <p className="text-lg mb-4">This minimal version should work without errors.</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>

      <Footer />
    </main>
  );
};

export default ContentPageMinimal;