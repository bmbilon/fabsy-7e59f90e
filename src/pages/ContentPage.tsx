import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FAQSection from '@/components/FAQSection';
import ArticleSchema from '@/components/ArticleSchema';
import { Helmet } from 'react-helmet-async';
import { MapPin, AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ContentPage = () => {
  const { slug } = useParams();
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPage() {
      if (!slug) return;

      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('page_content')
          .select('*')
          .eq('slug', slug)
          .eq('published', true)
          .single();

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Page not found');

        // Parse JSON fields
        const parsedData = {
          ...data,
          faqs: typeof data.faqs === 'string' ? JSON.parse(data.faqs) : data.faqs,
          stats: typeof data.stats === 'string' ? JSON.parse(data.stats) : data.stats,
        };

        setPageData(parsedData);
      } catch (err) {
        console.error('Error fetching page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load page');
      } finally {
        setLoading(false);
      }
    }

    fetchPage();
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
        <Footer />
      </main>
    );
  }

  if (error || !pageData) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">{error || "The page you're looking for doesn't exist."}</p>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : `https://fabsy.ca/content/${pageData.slug}`;

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>{pageData.meta_title}</title>
        <meta name="description" content={pageData.meta_description} />
        <link rel="canonical" href={currentUrl} />
      </Helmet>

      <ArticleSchema 
        headline={pageData.h1}
        description={pageData.meta_description}
        url={currentUrl}
        datePublished={pageData.created_at}
        dateModified={pageData.updated_at}
      />

      <Header />

      <article className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link to="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <MapPin className="w-4 h-4" />
            <span>{pageData.city}</span>
            <span>/</span>
            <AlertTriangle className="w-4 h-4" />
            <span>{pageData.violation}</span>
          </div>

          {/* Hero Section */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <h1 className="text-4xl font-bold mb-6 text-gray-900">
              {pageData.h1}
            </h1>

            {/* Stats Grid */}
            {pageData.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <div className="text-red-600 text-2xl font-bold">
                    ${pageData.stats.avgFine}
                  </div>
                  <div className="text-xs text-red-700">Fine Amount</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="text-orange-600 text-2xl font-bold">
                    ${pageData.stats.insuranceIncrease}
                  </div>
                  <div className="text-xs text-orange-700">Insurance Increase</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="text-green-600 text-2xl font-bold">
                    {pageData.stats.successRate}%
                  </div>
                  <div className="text-xs text-green-700">Success Rate</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-blue-600 text-2xl font-bold">
                    ${pageData.stats.avgSavings}
                  </div>
                  <div className="text-xs text-blue-700">Avg Savings</div>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              {pageData.content.split('\n\n').map((paragraph: string, idx: number) => {
                if (paragraph.startsWith('##')) {
                  return <h2 key={idx} className="text-2xl font-bold mt-8 mb-4">{paragraph.replace('##', '').trim()}</h2>;
                }
                if (paragraph.startsWith('###')) {
                  return <h3 key={idx} className="text-xl font-semibold mt-6 mb-3">{paragraph.replace('###', '').trim()}</h3>;
                }
                if (paragraph.startsWith('-')) {
                  const items = paragraph.split('\n').filter((line: string) => line.startsWith('-'));
                  return (
                    <ul key={idx} className="list-disc ml-6 space-y-2 mb-4">
                      {items.map((item: string, i: number) => (
                        <li key={i}>{item.replace('-', '').trim()}</li>
                      ))}
                    </ul>
                  );
                }
                if (paragraph.trim()) {
                  return <p key={idx} className="mb-4 text-gray-700 leading-relaxed">{paragraph}</p>;
                }
                return null;
              })}
            </div>
          </div>

          {/* FAQs Section */}
          {pageData.faqs && pageData.faqs.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
              <h2 className="text-3xl font-bold mb-6 text-gray-900">
                Frequently Asked Questions
              </h2>
              <FAQSection 
                faqs={pageData.faqs}
                pageName={pageData.h1}
                pageUrl={currentUrl}
              />
            </div>
          )}

          {/* Local Info */}
          {pageData.local_info && (
            <div className="bg-blue-900 text-white rounded-2xl shadow-xl p-8 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <MapPin className="w-6 h-6" />
                <h2 className="text-2xl font-bold">Local {pageData.city} Information</h2>
              </div>
              <p className="text-blue-100 leading-relaxed">
                {pageData.local_info}
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl p-8 text-white text-center">
            <Shield className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-3">
              Ready to Fight Your {pageData.violation} Ticket?
            </h2>
            <p className="text-xl mb-6 text-green-50">
              Zero-risk guarantee • {pageData.stats?.successRate || 94}% success rate • Save ${pageData.stats?.avgSavings || 1650}+
            </p>
            <Link to="/submit-ticket">
              <Button 
                size="lg"
                className="bg-white text-green-600 hover:bg-green-50 text-lg px-8 py-6"
              >
                Get Free Analysis Now
              </Button>
            </Link>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
};

export default ContentPage;
