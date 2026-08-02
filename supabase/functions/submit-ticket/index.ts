import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Rate limiting: Track submissions by IP
const submissionTracker = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_SUBMISSIONS_PER_HOUR = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SubmissionData {
  // Client info
  driversLicense: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  dateOfBirth?: string;
  smsOptIn: boolean;
  
  // Ticket info
  ticketNumber: string;
  violation: string;
  fineAmount: string;
  violationDate?: string;
  courtLocation?: string;
  courtDate?: string;
  defenseStrategy: string;
  additionalNotes?: string;
  insuranceCompany?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP address
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    
    const now = Date.now();
    const tracker = submissionTracker.get(clientIP);
    
    if (tracker) {
      if (now < tracker.resetAt) {
        if (tracker.count >= MAX_SUBMISSIONS_PER_HOUR) {
          console.warn(`[Submit Ticket] Rate limit exceeded for IP: ${clientIP.substring(0, 10)}...`);
          return new Response(
            JSON.stringify({ error: "Too many submissions. Please try again later." }),
            {
              status: 429,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
        tracker.count++;
      } else {
        // Reset window
        tracker.count = 1;
        tracker.resetAt = now + RATE_LIMIT_WINDOW;
      }
    } else {
      submissionTracker.set(clientIP, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    }

    const formData: SubmissionData = await req.json();
    
    console.log("[Submit Ticket] Processing submission");

    // Comprehensive input validation with length limits
    if (!formData.driversLicense || !formData.firstName || !formData.lastName || 
        !formData.email || !formData.phone || !formData.ticketNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Length validation to prevent DoS
    if (formData.firstName.length > 100 || formData.lastName.length > 100 ||
        formData.email.length > 255 || formData.phone.length > 20 ||
        formData.driversLicense.length > 50 || formData.ticketNumber.length > 50 ||
        formData.violation.length > 500 || formData.fineAmount.length > 20 ||
        (formData.address && formData.address.length > 500) ||
        (formData.city && formData.city.length > 100) ||
        (formData.postalCode && formData.postalCode.length > 20) ||
        (formData.courtLocation && formData.courtLocation.length > 200) ||
        (formData.defenseStrategy && formData.defenseStrategy.length > 1000) ||
        (formData.additionalNotes && formData.additionalNotes.length > 2000) ||
        (formData.insuranceCompany && formData.insuranceCompany.length > 200)) {
      return new Response(
        JSON.stringify({ error: "Input field exceeds maximum length" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Phone validation (basic format check)
    const phoneRegex = /^[\d\s+()-]+$/;
    if (!phoneRegex.test(formData.phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Step 1: Check if client exists
    let clientId: string;
    
    const { data: existingClient, error: clientLookupError } = await supabase
      .from('clients')
      .select('id,email')
      .eq('drivers_license', formData.driversLicense)
      .maybeSingle();
    
    if (clientLookupError) {
      console.error('[Submit Ticket] Client lookup error:', clientLookupError);
      throw new Error('Failed to check existing client');
    }

    if (existingClient) {
      // Public intake must never replace the identity or contact details on an
      // existing client record. Portal ownership is verified through email.
      if (existingClient.email?.trim().toLowerCase() !== formData.email.trim().toLowerCase()) {
        return new Response(
          JSON.stringify({
            error: "This licence is already connected to a client record. Use the existing email or contact support.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      console.log('[Submit Ticket] Reusing verified-email client');
      clientId = existingClient.id;
    } else {
      // Create new client (using service role key, bypasses RLS)
      console.log('[Submit Ticket] Creating new client');
      const { data: newClient, error: createClientError } = await supabase
        .from('clients')
        .insert({
          drivers_license: formData.driversLicense,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          postal_code: formData.postalCode,
          date_of_birth: formData.dateOfBirth,
          sms_opt_in: formData.smsOptIn
        })
        .select('id')
        .single();

      if (createClientError || !newClient) {
        console.error('[Submit Ticket] Client creation error:', createClientError);
        throw new Error('Failed to create client record');
      }
      
      clientId = newClient.id;
      console.log('[Submit Ticket] Client created');
    }

    const submissionPayload = {
      client_id: clientId,
      first_name: formData.firstName,
      last_name: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      postal_code: formData.postalCode,
      date_of_birth: formData.dateOfBirth,
      drivers_license: formData.driversLicense,
      ticket_number: formData.ticketNumber,
      violation: formData.violation,
      fine_amount: formData.fineAmount,
      violation_date: formData.violationDate,
      court_location: formData.courtLocation,
      court_date: formData.courtDate,
      defense_strategy: formData.defenseStrategy,
      additional_notes: formData.additionalNotes,
      insurance_company: formData.insuranceCompany,
      status: 'awaiting_payment'
    };

    // Reuse an unpaid submission so browser retries cannot create duplicate cases.
    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .from('ticket_submissions')
      .select('id')
      .eq('client_id', clientId)
      .eq('ticket_number', formData.ticketNumber)
      .eq('status', 'awaiting_payment')
      .limit(1)
      .maybeSingle();

    if (existingSubmissionError) {
      console.error('[Submit Ticket] Existing submission lookup error:', existingSubmissionError);
      throw new Error('Failed to check existing ticket submission');
    }

    if (existingSubmission) {
      const { error: refreshError } = await supabase
        .from('ticket_submissions')
        .update({ ...submissionPayload, updated_at: new Date().toISOString() })
        .eq('id', existingSubmission.id);

      if (refreshError) {
        console.error('[Submit Ticket] Existing submission refresh error:', refreshError);
        throw new Error('Failed to refresh ticket submission');
      }

      return new Response(JSON.stringify({
        success: true,
        submissionId: existingSubmission.id,
        clientId,
        reused: true,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Step 2: Create a payment-pending ticket submission.
    console.log('[Submit Ticket] Creating ticket submission');
    const { data: submissionData, error: submissionError } = await supabase
      .from('ticket_submissions')
      .insert(submissionPayload)
      .select('id')
      .single();

    if (submissionError || !submissionData) {
      console.error('[Submit Ticket] Submission error:', submissionError);
      throw new Error('Failed to create ticket submission');
    }

    console.log('[Submit Ticket] Submission created successfully');

    return new Response(JSON.stringify({ 
      success: true,
      submissionId: submissionData.id,
      clientId: clientId
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error("[Submit Ticket] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Submission failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
