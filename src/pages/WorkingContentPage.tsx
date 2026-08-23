import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FAQSection from '@/components/FAQSection';
import ArticleSchema from '@/components/ArticleSchema';
import ServiceSchema from '@/components/ServiceSchema';
import LocalBusinessSchema from '@/components/LocalBusinessSchema';
import HowToSchema from '@/components/HowToSchema';
import useSafeHead from '@/hooks/useSafeHead';
import { MapPin, AlertTriangle, Shield, ExternalLink, Zap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AnswerBox from '@/components/AnswerBox';

type PageRecord = Record<string, unknown>;

const BANNED_CONTENT_RE = /(?:no\s+win\s+no\s+fee|risk[\s-]*free|money\s+back|guarantee|zero[\s-]*risk)/i;
const SEMANTIC_OVER_CAP_RE = /\b(?:above|greater\s+than|more\s+than|over)\s+95\s*%\+?|\b95\s*%\+?\s+(?:or\s+(?:higher|more)|and\s+above)\b/i;
const LAWYER_STATUS_RE = /\b(?:Fabsy(?:'s)?|our(?:\s+\w+){0,3})\s+(?:lawyers?|attorneys?|legal\s+team)\b|\b(?:lawyers?|attorneys?)\s+(?:at|from)\s+Fabsy\b|\bFabsy\s+(?:is|operates\s+as)\s+(?!not\b)(?:an?\s+)?law\s+firm\b|\b(?:Fabsy|we)\s+(?:provides?|offers?)\s+legal\s+advice\b/i;
const UNSAFE_HTML_RE = /<\s*\/?\s*(?:base|button|embed|form|iframe|input|link|math|meta|object|option|script|select|style|svg|textarea)\b|\b(?:formaction|on[a-z]+|src|srcdoc|srcset|style|xlink:href)\s*=|\b(?:data|javascript|vbscript)\s*:|\bexpression\s*\(|\burl\s*\(/i;
const ALLOWED_CONTENT_TAGS = new Set(['a', 'b', 'h2', 'li', 'p', 'strong', 'ul']);
let curatedSlugsPromise: Promise<Set<string>> | null = null;

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const hasUnsafeHtml = (value: string): boolean => {
  if (UNSAFE_HTML_RE.test(value)) return true;
  for (const match of value.matchAll(/<\s*\/?\s*([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    if (!ALLOWED_CONTENT_TAGS.has(match[1].toLowerCase())) return true;
  }
  return false;
};

const hasOverCapPercentage = (value: string): boolean => {
  if (SEMANTIC_OVER_CAP_RE.test(value)) return true;
  for (const match of value.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*%\+?/g)) {
    if (Number(match[1]) > 95) return true;
  }
  return false;
};

const hasFabsyPricingSignal = (value: string): boolean =>
  /\$\s*488\b|\bflat\s+\$\s*\d|\b(?:admin|base|contingency|representation|service)\s+fee\b|\bFabsy\b[^.!?\n]{0,100}(?:\$\s*\d|\b(?:charges?|costs?|fees?|pricing)\b)|\b(?:pricing|fee\s+structure|only\s+pay)\b|\b30\s*(?:%|percent)\b[^.!?\n]{0,100}\bfine\s+reduction\b/i.test(value);

const hasCompleteFabsyPricing = (value: string): boolean =>
  /\$\s*488\b/i.test(value)
  && /\b30\s*(?:%|percent)\b/i.test(value)
  && /\bfine\s+reduction\b/i.test(value)
  && /\bno\s+additional\s+charge\b/i.test(value)
  && /\bfine\s+is\s+not\s+reduced\b/i.test(value);

const pricingClaimsAreComplete = (page: PageRecord): boolean => {
  const fields: string[] = [
    text(page.meta_title),
    text(page.meta_description),
    text(page.h1),
    text(page.hook),
    text(page.what),
    text(page.how),
    text(page.next),
    ...(Array.isArray(page.bullets) ? page.bullets.map(text) : []),
    ...(Array.isArray(page.faqs)
      ? page.faqs.map((faq) => {
          if (!faq || typeof faq !== 'object') return '';
          const item = faq as Record<string, unknown>;
          return `${text(item.q)} ${text(item.a)}`.trim();
        })
      : []),
  ].filter(Boolean);

  return fields.every((field) => !hasFabsyPricingSignal(field) || hasCompleteFabsyPricing(field));
};

const loadCuratedSlugs = async (): Promise<Set<string>> => {
  if (!curatedSlugsPromise) {
    curatedSlugsPromise = fetch('/prerendered/content-manifest.json')
      .then(async response => {
        if (!response.ok) return new Set<string>();
        const manifest = await response.json() as { curatedSlugs?: unknown };
        return new Set(
          Array.isArray(manifest.curatedSlugs)
            ? manifest.curatedSlugs.filter((value): value is string => typeof value === 'string')
            : []
        );
      })
      .catch(() => new Set<string>());
  }
  return curatedSlugsPromise;
};

const hasReviewedCuratedBody = (page: PageRecord): boolean => {
  const body = [page.hook, page.what, page.how, page.next].map(text);
  if (body.some(value => !value)) return false;
  const htmlFields = [
    text(page.what),
    text(page.how),
    text(page.next),
    ...(Array.isArray(page.faqs)
      ? page.faqs.map((faq) => {
          if (!faq || typeof faq !== 'object') return '';
          return text((faq as Record<string, unknown>).a);
        })
      : []),
  ];
  if (htmlFields.some(hasUnsafeHtml)) return false;

  const searchable = JSON.stringify({
    meta_title: page.meta_title,
    meta_description: page.meta_description,
    h1: page.h1,
    hook: page.hook,
    bullets: page.bullets,
    what: page.what,
    how: page.how,
    next: page.next,
    faqs: page.faqs,
  });
  return !BANNED_CONTENT_RE.test(searchable)
    && !searchable.includes('\u2014')
    && !hasOverCapPercentage(searchable)
    && !LAWYER_STATUS_RE.test(searchable)
    && pricingClaimsAreComplete(page);
};

const safeLegacyH1 = (page: PageRecord): string => {
  const candidate = text(page.h1)
    .replace(/\s*\|\s*\d{1,3}%\+?\s+success(?:\s+rate)?\s*$/i, '')
    .trim();
  if (
    !candidate ||
    BANNED_CONTENT_RE.test(candidate) ||
    candidate.includes('\u2014') ||
    /\$\s*\d|\b\d+\s*(?:demerit|days?|months?|years?)\b/i.test(candidate)
  ) {
    const city = text(page.city);
    return city ? `Traffic Ticket Options in ${city}` : 'Alberta Traffic Ticket Options';
  }
  return candidate;
};

const safeLegacyPage = (page: PageRecord): PageRecord => {
  const city = text(page.city);
  const violation = text(page.violation);
  const h1 = safeLegacyH1(page);
  const titleBase = h1.replace(/\s*\|\s*Fabsy\s*$/i, '');
  const metaTitle = `${titleBase.slice(0, 52).trim()} | Fabsy`;
  const ticketLabel = violation ? `${violation.toLowerCase()} ticket` : 'traffic ticket';
  const place = city ? ` in ${city}` : ' in Alberta';
  const pricing = 'Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.';

  return {
    ...page,
    meta_title: metaTitle,
    meta_description: `Review options for a ${ticketLabel}${place}, check the deadline printed on the ticket, and request a free Fabsy ticket check.`,
    h1,
    hook: `Check the dispute deadline printed on your ${ticketLabel} and review your options before deciding how to respond.`,
    bullets: [
      'The dispute deadline is printed on the ticket.',
      'Keep the ticket and any relevant photos, video, or documents.',
      'Fabsy is an Alberta traffic ticket agent service, not a law firm.',
    ],
    what: `<h2>What to do next</h2><p>Follow the instructions and deadline printed on the ticket. Keep a copy and gather any relevant documents before choosing how to respond.</p>`,
    how: `<h2>How Fabsy can help</h2><p>Fabsy can assess the ticket, explain the available options, and provide agent representation where permitted.</p>`,
    next: `<h2>Pricing</h2><p>${pricing}</p>`,
    content: '',
    local_info: city ? `Fabsy serves ${city} where paid traffic ticket agent representation is permitted.` : '',
    stats: {},
    faqs: [
      {
        q: 'What should I do after receiving an Alberta traffic ticket?',
        a: 'Check the dispute deadline printed on the ticket, keep a copy, and gather any relevant photos, video, or documents before choosing how to respond.',
      },
      {
        q: 'How much does Fabsy charge for representation?',
        a: pricing,
      },
      {
        q: 'Is Fabsy a law firm?',
        a: 'No. Fabsy is an agent service for Alberta traffic matters, not a law firm.',
      },
    ],
  };
};

const normalizePageForDisplay = (page: PageRecord, curated: boolean): PageRecord => {
  let faqs: unknown = page.faqs || [];
  let faqsValid = Array.isArray(faqs);
  if (typeof page.faqs === 'string') {
    try {
      faqs = JSON.parse(page.faqs || '[]');
      faqsValid = Array.isArray(faqs);
    } catch {
      faqs = [];
      faqsValid = false;
    }
  }
  const parsed = {
    ...page,
    faqs,
  };
  return curated && faqsValid && hasReviewedCuratedBody(parsed) ? parsed : safeLegacyPage(parsed);
};

const WorkingContentPage = () => {
  const { slug } = useParams();
  const [pageData, setPageData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canonicalUrl = slug ? `https://fabsy.ca/content/${slug}` : undefined;

  // Safe head management (replaces React Helmet)
  useSafeHead({
    title: pageData?.meta_title || pageData?.h1 || `Content - ${slug}` || 'Fabsy',
    description: pageData?.meta_description || 'Trusted traffic ticket defence in Alberta',
    canonical: canonicalUrl,
    robots: slug && /^(?:test(?:-|$)|verify-smoke(?:-|$))/.test(slug)
      ? 'noindex, nofollow'
      : 'index, follow',
  });

  useEffect(() => {
    async function fetchPage() {
      if (!slug) return;

      setLoading(true);
      setError(null);

      try {
        const [pageResult, curatedSlugs] = await Promise.all([
          supabase
            .from('page_content')
            .select('*')
            .eq('slug', slug)
            .single(),
          loadCuratedSlugs(),
        ]);
        const { data, error: fetchError } = pageResult;

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Page not found');

        setPageData(normalizePageForDisplay(data, curatedSlugs.has(slug)));
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

  const currentUrl = canonicalUrl || `https://fabsy.ca/content/${String(pageData.slug)}`;

  // Derive Service schema fields with enhanced city detection
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
  
  const cityName: string | undefined = pageData.city 
    || detectCityFromSlug(pageData.slug as string || '') 
    || (pageData.h1 && /\bin\s+([A-Za-z\-\s]+)$/.exec(pageData.h1 as string)?.[1]?.trim()) 
    || undefined;
    
  const serviceName: string = pageData.h1 || `Traffic Ticket Dispute${cityName ? ` in ${cityName}` : ''}`;
  const serviceType = 'Traffic ticket dispute';

  // Derive offense/violation for answer box and HowTo
  const offence: string = (pageData.violation
    || (pageData.h1 && (/Fight\s+(?:a|an)\s+(.+?)\s+in\s+/i.exec(pageData.h1 as string)?.[1]?.trim()))
    || 'traffic ticket');

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
        offerDescription="Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced."
      />
      {/* Enhanced LocalBusiness schema for Alberta city pages */}
      {cityName && (
        <LocalBusinessSchema 
          url={currentUrl}
          cityName={cityName}
        />
      )}
      {/* HowTo for cornerstone flows */}
      <HowToSchema
        name={`How to fight a ${offence.toLowerCase()}${cityName ? ` in ${cityName}` : ' in Alberta'} (3 steps)`}
        description={`Three-step process to dispute a ${offence.toLowerCase()}${cityName ? ` in ${cityName}` : ' in Alberta'}.`}
        url={currentUrl}
        steps={[
          { name: 'Upload your ticket', text: 'Send us a photo or PDF of your ticket and basic details.' },
          { name: 'We check the court file', text: 'We obtain and review disclosure for errors and defenses.' },
          { name: 'Confirm the plan', text: 'We explain the options and provide agent representation where permitted.' },
        ]}
      />
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

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-foreground leading-tight">
            {pageData.h1 || pageData.slug}
          </h1>

          {/* Answer Box - 60-second answer above the fold */}
          {cityName && offence && (
            <AnswerBox 
              offence={offence}
              city={cityName}
              ctaHref="/traffic-ticket-assessment"
            />
          )}

          {/* Original Answer Box (60-second summary) - keeping as fallback */}
          <div className="mb-8 rounded-xl border bg-card shadow-sm p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-2">Can I dispute it?</h2>
                <p className="text-foreground">You can dispute a {offence.toLowerCase()} {cityName ? `in ${cityName}` : 'in Alberta'}. Follow the instructions on the ticket and act by the deadline printed on it.</p>
                <h3 className="mt-4 text-sm font-semibold text-foreground">What to do now (3 steps)</h3>
                <ol className="mt-2 list-decimal ml-5 space-y-1 text-foreground">
                  <li>Upload your ticket</li>
                  <li>We check the court file and disclosure</li>
                  <li>Confirm the plan (we represent you)</li>
                </ol>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">What happens next</h3>
                <p className="text-foreground">We review the ticket and disclosure, explain the available options, and provide agent representation where permitted.</p>
                <h3 className="mt-3 text-sm font-semibold text-foreground">Pricing</h3>
                <p className="text-foreground">Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.</p>
                <h3 className="mt-3 text-sm font-semibold text-foreground">Local</h3>
                <p className="text-foreground">{cityName || 'Alberta'} • {offence.charAt(0).toUpperCase() + offence.slice(1)}</p>
              </div>
            </div>
          </div>

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
                  <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
                  Why Act Now
                </h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="text-foreground leading-relaxed">Act by the deadline printed on your ticket</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="text-foreground leading-relaxed">Keep the ticket and related documents</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="text-foreground leading-relaxed">Request and review disclosure</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="text-foreground leading-relaxed">Confirm whether agent representation is permitted</span>
                  </li>
                </ul>
              </div>

              {/* CTA Card */}
              <div className="bg-primary text-primary-foreground rounded-xl p-6 shadow-elegant">
                <div className="w-12 h-12 rounded-lg bg-primary-foreground/20 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Get a ticket-specific recommendation</h3>
                <p className="text-sm mb-5 opacity-95">
                  Ticket Triage reviews the ticket, demerit implications, likely insurance significance, and whether representation appears worth the cost.
                </p>
                <Link to="/traffic-ticket-assessment">
                  <Button 
                    size="lg"
                    className="w-full bg-background text-foreground hover:shadow-lg transition-shadow"
                  >
                    See Ticket Triage - $149 →
                  </Button>
                </Link>
                <p className="text-xs mt-3 opacity-80 text-center">Human reviewed · GST included · $149 can be applied to eligible representation when worthwhile</p>
                <p className="mt-3 text-center text-xs opacity-80">
                  <Link to="/submit-ticket" className="underline underline-offset-2">Only need the free representation eligibility check?</Link>
                </p>
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
