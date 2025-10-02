import JSONLDInjector from '@/components/JSONLDInjector';
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";
import { generateFaqJsonLd, generateVideoJsonLd } from "@/utils/generate-json-ld";
import ArticleSchema from "@/components/ArticleSchema";
import FAQSection from "@/components/FAQSection";

interface PageContent {
  slug: string;
  meta_title: string;
  meta_description: string;
  h1: string;
  hook: string;
  bullets: string[];
  what: string;
  how: string;
  next: string;
  faqs: Array<{ q: string; a: string }>;
  video: { youtubeUrl?: string; transcript?: string } | null;
}

const ContentPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [pageData, setPageData] = useState<PageContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPage = async () => {
      try {
        // Try to load from build-time generated content
        const content = await import(`../content/pages/${slug}.json`);
        setPageData(content.default || content);
      } catch (error) {
        console.error('Failed to load page content:', error);
        setPageData(null);
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      loadPage();
    }
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
        <Footer />
      </main>
    );
  }

  if (!pageData) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">The page you're looking for doesn't exist.</p>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  const faqJsonLd = generateFaqJsonLd(pageData.faqs || []);
  const videoJsonLd = pageData.video?.youtubeUrl 
    ? generateVideoJsonLd({
        youtubeUrl: pageData.video.youtubeUrl,
        transcript: pageData.video.transcript,
        title: pageData.h1
      })
    : null;

  return (
    <>
      <Helmet>
        <title>{pageData.meta_title}</title>
        <meta name="description" content={pageData.meta_description} />
        <meta property="og:title" content={pageData.meta_title} />
        <meta property="og:description" content={pageData.meta_description} />
        <meta property="og:type" content="article" />
        <link rel="canonical" href={`https://fabsy.ca/content/${pageData.slug}`} />
        
        {faqJsonLd && (
          <script type="application/ld+json">
            {JSON.stringify(faqJsonLd)}
          </script>
        )}
        {videoJsonLd && (
          <script type="application/ld+json">
            {JSON.stringify(videoJsonLd)}
          </script>
        )}
      </Helmet>
      <JSONLDInjector jsonld={pageData?.jsonld ?? null} />

      {pageData && (
        <>
          <Helmet>
            <title>{pageData.meta_title}</title>
            <meta name="description" content={pageData.meta_description} />
          </Helmet>

          <ArticleSchema
            headline={pageData.h1}
            description={pageData.meta_description}
            url={typeof window !== "undefined" ? window.location.href : `https://fabsy.ca/content/${pageData.slug}`}
          />

          {pageData.faqs && pageData.faqs.length > 0 && (
            <FAQSection
              faqs={pageData.faqs.map((f:any) => ({ q: String(f.q), a: String(f.a) }))}
              pageName={pageData.h1}
              pageUrl={typeof window !== "undefined" ? window.location.href : `https://fabsy.ca/content/${pageData.slug}`}
            />
          )}
        </>
      )}

      <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <Header />

        <article className="container mx-auto px-4 py-12">
          {/* Hero Section */}
          <div className="max-w-4xl mx-auto mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">{pageData.h1}</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              {pageData.hook}
            </p>
          </div>

          {/* Key Points */}
          {pageData.bullets && pageData.bullets.length > 0 && (
            <Card className="max-w-4xl mx-auto mb-12">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold mb-6">Key Points</h2>
                <ul className="space-y-3">
                  {pageData.bullets.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-lg">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Content Sections */}
          <div className="max-w-4xl mx-auto space-y-12">
            {pageData.what && (
              <section>
                <h2 className="text-3xl font-bold mb-4">What You Need to Know</h2>
                <div 
                  className="prose prose-lg max-w-none dark:prose-invert" 
                  dangerouslySetInnerHTML={{ __html: pageData.what }} 
                />
              </section>
            )}

            {pageData.how && (
              <section>
                <h2 className="text-3xl font-bold mb-4">How It Works</h2>
                <div 
                  className="prose prose-lg max-w-none dark:prose-invert" 
                  dangerouslySetInnerHTML={{ __html: pageData.how }} 
                />
              </section>
            )}

            {pageData.next && (
              <section>
                <h2 className="text-3xl font-bold mb-4">Next Steps</h2>
                <div 
                  className="prose prose-lg max-w-none dark:prose-invert" 
                  dangerouslySetInnerHTML={{ __html: pageData.next }} 
                />
              </section>
            )}

            {/* FAQs - Now handled by FAQSection component at top for schema markup */}
            {/* {pageData.faqs && pageData.faqs.length > 0 && (
              <section>
                <h2 className="text-3xl font-bold mb-6">Frequently Asked Questions</h2>
                <div className="space-y-4">
                  {pageData.faqs.map((faq, i) => (
                    <Card key={i}>
                      <CardContent className="p-6">
                        <h3 className="text-xl font-semibold mb-3">{faq.q}</h3>
                        <p className="text-muted-foreground leading-relaxed">{faq.a}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )} */}

            {/* CTA */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20">
              <CardContent className="p-8 text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
                <p className="text-xl text-muted-foreground mb-6">
                  Get a free eligibility check and see if your ticket is worth fighting
                </p>
                <Link to="/">
                  <Button size="lg" className="text-lg px-8">
                    Free Eligibility Check
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </article>

        <Footer />
      </main>
    </>
  );
};

export default ContentPage;
