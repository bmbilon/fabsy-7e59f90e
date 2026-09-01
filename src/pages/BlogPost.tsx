import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ArrowLeft, Share2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { guardPublishedBlogPost } from '@/lib/published-content-guardrails';
import useSafeHead from '@/hooks/useSafeHead';
import { RAPID_RESOLUTION } from '@/config/offers';
import seoRoutePolicies from '@/config/seoRoutePolicies.json';
import {
  blogEditorialDateDisplay,
  blogSeoTitle,
  buildBlogPostingSchema,
  formatBlogEditorialDate,
  latestEditorialDate,
  officialBlogSources,
} from '@/lib/blog-seo';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  meta_description: string;
  keywords: string[];
  status: string;
  published_at: string;
  updated_at?: string;
  reviewed_at?: string;
  source_data?: unknown;
  author: string;
  category: string;
  aeo_score: number;
  view_count: number;
  featured_image?: string;
}

const BLOG_REDIRECTS = seoRoutePolicies.redirects as Record<string, string>;
const GONE_BLOG_PATHS = new Set(seoRoutePolicies.gone);

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const blogPath = slug ? `/blog/${slug}` : '';
  const policyDestination = BLOG_REDIRECTS[blogPath] || (GONE_BLOG_PATHS.has(blogPath) ? '/blog' : null);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  useSafeHead({
    title: post ? blogSeoTitle(post.title) : null,
    description: post?.meta_description,
    canonical: post ? `https://fabsy.ca/blog/${post.slug}` : null,
    ogType: post ? 'article' : null,
  });

  const fetchPost = useCallback(async () => {
    if (policyDestination) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setNotFound(true);
        } else {
          console.error('Supabase error:', error);
          setError(`Database error: ${error.message}`);
        }
      } else if (data) {
        setPost(guardPublishedBlogPost(data as BlogPost));
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load blog post');
    } finally {
      setLoading(false);
    }
  }, [policyDestination, slug]);

  useEffect(() => {
    if (slug && !policyDestination) {
      void fetchPost();
    }
  }, [fetchPost, policyDestination, slug]);

  const getEstimatedReadTime = (content: string) => {
    const wordsPerMinute = 200;
    const wordCount = content.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const text = `${post?.title} - ${post?.meta_description}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: post?.title, text, url });
      } catch (err) {
        console.log('Share cancelled or failed');
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy link');
      }
    }
  };


  if (policyDestination) {
    return <Navigate to={policyDestination} replace />;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-hero">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  if (notFound) {
    return <Navigate to="/blog" replace />;
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-hero">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-md mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-600 mb-4">Unable to load blog post</p>
              <p className="text-sm text-red-500 mb-4">{error}</p>
              <Link to="/blog">
                <Button>Back to Blog</Button>
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  if (!post) return <Navigate to="/blog" replace />;

  const structuredData = buildBlogPostingSchema(post);
  const dateModified = latestEditorialDate(post) || post.published_at;
  const editorialDates = blogEditorialDateDisplay(post);
  const officialSources = officialBlogSources(post.source_data);

  return (
    <>
      <Helmet>
        <meta name="keywords" content={post.keywords.join(", ")} />
        
        {/* Open Graph */}
        {post.featured_image && <meta property="og:image" content={post.featured_image} />}
        <meta property="article:published_time" content={post.published_at} />
        <meta property="article:modified_time" content={dateModified} />
        <meta property="article:author" content={post.author || 'Fabsy Editorial Team'} />
        <meta property="article:section" content={post.category} />
        {post.keywords.map((keyword) => (
          <meta key={keyword} property="article:tag" content={keyword} />
        ))}
        
        {/* Twitter */}
        {post.featured_image && <meta name="twitter:image" content={post.featured_image} />}
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <main className="min-h-screen bg-gradient-hero">
        <Header />
        
        <article className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              {/* Back to Blog */}
              <div className="mb-8">
                <Link
                  to="/blog"
                  className="inline-flex items-center text-primary-light hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Blog
                </Link>
              </div>

              {/* Article Header */}
              <header className="mb-8">
                <div className="mb-4">
                  <Badge variant="secondary">{post.category}</Badge>
                </div>
                
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                  {post.title}
                </h1>

                <div className="flex flex-col gap-4 mb-6 pb-6 border-b border-white/10 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-white/70">
                    <span>
                      By{' '}
                      <Link to="/about" className="font-semibold text-primary-light underline underline-offset-4 hover:text-white">
                        {post.author || 'Fabsy Editorial Team'}
                      </Link>
                    </span>
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Published{editorialDates.published?.reviewed ? ' and editorially reviewed' : ''}{' '}
                      {formatBlogEditorialDate(post.published_at)}
                    </span>
                    {editorialDates.modified && (
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Updated{editorialDates.modified.reviewed ? ' and editorially reviewed' : ''}{' '}
                        {formatBlogEditorialDate(editorialDates.modified.value)}
                      </span>
                    )}
                    {editorialDates.reviewed && (
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Editorially reviewed {formatBlogEditorialDate(editorialDates.reviewed.value)}
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {getEstimatedReadTime(post.content)} min read
                    </span>
                  </div>
                  
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </div>

                <p className="text-xl text-white/80 leading-relaxed">
                  {post.meta_description}
                </p>
              </header>

              {/* Featured Image */}
              {post.featured_image && (
                <div className="mb-8 -mx-4 md:-mx-0">
                  <img 
                    src={post.featured_image} 
                    alt={post.title}
                    className="w-full h-64 md:h-96 object-cover rounded-lg shadow-lg"
                    loading="lazy"
                    onError={(e) => {
                      // Hide image if it fails to load
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Article Content */}
              <div className="prose prose-lg max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({node, ...props}) => <h2 className="text-3xl font-bold mt-12 mb-6 text-white" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-3xl font-bold mt-12 mb-6 text-white" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-2xl font-semibold mt-8 mb-4 text-white" {...props} />,
                    p: ({node, ...props}) => <p className="mb-6 text-white/80 leading-relaxed text-lg" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-6 space-y-2 text-white/80" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-6 space-y-2 text-white/80" {...props} />,
                    li: ({node, ...props}) => <li className="mb-2" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-white" {...props} />,
                    em: ({node, ...props}) => <em className="italic" {...props} />,
                    a: ({node, ...props}) => <a className="text-primary-light hover:text-white underline" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary pl-4 italic my-6 text-white/70" {...props} />,
                    code: ({node, className, ...props}) => {
                      const isInline = !className || !className.includes('language-');
                      return isInline
                        ? <code className="bg-white/10 text-slate-200 px-2 py-1 rounded text-sm font-mono" {...props} />
                        : <code className={`block bg-gray-900 text-gray-100 p-4 rounded-lg my-6 overflow-x-auto ${className}`} {...props} />;
                    },
                    img: ({node, ...props}) => (
                      <img 
                        className="w-full rounded-lg my-8 shadow-lg" 
                        {...props} 
                        loading="lazy"
                      />
                    ),
                    table: ({node, ...props}) => (
                      <div className="overflow-x-auto my-8">
                        <table className="min-w-full border-collapse border border-gray-300 bg-white shadow-sm" {...props} />
                      </div>
                    ),
                    thead: ({node, ...props}) => <thead className="bg-gray-50" {...props} />,
                    th: ({node, ...props}) => <th className="border border-gray-300 px-6 py-4 text-left font-semibold text-gray-900" {...props} />,
                    td: ({node, ...props}) => <td className="border border-gray-300 px-6 py-4 text-gray-700" {...props} />
                  }}
                >
                  {post.content}
                </ReactMarkdown>
              </div>

              {officialSources.length > 0 && (
                <section className="mt-12 rounded-lg border border-white/20 bg-white/5 p-6" aria-labelledby="article-sources-heading">
                  <h2 id="article-sources-heading" className="text-2xl font-bold text-white mb-3">Official sources</h2>
                  <p className="text-white/80 mb-4">Primary sources used for this article:</p>
                  <ul className="list-disc pl-6 space-y-2 text-white/80">
                    {officialSources.map((source) => (
                      <li key={source}>
                        <a href={source} className="text-primary-light underline underline-offset-4 hover:text-white">
                          {new URL(source).hostname.replace(/^www\./, '')}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Keywords */}
              <footer className="mt-12 pt-8 border-t border-white/10">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Topics Covered:</h3>
                  <div className="flex flex-wrap gap-2">
                    {post.keywords.map((keyword, index) => (
                      <Badge key={index} variant="outline">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mb-8 rounded-lg border border-white/20 bg-white/5 p-6">
                  <h3 className="text-xl font-semibold text-white mb-3">Related Alberta traffic-ticket guides</h3>
                  <ul className="list-disc pl-6 space-y-2 text-white/80">
                    <li><Link to="/content/speeding-ticket-alberta" className="text-primary-light underline underline-offset-4 hover:text-white">How to fight a speeding ticket in Alberta</Link></li>
                    <li><Link to="/content/fight-traffic-ticket-alberta" className="text-primary-light underline underline-offset-4 hover:text-white">How to dispute a traffic ticket in Alberta</Link></li>
                    <li><Link to="/hubs/court-options-and-deadlines" className="text-primary-light underline underline-offset-4 hover:text-white">Court options and response deadlines</Link></li>
                  </ul>
                </div>

                {/* Call to Action */}
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-8 text-center shadow-lg">
                  <h3 className="text-2xl font-bold mb-4 text-white">Need Help with Your Traffic Ticket?</h3>
                  <p className="text-xl mb-6 text-white/80">
                    Rapid Resolution handles secure intake, disclosure review, prosecutor review, file updates and your final decision for an eligible pre-trial matter.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button asChild size="lg" className="bg-primary text-white hover:bg-primary-dark border-0">
                      <Link to={RAPID_RESOLUTION.intakePath}>Start Rapid Resolution - ${RAPID_RESOLUTION.priceCad}</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="border-white/30 text-white hover:bg-primary/20">
                      <Link to="/how-it-works">See How It Works</Link>
                    </Button>
                  </div>
                </div>
              </footer>
            </div>
          </div>
        </article>

        <Footer />
      </main>
    </>
  );
};

export default BlogPost;
