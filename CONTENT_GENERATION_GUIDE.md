# AEO Content Generation Guide for Fabsy.ca

## Overview
This guide explains how to generate and publish AEO-optimized content pages using AI and the Supabase backend.

## 1. AI Content Generation Prompt

Use this exact prompt in your AI tool to generate content JSON:

```
You are an AEO content generator for fabsy.ca (Alberta traffic-ticket agent services).
Produce EXACT JSON only (no extra text) with these fields:

{
  "slug": "<url-friendly-slug>",
  "meta_title": "<<=60 chars>",
  "meta_description": "<<=155 chars>",
  "h1": "<Page H1>",
  "hook": "<One-sentence direct answer; FIRST visible text on page>",
  "bullets": ["short fact 1", "short fact 2", ...],            // 3-6 items
  "what": "<2-4 short paragraphs as HTML string (use <p>)>",
  "how": "<2-4 short paragraphs as HTML string>",
  "next": "<2-4 short paragraphs as HTML string>",
  "faqs": [{"q":"Question text?","a":"20-50 word answer starts with the short answer sentence."}, ...], // 6 items min
  "video": {"youtubeUrl":"","transcript":""}                   // optional
}

Rules:
1) Hook must be a single sentence, plain text, and start with an answer word like "You may", "You can", "Often".
2) Each FAQ answer must start with a short direct answer sentence and be 20-50 words.
3) No HTML tags inside FAQ q/a strings (plain text only).
4) Keep meta lengths under the limits.
5) Output valid JSON only, minified or pretty is OK.
6) Fabsy is an agent service, not a law firm.
7) If pricing is mentioned, use exactly: "Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced."
8) Do not use "no win no fee", "risk-free", "money back", "guarantee", "zero-risk", or em dashes. Do not invent fines, demerits, deadlines, insurance figures, turnaround times, or outcomes.

Example topic: "How to fight a traffic ticket in Alberta"
```

## 2. Publishing Content

### Option A: Using curl (Terminal)

```bash
curl -X POST "https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/upsert-page-content" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_PRESHARED_KEY" \
  -d @ai_output.json
```

### Option B: Using JavaScript

```javascript
const EDGE_URL = "https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/upsert-page-content";
const ADMIN_KEY = "YOUR_ADMIN_PRESHARED_KEY";

const aiJson = {
  // paste AI-generated JSON here
};

const res = await fetch(EDGE_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-admin-key": ADMIN_KEY
  },
  body: JSON.stringify(aiJson)
});

const result = await res.json();
console.log(result);
```

## 3. Example Payloads

### Pillar Page Example
```json
{
  "slug": "how-to-fight-a-traffic-ticket-in-alberta",
  "meta_title": "How to Fight a Traffic Ticket in Alberta | Fabsy",
  "meta_description": "Start here: how to dispute a traffic ticket in Alberta with a free eligibility check from Fabsy.",
  "h1": "How to Fight a Traffic Ticket in Alberta",
  "hook": "You may be able to dispute a traffic ticket in Alberta; start with a free eligibility check.",
  "bullets": [
    "Request disclosure to review evidence",
    "Gather photos, dashcam, and witness details",
    "Many cases resolve without trial",
    "Local courts have specific timelines",
    "Fabsy provides a free eligibility read"
  ],
  "what": "<p>Fighting a ticket means formally disputing the charge. Request disclosure to see the evidence, then decide how to respond.</p>",
  "how": "<p>Step 1: Request disclosure. Step 2: Gather any evidence (photos, witnesses, dashcam). Step 3: Prepare your defence or consult Fabsy for a free eligibility review.</p>",
  "next": "<p>Upload a photo of your ticket for a free eligibility check. After review, Fabsy will explain whether agent services are permitted and available.</p>",
  "faqs": [
    {"q":"Do I need to go to court for a traffic ticket in Alberta?","a":"Not always. You can pay the fine, request a trial, or sometimes settle. Request disclosure if you plan to dispute it."},
    {"q":"How long do I have to request disclosure?","a":"Time limits vary by ticket type; check your ticket and request disclosure promptly to avoid missing deadlines."},
    {"q":"Will fighting a ticket affect my insurance?","a":"Possibly. Insurance impacts depend on your insurer, driving history, and outcome. Confirm the effect with your provider."},
    {"q":"Can I get a reduced fine without a trial?","a":"It may be possible. Available outcomes depend on the allegation, evidence, current procedure, and individual circumstances."},
    {"q":"What evidence helps my case?","a":"Photos, dashcam footage, witness statements, and accurate timestamps are the most useful forms of evidence when disputing a ticket."},
    {"q":"How long does the process take?","a":"Timing varies by matter, court location, and current procedure. Check the ticket and current official court information."}
  ],
  "video": {"youtubeUrl":"","transcript":""}
}
```

### City-Specific Page Example
```json
{
  "slug": "fight-speeding-ticket-calgary",
  "meta_title": "Fight a Speeding Ticket in Calgary | Fabsy",
  "meta_description": "Local guide to fighting a speeding ticket in Calgary. Request disclosure, gather evidence, and get a free eligibility check.",
  "h1": "How to Fight a Speeding Ticket in Calgary",
  "hook": "You may be able to dispute a speeding ticket in Calgary; request disclosure and start a free eligibility check.",
  "bullets": [
    "Request disclosure from Calgary Traffic Court",
    "Local court names and addresses included",
    "Many cases reduced without trial",
    "Gather dashcam and photo evidence",
    "Fabsy offers free eligibility reviews"
  ],
  "what": "<p>Localize: mention Calgary Traffic Court, local highways like Deerfoot Trail, and common local enforcement patterns.</p>",
  "how": "<p>Request disclosure, gather city-specific evidence, and consider local representation or Fabsy's free review for Calgary-specific steps.</p>",
  "next": "<p>Upload your ticket photo for a free Calgary eligibility review. Fabsy will explain whether agent services are permitted and available.</p>",
  "faqs": [
    {"q":"What court deals with traffic tickets in Calgary?","a":"The court location is shown on the ticket. Procedures can change, so check the notice and current Alberta Court of Justice information."},
    {"q":"Can I request disclosure online in Calgary?","a":"Available disclosure channels depend on the matter and current court process. Check current official information or ask Fabsy to assess whether it can assist."},
    {"q":"Are Calgary speed camera tickets disputable?","a":"Sometimes. Available response options depend on the notice, evidence, issuer, and current procedure. Review the ticket before deciding."}
  ],
  "video": {"youtubeUrl":"","transcript":""}
}
```

## 4. Build Process

When content is published to the database:

1. **GitHub Actions** runs on push to main
2. **Sync Script** (`scripts/sync-pages-from-db.js`) fetches all published pages from Supabase
3. **JSON Files** are written to `src/content/pages/*.json`
4. **Route Generation** (`scripts/generate-routes.js`) creates `src/content/routes-manifest.json`
5. **Validation** (`ci/validate-faq-jsonld.js`) ensures FAQ text matches JSON-LD exactly
6. **SSG Build** generates static pages

## 5. Content Requirements

### Meta Fields
- **meta_title**: Max 60 characters, include primary keyword
- **meta_description**: Max 155 characters, natural keyword integration
- **h1**: Single H1 per page, matches primary intent

### Hook
- First visible text on page
- Single sentence
- Direct answer starting with "You can", "You may", "Often", etc.
- Plain text only (no HTML)

### Bullets
- 3-6 short facts
- Plain strings in array
- Actionable and specific

### Content Sections (what/how/next)
- 2-4 short paragraphs each
- HTML string with `<p>` tags
- No inline styles

### FAQs
- Minimum 6 questions
- **q**: Plain text question (no HTML)
- **a**: 20-50 words, starts with direct answer sentence (no HTML)
- Must be trimmed (no excess whitespace)

### Video (Optional)
- youtubeUrl: Full YouTube URL
- transcript: Text transcript for accessibility

## 6. Security Notes

- **ADMIN_PRESHARED_KEY** is required for the upsert endpoint
- Store in Supabase secrets or GitHub Actions secrets
- Never commit keys to source control
- Service role key is used in CI for read-only sync

## 7. Troubleshooting

### FAQ Validation Errors
If CI fails with FAQ validation:
- Check for HTML tags in FAQ q/a fields
- Ensure all strings are trimmed
- Verify no excess whitespace

### Page Not Appearing
1. Check database: page should have `slug` in `page_content` table
2. Verify sync script ran successfully in CI
3. Check `src/content/pages/<slug>.json` exists
4. Verify routes manifest includes the page

### Build Failures
- Review GitHub Actions logs
- Check Supabase connection in CI
- Verify all required secrets are set
