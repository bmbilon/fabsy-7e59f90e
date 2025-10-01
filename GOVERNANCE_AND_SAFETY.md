# Governance & Safety Guidelines

## Mandatory Disclaimer

**This text MUST appear near every AI output:**

```
This tool provides general information only and is not legal advice. 
Results are probabilistic. For case-specific advice, request a free 
human review from Fabsy
```

## Current Implementation

### ✅ Disclaimer is Displayed:

1. **AI Answer Display** (`InstantTicketAnalyzer.tsx`)
   - Shown in amber alert box below FAQs
   - Always visible with AI output
   - Cannot be hidden or dismissed

2. **Lead Capture Form** (`AILeadCapture.tsx`)
   - Included in form context
   - Visible before submission
   - User acknowledges by submitting

3. **Email Confirmations** (`send-lead-capture`)
   - User confirmation email includes disclaimer
   - Admin notification includes it
   - Clear separation from actionable content

4. **AI System Prompt** (`analyze-ticket-ai`)
   - Enforces inclusion in `ai_answer.disclaimer`
   - Falls back to default if missing
   - Ensures consistency across all outputs

5. **Hero Section** (`Hero.tsx`)
   - Microcopy clarifies: "Not legal advice"
   - Sets expectations upfront
   - Repeated throughout user journey

## Risk Mitigation

### High-Risk Query Detection

Route these queries to human review immediately:

**Red Flags**:
- Criminal charges mentioned
- DUI/impaired driving
- Driving while suspended
- Hit and run
- Accident with injury
- Court dates within 7 days
- Prior convictions mentioned

**Implementation** (Future Enhancement):
```typescript
const isHighRisk = (query: string, ticketData: any) => {
  const riskKeywords = [
    'criminal', 'dui', 'dwi', 'impaired', 
    'suspended', 'hit and run', 'injury',
    'accident', 'convicted'
  ];
  
  return riskKeywords.some(keyword => 
    query.toLowerCase().includes(keyword)
  );
};

if (isHighRisk(question, ticketData)) {
  return {
    ai_answer: {
      hook: "Your case may require immediate legal consultation.",
      explain: "Based on the details provided, we recommend speaking with a licensed professional right away.",
      faqs: [],
      disclaimer: "This tool provides general information only..."
    },
    page_json: null // Don't publish high-risk content
  };
}
```

### Audit Trail

**Every AI Output is Logged**:

Database: `aeo_analytics`
Event Type: `ai_query`
Logged Data:
- Query text
- Ticket data
- Timestamp
- Session ID
- User agent

**Query**:
```sql
SELECT 
  created_at,
  event_data->>'query' as query,
  event_data->>'ticket_data' as ticket_data,
  session_id
FROM aeo_analytics
WHERE event_type = 'ai_query'
ORDER BY created_at DESC;
```

**Retention**: 90 days minimum, 1 year recommended

### Human Review Triggers

**Automatic**:
- High-risk queries (when implemented)
- Micro-lead form submission
- Human review request button

**Manual**:
- Admin reviews drafts before publishing
- Weekly audit of AI outputs
- Monthly review of edge cases

## Content Quality Control

### Draft → Review → Publish

**Draft Phase**:
- All AI-generated content saved as `status: 'draft'`
- Not included in SSG build
- Not crawlable by search engines
- Allows human review before publication

**Review Phase**:
1. Admin reviews content in database
2. Checks for accuracy
3. Verifies disclaimer presence
4. Confirms FAQ quality
5. Tests tone and compliance

**Publish Phase**:
- Admin changes `status: 'published'`
- CI syncs to JSON files
- SSG build includes page
- Becomes crawlable and citable

### Quality Checklist

Before publishing, verify:
- ✅ Hook is direct, one-sentence answer
- ✅ Explanation is clear and accurate
- ✅ FAQs are 20-50 words each
- ✅ No legal advice given
- ✅ Alberta-specific information
- ✅ Disclaimer is present
- ✅ Tone is helpful, not prescriptive
- ✅ CTA is clear (human review)

## Email Safety

### User Confirmation Email

**Must Include**:
- Clear subject line (not misleading)
- Disclaimer in body
- 24hr response timeframe
- Contact information (phone number)
- Unsubscribe option (if applicable)

**Must NOT Include**:
- Legal advice or guarantees
- Success rate claims without context
- Pressure tactics
- Misleading statements

### Admin Notification Email

**Must Include**:
- Lead details
- AI answer provided
- Timestamp
- Action required: "Review within 24hrs"

**Best Practice**:
- Triage by risk level
- Prioritize court dates
- Track response times
- Follow up on all leads

## Regulatory Compliance

### Not Legal Practice

Fabsy's AI helper:
- ✅ Provides general information
- ✅ Explains common processes
- ✅ Directs to human review
- ❌ Does NOT give legal advice
- ❌ Does NOT represent clients
- ❌ Does NOT guarantee outcomes

### Privacy & Data

**User Data Collection**:
- Name, email (with consent)
- Ticket details (voluntarily provided)
- Session analytics (anonymized)

**Storage**:
- Encrypted at rest (Supabase)
- Access controlled (RLS policies)
- Admin access only for PII

**Retention**:
- Analytics: 90 days
- Leads: Until case closed + 1 year
- Published content: Indefinite

### Advertising & Marketing

**Truthful Claims**:
- ✅ "94% success rate" (if documented)
- ✅ "Free eligibility check"
- ✅ "24hr response"
- ❌ "Guaranteed dismissal"
- ❌ "100% success"
- ❌ "Never lose"

**Disclaimer Placement**:
- All marketing materials
- All email communications
- All web pages with AI output
- All social media posts

## Incident Response

### User Complaint

1. Acknowledge within 24hrs
2. Review AI output log
3. Assess validity of complaint
4. Respond with corrective action
5. Update system if needed

### Inaccurate Information

1. Identify source (AI output vs. human error)
2. Correct published content immediately
3. Notify affected users
4. Update AI prompt if systemic
5. Document incident

### Legal Notice

1. Contact legal counsel immediately
2. Preserve all relevant logs
3. Do not alter or delete data
4. Respond through counsel
5. Implement changes as advised

## Training & Updates

### Team Training

**All Staff Must Know**:
- Disclaimer requirements
- High-risk query identification
- Escalation procedures
- Compliance basics

**Refresher**: Quarterly

### System Updates

**AI Prompt Review**: Monthly
- Check for accuracy drift
- Update Alberta-specific info
- Refine disclaimer language
- Test edge cases

**Compliance Audit**: Quarterly
- Review all disclaimers
- Check email templates
- Verify data retention
- Test incident response

## Contact & Support

**For Users**:
- Phone: 403-669-5353
- Email: support@fabsy.ca
- Response: Within 24 hours

**For Legal/Compliance**:
- Email: legal@fabsy.ca
- Response: Immediate for urgent matters

## Summary

**The AI helper is a discovery and engagement tool, not a legal advisor.**

Every interaction must:
1. Display the disclaimer
2. Be logged for audit
3. Route high-risk to humans
4. Provide path to human review
5. Never guarantee outcomes

**When in doubt, route to human.**
