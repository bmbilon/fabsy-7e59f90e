import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FAQSection from '@/components/FAQSection';
import ArticleSchema from '@/components/ArticleSchema';
import ServiceSchema from '@/components/ServiceSchema';
import StaticJsonLd from '@/components/StaticJsonLd';
import useSafeHead from '@/hooks/useSafeHead';
import { MapPin, AlertTriangle, Shield, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WorkingContentPage = () => {
  const { slug } = useParams();
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Safe head management (replaces React Helmet)
  useSafeHead({
    title: pageData?.meta_title || pageData?.h1 || `Content - ${slug}` || 'Fabsy',
    description: pageData?.meta_description || 'Trusted traffic ticket defence in Alberta',
    canonical: slug ? `https://fabsy.ca/content/${slug}` : undefined
  });

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
          .single();

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Page not found');

        // Parse JSON fields if they exist
        const parsedData = {
          ...data,
          faqs: typeof data.faqs === 'string' ? JSON.parse(data.faqs || '[]') : (data.faqs || []),
          stats: typeof (data as any).stats === 'string' ? JSON.parse((data as any).stats || '{}') : ((data as any).stats || {}),
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
      <main className="min-h-screen bg-background">
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
      <main className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl font-bold mb-4 text-foreground">Page Not Found</h1>
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

  // Derive Service schema fields
  const cityName: string | undefined = pageData.city || (pageData.h1 && /\bin\s+([A-Za-z\-\s]+)$/.exec(pageData.h1)?.[1]?.trim());
  const serviceName: string = pageData.h1 || `Traffic Ticket Dispute${cityName ? ` in ${cityName}` : ''}`;
  const serviceType = 'Traffic ticket dispute';

  // FAQ JSON-LD (if FAQs present)
  const faqEntities = Array.isArray(pageData.faqs)
    ? pageData.faqs
        .map((f: any) => ({ q: typeof f.q === 'string' ? f.q.trim() : '', a: typeof f.a === 'string' ? f.a.trim() : '' }))
        .filter((f: any) => f.q && f.a)
        .map((f: any) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        }))
    : [];

  return (
    <main className="min-h-screen bg-background">
      <ArticleSchema 
        headline={pageData.h1 || pageData.slug}
        description={pageData.meta_description || 'Content page'}
        url={currentUrl}
        datePublished={pageData.created_at}
        dateModified={pageData.updated_at}
      />
      <ServiceSchema 
        name={serviceName}
        serviceType={serviceType}
        url={currentUrl}
        cityName={cityName}
        offerDescription="Zero-risk: pay only if we win"
        price="0"
        priceCurrency="CAD"
      />
      {faqEntities.length > 0 && (
        <StaticJsonLd
          schema={{
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqEntities,
          }}
          dataAttr="faq"
        />
      )}

      <Header />

      {/* Hero Section with subtle background */}
      <div className="bg-gradient-to-b from-muted/30 to-background border-b">
        <div className="container mx-auto px-4 py-12 md:py-16 max-w-5xl">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link to="/" className="hover:text-primary transition-colors">Home</Link>
            <span>/</span>
            {pageData.city && (
              <>
                <MapPin className="w-4 h-4" />
                <span className="text-foreground font-medium">{pageData.city}</span>
                <span>/</span>
              </>
            )}
            {pageData.violation && (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span className="text-foreground font-medium">{pageData.violation}</span>
              </>
            )}
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 text-foreground leading-tight">
            {pageData.h1 || pageData.slug}
          </h1>

          {/* Stats Grid */}
          {pageData.stats && Object.keys(pageData.stats).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {pageData.stats.avgFine && (
                <div className="bg-card rounded-xl p-4 border shadow-sm">
                  <div className="text-destructive text-2xl font-bold">
                    ${pageData.stats.avgFine}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Typical Fine</div>
                </div>
              )}
              {pageData.stats.insuranceIncrease && (
                <div className="bg-card rounded-xl p-4 border shadow-sm">
                  <div className="text-orange-600 text-2xl font-bold">
                    ${pageData.stats.insuranceIncrease}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Insurance Impact</div>
                </div>
              )}
              {pageData.stats.successRate && (
                <div className="bg-card rounded-xl p-4 border shadow-sm">
                  <div className="text-primary text-2xl font-bold">
                    {pageData.stats.successRate}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Success Rate</div>
                </div>
              )}
              {pageData.stats.avgSavings && (
                <div className="bg-card rounded-xl p-4 border shadow-sm">
                  <div className="text-primary text-2xl font-bold">
                    ${pageData.stats.avgSavings}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Avg Savings</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <article className="container mx-auto px-4 py-12 md:py-16 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Main Content Column */}
          <div className="lg:col-span-8 space-y-8">
            {/* Main Article Content */}
            <div className="bg-card rounded-xl p-8 md:p-10 shadow-sm border">
              <div className="prose prose-lg max-w-none
                prose-headings:text-foreground prose-headings:font-bold prose-headings:tracking-tight
                prose-h2:text-3xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border
                prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-3
                prose-h4:text-xl prose-h4:mt-6 prose-h4:mb-2
                prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-6
                prose-strong:text-foreground prose-strong:font-semibold
                prose-ul:my-6 prose-ol:my-6
                prose-li:text-foreground prose-li:my-2 prose-li:leading-relaxed
                prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline">
                
                {pageData.hook && (
                  <div className="bg-primary/10 border-l-4 border-primary p-5 rounded-r mb-8">
                    <p className="text-foreground font-medium mb-0">{pageData.hook}</p>
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
                        return <h2 key={idx} className="text-3xl font-bold mt-10 mb-4 pb-2 border-b border-border text-foreground">{paragraph.replace('##', '').trim()}</h2>;
                      }
                      if (paragraph.startsWith('###')) {
                        return <h3 key={idx} className="text-2xl font-semibold mt-8 mb-3 text-foreground">{paragraph.replace('###', '').trim()}</h3>;
                      }
                      if (paragraph.startsWith('-')) {
                        const items = paragraph.split('\n').filter((line: string) => line.startsWith('-'));
                        return (
                          <ul key={idx} className="list-disc ml-6 space-y-2 mb-6">
                            {items.map((item: string, i: number) => (
                              <li key={i} className="text-foreground leading-relaxed">{item.replace('-', '').trim()}</li>
                            ))}
                          </ul>
                        );
                      }
                      if (paragraph.trim()) {
                        return <p key={idx} className="mb-6 text-foreground leading-relaxed">{paragraph}</p>;
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* FAQs Section */}
            {pageData.faqs && pageData.faqs.length > 0 && (
              <div className="bg-card rounded-xl p-8 md:p-10 shadow-sm border">
                <h2 className="text-3xl font-bold mb-6 text-foreground">
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
              <div className="bg-card rounded-xl p-8 shadow-sm border">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">Local {pageData.city || 'Area'} Information</h2>
                </div>
                <p className="text-foreground leading-relaxed">
                  {pageData.local_info}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar Column */}
          <aside className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              {/* Key Highlights Card */}
              <div className="bg-card rounded-xl p-6 shadow-sm border">
                <h3 className="text-lg font-bold mb-4 text-foreground flex items-center gap-2">
                  <span className="text-primary">⚡</span>
                  Why Act Now
                </h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-0.5 font-bold">✓</span>
                    <span className="text-foreground leading-relaxed">Only 7 days to file your dispute</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-0.5 font-bold">✓</span>
                    <span className="text-foreground leading-relaxed">Prevent insurance rate increases</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-0.5 font-bold">✓</span>
                    <span className="text-foreground leading-relaxed">Protect your driving record</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-0.5 font-bold">✓</span>
                    <span className="text-foreground leading-relaxed">{pageData.stats?.successRate || 94}% success rate</span>
                  </li>
                </ul>
              </div>

              {/* CTA Card */}
              <div className="bg-primary text-primary-foreground rounded-xl p-6 shadow-elegant">
                <div className="w-12 h-12 rounded-lg bg-primary-foreground/20 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">
                  Fight Your {pageData.violation || 'Traffic'} Ticket
                </h3>
                <p className="text-sm mb-5 opacity-95">
                  {pageData.stats?.successRate || 94}% success rate • Save ${pageData.stats?.avgSavings || 1650}+ on average
                </p>
                <Link to="/submit-ticket">
                  <Button 
                    size="lg"
                    className="w-full bg-background text-foreground hover:shadow-lg transition-shadow"
                  >
                    Get Free Analysis →
                  </Button>
                </Link>
                <p className="text-xs mt-3 opacity-80 text-center">Free consultation • No win, no fee options</p>
              </div>

              {/* Related Resources */}
              <div className="bg-card rounded-xl p-6 shadow-sm border">
                <h3 className="text-sm font-semibold mb-4 text-foreground uppercase tracking-wide">Helpful Resources</h3>
                <div className="space-y-3">
                  <a 
                    href="https://www.alberta.ca/traffic-safety" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                  >
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    <span className="group-hover:underline">Alberta Traffic Safety</span>
                  </a>
                  <Link 
                    to="/how-it-works"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                  >
                    <span className="group-hover:underline">How We Fight Tickets</span>
                  </Link>
                  <Link 
                    to="/faq"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                  >
                    <span className="group-hover:underline">Common Questions</span>
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </article>

      <Footer />
    </main>
  );
};

export default WorkingContentPage;
