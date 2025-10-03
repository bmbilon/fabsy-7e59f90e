import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { FileText, TrendingUp, CheckCircle, Edit, Trash2 } from 'lucide-react';

// AdminBlog component for managing blog posts and content

const AdminBlog = () => {
  const [drafts, setDrafts] = useState([]);
  const [published, setPublished] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [editedMetaDesc, setEditedMetaDesc] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const { data: draftData } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('status', 'draft')
      .order('aeo_score', { ascending: false });
    
    const { data: publishedData } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    
    const { data: topicData } = await supabase
      .from('blog_topics')
      .select('*')
      .order('priority_score', { ascending: false });

    setDrafts(draftData || []);
    setPublished(publishedData || []);
    setTopics(topicData || []);
  }

  async function publishPost() {
    await supabase
      .from('blog_posts')
      .update({
        status: 'published',
        title: editedTitle,
        content: editedContent,
        meta_description: editedMetaDesc,
        published_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString()
      })
      .eq('id', selectedPost.id);
    
    toast({
      title: "Published!",
      description: "Blog post is now live on your site."
    });
    
    setSelectedPost(null);
    fetchAll();
  }

  async function deletePost(id: string) {
    await supabase.from('blog_posts').delete().eq('id', id);
    toast({ title: "Deleted", description: "Post removed." });
    fetchAll();
  }

  async function addTopic() {
    const topic = prompt("Enter new topic:");
    if (!topic) return;
    
    await supabase.from('blog_topics').insert({
      topic,
      priority_score: 75,
      source: 'manual'
    });
    
    fetchAll();
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Blog Content Manager</h1>
          <div className="flex gap-2">
            <Button onClick={addTopic} variant="outline">
              <TrendingUp className="w-4 h-4 mr-2" />
              Add Topic
            </Button>
          </div>
        </div>

        {!selectedPost ? (
          <Tabs defaultValue="drafts" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="drafts">
                Drafts ({drafts.length})
              </TabsTrigger>
              <TabsTrigger value="published">
                Published ({published.length})
              </TabsTrigger>
              <TabsTrigger value="topics">
                Topics ({topics.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="drafts" className="mt-6">
              {drafts.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 mb-4">No drafts yet. n8n will generate them daily.</p>
                  <p className="text-sm text-gray-500">Check back tomorrow or trigger the n8n workflow manually.</p>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {drafts.map(post => (
                    <Card key={post.id} className="p-6 hover:shadow-lg transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h2 className="text-2xl font-bold mb-2">{post.title}</h2>
                          <p className="text-gray-600 mb-3">{post.meta_description}</p>
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline">{post.category}</Badge>
                            {post.keywords?.slice(0, 3).map((kw, i) => (
                              <Badge key={i} variant="secondary">{kw}</Badge>
                            ))}
                          </div>
                        </div>
                        <Badge 
                          variant={post.aeo_score > 80 ? 'default' : 'secondary'}
                          className="ml-4"
                        >
                          AEO: {post.aeo_score}
                        </Badge>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => {
                            setSelectedPost(post);
                            setEditedTitle(post.title);
                            setEditedContent(post.content);
                            setEditedMetaDesc(post.meta_description);
                          }}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Review & Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => deletePost(post.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="published" className="mt-6">
              <div className="grid gap-4">
                {published.map(post => (
                  <Card key={post.id} className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold">{post.title}</h3>
                        <p className="text-sm text-gray-600">
                          Published: {new Date(post.published_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{post.view_count} views</Badge>
                        <Button size="sm" variant="outline" asChild>
                          <a href={`/blog/${post.slug}`} target="_blank">View</a>
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="topics" className="mt-6">
              <div className="grid gap-3">
                {topics.map(topic => (
                  <Card key={topic.id} className="p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <p className="font-medium">{topic.topic}</p>
                        <p className="text-xs text-gray-500">
                          Source: {topic.source} | Priority: {topic.priority_score}
                        </p>
                      </div>
                      {topic.used && (
                        <Badge variant="secondary">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Used
                        </Badge>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div>
            <Button 
              onClick={() => setSelectedPost(null)} 
              variant="outline"
              className="mb-4"
            >
              ← Back to Drafts
            </Button>
            
            <Card className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Title</label>
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="text-lg font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Meta Description ({editedMetaDesc.length}/155)
                  </label>
                  <Textarea
                    value={editedMetaDesc}
                    onChange={(e) => setEditedMetaDesc(e.target.value)}
                    rows={2}
                    maxLength={155}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Content (Markdown)</label>
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[500px] font-mono text-sm"
                  />
                </div>
                
                <div className="flex gap-4 pt-4 border-t">
                  <Button 
                    onClick={publishPost}
                    className="bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Publish Now
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      // Save draft
                      supabase.from('blog_posts').update({
                        title: editedTitle,
                        content: editedContent,
                        meta_description: editedMetaDesc
                      }).eq('id', selectedPost.id);
                      toast({ title: "Saved", description: "Draft updated." });
                    }}
                  >
                    Save Draft
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
};

export default AdminBlog;