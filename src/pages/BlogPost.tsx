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
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background">
        <article className="container mx-auto px-4 py-8 md:py-16 max-w-5xl">
          {/* Hero Section */}
          <header className="mb-12 text-center">
            <div className="inline-block px-4 py-1 mb-4 text-sm font-semibold rounded-full bg-primary/10 text-primary">
              {post.category || 'Article'}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {post.title}
            </h1>
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                  {post.author?.charAt(0) || 'F'}
                </div>
                <span className="font-medium">{post.author || 'Fabsy Team'}</span>
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
          </header>

          {/* Featured Image Placeholder */}
          <div className="mb-12 rounded-2xl overflow-hidden shadow-2xl">
            <div className="aspect-video bg-gradient-to-br from-primary/20 via-primary/10 to-background flex items-center justify-center">
              <div className="text-center p-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">Featured image coming soon</p>
              </div>
            </div>
          </div>

          {/* Article Content */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-8">
              <div 
                className="prose prose-lg prose-slate dark:prose-invert max-w-none 
                  prose-headings:font-bold prose-headings:tracking-tight
                  prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-4
                  prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-3
                  prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-6
                  prose-strong:text-foreground prose-strong:font-semibold
                  prose-li:text-foreground prose-li:my-2
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-r-lg"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {/* Related Resources Section */}
              <div className="mt-16 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-background border border-primary/20">
                <h3 className="text-2xl font-bold mb-6">📚 Related Resources</h3>
                <div className="grid gap-4">
                  <a 
                    href="https://www.alberta.ca/winter-driving-safety" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group p-4 rounded-lg bg-background hover:bg-primary/5 border border-border hover:border-primary/50 transition-all duration-300"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        🏛️
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1 group-hover:text-primary transition-colors">Alberta Winter Driving Safety Guidelines</h4>
                        <p className="text-sm text-muted-foreground">Official guidelines from the Government of Alberta</p>
                      </div>
                    </div>
                  </a>
                  
                  <a 
                    href="/how-it-works" 
                    className="group p-4 rounded-lg bg-background hover:bg-primary/5 border border-border hover:border-primary/50 transition-all duration-300"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        ⚖️
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1 group-hover:text-primary transition-colors">Got a Traffic Ticket? We Can Help</h4>
                        <p className="text-sm text-muted-foreground">Learn how Fabsy fights traffic tickets in Alberta</p>
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-4">
              <div className="sticky top-24 space-y-6">
                {/* Quick Tips Card */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-background border border-primary/20">
                  <h3 className="text-xl font-bold mb-4">💡 Quick Tips</h3>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Install winter tires before October</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Look for the Three-Peak Mountain Snowflake symbol</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Check tire pressure monthly</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Replace when tread depth reaches 4/32 inch</span>
                    </li>
                  </ul>
                </div>

                {/* CTA Card */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                  <h3 className="text-xl font-bold mb-2">Need Legal Help?</h3>
                  <p className="text-sm mb-4 opacity-90">Got a traffic ticket? We fight tickets across Alberta.</p>
                  <a 
                    href="/ticket-form" 
                    className="block w-full py-3 px-4 rounded-lg bg-background text-foreground text-center font-semibold hover:bg-background/90 transition-colors"
                  >
                    Submit Your Ticket
                  </a>
                </div>

                {/* Share Card */}
                <div className="p-6 rounded-2xl border border-border">
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Share Article</h3>
                  <div className="flex gap-2">
                    <button className="flex-1 py-2 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-sm font-medium">
                      Twitter
                    </button>
                    <button className="flex-1 py-2 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-sm font-medium">
                      Facebook
                    </button>
                  </div>
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
