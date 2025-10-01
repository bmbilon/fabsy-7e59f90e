# Fabsy AEO Implementation Guide

**Last Updated:** 2025-10-01  
**Site:** fabsy.ca  
**Purpose:** Alberta traffic ticket help for women  
**Goal:** Dominate AI search queries and beat all competitors in featured snippets

---

## Executive Summary

This document outlines the Answer Engine Optimization (AEO) strategy implemented for fabsy.ca. Our goal is to rank #1 in AI-powered search queries (ChatGPT, Perplexity, Google SGE, etc.) by providing direct, structured answers optimized for voice search and featured snippets.

**Core Strategy:** Answer-first content with exact wording matching between HTML and JSON-LD structured data.

---

## 1. AEO Content Structure

### Standard Page Template

Every content page follows this structure:

```markdown
# {{H1}} (max 60 chars, includes target keyword)

{{HOOK}} <!-- ONE-SENTENCE DIRECT ANSWER - Must be first visible text -->

**Key facts**
- {{bullet1}} (short, actionable)
- {{bullet2}}
- {{bullet3}}
- {{bullet4}}
- {{bullet5}}

## What
{{what_section}} (2-4 short paragraphs)

## How
{{how_section}} (2-4 short paragraphs)

## Next steps
{{next_section}} (2-4 short paragraphs)

**Frequently asked questions**
<details>
<summary>Q: {{faq1.q}}</summary>
<p>{{faq1.a}}</p>
</details>
<!-- Repeat for 6+ FAQs -->

**Call to action**
[Get a free eligibility check](/free-check)
```

### Content Requirements

- **Meta Title:** ≤60 characters, includes target keyword
- **Meta Description:** ≤155 characters, includes target keyword
- **Hook:** One-sentence direct answer, first visible text on page
- **Word Count:** Minimum 300 words, recommended 350-600 words
- **FAQ Answers:** 20-50 words each, start with direct answer
- **Tone:** Supportive, plain-language, conversational, female-friendly
- **Local Focus:** Alberta-specific examples and references

---

## 2. Critical AEO Rule: Exact Wording Match

**🚨 MOST IMPORTANT:** FAQ wording in HTML must match JSON-LD **EXACTLY**.

AI engines use exact text matching for featured snippets. Any deviation reduces ranking potential.

### Example

**HTML:**
```html
<details>
<summary>Q: Do I need to go to court for a traffic ticket in Alberta?</summary>
<p>Not always. You can pay the fine, request a trial, or sometimes settle. If you want to dispute it, request disclosure and prepare your defense.</p>
</details>
```

**JSON-LD (must be identical):**
```json
{
  "@type": "Question",
  "name": "Do I need to go to court for a traffic ticket in Alberta?",
  "acceptedAnswer": {
    "@type": "Answer",
    "text": "Not always. You can pay the fine, request a trial, or sometimes settle. If you want to dispute it, request disclosure and prepare your defense."
  }
}
```

---

## 3. JSON-LD Schemas Implemented

### FAQPage Schema
Used on all content pages with FAQs.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question text here",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer text here"
      }
    }
  ]
}
```

### ProfessionalService Schema
Used on homepage.

```json
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "Fabsy",
  "url": "https://fabsy.ca",
  "logo": "https://fabsy.ca/path/to/logo.png",
  "telephone": "+1-403-XXX-XXXX",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[street]",
    "addressLocality": "Calgary",
    "addressRegion": "AB",
    "postalCode": "[postal]",
    "addressCountry": "CA"
  },
  "areaServed": {
    "@type": "State",
    "name": "Alberta"
  },
  "priceRange": "$"
}
```

### Other Schemas Available
- LocalBusiness
- Article
- Organization
- WebPage
- BreadcrumbList

---

## 4. AI Content Generation Functions

We've built 7 edge functions to automate AEO content creation:

### 4.1 Generate City Content
**Function:** `generate-city-content`  
**Purpose:** Rewrite content for specific Alberta cities

**Input:**
```json
{
  "cityName": "Calgary",
  "localCourt": "Calgary Traffic Court",
  "baseContent": "optional base content to rewrite"
}
```

**Output:**
- meta_title, meta_description, slug, h1
- hook (direct answer)
- bullets (5 key facts)
- sections (what, how, next)
- faqs (6 Q&A, at least 3 city-specific)

---

### 4.2 Generate FAQs
**Function:** `generate-faqs`  
**Purpose:** Create 6 AEO-optimized FAQs for any topic

**Input:**
```json
{
  "topic": "How to fight a speeding ticket in Alberta"
}
```

**Output:**
```json
{
  "faqs": [
    {"q": "Question", "a": "20-50 word answer"},
    ...
  ]
}
```

---

### 4.3 Generate Social Posts
**Function:** `generate-social-posts`  
**Purpose:** Create 12 social media posts (≤220 chars each)

**Input:**
```json
{
  "pageTitle": "Fight Your Traffic Ticket",
  "bullets": ["fact 1", "fact 2", "fact 3"],
  "cta": "Get help today"
}
```

**Output:**
```json
{
  "posts": [
    {
      "text": "Post text under 220 chars",
      "hashtags": ["tag1", "tag2", "tag3"],
      "imageCaption": "Image description"
    }
  ]
}
```

---

### 4.4 Generate Outreach Sequence
**Function:** `generate-outreach-sequence`  
**Purpose:** 3-step email sequence for guest post pitches

**Input:**
```json
{
  "blogName": "Calgary Women's Blog",
  "blogFocus": "Women's lifestyle",
  "recipientName": "Editor Name",
  "topicIdea": "Traffic ticket Q&A"
}
```

**Output:**
```json
{
  "email1": {"subject": "...", "body": "..."},
  "email2": {"subject": "...", "body": "..."},
  "email3": {"subject": "...", "body": "..."}
}
```

Each email ≤120 words.

---

### 4.5 Generate Video Script
**Function:** `generate-video-script`  
**Purpose:** 60-90 second explainer video with timing

**Input:**
```json
{
  "topic": "How to Fight Your Ticket",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "cta": "Visit fabsy.ca"
}
```

**Output:**
```json
{
  "script": "Full script with [00:00-00:10] timing markers",
  "captions": "WebVTT formatted captions",
  "transcript": "One paragraph for SEO"
}
```

Structure:
- Hook: 10s
- Step 1: 15-20s
- Step 2: 15-20s
- Step 3: 15-20s
- CTA: 10s

---

### 4.6 Generate JSON-LD
**Function:** `generate-json-ld`  
**Purpose:** Create structured data schemas

**Input:**
```json
{
  "type": "FAQPage",
  "data": {
    "faqs": [
      {"q": "Question", "a": "Answer"}
    ]
  }
}
```

**Supported Types:**
- FAQPage
- ProfessionalService
- LocalBusiness
- Article
- Organization
- WebPage
- BreadcrumbList

**Output:**
- Raw JSON-LD object
- Ready-to-paste `<script type="application/ld+json">` tag

---

### 4.7 Generate Page Content
**Function:** `generate-page-content`  
**Purpose:** Complete page content for template

**Input:**
```json
{
  "topic": "How to Fight a Speeding Ticket",
  "city": "Calgary",
  "targetKeyword": "fight speeding ticket Calgary"
}
```

**Output:**
- All template placeholders filled
- meta_title, meta_description, slug
- h1, hook, bullets
- what_section, how_section, next_section
- faqs (6 Q&A pairs)

---

### 4.8 Validate Page Content
**Function:** `validate-page-content`  
**Purpose:** Pre-publishing validation checklist

**Input:**
```json
{
  "meta_title": "...",
  "meta_description": "...",
  "hook": "...",
  "content": "full page content",
  "faqs": [...],
  "jsonLd": {...}
}
```

**Validates:**
✅ Meta title ≤60 chars  
✅ Meta description ≤155 chars  
✅ Hook present  
✅ Word count ≥300  
✅ FAQ answers 20-50 words  
✅ **CRITICAL:** FAQ HTML/JSON-LD exact match  
✅ JSON-LD structure valid

**Manual Check Reminders:**
- Google Rich Results test
- Lighthouse mobile < 3s
- CTA above fold
- Hook as first visible text

---

## 5. Pre-Publishing Checklist

Before publishing any page:

### ✅ Content Validation
- [ ] Hook sentence is first visible text
- [ ] Meta title ≤60 chars, includes keyword
- [ ] Meta description ≤155 chars, includes keyword
- [ ] Page word count ≥300 (preferably 350-600)
- [ ] FAQ answers 20-50 words each
- [ ] At least 3 Alberta/city-specific FAQs

### ✅ Structured Data
- [ ] FAQs visible in HTML (details/summary or plain text)
- [ ] JSON-LD added to page `<head>`
- [ ] **FAQ wording IDENTICAL in HTML and JSON-LD**
- [ ] Test with Google Rich Results tool
- [ ] No JSON-LD errors

### ✅ Performance
- [ ] Mobile load time < 3s (Lighthouse)
- [ ] Images optimized and lazy-loaded
- [ ] Render-blocking JS minimized
- [ ] Caching headers configured
- [ ] Fix top 3 Lighthouse issues

### ✅ UX & Conversion
- [ ] CTA/form above the fold
- [ ] Form minimal: name, email, ticket type, attach ticket (optional)
- [ ] Mobile-responsive
- [ ] Readable font sizes (16px+ body text)

---

## 6. Current Site Architecture

### Tech Stack
- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (backend + edge functions)

### Key Pages
- **Homepage:** Hero, trust indicators, how it works, testimonials
- **Ticket Form:** Multi-step form with OCR for ticket upload
- **About, Services, Contact, FAQ pages**
- **Privacy Policy, Terms of Service**

### Backend Features
- Supabase database with RLS policies
- Edge functions for AI content generation
- Email notifications (Resend)
- Payment processing (Stripe)
- OCR for tickets and driver's licenses

---

## 7. AI Query Optimization Strategy

### Target Voice Queries
- "How do I fight a traffic ticket in Alberta?"
- "What happens if I ignore a speeding ticket?"
- "Can a traffic ticket affect my insurance?"
- "Do I need a lawyer for a traffic ticket in Calgary?"
- "How much does a speeding ticket cost in Alberta?"

### Optimization Techniques
1. **Answer-first structure:** Hook provides immediate answer
2. **Exact wording matching:** HTML/JSON-LD must be identical
3. **Natural language:** Write how people speak, not how they write
4. **Local specificity:** City names, court names, Alberta references
5. **Structured data:** Multiple schema types for rich results
6. **FAQ optimization:** Questions mirror real voice queries

---

## 8. Competitive Advantage

### Why We'll Beat Competitors
1. **Exact FAQ matching:** Most competitors don't match HTML/JSON-LD perfectly
2. **Answer-first structure:** Hook sentence gives AI engines direct answers
3. **Female-focused:** Supportive tone attracts women (underserved audience)
4. **Local expertise:** Alberta-specific content beats generic national services
5. **AI-generated scale:** 7 edge functions automate content for every city
6. **Validation system:** Pre-publishing checks prevent AEO mistakes

---

## 9. Content Production Workflow

### Recommended Process

1. **Topic Research**
   - Identify common voice queries (Google "People Also Ask", Answer the Public)
   - Analyze competitor content
   - Note Alberta-specific variations

2. **Generate Base Content**
   - Use `generate-page-content` function
   - Input: topic, city (optional), target keyword
   - Output: Complete page template filled

3. **Customize & Enhance**
   - Add local examples and case studies
   - Ensure natural, conversational tone
   - Verify Alberta legal accuracy

4. **Create JSON-LD**
   - Use `generate-json-ld` function
   - Type: FAQPage (or ProfessionalService for homepage)
   - **CRITICAL:** Copy exact FAQ text from HTML

5. **Validate Before Publishing**
   - Use `validate-page-content` function
   - Fix all errors, address warnings
   - Run manual checks (Rich Results, Lighthouse)

6. **Publish & Monitor**
   - Deploy to production
   - Monitor Google Search Console
   - Track AI engine citations (ChatGPT, Perplexity)

---

## 10. City-Specific Content Strategy

### Target Cities
- Calgary
- Edmonton
- Red Deer
- Lethbridge
- Medicine Hat
- Fort McMurray
- Grande Prairie

### Localization Requirements
- Local court names (e.g., "Calgary Traffic Court")
- City-specific traffic patterns and issues
- Local street/highway examples
- 3+ city-specific FAQs per page
- Local testimonials (if available)

### Replication Process
Use `generate-city-content` function with city name and local court. This creates Alberta-optimized content that feels genuinely local, not templated.

---

## 11. Measurement & Success Metrics

### Primary KPIs
- **AI Citation Rate:** How often Fabsy appears in ChatGPT/Perplexity answers
- **Featured Snippet Wins:** Number of Google featured snippets owned
- **Voice Search Rankings:** Track positions for target voice queries
- **Organic Traffic from AI:** GA4 segment for AI-referred traffic

### Secondary KPIs
- FAQ click-through rate
- Form submission rate (above fold CTA)
- Mobile load time
- Rich Results test pass rate

### Tools
- Google Search Console
- Lighthouse/PageSpeed Insights
- Rich Results Testing Tool
- ChatGPT/Perplexity manual testing
- Custom analytics for AI referrals

---

## 12. Next Steps & Recommendations

### Immediate Priorities
1. Complete address/phone in ProfessionalService schema
2. Add testimonial schema for social proof
3. Create city pages for top 7 Alberta cities
4. Build FAQ library (50+ questions)
5. Optimize existing pages with validation function

### Content Expansion
- Create "How to" guides for each ticket type
- Build provincial comparison content
- Add insurance impact calculators
- Develop video content (60-90s explainers)

### Technical Improvements
- Image lazy loading and optimization
- Implement service worker for caching
- Add AMP versions for mobile speed
- Set up content delivery network (CDN)

### Link Building & Outreach
- Use `generate-outreach-sequence` for guest posts
- Target local Alberta blogs and news sites
- Women-focused publications
- Legal and automotive blogs

---

## 13. API Reference

All edge functions are deployed at:
`https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/{function-name}`

### Function Endpoints

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| `generate-city-content` | City-specific content | cityName, localCourt, baseContent | Full page content |
| `generate-faqs` | AEO-optimized FAQs | topic | 6 Q&A pairs |
| `generate-social-posts` | Social media posts | pageTitle, bullets, cta | 12 posts ≤220 chars |
| `generate-outreach-sequence` | Email pitch sequence | blogName, recipientName | 3-step email sequence |
| `generate-video-script` | Video explainer script | topic, keyPoints, cta | Script + captions + transcript |
| `generate-json-ld` | Structured data | type, data | JSON-LD + script tag |
| `generate-page-content` | Complete page template | topic, city, keyword | All template fields |
| `validate-page-content` | Pre-publish validation | page content + jsonLd | Pass/fail + errors/warnings |

---

## 14. Example: Perfect AEO Page

### URL
`https://fabsy.ca/fight-speeding-ticket-calgary`

### Meta Tags
```html
<title>How to Fight a Speeding Ticket in Calgary | Fabsy</title>
<meta name="description" content="You can fight a speeding ticket in Calgary by requesting disclosure and preparing your defense. Get expert help from Fabsy today.">
```

### Content
```markdown
# How to Fight a Speeding Ticket in Calgary

You can fight a speeding ticket in Calgary by requesting disclosure, reviewing evidence, and preparing your defense with professional help.

**Key facts**
- Request disclosure within 30 days of receiving your ticket
- Calgary Traffic Court processes over 50,000 cases annually
- Professional representation increases success rate by 40%
- Most cases resolve without court appearance
- Reduced fines and demerit points are common outcomes

## What is fighting a speeding ticket?

Fighting a speeding ticket means formally disputing the charge... [2-3 more paragraphs]

## How to fight your speeding ticket in Calgary

Step 1: Request disclosure from Calgary Traffic Court... [2-3 more paragraphs]

## Next steps after receiving your ticket

Once you've decided to fight your ticket... [2-3 more paragraphs]

**Frequently asked questions**
<details>
<summary>Q: Do I need a lawyer to fight a speeding ticket in Calgary?</summary>
<p>Not required, but recommended. Professional representation increases success rates by 40%. Fabsy's licensed paralegals handle Calgary traffic tickets daily and know the local courts well.</p>
</details>
[5 more FAQs]

**Call to action**
[Get a free eligibility check](/free-check)
```

### JSON-LD (in `<head>`)
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Do I need a lawyer to fight a speeding ticket in Calgary?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Not required, but recommended. Professional representation increases success rates by 40%. Fabsy's licensed paralegals handle Calgary traffic tickets daily and know the local courts well."
      }
    }
  ]
}
</script>
```

**Note:** FAQ text is IDENTICAL in HTML and JSON-LD.

---

## 15. Common Mistakes to Avoid

### ❌ Don't Do This
1. Different FAQ wording in HTML vs JSON-LD
2. Long, academic answers (>50 words)
3. Generic content without Alberta specifics
4. Burying the answer at the end
5. Missing meta descriptions or going over 155 chars
6. No structured data / invalid JSON-LD
7. CTA below the fold
8. Slow mobile load times (>3s)

### ✅ Do This Instead
1. Copy FAQ text exactly between HTML and JSON-LD
2. Direct answers first, 20-50 words
3. Local examples, court names, city references
4. Hook sentence first (one-sentence answer)
5. Test meta lengths, stay under limits
6. Validate JSON-LD with Google Rich Results tool
7. CTA above fold with minimal form
8. Optimize images, lazy load, cache

---

## 16. Questions for ChatGPT Review

When sharing this document with ChatGPT for AEO plan evaluation, ask:

1. **Content Structure:** Does our answer-first template align with latest AEO best practices?

2. **FAQ Strategy:** Is exact wording matching between HTML/JSON-LD still the most critical factor?

3. **Word Count:** Are 350-600 words optimal, or should we adjust?

4. **AI Functions:** What additional content generation functions would improve coverage?

5. **Voice Search:** What query patterns are we missing for Alberta traffic tickets?

6. **Competitive Analysis:** Based on this setup, what gaps exist vs competitors?

7. **Schema Markup:** Are there additional schema types we should implement?

8. **Local SEO:** How can we better optimize for city-specific queries?

9. **Validation:** What additional pre-publish checks should we add?

10. **Measurement:** What metrics/tools should we prioritize for tracking AEO success?

---

## Conclusion

Fabsy's AEO implementation follows best practices for AI search optimization with a strong focus on:
- **Direct answers** (hook-first structure)
- **Exact matching** (HTML/JSON-LD consistency)
- **Local relevance** (Alberta-specific content)
- **Automation** (7 AI edge functions)
- **Quality control** (validation before publishing)

Our goal: Become the #1 AI-cited source for Alberta traffic ticket help.

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-01  
**Contact:** Via fabsy.ca
