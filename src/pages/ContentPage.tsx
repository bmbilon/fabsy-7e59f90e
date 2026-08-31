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
import AnswerBox from '@/components/AnswerBox';
import type { FAQItem } from '@/components/FAQSchema';
import PhotoRadarOfferStrip from '@/components/PhotoRadarOfferStrip';
import { isPhotoRadarContentSlug } from '@/lib/photo-radar-pages';

type ContentPageData = {
  slug: string;
  meta_title: string;
  meta_description: string;
  h1: string;
  hook: string;
  what: string;
  how: string;
  next: string;
  content: string;
  local_info: string;
  city: string;
  violation: string;
  created_at?: string;
  updated_at?: string;
  faqs: FAQItem[];
};

type RelatedPage = Pick<ContentPageData, 'slug' | 'city' | 'violation' | 'h1'>;

const stringField = (value: unknown): string => typeof value === 'string' ? value : '';

const faqItems = (value: unknown): FAQItem[] => {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate || '[]');
    } catch {
      return [];
    }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return typeof record.q === 'string' && typeof record.a === 'string'
      ? [{ q: record.q, a: record.a }]
      : [];
  });
};

const contentPageData = (value: unknown): ContentPageData | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const slug = stringField(record.slug);
  if (!slug) return null;
  const createdAt = stringField(record.created_at);
  const updatedAt = stringField(record.updated_at);
  return {
    slug,
    meta_title: stringField(record.meta_title),
    meta_description: stringField(record.meta_description),
    h1: stringField(record.h1),
    hook: stringField(record.hook),
    what: stringField(record.what),
    how: stringField(record.how),
    next: stringField(record.next),
    content: stringField(record.content),
    local_info: stringField(record.local_info),
    city: stringField(record.city),
    violation: stringField(record.violation),
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(updatedAt ? { updated_at: updatedAt } : {}),
    faqs: faqItems(record.faqs),
  };
};

const relatedPage = (value: unknown): RelatedPage | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const slug = stringField(record.slug);
  if (!slug) return null;
  return {
    slug,
    city: stringField(record.city),
    violation: stringField(record.violation),
    h1: stringField(record.h1),
  };
};

const ContentPage = () => {
  const { slug } = useParams();
  const [pageData, setPageData] = useState<ContentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relatedPages, setRelatedPages] = useState<RelatedPage[]>([]);

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

        const parsedData = contentPageData(data);
        if (!parsedData) throw new Error('Page data is invalid');

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
            const filtered = related
              .map(relatedPage)
              .filter((item): item is RelatedPage => item !== null)
              .filter((item) => item.violation.toLowerCase() !== currentViolation);
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
      const gtag = window.gtag;
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
  
  const detectedCity = pageData.city || detectCityFromSlug(pageData.slug);
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

          {/* Answer Box - 60-second answer above the fold */}
          {detectedCity && pageData.violation && (
            <AnswerBox 
              offence={pageData.violation}
              city={detectedCity}
              ctaHref="/traffic-ticket-assessment/start"
              photoRadar={isPhotoRadarContentSlug(slugStr)}
              className="mb-8"
            />
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
          {isPhotoRadarContentSlug(slugStr) ? <PhotoRadarOfferStrip /> : <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl p-8 text-white text-center">
            <Shield className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-3">Start Rapid Resolution</h2>
              <p className="text-xl mb-6 text-green-50">
              Handle an eligible Alberta pre-trial ticket through secure intake, disclosure review, prosecutor review, immediate updates and your final decision for $198 CAD plus GST.
            </p>
            <Link to="/submit-ticket">
              <Button 
                size="lg"
                className="bg-white text-green-600 hover:bg-green-50 text-lg px-8 py-6"
              >
                Start Rapid Resolution
              </Button>
            </Link>
          </div>}
        </div>
      </article>

      <Footer />
    </main>
  );
};

export default ContentPage;
