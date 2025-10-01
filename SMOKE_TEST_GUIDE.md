# AEO Pipeline Smoke Test Guide

## Overview

This guide walks you through testing the complete end-to-end AEO content pipeline to ensure everything works before scaling content production.

## Pipeline Flow

```
User Query
    ↓
[analyze-ticket-ai] → Generate ai_answer + page_json
    ↓
[upsert-page-content] → Save to database (status: draft/published)
    ↓
[sync-pages-from-db.js] → Read DB → Write JSON files
    ↓
[generate-routes.js] → Create routes manifest
    ↓
[validate-faq-jsonld.js] → Validate FAQ text equality
    ↓
[npm run build] → SSG build
    ↓
Deployed Site → Content live and crawlable
```

## Prerequisites

1. **Environment Variables Set**:
   ```bash
   # Check .env file
   VITE_SUPABASE_URL=https://gcasbisxfrssonllpqrw.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<your-key>
   ```

2. **Supabase Secrets Configured**:
   - `LOVABLE_API_KEY` - For AI gateway
   - `RESEND_API_KEY` - For emails (optional for this test)

3. **Dependencies Installed**:
   ```bash
   npm install
   ```

## Quick Smoke Test (Automated)

Run the automated smoke test script:

```bash
node scripts/smoke-test-aeo.js
```

**What it tests**:
- ✅ AI function generates valid content
- ✅ Disclaimer is present
- ✅ Page saves to database
- ✅ FAQs are plain text (no HTML)
- ✅ FAQs are trimmed (no whitespace)
- ✅ JSON file is created
- ✅ FAQ JSON-LD validation passes

**Expected Output**:
```
🧪 Starting AEO Pipeline Smoke Test

📝 Step 1: Calling analyze-ticket-ai...
  ✅ AI generated content successfully
  📄 Hook: "You may be able to dispute..."
  📝 FAQs: 6 questions
  ✅ Disclaimer present in AI answer

💾 Step 2: Saving to database via upsert-page-content...
  ✅ Page saved to database: smoke-test-1234567890

🔍 Step 3: Verifying in database...
  ✅ Page found in database
  📊 Fields: id, slug, meta_title, ...
  ✅ 6 FAQs validated (plain text, no HTML)

📁 Step 4: Simulating sync-pages-from-db...
  ✅ JSON file created: src/content/pages/smoke-test-1234567890.json

🔍 Step 5: Validating FAQ JSON-LD equality...
  ✅ All FAQs pass JSON-LD equality validation

🗺️  Step 6: Generating route entry...
  ✅ Route: /smoke-test-1234567890

============================================================
✅ SMOKE TEST PASSED - All steps completed successfully!
============================================================
```

## Manual Step-by-Step Test

If you prefer to test each component manually:

### Step 1: Test AI Analysis Function

```bash
curl -X POST "https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/analyze-ticket-ai" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "question": "Can I dispute a speeding ticket in Calgary?",
    "ticketData": {
      "city": "Calgary",
      "charge": "Speeding 20km over",
      "fine": "$150"
    }
  }'
```

**Verify**:
- Returns `ai_answer` object with hook, explain, faqs, disclaimer
- Returns `page_json` object with all required fields
- FAQs in both outputs are identical plain text

### Step 2: Test Page Upsert

Save the `page_json` from step 1 to a file (e.g., `test-page.json`), then:

```bash
curl -X POST "https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/upsert-page-content" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d @test-page.json
```

**Verify**:
- Returns `{ success: true, slug: "...", data: {...} }`
- Check Supabase dashboard: page appears in `page_content` table

### Step 3: Test Database Sync

```bash
node scripts/sync-pages-from-db.js
```

**Verify**:
- Console shows: `✓ Wrote <slug>.json`
- File exists: `src/content/pages/<slug>.json`
- JSON structure matches database row

### Step 4: Test Route Generation

```bash
node scripts/generate-routes.js
```

**Verify**:
- Console shows: `✅ Generated N route(s)`
- File exists: `src/content/routes-manifest.json`
- Contains your test page slug

### Step 5: Test FAQ Validation

```bash
node ci/validate-faq-jsonld.js
```

**Verify**:
- Console shows: `✓ <slug>.json: N FAQ(s) validated`
- No errors about HTML or whitespace

### Step 6: Test Build

```bash
npm run build
```

**Verify**:
- Build completes without errors
- `dist/` folder contains built files
- Test page is included in build

### Step 7: Test in Browser

```bash
npm run dev
```

Visit: `http://localhost:5173/<your-test-slug>`

**Verify**:
- Page renders correctly
- Hook appears first
- FAQs are displayed
- Disclaimer is visible
- JSON-LD script is in page source (view source)

## Common Issues & Solutions

### Issue: "LOVABLE_API_KEY is not configured"

**Solution**: Add the secret in Supabase:
```bash
# In Supabase dashboard:
Project Settings → Edge Functions → Secrets → Add LOVABLE_API_KEY
```

### Issue: "No pages found in database"

**Solution**: Ensure you've run the upsert function with `status: 'published'`:
```json
{
  "slug": "test-page",
  "status": "published",
  ...
}
```

### Issue: "FAQ contains HTML"

**Solution**: FAQs must be plain text. Remove all HTML tags:
```javascript
// ❌ Wrong
{ "q": "How long?", "a": "<p>You have 30 days</p>" }

// ✅ Correct
{ "q": "How long?", "a": "You have 30 days" }
```

### Issue: "Page not appearing in build"

**Solution**: 
1. Check `status` is 'published' in database
2. Run sync script: `node scripts/sync-pages-from-db.js`
3. Check JSON file exists in `src/content/pages/`
4. Re-run build: `npm run build`

### Issue: Build fails with "module not found"

**Solution**: Install dependencies:
```bash
npm install
```

## Success Criteria

Your smoke test is successful when:

- ✅ AI function returns valid dual output
- ✅ Page saves to database correctly
- ✅ Sync script creates JSON file
- ✅ Routes are generated
- ✅ FAQ validation passes
- ✅ Build completes without errors
- ✅ Page renders in browser
- ✅ JSON-LD is present in page source

## Production Checklist

Before scaling content production:

- [ ] Smoke test passes with published pages
- [ ] Smoke test passes with draft pages (not synced)
- [ ] Test human QA workflow (draft → published)
- [ ] Test CI/CD pipeline on GitHub
- [ ] Verify email notifications work
- [ ] Test analytics tracking
- [ ] Test lead capture form
- [ ] Verify disclaimer appears everywhere
- [ ] Check mobile responsiveness
- [ ] Test with real ticket data

## Cleanup After Testing

Remove test pages:

```sql
-- In Supabase SQL Editor
DELETE FROM page_content WHERE slug LIKE 'smoke-test-%';
```

Remove test JSON files:
```bash
rm src/content/pages/smoke-test-*.json
```

Re-generate routes:
```bash
node scripts/generate-routes.js
```

## Next Steps

Once smoke test passes:

1. **Scale Content Production**:
   - Use AI helper in production
   - Generate city-specific pages
   - Create pillar content pages

2. **Monitor Analytics**:
   - Check `/admin/aeo` dashboard
   - Track AI query volume
   - Monitor conversion rates

3. **Iterate & Improve**:
   - Review AI outputs weekly
   - Refine system prompt
   - Update FAQ quality
   - A/B test conversion forms

## Support

If you encounter issues not covered in this guide:

1. Check edge function logs:
   - [analyze-ticket-ai logs](https://supabase.com/dashboard/project/gcasbisxfrssonllpqrw/functions/analyze-ticket-ai/logs)
   - [upsert-page-content logs](https://supabase.com/dashboard/project/gcasbisxfrssonllpqrw/functions/upsert-page-content/logs)

2. Check database:
   - [View page_content table](https://supabase.com/dashboard/project/gcasbisxfrssonllpqrw/editor)
   - Run queries to inspect data

3. Review documentation:
   - `IMPLEMENTATION_SUMMARY.md`
   - `GOVERNANCE_AND_SAFETY.md`
   - `AEO_ANALYTICS.md`
