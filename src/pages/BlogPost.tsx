import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ArrowLeft, Share2, Eye } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  meta_description: string;
  keywords: string[];
  status: string;
  published_at: string;
  author: string;
  category: string;
  aeo_score: number;
  view_count: number;
  featured_image?: string;
}

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (slug) {
      fetchPost();
    }
  }, [slug]);

  async function fetchPost() {
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
        setPost(data);
        // Update view count
        updateViewCount(data.id, data.view_count);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load blog post');
    } finally {
      setLoading(false);
    }
  }

  async function updateViewCount(postId: string, currentCount: number) {
    try {
      await supabase
        .from('blog_posts')
        .update({ view_count: (currentCount || 0) + 1 })
        .eq('id', postId);
    } catch (err) {
      console.warn('Failed to update view count:', err);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

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


  if (loading) {
    return (
      <main className="min-h-screen bg-white">
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
      <main className="min-h-screen bg-white">
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

  // Structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.meta_description,
    "author": {
      "@type": "Organization",
      "name": post.author
    },
    "publisher": {
      "@type": "Organization",
      "name": "Fabsy",
      "logo": {
        "@type": "ImageObject",
        "url": "https://fabsy.ca/logo.png"
      }
    },
    "datePublished": post.published_at,
    "dateModified": post.published_at,
    "keywords": post.keywords.join(", "),
    "articleSection": post.category,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://fabsy.ca/blog/${post.slug}`
    }
  };

  return (
    <>
      <Helmet>
        <title>{post.title} | Fabsy - Alberta Traffic Ticket Defense</title>
        <meta name="description" content={post.meta_description} />
        <meta name="keywords" content={post.keywords.join(", ")} />
        <link rel="canonical" href={`https://fabsy.ca/blog/${post.slug}`} />
        
        {/* Open Graph */}
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.meta_description} />
        <meta property="og:url" content={`https://fabsy.ca/blog/${post.slug}`} />
        <meta property="og:type" content="article" />
        {post.featured_image && <meta property="og:image" content={post.featured_image} />}
        <meta property="article:published_time" content={post.published_at} />
        <meta property="article:author" content={post.author} />
        <meta property="article:section" content={post.category} />
        {post.keywords.map((keyword) => (
          <meta key={keyword} property="article:tag" content={keyword} />
        ))}
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.meta_description} />
        {post.featured_image && <meta name="twitter:image" content={post.featured_image} />}
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <main className="min-h-screen bg-white">
        <Header />
        
        <article className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              {/* Back to Blog */}
              <div className="mb-8">
                <Link 
                  to="/blog" 
                  className="inline-flex items-center text-fabsy-red hover:text-red-700 transition-colors"
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
                
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                  {post.title}
                </h1>

                <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-200">
                  <div className="flex items-center gap-6 text-gray-600">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDate(post.published_at)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {getEstimatedReadTime(post.content)} min read
                    </span>
                    <span className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      {(post.view_count || 0) + 1} views
                    </span>
                  </div>
                  
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </div>

                <p className="text-xl text-gray-600 leading-relaxed">
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
                    h1: ({node, ...props}) => <h1 className="text-4xl font-bold mt-8 mb-6 text-gray-900" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-3xl font-bold mt-12 mb-6 text-gray-900" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-2xl font-semibold mt-8 mb-4 text-gray-900" {...props} />,
                    p: ({node, ...props}) => <p className="mb-6 text-gray-700 leading-relaxed text-lg" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-6 space-y-2 text-gray-700" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-6 space-y-2 text-gray-700" {...props} />,
                    li: ({node, ...props}) => <li className="mb-2" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                    em: ({node, ...props}) => <em className="italic" {...props} />,
                    a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-700 underline" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic my-6 text-gray-600" {...props} />,
                    code: ({node, inline, ...props}) => 
                      inline 
                        ? <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono" {...props} />
                        : <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg my-6 overflow-x-auto" {...props} />,
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

              {/* Keywords */}
              <footer className="mt-12 pt-8 border-t border-gray-200">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Topics Covered:</h3>
                  <div className="flex flex-wrap gap-2">
                    {post.keywords.map((keyword, index) => (
                      <Badge key={index} variant="outline">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Call to Action */}
                <div className="bg-fabsy-red text-white rounded-lg p-8 text-center" style={{backgroundColor: '#dc2626 !important', color: '#ffffff !important'}}>
                  <h3 className="text-2xl font-bold mb-4">Need Help with Your Traffic Ticket?</h3>
                  <p className="text-xl mb-6 opacity-90">
                    Don't let a traffic ticket impact your driving record. Get expert help from Alberta's premier traffic defense service.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button asChild variant="secondary" size="lg">
                      <Link to="/contact">Get Free Consultation</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="bg-white text-fabsy-red hover:bg-gray-50" style={{backgroundColor: '#ffffff', color: '#dc2626'}}>
                      <Link to="/">Learn More</Link>
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
