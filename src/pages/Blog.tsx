import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Calendar, Clock, ArrowRight, BookOpenCheck } from 'lucide-react';
import useSafeHead from '@/hooks/useSafeHead';
import { guardPublishedBlogPost } from '@/lib/published-content-guardrails';
import seoRoutePolicies from '@/config/seoRoutePolicies.json';

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

const FEATURED_GUIDES = [
  {
    href: '/content/speeding-ticket-alberta',
    eyebrow: 'Speeding tickets',
    title: 'Speeding Tickets in Alberta: Deadlines, Demerits and Options',
    description: 'Start with the core Alberta guide to deadlines, penalties, disclosure and the choices available after a speeding ticket.',
  },
  {
    href: '/content/fight-traffic-ticket-alberta',
    eyebrow: 'Ticket response guide',
    title: 'How to Fight a Traffic Ticket in Alberta',
    description: 'Follow the practical route from checking the ticket and requesting disclosure through resolution discussions or trial preparation.',
  },
] as const;

const RETIRED_BLOG_SLUGS = new Set([
  ...Object.keys(seoRoutePolicies.redirects),
  ...seoRoutePolicies.gone,
].filter(path => path.startsWith('/blog/')).map(path => path.slice('/blog/'.length)));

function BlogHero() {
  return <section className="py-16 text-white">
    <div className="container mx-auto px-4 text-center">
      <h1 className="mb-4 text-4xl font-bold md:text-5xl">Alberta Traffic Ticket Blog</h1>
      <p className="mx-auto max-w-3xl text-xl opacity-90 md:text-2xl">
        General information about Alberta traffic tickets, enforcement, and response options
      </p>
    </div>
  </section>;
}

function FeaturedGuides() {
  return <section className="pb-8" aria-labelledby="featured-guides-heading">
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-7xl rounded-2xl border border-white/20 bg-white/10 p-6 shadow-xl backdrop-blur-sm sm:p-8">
        <div className="mb-6 max-w-3xl">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-200">
            <BookOpenCheck className="h-5 w-5" aria-hidden="true" /> Start here
          </p>
          <h2 id="featured-guides-heading" className="text-3xl font-bold text-white">Essential Alberta ticket guides</h2>
          <p className="mt-2 text-white/75">Source-backed overviews for the questions Alberta drivers ask most often.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {FEATURED_GUIDES.map(guide => <Link key={guide.href} to={guide.href} className="group rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <Card className="h-full border-white/30 bg-white p-6 transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-lg">
              <p className="mb-2 text-sm font-semibold text-fabsy-red">{guide.eyebrow}</p>
              <h3 className="text-xl font-bold text-slate-900 group-hover:text-fabsy-red">{guide.title}</h3>
              <p className="mt-3 leading-relaxed text-slate-600">{guide.description}</p>
              <span className="mt-5 inline-flex items-center font-semibold text-sky-700 group-hover:text-sky-900">
                Read the guide <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </span>
            </Card>
          </Link>)}
        </div>
      </div>
    </div>
  </section>;
}

const Blog = () => {
  useSafeHead({
    title: 'Alberta Traffic Ticket Articles | Fabsy',
    description: 'Read general information about Alberta traffic tickets, enforcement, and response options from Fabsy Traffic Ticket Services.',
    canonical: 'https://fabsy.ca/blog',
  });
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        setError(`Database error: ${error.message}`);
      } else {
        setPosts((data || [])
          .filter(post => !RETIRED_BLOG_SLUGS.has(post.slug))
          .map(post => guardPublishedBlogPost(post as BlogPost)));
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load blog posts');
    } finally {
      setLoading(false);
    }
  }

  const getExcerpt = (content: string, maxLength: number = 150) => {
    // Remove markdown headers and get clean text
    const cleanContent = content
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .trim();
    
    return cleanContent.length > maxLength 
      ? cleanContent.substring(0, maxLength) + '...'
      : cleanContent;
  };

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

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-hero">
        <Header />
        <BlogHero />
        <FeaturedGuides />
        <div className="container mx-auto px-4 py-16">
          <div className="text-center">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-64 mx-auto mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-96 mx-auto mb-8"></div>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-6 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded mb-4 w-3/4"></div>
                  <div className="flex gap-2 mb-4">
                    <div className="h-5 bg-gray-200 rounded w-16"></div>
                    <div className="h-5 bg-gray-200 rounded w-20"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </Card>
              ))}
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-hero">
        <Header />
        <BlogHero />
        <FeaturedGuides />
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-md mx-auto">
            <h2 className="text-3xl font-bold text-white mb-4">Latest articles</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-600 mb-4">Unable to load blog posts</p>
              <p className="text-sm text-red-500">{error}</p>
              <button 
                onClick={fetchPosts} 
                className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-hero">
      <Header />
      <BlogHero />
      <FeaturedGuides />

      {/* Blog Posts Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          {posts.length === 0 ? (
            <div className="text-center max-w-md mx-auto">
              <h2 className="text-2xl font-semibold text-white mb-4">No Posts Yet</h2>
              <p className="text-white/70">
                We're working on creating valuable content for Alberta drivers. Check back soon!
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Latest Articles</h2>
                <p className="text-white/70 max-w-2xl mx-auto">
                  Stay informed about Alberta traffic laws and learn how to handle tickets effectively
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto">
                {posts.map((post) => (
                  <Card key={post.id} className="h-full flex flex-col bg-gradient-card border border-white/20 hover:shadow-lg transition-shadow duration-300 overflow-hidden">
                    {/* Featured Image */}
                    {post.featured_image && (
                      <div className="aspect-video overflow-hidden">
                        <img 
                          src={post.featured_image} 
                          alt={post.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            // Hide image container if image fails to load
                            e.currentTarget.parentElement!.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    
                    <div className="p-6 flex flex-col h-full">
                      {/* Category Badge */}
                      <div className="mb-3">
                        <Badge variant="secondary" className="text-xs">
                          {post.category}
                        </Badge>
                      </div>

                      {/* Title */}
                      <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2">
                        <Link 
                          to={`/blog/${post.slug}`}
                          className="hover:text-fabsy-red transition-colors"
                        >
                          {post.title}
                        </Link>
                      </h3>

                      {/* Excerpt */}
                      <p className="text-gray-600 mb-4 line-clamp-3 flex-grow">
                        {post.meta_description || getExcerpt(post.content)}
                      </p>

                      {/* Keywords */}
                      <div className="mb-4">
                        <div className="flex flex-wrap gap-1">
                          {post.keywords?.slice(0, 3).map((keyword, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Meta info */}
                      <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {formatDate(post.published_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {getEstimatedReadTime(post.content)} min read
                          </span>
                        </div>
                      </div>

                      {/* Read More Link */}
                        <Link 
                          to={`/blog/${post.slug}`}
                          className="inline-flex items-center text-sky-700 font-semibold hover:text-sky-900 transition-colors mt-auto"
                        >
                        Read Article
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default Blog;
