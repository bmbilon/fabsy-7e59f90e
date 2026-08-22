# Fabsy Traffic Ticket System - Complete Data Flow Documentation

**Generated:** October 1, 2025  
**Project:** Fabsy Traffic Ticket Defense  
**Version:** 1.0

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Complete Data Flow Walkthrough](#complete-data-flow-walkthrough)
3. [Database Schema](#database-schema)
4. [Edge Functions Reference](#edge-functions-reference)
5. [Email Templates](#email-templates)
6. [Security Implementation](#security-implementation)
7. [Admin Portal Workflow](#admin-portal-workflow)
8. [Troubleshooting Guide](#troubleshooting-guide)

---

## System Overview

### Technology Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Supabase Edge Functions (Deno runtime)
- **Database:** PostgreSQL (via Supabase)
- **Storage:** Supabase Storage (consent-forms bucket)
- **Email Service:** Resend API (hello@fabsy.ca)
- **SMS Service:** Twilio API
- **PDF Generation:** pdf-lib library

### Key Security Features

1. **No Direct Database Access** - Frontend cannot directly insert into protected tables
2. **Backend Validation** - All input validated server-side before database operations
3. **Service Role Authentication** - Backend uses service role key to bypass RLS properly
4. **Row Level Security (RLS)** - All tables protected with appropriate policies
5. **Input Sanitization** - Email validation, required field checks, type validation
6. **Rate Limiting Ready** - Architecture supports adding rate limits to prevent spam

---

## Complete Data Flow Walkthrough

### Step 1: Form Initiation & Data Collection

**Location:** User browser → `src/components/TicketForm.tsx`

**What Happens:**
1. User lands on ticket form page at `/ticket-form`
2. User progresses through 6 steps, filling out data
3. All data stays in React state (no backend calls yet)

**Form Steps:**
- **Step 1: Ticket Details**
  - Ticket number (required)
  - Issue date (required)
  - Location (required)
  - Officer name & badge (required)
  - Offense section/subsection
  - Offense description
  - Violation type (required)
  - Fine amount (required)
  - Court date & location
  - Agent representation permitted
  - Ticket image upload
  - Vehicle seizure checkbox

- **Step 2: Personal Information**
  - First name (required)
  - Last name (required)
  - Email (required)
  - Phone (required)
  - SMS opt-in checkbox
  - Address (required)
  - City (required)
  - Province (required)
  - Postal code (required)
  - Date of birth (required)
  - Driver's license number (required) - **Used as unique client identifier**
  - Driver's license image upload
  - Address different from license checkbox

- **Step 3: Defense Strategy**
  - Plea type (required): guilty, not_guilty, no_contest, etc.
  - Explanation (required)
  - Circumstances
  - Witnesses (yes/no)
  - Witness details
  - Evidence (yes/no)
  - Evidence details
  - Prior tickets

- **Step 4: Consent Form**
  - Digital signature (required)
  - Agreement checkbox (required)
  - Displays consent terms and data processing agreement

- **Step 5: Review**
  - Shows summary of all entered data
  - Continue button advances to payment

- **Step 6: Payment**
  - Insurance company (optional)
  - Terms and conditions checkbox (required)
  - Redirects to Stripe Checkout for the $488 CAD flat service fee

**Data Storage During Form Fill:**
```typescript
// All data stored in React state as FormData interface
interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  driversLicense: string;
  // ... all other fields
}
```

---

### Step 2: Payment Step - Submission Trigger

**Location:** `src/components/form-steps/PaymentStep.tsx` (line 40+)

**Trigger:** User clicks "Continue to Secure Stripe Checkout"

**What Happens:**
1. Frontend validates terms checkbox is checked
2. Frontend calls first edge function: `submit-ticket`
3. Sends complete form data as JSON payload

**Code Flow:**
```typescript
const { data: submissionResult, error: submissionError } = 
  await supabase.functions.invoke('submit-ticket', {
    body: {
      // Client information
      driversLicense: formData.driversLicense,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      postalCode: formData.postalCode,
      dateOfBirth: formData.dateOfBirth?.toISOString().split('T')[0],
      smsOptIn: formData.smsOptIn,
      
      // Ticket information
      ticketNumber: formData.ticketNumber,
      violation: formData.violation,
      fineAmount: formData.fineAmount,
      violationDate: formData.issueDate?.toISOString().split('T')[0],
      courtLocation: formData.courtJurisdiction,
      courtDate: formData.courtDate?.toISOString().split('T')[0],
      defenseStrategy: `${formData.pleaType}\n\nExplanation: ${formData.explanation}\n\nCircumstances: ${formData.circumstances}`,
      additionalNotes: formData.additionalNotes,
      insuranceCompany: formData.insuranceCompany
    }
  });
```

**Response Expected:**
```json
{
  "success": true,
  "submissionId": "9d1a9369-fa48-4fea-882d-99a5b3a7ab44",
  "clientId": "abc-123-def-456-789"
}
```

---

### Step 3: Backend Processing - Client Record

**Location:** Edge Function `supabase/functions/submit-ticket/index.ts`

**Process Flow:**

#### 3.1 Input Validation
```typescript
// Line 45-65: Validate all required fields
- driversLicense must be present
- firstName must be present
- lastName must be present
- email must be present and valid format
- phone must be present
- ticketNumber must be present

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

#### 3.2 Client Lookup
```typescript
// Line 68-75: Check if client already exists
const { data: existingClient, error: clientLookupError } = 
  await supabase
    .from('clients')
    .select('id')
    .eq('drivers_license', formData.driversLicense)
    .maybeSingle();
```

**Query Executed:**
```sql
SELECT id 
FROM clients 
WHERE drivers_license = '140693-359'
LIMIT 1;
```

#### 3.3A If Client Exists - Update Record
```typescript
// Line 77-95: Update existing client with latest information
const { error: updateError } = await supabase
  .from('clients')
  .update({
    first_name: formData.firstName,
    last_name: formData.lastName,
    email: formData.email,
    phone: formData.phone,
    address: formData.address,
    city: formData.city,
    postal_code: formData.postalCode,
    date_of_birth: formData.dateOfBirth,
    sms_opt_in: formData.smsOptIn,
    updated_at: new Date().toISOString()
  })
  .eq('id', clientId);
```

**SQL Executed:**
```sql
UPDATE clients 
SET 
  first_name = 'Brett',
  last_name = 'Bilon',
  email = 'brettbilon@gmail.com',
  phone = '4036695353',
  address = '209 32 Ave NW',
  city = 'Calgary',
  postal_code = 'T2M 2P8',
  date_of_birth = '1979-05-08',
  sms_opt_in = true,
  updated_at = '2025-10-01T14:30:00.000Z'
WHERE id = 'existing-client-uuid';
```

#### 3.3B If Client Does Not Exist - Create New Record
```typescript
// Line 97-125: Create new client
const { data: newClient, error: createClientError } = 
  await supabase
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
```

**SQL Executed:**
```sql
INSERT INTO clients (
  id,                    -- Auto-generated UUID
  drivers_license,       -- '140693-359'
  first_name,           -- 'Brett'
  last_name,            -- 'Bilon'
  email,                -- 'brettbilon@gmail.com'
  phone,                -- '4036695353'
  address,              -- '209 32 Ave NW'
  city,                 -- 'Calgary'
  postal_code,          -- 'T2M 2P8'
  date_of_birth,        -- '1979-05-08'
  sms_opt_in,           -- true
  created_at,           -- '2025-10-01T14:30:00.000Z'
  updated_at            -- '2025-10-01T14:30:00.000Z'
) 
RETURNING id;
```

**Result:** `clientId` variable now contains the UUID of the client (existing or new)

**Security Note:** This INSERT uses the service role key, so it bypasses the RLS policy that blocks direct client inserts. Only this backend function can create client records.

---

### Step 4: Backend Processing - Ticket Submission

**Location:** Same edge function `supabase/functions/submit-ticket/index.ts` (line 127+)

**Process:**

#### 4.1 Create Ticket Submission Record
```typescript
// Line 129-156: Insert ticket submission linked to client
const { data: submissionData, error: submissionError } = 
  await supabase
    .from('ticket_submissions')
    .insert({
      client_id: clientId,                    // Link to client
      ticket_number: formData.ticketNumber,
      violation: formData.violation,
      fine_amount: formData.fineAmount,
      violation_date: formData.violationDate,
      court_location: formData.courtLocation,
      court_date: formData.courtDate,
      defense_strategy: formData.defenseStrategy,
      additional_notes: formData.additionalNotes,
      insurance_company: formData.insuranceCompany,
      status: 'pending'
    })
    .select('id')
    .single();
```

**SQL Executed:**
```sql
INSERT INTO ticket_submissions (
  id,                    -- Auto-generated UUID
  client_id,            -- 'abc-123-def-456' (from clients table)
  ticket_number,        -- 'A08645033J'
  violation,            -- 'Speeding 30km over limit'
  fine_amount,          -- '462'
  violation_date,       -- '2024-03-22'
  violation_time,       -- NULL (optional)
  court_location,       -- 'Calgary Provincial Court'
  court_date,           -- '2024-05-23'
  defense_strategy,     -- 'not_guilty\n\nExplanation: I was not speeding...'
  additional_notes,     -- 'Additional context...'
  coupon_code,          -- NULL for current website submissions
  insurance_company,    -- 'Intact Insurance' (or NULL)
  status,               -- 'pending' for the existing case-management workflow
  consent_form_path,    -- NULL (will be filled in next step)
  assigned_to,          -- NULL
  search_vector,        -- Auto-generated for full-text search
  created_at,           -- '2025-10-01T14:30:00.000Z'
  updated_at            -- '2025-10-01T14:30:00.000Z'
) 
RETURNING id;
```

#### 4.2 Return Success Response
```typescript
// Line 168-175: Send response back to frontend
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
```

**Database State After Step 4:**
- 1 record in `clients` table (new or updated)
- 1 new record in `ticket_submissions` with status `pending`
- `ticket_submissions.client_id` references `clients.id`
- `ticket_submissions.consent_form_path` is still NULL

---

### Step 5: Stripe Checkout Session Creation

The frontend creates or reuses an idempotent Stripe Checkout session tied to the submission ID.
The $488 CAD flat fee is defined server-side. Stripe remains the payment source of truth; database
status changes must not depend on the customer returning to the browser success page.

### Step 6: Consent Form PDF Generation

**Location:** Frontend calls `supabase/functions/generate-consent-form/index.ts`

**Trigger:** Frontend receives success from submit-ticket

**Code Flow:**
```typescript
// PaymentStep.tsx line 154+
const { data: consentData, error: consentError } = 
  await supabase.functions.invoke('generate-consent-form', {
    body: {
      submissionId: submissionId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      province: formData.province,
      postalCode: formData.postalCode,
      driversLicense: formData.driversLicense,
      ticketNumber: formData.ticketNumber,
      violation: formData.violation,
      issueDate: formData.issueDate?.toLocaleDateString(),
      digitalSignature: formData.digitalSignature
    }
  });
```

**Backend Process:**

#### 5.1 Create PDF Document
```typescript
// Line 45-155: Generate PDF using pdf-lib
const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([612, 792]); // Letter size (8.5" x 11")

// Add text to PDF at various positions
```

**PDF Structure Created:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     WRITTEN CONSENT FOR TRAFFIC TICKET AGENT REPRESENTATION │
│           Fabsy Traffic Ticket Services                     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  CLIENT INFORMATION                                          │
│  ─────────────────                                          │
│  Name: Brett Bilon                                          │
│  Email: brettbilon@gmail.com                                │
│  Phone: 4036695353                                          │
│  Address: 209 32 Ave NW, Calgary, AB                        │
│  Postal Code: T2M 2P8                                       │
│  Driver's License: 140693-359                               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  TICKET INFORMATION                                          │
│  ──────────────────                                         │
│  Ticket Number: A08645033J                                  │
│  Violation: Speeding 30km over limit                        │
│  Issue Date: March 22, 2024                                 │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  AUTHORIZATION FOR REPRESENTATION                            │
│  ────────────────────────────────                          │
│  I, the undersigned, hereby authorize Fabsy and its         │
│  designated agents to represent me in all matters related   │
│  to the traffic violation referenced above. This includes:  │
│                                                              │
│  • Appearing on my behalf at all court proceedings         │
│  • Filing and submitting applicable court documents        │
│  • Negotiating with prosecutors and court officials        │
│  • Making decisions regarding plea negotiations            │
│  • Accessing my driving record and related information     │
│                                                              │
│  I understand that:                                         │
│  • Fabsy will make reasonable efforts to achieve the best  │
│    possible outcome                                         │
│  • Outcomes vary by case                                   │
│  • I am responsible for the service fee regardless of      │
│    outcome                                                  │
│  • $488 base representation fee + 30% of fine reduction    │
│    achieved; there is no additional charge if the fine is  │
│    not reduced                                               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  CLIENT SIGNATURE                                            │
│  ────────────────                                           │
│  Digital Signature: Brett Bilon                             │
│  Date: October 1, 2025                                      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  By signing this form, I consent to the processing of my    │
│  personal information as outlined in Fabsy's Privacy Policy.│
│  I understand my data will be used solely for traffic ticket│
│  agent representation. Fabsy is not a law firm. It will not│
│  be shared with third parties                               │
│  except as required by law.                                 │
└─────────────────────────────────────────────────────────────┘
```

#### 5.2 Convert to Bytes and Upload to Storage
```typescript
// Line 157-172: Save PDF and upload
const pdfBytes = await pdfDoc.save();
console.log("PDF generated, size:", pdfBytes.length, "bytes");

const fileName = `${formData.submissionId}/consent-form.pdf`;
console.log("Uploading to storage:", fileName);

const { error: uploadError } = await supabase.storage
  .from('consent-forms')
  .upload(fileName, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true
  });
```

**Storage Operation:**
- **Bucket:** `consent-forms`
- **Path:** `{submissionId}/consent-form.pdf`
- **Example:** `9d1a9369-fa48-4fea-882d-99a5b3a7ab44/consent-form.pdf`
- **File Size:** Typically 50-100KB depending on content length
- **Content-Type:** `application/pdf`
- **Upsert:** `true` (overwrites if exists)

#### 5.3 Update Ticket Submission Record
```typescript
// Line 177-182: Link consent form to submission
const { error: updateError } = await supabase
  .from('ticket_submissions')
  .update({ consent_form_path: fileName })
  .eq('id', formData.submissionId);
```

**SQL Executed:**
```sql
UPDATE ticket_submissions 
SET consent_form_path = '9d1a9369-fa48-4fea-882d/consent-form.pdf'
WHERE id = '9d1a9369-fa48-4fea-882d-99a5b3a7ab44';
```

**Database State After Step 5:**
- PDF file stored in Supabase Storage
- `ticket_submissions.consent_form_path` now populated with storage path
- Admin can download PDF from storage using this path

---

### Step 7: Payment-Pending Notification System

**Location:** Frontend calls `supabase/functions/send-notification/index.ts`

**Trigger:** Frontend receives success from generate-consent-form, waits 1 second for storage consistency

**Code Flow:**
```typescript
// PaymentStep.tsx line 187+
// Wait 1 second to ensure storage consistency
await new Promise(resolve => setTimeout(resolve, 1000));

const { error: notificationError } = 
  await supabase.functions.invoke('send-notification', {
    body: {
      submissionId: submissionId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      ticketNumber: formData.ticketNumber,
      violation: formData.violation,
      fineAmount: formData.fineAmount,
      submittedAt: new Date().toLocaleString(),
      smsOptIn: formData.smsOptIn
    }
  });
```

#### Part A: Fetch Admin Users

**Backend Process:**
```typescript
// Line 59-82: Get admin email addresses
// Step 1: Query user_roles table for admin users
const { data: adminUsers, error: adminError } = await supabase
  .from('user_roles')
  .select('user_id')
  .eq('role', 'admin');

// Step 2: Get email addresses from auth.users
const { data: adminProfiles, error: profileError } = 
  await supabase.auth.admin.listUsers();

// Step 3: Filter to only admin users
const adminUserIds = adminUsers.map(u => u.user_id);
const adminEmails = adminProfiles.users
  .filter(user => adminUserIds.includes(user.id))
  .map(user => user.email)
  .filter((email): email is string => email !== undefined);
```

**SQL Queries Executed:**
```sql
-- Query 1: Get admin user IDs
SELECT user_id 
FROM user_roles 
WHERE role = 'admin';

-- Query 2: Get user details from auth
-- (Handled by Supabase Auth API, not direct SQL)
```

**Result:** Array of admin email addresses, e.g., `['brett@execom.ca']`

#### Part B: Send Admin Notification Email

**Backend Process:**
```typescript
// Line 90-130: Construct and send admin email
const emailResponse = await resend.emails.send({
  from: "Fabsy <hello@fabsy.ca>",
  reply_to: "brett@execom.ca",
  to: adminEmails,
  subject: `Payment Pending - ${ticketData.firstName} ${ticketData.lastName}`,
  html: `... HTML email template ...`
});
```

**Admin Email Template:**
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
    🎫 Payment-Pending Ticket Submission
  </h1>
  
  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <h2 style="color: #4CAF50; margin-top: 0;">Client Information</h2>
    <p><strong>Name:</strong> Brett Bilon</p>
    <p><strong>Email:</strong> brettbilon@gmail.com</p>
    <p><strong>Phone:</strong> 4036695353</p>
  </div>
  
  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <h2 style="color: #4CAF50; margin-top: 0;">Quick Details</h2>
    <p><strong>Ticket Number:</strong> A08645033J</p>
    <p><strong>Violation:</strong> Speeding 30km over limit</p>
    <p><strong>Fine Amount:</strong> $462</p>
  </div>
  
  <div style="background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
    <p style="margin: 0 0 15px 0; font-weight: bold;">View Full Case Details</p>
    <a href="https://fabsy.ca/admin/submissions/9d1a9369-fa48-4fea-882d-99a5b3a7ab44" 
       style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; 
              text-decoration: none; border-radius: 5px; font-weight: bold;">
      Open Admin Portal
    </a>
  </div>
  
  <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
    <strong>Submitted:</strong> October 1, 2025 2:30 PM<br>
    This is an automated notification from your Fabsy case management system.
  </p>
</div>
```

**Email Metadata:**
- **From:** Fabsy <hello@fabsy.ca>
- **Reply-To:** brett@execom.ca
- **To:** All admin emails
- **Subject:** Payment Pending - Brett Bilon
- **Attachments:** None for admin email
- **API:** Resend API

**Admin Portal Link:** 
- Base URL: `https://fabsy.ca` (or current site origin)
- Path: `/admin/submissions/{submissionId}`
- Full Example: `https://fabsy.ca/admin/submissions/9d1a9369-fa48-4fea-882d-99a5b3a7ab44`

#### Part C: Fetch Consent Form from Storage

**Backend Process:**
```typescript
// Line 134-183: Download consent form with retry logic
let pdfBuffer: ArrayBuffer | null = null;

if (ticketData.submissionId) {
  const fileName = `${ticketData.submissionId}/consent-form.pdf`;
  let retries = 3;
  let retryDelay = 1000; // Start with 1 second
  
  while (retries > 0 && !pdfBuffer) {
    try {
      console.log(`Attempting to download (${4 - retries}/3):`, fileName);
      
      const { data: pdfData, error: downloadError } = 
        await supabase.storage
          .from('consent-forms')
          .download(fileName);
      
      if (downloadError) {
        console.error(`Error (attempt ${4 - retries}):`, downloadError);
        retries--;
        
        if (retries > 0) {
          console.log(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2; // Exponential backoff: 1s, 2s, 4s
        }
      } else if (pdfData) {
        pdfBuffer = await pdfData.arrayBuffer();
        console.log("Consent form fetched, size:", pdfBuffer.byteLength, "bytes");
      }
    } catch (pdfError: any) {
      console.error(`Error fetching (attempt ${4 - retries}):`, pdfError.message);
      retries--;
      
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
      }
    }
  }
}
```

**Retry Logic:**
- **Attempt 1:** Download → If fail, wait 1 second
- **Attempt 2:** Download → If fail, wait 2 seconds  
- **Attempt 3:** Download → If fail, give up

**Why Retry Logic?** 
Storage operations may have slight delays in consistency. The retry logic with exponential backoff ensures the PDF is available before sending the email.

**Conversion Process:**
```typescript
// Convert PDF blob to ArrayBuffer
pdfBuffer = await pdfData.arrayBuffer();

// Convert ArrayBuffer to Base64 for email attachment
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const base64PDF = arrayBufferToBase64(pdfBuffer);
```

#### Part D: Send Client Welcome Email

**Backend Process:**
```typescript
// Line 159-216: Send client confirmation email with PDF attachment
const clientEmailResponse = await resend.emails.send({
  from: "Fabsy <hello@fabsy.ca>",
  reply_to: "brett@execom.ca",
  to: [ticketData.email],
  subject: "Your Ticket Submission Confirmation",
  html: `... HTML email template ...`,
  attachments: pdfBuffer ? [{
    filename: 'Written-Consent-Form.pdf',
    content: arrayBufferToBase64(pdfBuffer),
  }] : [],
});
```

**Client Email Template:**
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
    Thank You for Your Submission!
  </h1>
  
  <p style="font-size: 16px; color: #333;">
    Hi Brett,
  </p>
  
  <p style="font-size: 14px; color: #555; line-height: 1.6;">
    We've received your ticket submission and our team will begin reviewing your 
    case right away. Below is a summary of your submission, and attached you'll 
    find a copy of the written consent form.
  </p>
  
  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <h2 style="color: #4CAF50; margin-top: 0;">Your Ticket Information</h2>
    <p><strong>Ticket Number:</strong> A08645033J</p>
    <p><strong>Violation:</strong> Speeding 30km over limit</p>
    <p><strong>Fine Amount:</strong> $462</p>
  </div>
  
  <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <h3 style="color: #333; margin-top: 0;">What Happens Next?</h3>
    <ul style="color: #555; line-height: 1.8;">
      <li>Our agent team will review your ticket within 24 hours</li>
      <li>We'll review the available options for your ticket</li>
      <li>You'll receive updates via email and SMS</li>
      <li>We'll keep you informed every step of the way</li>
    </ul>
  </div>
  
  <p style="font-size: 14px; color: #555; line-height: 1.6;">
    If you have any questions, feel free to reach out to us at any time.
  </p>
  
  <p style="font-size: 14px; color: #333;">
    Best regards,<br>
    <strong>The Fabsy Team</strong>
  </p>
  
  <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
    Submitted on October 1, 2025 2:30 PM
  </p>
</div>
```

**Email Metadata:**
- **From:** Fabsy <hello@fabsy.ca>
- **Reply-To:** brett@execom.ca
- **To:** brettbilon@gmail.com (client's email)
- **Subject:** Your Ticket Submission Confirmation
- **Attachments:** 
  - Filename: `Written-Consent-Form.pdf`
  - Content: Base64-encoded PDF (50-100KB)
  - Content-Type: `application/pdf`

#### Part E: Send SMS Notifications

**Admin SMS:**
```typescript
// Line 222-270: Send SMS to admin via Twilio
const adminSmsMessage = 
  `Payment-pending ticket submission. Do not begin service until payment is confirmed.
Name: ${ticketData.firstName} ${ticketData.lastName}
Ticket: ${ticketData.ticketNumber}
Violation: ${ticketData.violation}
Fine: $${ticketData.fineAmount}`;

const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

const adminSmsResult = await fetch(twilioUrl, {
  method: "POST",
  headers: {
    "Authorization": `Basic ${twilioAuth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    To: "+14036695353",  // Admin phone (hardcoded)
    From: twilioPhoneNumber,
    Body: adminSmsMessage,
  }).toString(),
});
```

**Admin SMS Example:**
```
Payment-pending ticket submission. Do not begin service until payment is confirmed.
Name: Brett Bilon
Ticket: A08645033J
Violation: Speeding 30km over limit
Fine: $462
```

**Client SMS (if opted in):**
```typescript
// Line 277-309: Send SMS to client if they opted in
if (ticketData.smsOptIn) {
  const clientSmsMessage = 
    `Hi ${ticketData.firstName}! Your ticket submission has been received. 
We've emailed you copies of your forms and consent agreement. 
Our team will review your case within 24 hours. - Fabsy`;

  const clientSmsResult = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${twilioAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: ticketData.phone,
      From: twilioPhoneNumber,
      Body: clientSmsMessage,
    }).toString(),
  });
}
```

**Client SMS Example:**
```
Hi Brett! Your ticket submission has been received. We've emailed 
you copies of your forms and consent agreement. Our team will 
review your case within 24 hours. - Fabsy
```

**SMS Metadata:**
- **API:** Twilio SMS API
- **From:** Twilio phone number (configured in secrets)
- **Character Limit:** 160 characters per segment (these are multi-segment)
- **Cost:** ~$0.0075 USD per SMS segment

#### Part F: Return Final Response

```typescript
// Line 313-326: Return success response with all statuses
return new Response(JSON.stringify({ 
  success: true, 
  adminEmail: emailResponse, 
  clientEmail: clientEmailResponse,
  adminSms: adminSmsResponse,
  clientSms: clientSmsResponse 
}), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    ...corsHeaders,
  },
});
```

**Complete Response Example:**
```json
{
  "success": true,
  "adminEmail": {
    "id": "36be7d9b-2bec-45ce-b055-e5901b227a1e",
    "from": "hello@fabsy.ca",
    "to": ["brett@execom.ca"],
    "created_at": "2025-10-01T14:30:00.000Z"
  },
  "clientEmail": {
    "id": "e10971ab-d9a8-4ccd-adf2-7f394ce0d955",
    "from": "hello@fabsy.ca",
    "to": ["brettbilon@gmail.com"],
    "created_at": "2025-10-01T14:30:00.000Z"
  },
  "adminSms": {
    "sid": "SM1234567890abcdef",
    "status": "queued"
  },
  "clientSms": {
    "sid": "SM0987654321fedcba",
    "status": "queued"
  }
}
```

---

### Step 8: Frontend Checkout Redirect and Verified Return

**Location:** `src/components/form-steps/PaymentStep.tsx` (line 195+)

**What Happens:**

```typescript
// Create the fixed-price Stripe Checkout session.
const { data, error } = await supabase.functions.invoke('create-payment', {
  body: {
    submissionId,
    customerEmail: formData.email,
    customerName: `${formData.firstName} ${formData.lastName}`.trim(),
    ticketNumber: formData.ticketNumber
  }
});

if (data?.url) {
  window.location.href = data.url; // Redirect to Stripe checkout
}
```

**Success Page:** `/thank-you?session_id={CHECKOUT_SESSION_ID}`

**User Experience:**
1. Redirect to Stripe Checkout
2. Stripe returns the customer to `/thank-you`
3. `get-checkout-session` reads the payment status from Stripe for confirmation and analytics
4. The read endpoint does not mutate case status

---

## Database Schema

### clients Table

**Purpose:** Stores unique client records, identified by driver's license number

```sql
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drivers_license TEXT NOT NULL UNIQUE,  -- Business key
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  date_of_birth DATE,
  sms_opt_in BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX clients_drivers_license_key ON clients(drivers_license);
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_phone ON clients(phone);

-- Row Level Security (RLS)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins and case managers can view all clients"
  ON clients FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'case_manager'::app_role));

CREATE POLICY "Admins and case managers can update clients"
  ON clients FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'case_manager'::app_role));

CREATE POLICY "Only backend can insert clients"
  ON clients FOR INSERT
  WITH CHECK (false); -- Blocks all direct inserts; only edge functions can insert

-- Trigger for updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Sample Data:**
```sql
{
  "id": "abc-123-def-456",
  "drivers_license": "140693-359",
  "first_name": "Brett",
  "last_name": "Bilon",
  "email": "brettbilon@gmail.com",
  "phone": "4036695353",
  "address": "209 32 Ave NW",
  "city": "Calgary",
  "postal_code": "T2M 2P8",
  "date_of_birth": "1979-05-08",
  "sms_opt_in": true,
  "created_at": "2025-10-01T14:30:00.000Z",
  "updated_at": "2025-10-01T14:30:00.000Z"
}
```

---

### ticket_submissions Table

**Purpose:** Stores individual ticket submissions, linked to clients

```sql
CREATE TABLE public.ticket_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  violation TEXT NOT NULL,
  fine_amount TEXT NOT NULL,
  violation_date DATE,
  violation_time TEXT,
  court_location TEXT,
  court_date DATE,
  defense_strategy TEXT,
  additional_notes TEXT,
  coupon_code TEXT,
  insurance_company TEXT,
  status TEXT DEFAULT 'pending',
  consent_form_path TEXT,
  assigned_to UUID,
  search_vector TSVECTOR,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ticket_submissions_client_id ON ticket_submissions(client_id);
CREATE INDEX idx_ticket_submissions_status ON ticket_submissions(status);
CREATE INDEX idx_ticket_submissions_ticket_number ON ticket_submissions(ticket_number);
CREATE INDEX idx_ticket_submissions_created_at ON ticket_submissions(created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE ticket_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins and case managers can view all submissions"
  ON ticket_submissions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'case_manager'::app_role));

CREATE POLICY "Admins and case managers can update submissions"
  ON ticket_submissions FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'case_manager'::app_role));

CREATE POLICY "Only backend can insert submissions"
  ON ticket_submissions FOR INSERT
  WITH CHECK (false); -- Blocks all direct inserts; only edge functions can insert

-- Trigger for updated_at
CREATE TRIGGER update_ticket_submissions_updated_at
  BEFORE UPDATE ON ticket_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Sample Data:**
```sql
{
  "id": "9d1a9369-fa48-4fea-882d-99a5b3a7ab44",
  "client_id": "abc-123-def-456",
  "ticket_number": "A08645033J",
  "violation": "Speeding 30km over limit",
  "fine_amount": "462",
  "violation_date": "2024-03-22",
  "violation_time": null,
  "court_location": "Calgary Provincial Court",
  "court_date": "2024-05-23",
  "defense_strategy": "not_guilty\n\nExplanation: I was not speeding...\n\nCircumstances: ...",
  "additional_notes": "Additional context about the incident",
  "coupon_code": null,
  "insurance_company": "Intact Insurance",
  "status": "pending",
  "consent_form_path": "9d1a9369-fa48-4fea-882d/consent-form.pdf",
  "assigned_to": null,
  "search_vector": null,
  "created_at": "2025-10-01T14:30:00.000Z",
  "updated_at": "2025-10-01T14:30:00.000Z"
}
```

---

### user_roles Table

**Purpose:** Manages admin and case manager roles

```sql
CREATE TYPE app_role AS ENUM ('admin', 'case_manager', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Row Level Security (RLS)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all roles"
  ON user_roles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert roles"
  ON user_roles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles"
  ON user_roles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
```

**Sample Data:**
```sql
{
  "id": "role-123-abc",
  "user_id": "user-456-def",
  "role": "admin",
  "created_at": "2025-09-01T10:00:00.000Z"
}
```

---

### Database Helper Function

```sql
-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

---

## Edge Functions Reference

### 1. submit-ticket

**Path:** `supabase/functions/submit-ticket/index.ts`

**Purpose:** Creates or updates client record and creates ticket submission

**Method:** POST

**Authentication:** None (public endpoint)

**Request Body:**
```typescript
{
  // Client info
  driversLicense: string;     // Required, used as unique identifier
  firstName: string;          // Required
  lastName: string;           // Required
  email: string;              // Required, validated with regex
  phone: string;              // Required
  address: string;
  city: string;
  postalCode: string;
  dateOfBirth?: string;       // YYYY-MM-DD format
  smsOptIn: boolean;
  
  // Ticket info
  ticketNumber: string;       // Required
  violation: string;          // Required
  fineAmount: string;         // Required
  violationDate?: string;     // YYYY-MM-DD format
  courtLocation?: string;
  courtDate?: string;         // YYYY-MM-DD format
  defenseStrategy: string;    // Combined plea + explanation + circumstances
  additionalNotes?: string;
  insuranceCompany?: string;
}
```

**Response:**
```typescript
{
  success: true,
  submissionId: string,  // UUID of created ticket_submission
  clientId: string       // UUID of client (existing or created)
}
```

**Error Response:**
```typescript
{
  error: string  // Error message
}
```

**Process Flow:**
1. Validate required fields
2. Validate email format
3. Check if client exists by driver's license
4. Create new client OR update existing client
5. Create ticket submission linked to client
6. Return success with IDs

**Key Security Features:**
- Server-side input validation
- Email format validation
- Uses service role key to bypass RLS
- No sensitive data logged

---

### 2. generate-consent-form

**Path:** `supabase/functions/generate-consent-form/index.ts`

**Purpose:** Generates personalized consent form PDF and uploads to storage

**Method:** POST

**Authentication:** None (public endpoint)

**Request Body:**
```typescript
{
  submissionId: string;       // Required, used for storage path
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  driversLicense: string;
  ticketNumber: string;
  violation: string;
  issueDate: string;          // Formatted date string
  digitalSignature: string;
}
```

**Response:**
```typescript
{
  success: true,
  consentFormPath: string  // Storage path: {submissionId}/consent-form.pdf
}
```

**Error Response:**
```typescript
{
  error: string  // Error message
}
```

**Process Flow:**
1. Receive submission data
2. Create PDF using pdf-lib
3. Add header, client info, ticket info, authorization text, signature
4. Convert PDF to bytes
5. Upload to storage bucket 'consent-forms'
6. Update ticket_submissions record with storage path
7. Return success with storage path

**PDF Layout:**
- Page size: Letter (8.5" x 11")
- Font: Helvetica (normal and bold)
- Sections: Header, Client Info, Ticket Info, Authorization, Signature, Consent
- File size: ~50-100KB

---

### 3. send-notification

**Path:** `supabase/functions/send-notification/index.ts`

**Purpose:** Sends admin email, client email with PDF, and SMS notifications

**Method:** POST

**Authentication:** None (public endpoint)

**Request Body:**
```typescript
{
  submissionId?: string;      // Required for PDF attachment
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ticketNumber: string;
  violation: string;
  fineAmount: string;
  submittedAt: string;        // Formatted datetime
  smsOptIn?: boolean;
}
```

**Response:**
```typescript
{
  success: true,
  adminEmail: object,      // Resend API response
  clientEmail: object,     // Resend API response
  adminSms: object,        // Twilio API response
  clientSms: object        // Twilio API response (if opted in)
}
```

**Error Response:**
```typescript
{
  error: string  // Error message
}
```

**Process Flow:**
1. Fetch admin user IDs from user_roles table
2. Fetch admin email addresses from auth.users
3. Send admin notification email (no attachments)
4. Download consent PDF from storage (with retry logic)
5. Convert PDF to base64
6. Send client welcome email (with PDF attachment)
7. Send admin SMS notification
8. Send client SMS notification (if opted in)
9. Return success with all statuses

**Email Services:**
- Provider: Resend API
- From: hello@fabsy.ca
- Reply-To: brett@execom.ca

**SMS Services:**
- Provider: Twilio API
- Admin phone: +14036695353 (hardcoded)
- Client phone: from form data

---

### 4. create-payment

**Path:** `supabase/functions/create-payment/index.ts`

**Purpose:** Creates Stripe checkout session for payment

**Method:** POST

**Authentication:** None (public endpoint)

**Request Body:**
```typescript
{
  submissionId: string;
  customerEmail: string;
  customerName: string;
  ticketNumber: string;
}
```

**Response:**
```typescript
{
  url: string  // Stripe checkout session URL
}
```

**Process Flow:**
1. Create a Stripe Checkout session for the $488 CAD flat service fee
2. Reuse the session idempotently for retries of the same submission
3. Attach the submission ID as server-controlled metadata
4. Set validated success/cancel URLs
5. Return the checkout URL for redirect

---

## Email Templates

### Admin Notification Email

**Subject:** Payment Pending - [First Name] [Last Name]

**From:** Fabsy <hello@fabsy.ca>

**Reply-To:** brett@execom.ca

**Template Structure:**
```
┌───────────────────────────────────────────────────┐
│ 🎫 Payment-Pending Ticket Submission             │
├───────────────────────────────────────────────────┤
│ Client Information                                │
│ • Name: [Full Name]                               │
│ • Email: [Email]                                  │
│ • Phone: [Phone]                                  │
├───────────────────────────────────────────────────┤
│ Quick Details                                     │
│ • Ticket Number: [Ticket #]                       │
│ • Violation: [Violation]                          │
│ • Fine Amount: $[Amount]                          │
├───────────────────────────────────────────────────┤
│ [Open Admin Portal Button]                        │
│ → /admin/submissions/[id]                         │
├───────────────────────────────────────────────────┤
│ Submitted: [Datetime]                             │
│ Automated notification from Fabsy system          │
└───────────────────────────────────────────────────┘
```

---

### Client Welcome Email

**Subject:** Your Ticket Submission Confirmation

**From:** Fabsy <hello@fabsy.ca>

**Reply-To:** brett@execom.ca

**Attachment:** Written-Consent-Form.pdf (50-100KB)

**Template Structure:**
```
┌───────────────────────────────────────────────────┐
│ Thank You for Your Submission!                    │
├───────────────────────────────────────────────────┤
│ Hi [First Name],                                  │
│                                                   │
│ We've received your ticket submission and our    │
│ team will begin reviewing your case right away.  │
│ Below is a summary, and attached is your consent │
│ form.                                             │
├───────────────────────────────────────────────────┤
│ Your Ticket Information                           │
│ • Ticket Number: [Ticket #]                       │
│ • Violation: [Violation]                          │
│ • Fine Amount: $[Amount]                          │
├───────────────────────────────────────────────────┤
│ What Happens Next?                                │
│ • Agent team reviews within 24 hours             │
│ • We review the available ticket options         │
│ • You receive updates via email[/SMS]            │
│ • We keep you informed every step                │
├───────────────────────────────────────────────────┤
│ Questions? Feel free to reach out!               │
│                                                   │
│ Best regards,                                     │
│ The Fabsy Team                                    │
├───────────────────────────────────────────────────┤
│ Submitted on [Datetime]                           │
└───────────────────────────────────────────────────┘
```

---

## Security Implementation

### 1. Row Level Security (RLS)

**Purpose:** Prevent unauthorized database access

**Implementation:**

```sql
-- All sensitive tables have RLS enabled
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Example policy: Only admins can view clients
CREATE POLICY "Admins and case managers can view all clients"
  ON clients FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'case_manager'::app_role)
  );

-- Critical: Block direct inserts from clients
CREATE POLICY "Only backend can insert clients"
  ON clients FOR INSERT
  WITH CHECK (false);  -- No one can directly insert
```

**Result:** Frontend cannot directly insert/update/delete sensitive data

---

### 2. Backend-Only Data Insertion

**Security Issue (Before):**
```typescript
// ❌ INSECURE: Frontend could directly insert
const { data } = await supabase
  .from('clients')
  .insert({ /* any data */ });
```

**Solution (After):**
```typescript
// ✅ SECURE: Must go through backend validation
const { data } = await supabase.functions.invoke('submit-ticket', {
  body: { /* validated data */ }
});
```

**Backend uses service role key:**
```typescript
// Service role key bypasses RLS (backend only)
const supabase = createClient(
  supabaseUrl, 
  supabaseServiceKey  // Has elevated privileges
);
```

---

### 3. Input Validation

**Email Validation:**
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(formData.email)) {
  return error response;
}
```

**Required Fields:**
```typescript
if (!formData.driversLicense || !formData.firstName || 
    !formData.lastName || !formData.email || 
    !formData.phone || !formData.ticketNumber) {
  return { error: "Missing required fields" };
}
```

**Type Checking:**
- Email must be valid email format
- Dates must be valid date strings
- UUIDs validated by database

---

### 4. Secrets Management

**Environment Variables (Supabase Secrets):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Backend auth key
- `RESEND_API_KEY` - Email service key
- `TWILIO_ACCOUNT_SID` - SMS service account
- `TWILIO_AUTH_TOKEN` - SMS service auth
- `TWILIO_PHONE_NUMBER` - SMS sender number

**Never exposed to frontend:** All secrets stay in backend edge functions

---

### 5. CORS Configuration

**Purpose:** Allow only authorized origins

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",  // Can be restricted to specific domain
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

**Production Recommendation:** Change `*` to specific domain: `https://fabsy.ca`

---

### 6. Rate Limiting (Ready for Implementation)

**Current State:** Not implemented

**Future Enhancement:**
```typescript
// Add rate limiting middleware to edge functions
// Example: Max 10 submissions per IP per hour
```

---

## Admin Portal Workflow

### Admin Login

**Route:** `/admin`

**Authentication:** Supabase Auth (email/password)

**Role Check:**
```typescript
// Check if user has admin or case_manager role
const { data: roleData } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .in('role', ['admin', 'case_manager'])
  .single();
```

**Access Control:**
- Only users with `admin` or `case_manager` role can access
- Redirects to login if not authenticated
- Redirects to login if role check fails

---

### Admin Dashboard

**Route:** `/admin/dashboard`

**Query Executed:**
```sql
SELECT 
  ticket_submissions.*,
  clients.first_name,
  clients.last_name,
  clients.email,
  clients.phone,
  clients.drivers_license
FROM ticket_submissions
LEFT JOIN clients ON ticket_submissions.client_id = clients.id
ORDER BY created_at DESC;
```

**Dashboard Features:**
- Stats cards showing counts by status
- Search functionality (name, email, ticket#, violation)
- Submission cards with key information
- Status badges (pending/in_progress/completed)
- Click to view full details

**Display:**
```
┌─────────────────────────────────────────────────┐
│ Brett Bilon                        [PENDING]    │
│ 📧 brettbilon@gmail.com                         │
│ 📱 4036695353                                    │
│ 🎫 Ticket: A08645033J                           │
│ 💰 Fine: $462                                    │
│ Violation: Speeding 30km over                   │
│ Submitted: 2 minutes ago                        │
└─────────────────────────────────────────────────┘
```

---

### Submission Detail View

**Route:** `/admin/submissions/[id]`

**Query Executed:**
```sql
SELECT 
  ticket_submissions.*,
  clients.*
FROM ticket_submissions
LEFT JOIN clients ON ticket_submissions.client_id = clients.id
WHERE ticket_submissions.id = '[submission-id]';
```

**Features:**
- Complete client information
- Full ticket details
- Defense strategy and notes
- Payment status and insurance information
- Status dropdown (can update)
- Download consent form button
- Submission metadata (created, updated)

**Status Update:**
```typescript
// Admin can change status
const updateStatus = async (newStatus: string) => {
  const { error } = await supabase
    .from('ticket_submissions')
    .update({ status: newStatus })
    .eq('id', submission.id);
};
```

**Download Consent Form:**
```typescript
const downloadConsentForm = async () => {
  const { data, error } = await supabase.storage
    .from('consent-forms')
    .download(submission.consent_form_path);
  
  // Create download link
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `consent-form-${submission.ticket_number}.pdf`;
  link.click();
};
```

---

## Troubleshooting Guide

### Issue: Email not received

**Possible Causes:**
1. Email in spam folder
2. Resend API key invalid
3. Storage consistency issue (PDF not ready)
4. Email address invalid

**Debug Steps:**
1. Check edge function logs: `send-notification`
2. Look for "Email sent successfully" log
3. Check Resend dashboard for delivery status
4. Verify PDF was uploaded to storage
5. Check retry logic executed successfully

**Fix:**
- Ensure Resend API key is valid
- Check email domain DNS settings
- Increase retry delay if storage is slow
- Add email to safe senders list

---

### Issue: PDF not attached to email

**Possible Causes:**
1. Consent form not generated
2. Storage path incorrect
3. Retry logic exhausted
4. PDF download failed

**Debug Steps:**
1. Check `generate-consent-form` logs
2. Verify PDF exists in storage bucket
3. Check `send-notification` logs for download errors
4. Look for "Consent form fetched successfully" log

**Fix:**
- Ensure `generate-consent-form` completes before `send-notification`
- Increase wait time between functions (currently 1 second)
- Check storage bucket permissions
- Verify storage path format: `{submissionId}/consent-form.pdf`

---

### Issue: SMS not sent

**Possible Causes:**
1. Twilio credentials invalid
2. Phone number format incorrect
3. SMS opt-in not checked (for client SMS)
4. Twilio account balance low

**Debug Steps:**
1. Check `send-notification` logs for Twilio errors
2. Verify phone number format: +1XXXXXXXXXX
3. Check Twilio dashboard for message status
4. Verify Twilio account balance

**Fix:**
- Update Twilio credentials in Supabase secrets
- Format phone numbers correctly (E.164 format)
- Top up Twilio account balance
- Check Twilio phone number is active

---

### Issue: Submission not appearing in admin portal

**Possible Causes:**
1. RLS policy blocking view
2. Join query failing
3. Admin not logged in properly
4. Role not assigned correctly

**Debug Steps:**
1. Check browser console for errors
2. Verify admin user has correct role in `user_roles`
3. Check `ticket_submissions` and `clients` tables
4. Test RLS policies manually

**Fix:**
- Assign admin role: `INSERT INTO user_roles (user_id, role) VALUES ('[user-id]', 'admin')`
- Verify client_id exists in clients table
- Check RLS policies allow admin SELECT

---

### Issue: Form submission fails

**Possible Causes:**
1. Required field missing
2. Email validation failed
3. Backend function timeout
4. Database constraint violation

**Debug Steps:**
1. Check browser console for error message
2. Check `submit-ticket` function logs
3. Verify all required fields filled
4. Check database constraints

**Fix:**
- Fill all required fields
- Use valid email format
- Check driver's license format
- Ensure unique constraint not violated

---

### Issue: Duplicate client records

**Possible Causes:**
1. Driver's license number changed
2. Typo in driver's license
3. Concurrent submissions

**Debug Steps:**
1. Query clients table for duplicates
2. Check driver's license numbers match exactly
3. Review submission timestamps

**Fix:**
- Merge duplicate records manually in database
- Standardize driver's license format
- Add validation for driver's license format

---

## Complete Data Flow Diagram

```
┌──────────────┐
│ USER BROWSER │
└──────┬───────┘
       │
       │ 1. Fill out form (stays in React state)
       │
       ▼
┌──────────────────────────────────────────────────┐
│ Step 1-6: Form Data Collection                   │
│ • Ticket Details                                 │
│ • Personal Info (DL# = unique identifier)        │
│ • Defense Strategy                               │
│ • Consent & Signature                            │
│ • Payment Info                                   │
│ • Review                                         │
└──────┬───────────────────────────────────────────┘
       │
       │ 2. Click Submit
       │
       ▼
┌──────────────────────────────────────────────────┐
│ POST /submit-ticket                              │
│ • Validate input                                 │
│ • Check if client exists (by DL#)               │
│ •   IF EXISTS: Update client                     │
│ •   IF NOT: Create new client                    │
│ • Create ticket_submission record                │
│ • Return {submissionId, clientId}                │
└──────┬───────────────────────────────────────────┘
       │
       │ ┌──────────────────────────────────────┐
       │ │ DATABASE OPERATIONS                   │
       │ │ • clients table (INSERT or UPDATE)    │
       │ │ • ticket_submissions (INSERT)         │
       │ │ • Foreign key: client_id → clients.id │
       │ └──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ POST /generate-consent-form                      │
│ • Create PDF with pdf-lib                        │
│ • Add client & ticket info                       │
│ • Add authorization text                         │
│ • Add digital signature                          │
│ • Convert to bytes                               │
│ • Upload to storage bucket                       │
│ • Update ticket_submissions.consent_form_path    │
└──────┬───────────────────────────────────────────┘
       │
       │ ┌──────────────────────────────────────┐
       │ │ STORAGE OPERATION                     │
       │ │ • Bucket: consent-forms               │
       │ │ • Path: {id}/consent-form.pdf         │
       │ │ • Size: ~50-100KB                     │
       │ └──────────────────────────────────────┘
       │
       │ Wait 1 second for storage consistency
       │
       ▼
┌──────────────────────────────────────────────────┐
│ POST /send-notification                          │
│                                                  │
│ A. Fetch admin users & emails                   │
│    └─ Query: user_roles + auth.users            │
│                                                  │
│ B. Send admin email (Resend API)                │
│    └─ Subject: Payment Pending                   │
│    └─ Link to admin portal                      │
│    └─ No attachments                            │
│                                                  │
│ C. Download consent PDF (with retry)            │
│    └─ Attempt 1: Try download → Wait 1s         │
│    └─ Attempt 2: Try download → Wait 2s         │
│    └─ Attempt 3: Try download → Give up         │
│    └─ Convert to base64                         │
│                                                  │
│ D. Send client email (Resend API)               │
│    └─ Subject: Submission Confirmation          │
│    └─ Attachment: PDF (base64)                  │
│    └─ What happens next info                    │
│                                                  │
│ E. Send admin SMS (Twilio API)                  │
│    └─ To: +14036695353 (hardcoded)              │
│    └─ Body: Payment-pending submission summary  │
│                                                  │
│ F. Send client SMS (if opted in)                │
│    └─ To: Client's phone                        │
│    └─ Body: Confirmation message                │
│                                                  │
└──────┬───────────────────────────────────────────┘
       │
       │ ┌──────────────────────────────────────┐
       │ │ EXTERNAL APIs CALLED                  │
       │ │ • Resend: 2 emails sent               │
       │ │ • Twilio: 2 SMS sent (1 if no opt-in) │
       │ └──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ SUCCESS RESPONSE TO BROWSER                      │
│ • Redirect to Stripe Checkout                    │
└──────────────────────────────────────────────────┘


┌──────────────┐
│ ADMIN PORTAL │
└──────┬───────┘
       │
       │ Admin logs in → Verify role
       │
       ▼
┌──────────────────────────────────────────────────┐
│ GET /admin/dashboard                             │
│ • Query: ticket_submissions JOIN clients         │
│ • Display: Cards with key info                   │
│ • Search: Filter by name/email/ticket            │
│ • Stats: Count by status                         │
└──────┬───────────────────────────────────────────┘
       │
       │ Admin clicks submission
       │
       ▼
┌──────────────────────────────────────────────────┐
│ GET /admin/submissions/[id]                      │
│ • Query: Full submission + client details        │
│ • Display: All information                       │
│ • Actions:                                       │
│   • Update status dropdown                       │
│   • Download consent form button                 │
└──────────────────────────────────────────────────┘
```

---

## Summary

**Total Database Records Created:**
- 1 client record (or updated if exists)
- 1 ticket submission record

**Total Files Created:**
- 1 PDF file in storage

**Total Emails Sent:**
- 1 admin notification email
- 1 client welcome email (with PDF)

**Total SMS Sent:**
- 1 admin SMS
- 1 client SMS (if opted in)

**Security Features:**
- ✅ No direct database access from frontend
- ✅ Backend validation of all input
- ✅ Service role authentication for privileged operations
- ✅ Row Level Security (RLS) on all tables
- ✅ Email and format validation
- ✅ Secrets managed in backend only
- ✅ CORS configuration
- ✅ Audit trail in edge function logs

**Key Technologies:**
- React + TypeScript (Frontend)
- Supabase Edge Functions (Backend)
- PostgreSQL (Database)
- Supabase Storage (File storage)
- Resend (Email service)
- Twilio (SMS service)
- pdf-lib (PDF generation)

---

**End of Documentation**

For questions or updates, contact: brett@execom.ca
