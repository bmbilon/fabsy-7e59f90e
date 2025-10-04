import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import useSafeHead from '@/hooks/useSafeHead';

const BlogPost = () => {
  const { slug } = useParams();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useSafeHead({
    title: post?.meta_title || post?.title || 'Blog Post',
    description: post?.meta_description || '',
    canonical: `https://fabsy.ca/blog/${slug}`
  });

  useEffect(() => {
    async function fetchPost() {
      setLoading(true);
      setError(false);
      
      const { data, error: fetchError } = await (supabase as any)
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

      if (fetchError || !data) {
        setError(true);
        setLoading(false);
        return;
      }

      setPost(data);
      setLoading(false);

      // Increment view count
      await (supabase as any)
        .from('blog_posts')
        .update({ view_count: ((data as any).view_count || 0) + 1 })
        .eq('id', data.id);
    }

    if (slug) {
      fetchPost();
    }
  }, [slug]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </main>
        <Footer />
      </>
    );
  }

  if (error || !post) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Post Not Found</h1>
            <p className="text-muted-foreground">The blog post you're looking for doesn't exist.</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-purple-50/30 via-white to-white">
        {/* Hero Section with subtle background */}
        <div className="bg-gradient-to-b from-purple-100/40 to-white border-b border-purple-100">
          <div className="container mx-auto px-4 py-12 md:py-16 max-w-4xl">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold uppercase tracking-wide rounded-md bg-primary text-primary-foreground">
              {post.category || 'Article'}
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-foreground leading-tight">
              {post.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                  {post.author?.charAt(0) || 'F'}
                </div>
                <span className="font-medium text-foreground">{post.author || 'Fabsy Team'}</span>
              </div>
              <span>•</span>
              <time dateTime={post.published_at}>
                {new Date(post.published_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
              <span>•</span>
              <span>{Math.ceil((post.content?.length || 0) / 1000)} min read</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <article className="container mx-auto px-4 py-12 md:py-16 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
            {/* Main Content Column */}
            <div className="lg:col-span-8">
              {/* Featured Image */}
              {post.featured_image ? (
                <div className="mb-12 rounded-xl overflow-hidden shadow-elegant">
                  <img 
                    src={post.featured_image} 
                    alt={post.title}
                    className="w-full h-auto"
                  />
                </div>
              ) : (
                <div className="mb-12 rounded-xl overflow-hidden bg-muted border">
                  <div className="aspect-video flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-primary/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-muted-foreground">Featured image coming soon</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Article Body */}
              <div className="bg-card rounded-xl p-8 md:p-10 shadow-sm border mb-8">
                <div 
                  className="prose prose-lg max-w-none
                    prose-headings:text-foreground prose-headings:font-bold prose-headings:tracking-tight
                    prose-h2:text-3xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border
                    prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-3
                    prose-h4:text-xl prose-h4:mt-6 prose-h4:mb-2
                    prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-6
                    prose-strong:text-foreground prose-strong:font-semibold
                    prose-ul:my-6 prose-ol:my-6
                    prose-li:text-foreground prose-li:my-2 prose-li:leading-relaxed
                    prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                    prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-muted prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:my-6 prose-blockquote:rounded-r
                    prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                    prose-pre:bg-muted prose-pre:border prose-pre:border-border"
                  dangerouslySetInnerHTML={{ __html: post.content }}
                />
              </div>

              {/* Related Resources Section */}
              <div className="bg-card rounded-xl p-8 shadow-sm border">
                <h3 className="text-2xl font-bold mb-6 text-foreground flex items-center gap-2">
                  <span className="text-primary">📚</span>
                  Related Resources & Best Practices
                </h3>
                <div className="space-y-3">
                  <a 
                    href="https://www.alberta.ca/traffic-safety" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-4 p-4 rounded-lg bg-muted hover:bg-muted/70 transition-all duration-200 border border-transparent hover:border-primary/20"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-xl">
                      🏛️
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">Alberta Traffic Safety Guidelines</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">Official resources from the Government of Alberta</p>
                    </div>
                    <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  
                  <a 
                    href="/how-it-works" 
                    className="group flex items-start gap-4 p-4 rounded-lg bg-muted hover:bg-muted/70 transition-all duration-200 border border-transparent hover:border-primary/20"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-xl">
                      ⚖️
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">How We Fight Traffic Tickets</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">Learn about our proven process for defending Alberta traffic violations</p>
                    </div>
                    <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>

                  <a 
                    href="https://www.youtube.com/results?search_query=alberta+traffic+court" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-4 p-4 rounded-lg bg-muted hover:bg-muted/70 transition-all duration-200 border border-transparent hover:border-primary/20"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-xl">
                      🎥
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">Traffic Court Video Resources</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">Watch educational videos about traffic court procedures in Alberta</p>
                    </div>
                    <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Sidebar Column */}
            <aside className="lg:col-span-4">
              <div className="sticky top-24 space-y-6">
                {/* Key Takeaways Card */}
                <div className="bg-card rounded-xl p-6 shadow-sm border">
                  <h3 className="text-lg font-bold mb-4 text-foreground flex items-center gap-2">
                    <span className="text-primary">💡</span>
                    Key Takeaways
                  </h3>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="text-primary mt-0.5 font-bold">✓</span>
                      <span className="text-foreground leading-relaxed">Always review your ticket details within 7 days</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-primary mt-0.5 font-bold">✓</span>
                      <span className="text-foreground leading-relaxed">Document evidence immediately after the incident</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-primary mt-0.5 font-bold">✓</span>
                      <span className="text-foreground leading-relaxed">Professional representation increases success rates</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-primary mt-0.5 font-bold">✓</span>
                      <span className="text-foreground leading-relaxed">Protect your insurance rates and driving record</span>
                    </li>
                  </ul>
                </div>

                {/* CTA Card */}
                <div className="bg-primary text-primary-foreground rounded-xl p-6 shadow-elegant">
                  <h3 className="text-xl font-bold mb-2">Got a Traffic Ticket?</h3>
                  <p className="text-sm mb-5 opacity-95">Let our experts fight it for you. We have a proven track record across Alberta.</p>
                  <a 
                    href="/ticket-form" 
                    className="block w-full py-3 px-4 rounded-lg bg-background text-foreground text-center font-semibold hover:shadow-lg transition-shadow"
                  >
                    Submit Your Ticket →
                  </a>
                  <p className="text-xs mt-3 opacity-80 text-center">Free initial consultation • No win, no fee options</p>
                </div>

                {/* Share Card */}
                <div className="bg-card rounded-xl p-6 shadow-sm border">
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Share This Article</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(post.title)}`, '_blank')}
                      className="py-2.5 px-3 rounded-lg bg-muted hover:bg-muted/70 text-foreground transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <span>𝕏</span> Twitter
                    </button>
                    <button 
                      onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank')}
                      className="py-2.5 px-3 rounded-lg bg-muted hover:bg-muted/70 text-foreground transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <span>f</span> Facebook
                    </button>
                  </div>
                </div>

                {/* Table of Contents (Optional - can be dynamic) */}
                <div className="bg-muted/50 rounded-xl p-6 border border-border/50">
                  <h3 className="text-sm font-semibold mb-3 text-foreground uppercase tracking-wide">On This Page</h3>
                  <nav className="space-y-2 text-sm">
                    <a href="#" className="block text-muted-foreground hover:text-primary transition-colors">Introduction</a>
                    <a href="#" className="block text-muted-foreground hover:text-primary transition-colors">Key Points</a>
                    <a href="#" className="block text-muted-foreground hover:text-primary transition-colors">Best Practices</a>
                    <a href="#" className="block text-muted-foreground hover:text-primary transition-colors">Next Steps</a>
                  </nav>
                </div>
              </div>
            </aside>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
};

export default BlogPost;
