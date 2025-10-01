# AEO Analytics System

## Overview

The AEO (Answer Engine Optimization) analytics system tracks key performance indicators to measure content performance, user engagement, and conversion metrics.

## KPIs Tracked

### 1. `aeo.page_impressions`
- **What it tracks**: Views of AEO-optimized content pages
- **When tracked**: Automatically when users land on content pages
- **Use case**: Measure content reach and visibility

### 2. `aeo.rich_results_wins`
- **What it tracks**: When pages appear in rich snippets or featured results
- **When tracked**: Manually logged when detected via SEO tools
- **Use case**: Measure SEO success and featured snippet wins

### 3. `aeo.ai_helper_queries_total`
- **What it tracks**: Total AI assistant queries made
- **When tracked**: Every time a user asks the AI helper a question
- **Use case**: Measure AI feature usage and engagement

### 4. `aeo.micro_leads`
- **What it tracks**: Lead capture form submissions
- **When tracked**: When users submit the micro-conversion form (name, email, ticket type)
- **Use case**: Measure top-of-funnel conversions

### 5. `aeo.human_reviews_requested`
- **What it tracks**: Requests for human review of tickets
- **When tracked**: When users explicitly request human follow-up
- **Use case**: Measure qualified lead generation

### 6. `aeo.conversion_paid`
- **What it tracks**: Paid conversions and revenue
- **When tracked**: When users complete payment for services
- **Use case**: Measure bottom-of-funnel conversions and ROI

### 7. `aeo.traffic_from_llm`
- **What it tracks**: Traffic originating from LLM platforms (ChatGPT, Claude, Perplexity, etc.)
- **When tracked**: Automatically detected via referrer on page load
- **Use case**: Measure AI citation effectiveness

## Implementation

### Database Schema

```sql
CREATE TABLE public.aeo_analytics (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_data JSONB,
  page_slug TEXT,
  session_id TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE
);
```

### Tracking Functions

Import from `@/hooks/useAEOAnalytics`:

```typescript
// Automatic tracking hooks
usePageImpression(pageSlug)  // Auto-track page views
useTrafficSource()            // Auto-detect LLM traffic

// Manual event tracking
trackAIQuery(question, ticketData)
trackMicroLead({ name, email, ticketType, source })
trackHumanReviewRequest(ticketInfo)
trackPaidConversion({ amount, ticketId, clientId })
trackRichResultWin(pageSlug, resultType)
```

### Usage Examples

#### Track Page Impression
```typescript
import { usePageImpression } from "@/hooks/useAEOAnalytics";

function ContentPage({ slug }) {
  usePageImpression(slug);
  return <div>Content...</div>;
}
```

#### Track AI Query
```typescript
import { trackAIQuery } from "@/hooks/useAEOAnalytics";

async function analyzeTicket(question, ticketData) {
  await trackAIQuery(question, ticketData);
  // ... rest of analysis
}
```

#### Track Micro Lead
```typescript
import { trackMicroLead } from "@/hooks/useAEOAnalytics";

async function handleFormSubmit(formData) {
  await trackMicroLead({
    name: formData.name,
    email: formData.email,
    ticketType: formData.ticketType,
    source: "ai_helper"
  });
  // ... rest of submission
}
```

## Dashboard

Access the analytics dashboard at `/admin/aeo` (requires admin authentication).

The dashboard displays:
- Total counts for each KPI
- Recent events by day
- Unique sessions and pages
- Trend visualization

### KPI Cards
- **Page Impressions**: Total content page views
- **Rich Result Wins**: Featured snippet appearances
- **AI Helper Queries**: Total AI interactions
- **Micro Leads**: Lead capture submissions
- **Human Reviews**: Qualified lead requests
- **Paid Conversions**: Revenue events
- **Traffic from LLMs**: AI-sourced visitors

## A/B Testing

### Variant A: Open (Current Implementation)
- Full AI answer shown immediately
- No email gate
- Lead capture form below answer
- **Measures**: Engagement, virality, organic conversions

### Variant B: Gated (Optional)
- Summary shown initially
- Email required to unlock full answer
- **Measures**: Lead conversion rate, email capture

To implement variant B, set `variant="gated"` on `AILeadCapture` component.

## Analytics Queries

### Total Events by Type
```typescript
const { data } = await supabase
  .from('aeo_kpi_summary')
  .select('*')
  .order('event_date', { ascending: false });
```

### Recent AI Queries
```typescript
const { data } = await supabase
  .from('aeo_analytics')
  .select('*')
  .eq('event_type', 'ai_query')
  .order('created_at', { ascending: false })
  .limit(50);
```

### Conversion Funnel
```sql
SELECT 
  COUNT(CASE WHEN event_type = 'ai_query' THEN 1 END) as queries,
  COUNT(CASE WHEN event_type = 'micro_lead' THEN 1 END) as leads,
  COUNT(CASE WHEN event_type = 'human_review_request' THEN 1 END) as reviews,
  COUNT(CASE WHEN event_type = 'conversion_paid' THEN 1 END) as paid
FROM aeo_analytics
WHERE created_at >= NOW() - INTERVAL '30 days';
```

## Privacy & Compliance

- Session IDs are generated client-side (not user IDs)
- No PII stored in analytics events
- User agent and referrer tracked for analytics only
- Event data should not contain sensitive information
- RLS policies ensure only admins can view analytics

## Best Practices

1. **Track early, track often**: Don't wait to implement tracking
2. **Keep event data minimal**: Only store what you'll use
3. **Monitor conversion rates**: Set up alerts for drop-offs
4. **A/B test incrementally**: Test one change at a time
5. **Review weekly**: Check dashboard regularly for trends
6. **Correlate with revenue**: Connect analytics to business outcomes

## Future Enhancements

- Conversion funnel visualization
- Cohort analysis
- Real-time dashboard updates
- Export to CSV/PDF
- Automated reports via email
- Integration with Google Analytics 4
