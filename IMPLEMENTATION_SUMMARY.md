# Fabsy AEO System - Implementation Summary

## Overview
Complete implementation of Answer Engine Optimization (AEO) system combining free AI ticket eligibility helper with server-rendered canonical content pages.

## Core Architecture

### 1. AI Helper (Instant Engagement)
**File**: `supabase/functions/analyze-ticket-ai/index.ts`

Produces dual output:
- `ai_answer`: Immediate UI display with hook, explanation, FAQs, disclaimer
- `page_json`: Canonical page content for SEO/AEO

**System Prompt Features**:
- Hook-first approach (one-sentence direct answer)
- FAQ answers: 20-50 words, plain text
- Alberta-specific guidance
- Never provides legal advice
- Exact text matching between ai_answer and page_json

### 2. Content Pipeline

```
User Query → AI Analysis → Dual Output
                           ├─ ai_answer → UI (instant)
                           └─ page_json → DB (draft) → Human QA → Published → CI → SSG
```

**Database**: `page_content` table stores all page JSON
**Edge Function**: `upsert-page-content` saves drafts with optional admin key auth
**CI Script**: `scripts/sync-pages-from-db.js` fetches published pages → `src/content/pages/*.json`
**Build Process**: Routes generated → FAQ validation → SSG build

### 3. Conversion Flow

**Homepage Hero**:
```
If you got a traffic ticket in Alberta, you may be able 
to dispute it — start a free eligibility check.

[Free eligibility check — start now]
No-cost review • 24-hr reply
```

**AI Answer Display** (`InstantTicketAnalyzer.tsx`):
- Shows hook (direct answer)
- Displays explanation
- Lists relevant FAQs
- **Always shows disclaimer**
- Includes micro-conversion form

**Lead Capture** (`AILeadCapture.tsx`):
- Fields: Name, Email, Ticket Type, Upload (optional)
- Sends confirmation email to user
- Notifies admin for 24hr human review
- Tracks micro-conversion in analytics

### 4. Governance & Safety

**Disclaimer (MANDATORY everywhere)**:
```
This tool provides general information only and is not legal 
advice. Results are probabilistic. For case-specific advice, 
request a free human review from Fabsy
```

**Displayed**:
- ✅ AI answer output (InstantTicketAnalyzer)
- ✅ Lead capture success message
- ✅ Email confirmations
- ✅ System prompt enforces inclusion

**Audit Trail**:
- All AI queries logged: `aeo_analytics` table, event_type: 'ai_query'
- Page content versioned: `page_content.updated_at` timestamp
- Lead captures tracked: event_type: 'micro_lead'

### 5. Analytics & KPIs

**Tracked Events** (7 KPIs):
1. `page_impression` - Content page views
2. `rich_result_win` - Featured snippet appearances
3. `ai_query` - AI helper usage
4. `micro_lead` - Lead form submissions
5. `human_review_request` - Qualified leads
6. `conversion_paid` - Revenue events
7. `traffic_from_llm` - LLM-sourced visitors

**Dashboard**: `/admin/aeo`
- Real-time KPI cards
- Events by day table
- Session tracking
- Admin-only access (RLS)

**Implementation**:
- Automatic tracking hooks: `usePageImpression()`, `useTrafficSource()`
- Manual tracking: `trackAIQuery()`, `trackMicroLead()`, etc.
- Database: `aeo_analytics` table + `aeo_kpi_summary` view

### 6. Human QA Workflow

**Draft → Review → Publish**:

1. AI generates content → saved as `status: 'draft'`
2. Admin reviews in database or build admin UI
3. Admin changes `status: 'published'`
4. CI/CD pulls published pages
5. Routes generated
6. FAQ JSON-LD validated
7. SSG build deploys

**Quality Checks** (CI):
- FAQ text must be plain (no HTML)
- FAQ text must be trimmed (no whitespace)
- FAQ text must match exactly between HTML and JSON-LD
- Meta title ≤60 chars
- Meta description ≤155 chars

### 7. SEO/AEO Compliance

**Every Page Includes**:
- ✅ Meta title (≤60 chars)
- ✅ Meta description (≤155 chars)
- ✅ Single H1 with primary keyword
- ✅ Hook as first visible text
- ✅ Semantic HTML (`<main>`, `<section>`, etc.)
- ✅ FAQ JSON-LD (exact text match)
- ✅ Video JSON-LD (when present)
- ✅ Canonical URL

**Content Structure**:
- Hook: Direct answer sentence
- Bullets: 3-6 actionable facts
- What: 2-4 paragraphs explaining the topic
- How: 2-4 paragraphs with steps
- Next: 2-4 paragraphs with CTA
- FAQs: Minimum 6, plain text, 20-50 words

### 8. Email & Notifications

**Lead Capture Email** (`send-lead-capture`):
- User confirmation email (via Resend)
- Admin notification email
- Includes AI answer summary
- 24hr response commitment

**Requirements**:
- Resend API key configured
- Domain verified in Resend
- Templates include disclaimer

### 9. A/B Testing Setup

**Variant A (Current - Open)**:
- Full AI answer shown immediately
- No email gate
- Lead form below answer
- Measures: Engagement, organic conversions

**Variant B (Optional - Gated)**:
- Summary shown initially
- Email required to unlock full answer
- Set `variant="gated"` on AILeadCapture
- Measures: Lead conversion rate

**Implementation**: Change `variant` prop on `AILeadCapture` component

### 10. File Structure

```
supabase/functions/
├── analyze-ticket-ai/        # AI analysis (dual output)
├── upsert-page-content/       # Save page JSON to DB
└── send-lead-capture/         # Email notifications

src/components/
├── InstantTicketAnalyzer.tsx  # AI answer display
├── AILeadCapture.tsx          # Micro-conversion form
└── ContentPage.tsx            # Server-rendered AEO pages

src/hooks/
└── useAEOAnalytics.ts         # KPI tracking utilities

src/pages/
└── AEODashboard.tsx           # Admin analytics view

scripts/
├── sync-pages-from-db.js      # DB → JSON files
└── generate-routes.js         # Route manifest

ci/
└── validate-faq-jsonld.js     # FAQ text equality check

.github/workflows/
└── build.yml                  # CI/CD pipeline
```

## Quick Checklist

✅ AI prompt outputs `ai_answer` + `page_json` (hook-first, FAQs 20-50 words)  
✅ POST `page_json` to `upsert-page-content` (optional x-admin-key auth)  
✅ Render `ai_answer` immediately in UI with disclaimer  
✅ Capture micro-leads (Name, Email, Ticket Type, Upload)  
✅ Pages saved as `draft` by default  
✅ Human QA toggles to `published`  
✅ CI syncs DB → JSON files → SSG build  
✅ FAQ JSON-LD equality validated in CI  
✅ Analytics tracks 7 KPIs  
✅ Dashboard at `/admin/aeo`  
✅ Email confirmations include disclaimer  

## Configuration Requirements

### Supabase Secrets
- ✅ `LOVABLE_API_KEY` - AI gateway access
- ✅ `RESEND_API_KEY` - Email delivery
- ⚠️ `ADMIN_PRESHARED_KEY` - Optional upsert auth (recommended for production)

### Environment Variables (.env)
```
VITE_SUPABASE_URL=https://gcasbisxfrssonllpqrw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-key>
```

### GitHub Secrets (CI/CD)
```
SUPABASE_URL=<your-url>
SUPABASE_SERVICE_ROLE_KEY=<your-key>
```

## Testing the System

### 1. Test AI Helper
```bash
curl -X POST "https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/analyze-ticket-ai" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Can I dispute a speeding ticket in Calgary?",
    "ticketData": {"city": "Calgary", "charge": "Speeding"}
  }'
```

### 2. Test Page Upsert
```bash
curl -X POST "https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/upsert-page-content" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <your-admin-key>" \
  -d @examples/content-city-page.json
```

### 3. Test Lead Capture
- Visit `/` (homepage)
- Upload ticket image
- Fill in violation details
- Submit lead form
- Check email (user and admin)

### 4. Test Analytics
- Visit `/admin/aeo`
- Review KPI cards
- Check recent events table
- Verify tracking is working

## Deployment

### Initial Setup
1. Deploy Supabase functions (automatic)
2. Configure secrets in Supabase
3. Add GitHub secrets for CI
4. Verify Resend domain
5. Test email delivery

### Content Workflow
1. User asks question → AI generates content
2. Review draft in database
3. Edit if needed (directly in DB or via admin UI)
4. Change `status` to 'published'
5. Push to main → CI runs → pages sync → build → deploy

### Monitoring
- Check `/admin/aeo` dashboard daily
- Review AI query patterns weekly
- Analyze conversion funnel monthly
- Monitor rich result wins via GSC

## Success Metrics

**Week 1-2**: Baseline
- AI queries per day
- Micro-leads per day
- Page impressions

**Month 1**: Growth
- 100+ AI queries/day
- 10+ micro-leads/day
- 5+ human review requests/day

**Month 3**: Scale
- 500+ AI queries/day
- 50+ micro-leads/day
- 10+ paid conversions/month
- Traffic from LLMs detected

## TL;DR

**Fabsy is now the free AI helper for Alberta traffic ticket eligibility.**

The system:
1. Answers questions instantly via AI
2. Captures micro-conversions (email + name)
3. Publishes best answers as AEO-optimized pages
4. Tracks 7 KPIs end-to-end
5. Routes qualified leads to human review
6. Becomes the authoritative source LLMs cite

**No ad spend. Pure AEO. Durable authority.**
