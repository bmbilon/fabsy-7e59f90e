import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FAQSection from '@/components/FAQSection';
import ArticleSchema from '@/components/ArticleSchema';
import LocalBusinessSchema from '@/components/LocalBusinessSchema';
import { Helmet } from 'react-helmet-async';
import { MapPin, AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ContentPage = () => {
  const { slug } = useParams();
  const [pageData, setPageData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relatedPages, setRelatedPages] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    async function fetchPage() {
      if (!slug) return;

      setLoading(true);
      setError(null);

      try {
        // Remove the invalid published filter - query all data for the slug
        const { data, error: fetchError } = await supabase
          .from('page_content')
          .select('*')
          .eq('slug', slug)
          .single();

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Page not found');

        // Parse JSON fields if they exist
        const parsedData = {
          ...data,
          faqs: typeof data.faqs === 'string' ? JSON.parse(data.faqs || '[]') : (data.faqs || []),
          stats: typeof (data as Record<string, unknown>).stats === 'string' 
            ? JSON.parse((data as Record<string, unknown>).stats as string || '{}') 
            : ((data as Record<string, unknown>).stats || {}),
        };

        setPageData(parsedData);

        // Fetch related pages in same city with different offences
        try {
          const { data: related, error: relErr } = await supabase
            .from('page_content')
            .select('slug, city, violation, h1')
            .eq('city', parsedData.city)
            .neq('slug', parsedData.slug)
            .limit(20);
          if (!relErr && Array.isArray(related)) {
            // Pick two with different violation than current
            const currentViolation = (parsedData.violation || '').toLowerCase();
            const filtered = related.filter((r) => (r.violation || '').toLowerCase() !== currentViolation);
            setRelatedPages(filtered.slice(0, 2));
          } else {
            setRelatedPages([]);
          }
        } catch (_) {
          setRelatedPages([]);
        }
      } catch (err) {
        console.error('Error fetching page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load page');
      } finally {
        setLoading(false);
      }
    }

    fetchPage();
  }, [slug]);

  // Set GA4 user properties for AEO context (city, violation) when data loads
  useEffect(() => {
    if (pageData?.city || pageData?.violation) {
      const gtag = (window as Record<string, unknown>).gtag as undefined | ((...args: unknown[]) => void);
      if (typeof gtag === 'function') {
        try {
          gtag('set', 'user_properties', {
            city: pageData?.city || undefined,
            violation: pageData?.violation || undefined,
          });
        } catch {
          // Silent fail for gtag errors
        }
      }
    }
  }, [pageData?.city, pageData?.violation]);

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
  
  // Enhanced city detection for better LocalBusiness schema coverage
  const detectCityFromSlug = (slug: string): string | null => {
    const cityPatterns = [
      { pattern: /calgary/i, city: 'Calgary' },
      { pattern: /edmonton/i, city: 'Edmonton' },
      { pattern: /red-deer/i, city: 'Red Deer' },
      { pattern: /lethbridge/i, city: 'Lethbridge' },
      { pattern: /medicine-hat/i, city: 'Medicine Hat' },
      { pattern: /fort-mcmurray/i, city: 'Fort McMurray' },
      { pattern: /grande-prairie/i, city: 'Grande Prairie' },
      { pattern: /airdrie/i, city: 'Airdrie' },
      { pattern: /leduc/i, city: 'Leduc' },
      { pattern: /okotoks/i, city: 'Okotoks' },
      { pattern: /brooks/i, city: 'Brooks' },
      { pattern: /lacombe/i, city: 'Lacombe' },
      { pattern: /stony-plain/i, city: 'Stony Plain' },
      { pattern: /jasper/i, city: 'Jasper' },
      { pattern: /hinton/i, city: 'Hinton' },
      { pattern: /canmore/i, city: 'Canmore' },
      { pattern: /banff/i, city: 'Banff' },
      { pattern: /cochrane/i, city: 'Cochrane' },
      { pattern: /spruce-grove/i, city: 'Spruce Grove' },
      { pattern: /lloydminster/i, city: 'Lloydminster' },
      { pattern: /wetaskiwin/i, city: 'Wetaskiwin' },
      { pattern: /camrose/i, city: 'Camrose' },
      { pattern: /cold-lake/i, city: 'Cold Lake' },
      { pattern: /sylvan-lake/i, city: 'Sylvan Lake' }
    ];
    
    for (const { pattern, city } of cityPatterns) {
      if (pattern.test(slug)) return city;
    }
    return null;
  };
  
  const detectedCity = pageData.city || detectCityFromSlug(pageData.slug as string || '');
  const shouldRenderLocalBusiness = !!detectedCity;

  // Select 1–2 hub links based on context
  const slugStr = String(pageData.slug || '').toLowerCase();
  const isPhotoRadar = slugStr.includes('photo-radar');
  const hubLinks = isPhotoRadar
    ? [
        { to: '/hubs/photo-radar-vs-officer-issued', label: 'Photo-Radar vs Officer-Issued' },
        { to: '/hubs/alberta-tickets-101', label: 'Alberta Tickets 101' },
      ]
    : [
        { to: '/hubs/alberta-tickets-101', label: 'Alberta Tickets 101' },
        { to: '/hubs/demerits-and-insurance', label: 'Demerits & Insurance' },
      ];

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>{pageData.meta_title || `Content - ${pageData.slug}`}</title>
        <meta name="description" content={pageData.meta_description || 'Content page'} />
        <link rel="canonical" href={currentUrl} />
      </Helmet>

      <ArticleSchema 
        headline={pageData.h1 || pageData.slug}
        description={pageData.meta_description || 'Content page'}
        url={currentUrl}
        datePublished={pageData.created_at}
        dateModified={pageData.updated_at}
      />
      {/* Enhanced LocalBusiness schema for Alberta city pages */}
      {shouldRenderLocalBusiness && detectedCity && (
        <LocalBusinessSchema 
          url={currentUrl}
          cityName={detectedCity}
          aggregateRating={{
            ratingValue: 4.9,
            reviewCount: pageData.stats?.reviewCount || 127,
            bestRating: 5,
            worstRating: 1
          }}
        />
      )}

      <Header />

      <article className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link to="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            {pageData.city && (
              <>
                <MapPin className="w-4 h-4" />
                <span>{pageData.city}</span>
                <span>/</span>
              </>
            )}
            {pageData.violation && (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>{pageData.violation}</span>
              </>
            )}
          </div>

          {/* Hero Section */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <h1 className="text-4xl font-bold mb-6 text-gray-900">
              {pageData.h1 || pageData.slug}
            </h1>

            {/* Stats Grid */}
            {pageData.stats && Object.keys(pageData.stats).length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {pageData.stats.avgFine && (
                  <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                    <div className="text-red-600 text-2xl font-bold">
                      ${pageData.stats.avgFine}
                    </div>
                    <div className="text-xs text-red-700">Fine Amount</div>
                  </div>
                )}
                {pageData.stats.insuranceIncrease && (
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                    <div className="text-orange-600 text-2xl font-bold">
                      ${pageData.stats.insuranceIncrease}
                    </div>
                    <div className="text-xs text-orange-700">Insurance Increase</div>
                  </div>
                )}
                {pageData.stats.successRate && (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-green-600 text-2xl font-bold">
                      {pageData.stats.successRate}%
                    </div>
                    <div className="text-xs text-green-700"><a href="/proof" className="underline decoration-dashed underline-offset-4 hover:text-primary">Success Rate</a></div>
                  </div>
                )}
                {pageData.stats.avgSavings && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-blue-600 text-2xl font-bold">
                      ${pageData.stats.avgSavings}
                    </div>
                    <div className="text-xs text-blue-700">Avg Savings</div>
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              {pageData.hook && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                  <p className="text-blue-800 font-medium">{pageData.hook}</p>
                </div>
              )}
              
              {pageData.what && (
                <div className="mb-6" dangerouslySetInnerHTML={{ __html: pageData.what }} />
              )}
              
              {pageData.how && (
                <div className="mb-6" dangerouslySetInnerHTML={{ __html: pageData.how }} />
              )}
              
              {pageData.next && (
                <div className="mb-6" dangerouslySetInnerHTML={{ __html: pageData.next }} />
              )}
              
              {pageData.content && (
                <div className="mb-6">
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
              )}
            </div>
          </div>

          {/* Related in City */}
          {relatedPages.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
              <h2 className="text-3xl font-bold mb-6 text-gray-900">
                Related in {pageData.city}
              </h2>
              <ul className="list-disc ml-6 space-y-2 text-gray-800">
                {relatedPages.slice(0, 2).map((r) => (
                  <li key={r.slug}>
                    <Link to={`/content/${r.slug}`} className="underline decoration-dashed underline-offset-4 hover:text-primary">
                      {(r.h1 || r.violation || r.slug).toString()}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Explore Hubs */}
          {hubLinks.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
              <h2 className="text-3xl font-bold mb-6 text-gray-900">Explore Hubs</h2>
              <ul className="list-disc ml-6 space-y-2 text-gray-800">
                {hubLinks.map((h) => (
                  <li key={h.to}>
                    <Link to={h.to} className="underline decoration-dashed underline-offset-4 hover:text-primary">
                      {h.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* FAQs Section */}
          {pageData.faqs && pageData.faqs.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
              <h2 className="text-3xl font-bold mb-6 text-gray-900">
                Frequently Asked Questions
              </h2>
              <FAQSection 
                faqs={pageData.faqs}
                pageName={pageData.h1 || pageData.slug}
                pageUrl={currentUrl}
              />
            </div>
          )}

          {/* Local Info */}
          {pageData.local_info && (
            <div className="bg-blue-900 text-white rounded-2xl shadow-xl p-8 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <MapPin className="w-6 h-6" />
                <h2 className="text-2xl font-bold">Local {pageData.city || 'Area'} Information</h2>
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
              Ready to Fight Your {pageData.violation || 'Traffic'} Ticket?
            </h2>
              <p className="text-xl mb-6 text-green-50">
              Zero-risk guarantee • <a href="/proof" className="underline decoration-dashed underline-offset-4 hover:text-white">{pageData.stats?.successRate || 94}% success rate</a> • Save ${pageData.stats?.avgSavings || 1650}+
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
