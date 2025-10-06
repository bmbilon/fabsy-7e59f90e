import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Shield, UserPlus, Mail } from "lucide-react";
import type { User, Session } from '@supabase/supabase-js';

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  user_email?: string;
}

export default function AdminUserManagement() {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

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
      // Check if user is admin (only admins can manage roles)
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .eq('role', 'admin')
        .single();

      if (roleError || !roleData) {
        toast({
          title: "Unauthorized",
          description: "Only administrators can access user management",
          variant: "destructive",
        });
        navigate('/admin/dashboard');
        return;
      }

      setCurrentUserRole(roleData.role);

      // Fetch all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;

      // Fetch user emails from auth.users (if we have service role access)
      // For now, just display user_id
      setUserRoles(rolesData || []);

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load user roles",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const roleColors: Record<string, string> = {
      admin: "bg-red-500/10 text-red-500 border-red-500/20",
      case_manager: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      user: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    };

    return (
      <Badge variant="outline" className={roleColors[role] || roleColors.user}>
        <Shield className="h-3 w-3 mr-1" />
        {role.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Button 
            onClick={() => navigate('/admin/dashboard')} 
            variant="ghost" 
            size="sm"
            className="mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">User Access Management</h1>
              <p className="text-sm text-muted-foreground">
                Manage user roles and permissions
              </p>
            </div>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User Role
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Users</CardDescription>
              <CardTitle className="text-3xl">{userRoles.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Administrators</CardDescription>
              <CardTitle className="text-3xl">
                {userRoles.filter(r => r.role === 'admin').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Case Managers</CardDescription>
              <CardTitle className="text-3xl">
                {userRoles.filter(r => r.role === 'case_manager').length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* User Roles List */}
        <Card>
          <CardHeader>
            <CardTitle>User Roles</CardTitle>
            <CardDescription>
              Showing {userRoles.length} user role assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {userRoles.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No user roles found</p>
                </div>
              ) : (
                userRoles.map((userRole) => (
                  <Card
                    key={userRole.id}
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-lg bg-primary/10">
                            <Shield className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-mono text-sm text-muted-foreground">
                                {userRole.user_id}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Added {new Date(userRole.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getRoleBadge(userRole.role)}
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
