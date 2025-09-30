import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, MapPin, Shield, FileText, Phone, Mail, User } from "lucide-react";
import { format } from "date-fns";

interface TicketSubmission {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  date_of_birth: string;
  drivers_license: string;
  ticket_number: string;
  violation: string;
  fine_amount: string;
  violation_date: string;
  violation_time: string;
  court_location: string;
  court_date: string;
  defense_strategy: string;
  additional_notes: string;
  sms_opt_in: boolean;
  coupon_code: string;
  insurance_company: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function AdminSubmissionDetail() {
  const { id } = useParams();
  const [submission, setSubmission] = useState<TicketSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuthAndFetchSubmission();
  }, [id]);

  const checkAuthAndFetchSubmission = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate('/admin');
        return;
      }

      // Check user role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
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

      // Fetch submission
      const { data, error } = await supabase
        .from('ticket_submissions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setSubmission(data);
    } catch (error: any) {
      console.error('Error fetching submission:', error);
      toast({
        title: "Error",
        description: "Failed to load submission details",
        variant: "destructive",
      });
      navigate('/admin/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!submission) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('ticket_submissions')
        .update({ status: newStatus })
        .eq('id', submission.id);

      if (error) throw error;

      setSubmission({ ...submission, status: newStatus });
      toast({
        title: "Status Updated",
        description: `Case status changed to ${newStatus.replace('_', ' ')}`,
      });
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update case status",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading submission...</p>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Submission not found</p>
          <Button onClick={() => navigate('/admin/dashboard')} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/dashboard')}
            className="mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {submission.first_name} {submission.last_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Ticket #{submission.ticket_number}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Select value={submission.status} onValueChange={updateStatus} disabled={isUpdating}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Personal Info */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{submission.first_name} {submission.last_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </p>
                  <p className="font-medium">{submission.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </p>
                  <p className="font-medium">{submission.phone}</p>
                  {submission.sms_opt_in && (
                    <Badge variant="secondary" className="mt-1">SMS Enabled</Badge>
                  )}
                </div>
                {submission.address && (
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-medium">
                      {submission.address}<br />
                      {submission.city}, {submission.postal_code}
                    </p>
                  </div>
                )}
                {submission.date_of_birth && (
                  <div>
                    <p className="text-sm text-muted-foreground">Date of Birth</p>
                    <p className="font-medium">{format(new Date(submission.date_of_birth), 'PPP')}</p>
                  </div>
                )}
                {submission.drivers_license && (
                  <div>
                    <p className="text-sm text-muted-foreground">Driver's License</p>
                    <p className="font-medium">{submission.drivers_license}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Info */}
            {(submission.coupon_code || submission.insurance_company) && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {submission.coupon_code && (
                    <div>
                      <p className="text-sm text-muted-foreground">Coupon Code</p>
                      <Badge variant="outline">{submission.coupon_code}</Badge>
                    </div>
                  )}
                  {submission.insurance_company && (
                    <div>
                      <p className="text-sm text-muted-foreground">Insurance Company</p>
                      <p className="font-medium">{submission.insurance_company}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Ticket Details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Ticket Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Ticket Number</p>
                    <p className="font-medium text-lg">{submission.ticket_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fine Amount</p>
                    <p className="font-medium text-lg">${submission.fine_amount}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Violation</p>
                  <p className="font-medium">{submission.violation}</p>
                </div>
                {submission.violation_date && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Violation Date
                      </p>
                      <p className="font-medium">{format(new Date(submission.violation_date), 'PPP')}</p>
                    </div>
                    {submission.violation_time && (
                      <div>
                        <p className="text-sm text-muted-foreground">Time</p>
                        <p className="font-medium">{submission.violation_time}</p>
                      </div>
                    )}
                  </div>
                )}
                {submission.court_location && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Court Location
                    </p>
                    <p className="font-medium">{submission.court_location}</p>
                  </div>
                )}
                {submission.court_date && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Court Date
                    </p>
                    <p className="font-medium">{format(new Date(submission.court_date), 'PPP')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Defense Strategy */}
            {(submission.defense_strategy || submission.additional_notes) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Defense Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {submission.defense_strategy && (
                    <div>
                      <p className="text-sm text-muted-foreground">Defense Strategy</p>
                      <p className="font-medium whitespace-pre-wrap">{submission.defense_strategy}</p>
                    </div>
                  )}
                  {submission.additional_notes && (
                    <div>
                      <p className="text-sm text-muted-foreground">Additional Notes</p>
                      <p className="font-medium whitespace-pre-wrap">{submission.additional_notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Submission Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="font-medium">{format(new Date(submission.created_at), 'PPP p')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{format(new Date(submission.updated_at), 'PPP p')}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
