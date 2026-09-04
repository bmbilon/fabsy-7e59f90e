import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import { ArrowLeft, Search, FileText, Clock, CheckCircle2, AlertCircle, Mail, Phone, Ticket, DollarSign, type LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User, Session } from '@supabase/supabase-js';
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { AtePilotMetrics } from "@/components/AteCaseReview";

interface TicketSubmission {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  ticket_number: string;
  violation: string;
  fine_amount: string;
  status: string;
  service_type: "representation" | "ticket_insurance_assessment";
  ticket_type: "photo_radar" | "officer_issued";
  created_at: string;
}

interface IntakeLead {
  id: string;
  email: string | null;
  phone: string | null;
  preferred_locale: string;
  current_step: number;
  completed_step: number;
  status: "active" | "converted";
  converted_submission_id: string | null;
  ticket_document_path: string;
  ticket_document_content_type: string;
  ticket_document_size_bytes: number;
  ticket_uploaded_at: string;
  resume_delivery_status: "pending" | "sending" | "sent" | "failed";
  resume_delivery_channel: "email" | "sms" | null;
  resume_delivery_sent_at: string | null;
  resume_delivery_attempt_count: number;
  expires_at: string;
  updated_at: string;
}

export default function AdminCaseManagement() {
  const [submissions, setSubmissions] = useState<TicketSubmission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<TicketSubmission[]>([]);
  const [intakeLeads, setIntakeLeads] = useState<IntakeLead[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setTimeout(() => checkAuthAndFetchData(), 0);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAuthAndFetchData();
        return;
      }
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshed.session?.user && !refreshError) {
        setSession(refreshed.session);
        setUser(refreshed.session.user);
        checkAuthAndFetchData();
      } else {
        setIsLoading(false);
        navigate('/admin');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredSubmissions(submissions);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = submissions.filter(
        (sub) =>
          sub.first_name.toLowerCase().includes(query) ||
          sub.last_name.toLowerCase().includes(query) ||
          sub.email.toLowerCase().includes(query) ||
          sub.ticket_number.toLowerCase().includes(query) ||
          sub.violation.toLowerCase().includes(query)
      );
      setFilteredSubmissions(filtered);
    }
  }, [searchQuery, submissions]);

  const checkAuthAndFetchData = async () => {
    try {
      const roleData = await getIdrStaffRole();

      if (!roleData) {
        toast({
          title: "Unauthorized",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate('/admin');
        return;
      }

      setUserRole(roleData);

      const [submissionResult, leadResult] = await Promise.all([
        supabase.from('ticket_submissions').select(`
          *,
          clients (
            first_name,
            last_name,
            email,
            phone,
            drivers_license
          )
        `)
        .neq('status', 'awaiting_payment')
        .neq('status', 'assessment_awaiting_payment')
        .neq('status', 'assessment_checkout_open')
        .order('created_at', { ascending: false }),
        supabase.from('ticket_intake_drafts')
          .select('id,email,phone,preferred_locale,current_step,completed_step,status,converted_submission_id,ticket_document_path,ticket_document_content_type,ticket_document_size_bytes,ticket_uploaded_at,resume_delivery_status,resume_delivery_channel,resume_delivery_sent_at,resume_delivery_attempt_count,expires_at,updated_at')
          .in('status', ['active', 'converted'])
          .not('ticket_uploaded_at', 'is', null)
          .gt('expires_at', new Date().toISOString())
          .order('updated_at', { ascending: false }),
      ]);

      const { data, error } = submissionResult;
      if (leadResult.error) throw leadResult.error;

      if (error) throw error;

      const transformedData = data?.map((sub): TicketSubmission => ({
        id: sub.id,
        first_name: sub.clients?.first_name || '',
        last_name: sub.clients?.last_name || '',
        email: sub.clients?.email || '',
        phone: sub.clients?.phone || '',
        ticket_number: sub.ticket_number,
        violation: sub.violation,
        fine_amount: sub.fine_amount,
        status: sub.status,
        ticket_type: sub.ticket_type,
        service_type: sub.service_type === 'ticket_insurance_assessment'
          ? 'ticket_insurance_assessment'
          : 'representation',
        created_at: sub.created_at
      })) || [];

      setSubmissions(transformedData);
      setFilteredSubmissions(transformedData);
      const managedCaseIds = new Set(transformedData.map(submission => submission.id));
      setIntakeLeads((leadResult.data || []).filter((lead): lead is IntakeLead =>
        Boolean(lead.ticket_uploaded_at) &&
        (lead.status === 'active' || !lead.converted_submission_id || !managedCaseIds.has(lead.converted_submission_id))
      ));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load submissions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openLeadTicket = async (lead: IntakeLead) => {
    const { data, error } = await supabase.storage
      .from('assessment-tickets')
      .createSignedUrl(lead.ticket_document_path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Ticket unavailable", description: "The private ticket file could not be opened.", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: LucideIcon }> = {
      pending: { variant: "outline", icon: Clock },
      in_progress: { variant: "secondary", icon: AlertCircle },
      completed: { variant: "default", icon: CheckCircle2 },
      assessment_pending: { variant: "outline", icon: Clock },
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading cases...</p>
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
          <h1 className="text-2xl font-bold">Client Case Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage active ticket matters and historical Ticket Triage orders
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <AtePilotMetrics />
        <Card className="mb-8 border-amber-300/70">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Incomplete ticket intakes</CardTitle>
                <CardDescription>Uploaded tickets whose customers have allowed intake follow-up but have not completed payment.</CardDescription>
              </div>
              <Badge variant="outline">{intakeLeads.length} open</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {intakeLeads.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No incomplete uploaded intakes.</p> : <div className="space-y-3">
              {intakeLeads.map(lead => <div key={lead.id} className="flex flex-col gap-4 rounded-lg border bg-amber-50/40 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{lead.status === "converted" ? "Checkout started" : `Step ${lead.current_step} of 6`}</Badge>
                    <span className="text-xs text-muted-foreground">Updated {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true })}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {lead.email ? <span className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="break-all">{lead.email}</span></span> : null}
                    {lead.phone ? <span className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{lead.phone}</span> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">Locale: {lead.preferred_locale} · Ticket {(lead.ticket_document_size_bytes / 1024).toFixed(0)} KB · Resume access expires {new Date(lead.expires_at).toLocaleDateString()}</p>
                  <p className={`text-xs ${lead.resume_delivery_status === "failed" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                    Resume link: {lead.resume_delivery_status}{lead.resume_delivery_channel ? ` by ${lead.resume_delivery_channel}` : ""}
                    {lead.resume_delivery_sent_at ? ` · sent ${formatDistanceToNow(new Date(lead.resume_delivery_sent_at), { addSuffix: true })}` : ""}
                    {lead.resume_delivery_attempt_count > 1 ? ` · ${lead.resume_delivery_attempt_count} attempts` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void openLeadTicket(lead)}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />Open ticket
                  </Button>
                  {lead.converted_submission_id ? <Button type="button" onClick={() => navigate(`/admin/submissions/${lead.converted_submission_id}`)}>Open checkout case</Button> : null}
                </div>
              </div>)}
            </div>}
          </CardContent>
        </Card>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Submissions</CardDescription>
              <CardTitle className="text-3xl">{submissions.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-3xl">
                {submissions.filter(s => s.status === 'pending' || s.status === 'assessment_pending').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>In Progress</CardDescription>
              <CardTitle className="text-3xl">
                {submissions.filter(s => s.status === 'in_progress').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-3xl">
                {submissions.filter(s => s.status === 'completed').length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by name, email, ticket number, or violation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submissions List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Submissions</CardTitle>
            <CardDescription>
              Showing {filteredSubmissions.length} of {submissions.length} submissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredSubmissions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No submissions found</p>
                </div>
              ) : (
                filteredSubmissions.map((submission) => (
                  <Card
                    key={submission.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => navigate(submission.service_type === 'ticket_insurance_assessment' ? `/admin/assessments/${submission.id}` : `/admin/submissions/${submission.id}`)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">
                              {submission.first_name} {submission.last_name}
                            </h3>
                            {getStatusBadge(submission.status)}
                            {submission.ticket_type === 'photo_radar' && <Badge variant="secondary">Photo Radar · $79 · ATE</Badge>}
                            {submission.service_type === 'ticket_insurance_assessment' && (
                              <Badge variant="secondary">Legacy Ticket Triage · ${TICKET_ASSESSMENT.priceCad}</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                            <p className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" /> {submission.email}</p>
                            <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" /> {submission.phone}</p>
                            <p className="flex items-center gap-2"><Ticket className="h-4 w-4 shrink-0" aria-hidden="true" /> Ticket: {submission.ticket_number}</p>
                            <p className="flex items-center gap-2"><DollarSign className="h-4 w-4 shrink-0" aria-hidden="true" /> Fine: ${submission.fine_amount}</p>
                          </div>
                          <p className="text-sm mt-2">
                            <span className="font-medium">Violation:</span> {submission.violation}
                          </p>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <p>{formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}</p>
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
