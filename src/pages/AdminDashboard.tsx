import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Users, FileText, Shield, BarChart3 } from "lucide-react";
import type { User, Session } from '@supabase/supabase-js';

interface DashboardTile {
  title: string;
  description: string;
  icon: any;
  path: string;
  color: string;
}

export default function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [stats, setStats] = useState({
    totalSubmissions: 0,
    pendingSubmissions: 0,
    publishedPosts: 0,
    totalUsers: 0,
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  const tiles: DashboardTile[] = [
    {
      title: "Client Case Management",
      description: "View and manage ticket submissions and client cases",
      icon: Users,
      path: "/admin/cases",
      color: "from-blue-500 to-blue-600"
    },
    {
      title: "Blog Management",
      description: "Create, edit and publish blog posts and content",
      icon: FileText,
      path: "/admin/blog",
      color: "from-purple-500 to-purple-600"
    },
    {
      title: "User Access Management",
      description: "Manage user roles and permissions",
      icon: Shield,
      path: "/admin/users",
      color: "from-green-500 to-green-600"
    },
    {
      title: "AEO Analytics",
      description: "View analytics and performance metrics",
      icon: BarChart3,
      path: "/admin/aeo",
      color: "from-orange-500 to-orange-600"
    },
  ];

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setTimeout(() => checkAuthAndFetchData(session.user), 0);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAuthAndFetchData(session.user);
        return;
      }
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshed.session?.user && !refreshError) {
        setSession(refreshed.session);
        setUser(refreshed.session.user);
        checkAuthAndFetchData(refreshed.session.user);
      } else {
        setIsLoading(false);
        navigate('/admin');
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  const checkAuthAndFetchData = async (currentUser: User) => {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .in('role', ['admin', 'case_manager'])
        .single();

      if (roleError || !roleData) {
        toast({
          title: "Unauthorized",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate('/admin');
        return;
      }

      setUserRole(roleData.role);

      // Fetch stats
      const [submissionsResult, blogResult] = await Promise.all([
        supabase.from('ticket_submissions').select('id, status', { count: 'exact' }),
        supabase.from('blog_posts').select('id, status', { count: 'exact' })
      ]);

      setStats({
        totalSubmissions: submissionsResult.count || 0,
        pendingSubmissions: submissionsResult.data?.filter(s => s.status === 'pending').length || 0,
        publishedPosts: blogResult.data?.filter(p => p.status === 'published').length || 0,
        totalUsers: 0,
      });

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {userRole?.replace('_', ' ').toUpperCase()}
            </p>
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Cases</CardDescription>
              <CardTitle className="text-3xl">{stats.totalSubmissions}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Pending Cases</CardDescription>
              <CardTitle className="text-3xl">{stats.pendingSubmissions}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Published Posts</CardDescription>
              <CardTitle className="text-3xl">{stats.publishedPosts}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Active Users</CardDescription>
              <CardTitle className="text-3xl">{stats.totalUsers}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Admin Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Card
                key={tile.path}
                className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden group"
                onClick={() => navigate(tile.path)}
              >
                <div className={`h-2 bg-gradient-to-r ${tile.color}`}></div>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                        {tile.title}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {tile.description}
                      </CardDescription>
                    </div>
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${tile.color} text-white`}>
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    Open {tile.title}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
