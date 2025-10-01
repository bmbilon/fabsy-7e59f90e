# AEO/AIO SSG Setup Guide

## Overview
This setup implements Static Site Generation (SSG) for AEO-optimized content pages using vite-ssg. Pages are prerendered at build time with full SEO metadata and JSON-LD schemas.

## How It Works

### 1. Content Sync (Build Time)
- `scripts/sync-pages-from-db.js` fetches published pages from Supabase
- Writes JSON files to `src/content/pages/*.json`
- Requires `SUPABASE_SERVICE_ROLE_KEY` environment variable

### 2. Route Generation (Build Time)
- `scripts/generate-routes.js` reads the JSON files
- Creates `src/content/routes-manifest.json` with all routes

### 3. Page Rendering
- `src/pages/ContentPage.tsx` dynamically loads content from JSON files
- Includes react-helmet-async for SEO meta tags
- Generates FAQ and Video JSON-LD schemas automatically

## Required Package.json Changes

**IMPORTANT:** You need to manually update your `package.json` scripts section:

```json
{
  "scripts": {
    "dev": "vite",
    "prebuild": "node scripts/sync-pages-from-db.js && node scripts/generate-routes.js",
    "build": "npm run prebuild && vite build",
    "preview": "vite preview"
  }
}
```

The key changes:
- Added `prebuild` script that syncs pages and generates routes
- Modified `build` to run `prebuild` first

## Environment Variables

### Local Development
For local builds, set:
```bash
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
```

### CI/CD (GitHub Actions)
Already configured in `.github/workflows/build.yml`. Add these secrets to your GitHub repository:
- `SUPABASE_URL` (already set)
- `SUPABASE_SERVICE_ROLE_KEY` (needs to be added)

## Creating Content Pages

### Via Supabase Database
1. Insert content into the `page_content` table
2. Required fields:
   - `slug` - URL slug (e.g., "fight-speeding-ticket-calgary")
   - `meta_title` - SEO title
   - `meta_description` - SEO description
   - `h1` - Page headline
   - `hook` - Opening paragraph
   - `bullets` - JSON array of key points
   - `what` - HTML content for "What" section
   - `how` - HTML content for "How" section
   - `next` - HTML content for "Next Steps"
   - `faqs` - JSON array of `{q, a}` objects
   - `video` - JSON object with `youtubeUrl` and `transcript`

### Example Content
```json
{
  "slug": "fight-speeding-ticket-calgary",
  "meta_title": "Fight a Speeding Ticket in Calgary | Fabsy",
  "meta_description": "Dispute a speeding ticket in Calgary. Get a free eligibility check.",
  "h1": "How to Fight a Speeding Ticket in Calgary",
  "hook": "You may be able to dispute your speeding ticket — start with a free eligibility check.",
  "bullets": [
    "Request disclosure to review evidence",
    "Gather photos and witness details",
    "Many cases resolve without trial"
  ],
  "what": "<p>Fighting a ticket means formally disputing the charge...</p>",
  "how": "<p>Step 1: Request disclosure. Step 2: Gather evidence...</p>",
  "next": "<p>Upload a photo of your ticket for a free eligibility check.</p>",
  "faqs": [
    {
      "q": "Do I need to go to court?",
      "a": "Not always. You can pay the fine or request a trial..."
    }
  ],
  "video": {
    "youtubeUrl": "https://youtube.com/watch?v=...",
    "transcript": "..."
  }
}
```

## Accessing Pages

Once built, pages are accessible at:
```
https://yoursite.com/content/{slug}
```

Example:
```
https://fabsy.ca/content/fight-speeding-ticket-calgary
```

## SEO Features

### Automatic JSON-LD Generation
- FAQ schema for all FAQ sections
- Video schema for video content
- Exact text matching between HTML and JSON-LD

### Meta Tags
- Title and description tags
- Open Graph tags
- Canonical URLs

### Page Structure
- Semantic HTML5
- Proper heading hierarchy (H1 → H2 → H3)
- Accessible markup

## Testing

### Test Locally
```bash
# 1. Set environment variable
export SUPABASE_SERVICE_ROLE_KEY="your_key"

# 2. Run build
npm run build

# 3. Preview
npm run preview
```

### Test Content Page
Visit `http://localhost:4173/content/fight-speeding-ticket-calgary`

### Validate JSON-LD
Use Google's Rich Results Test:
https://search.google.com/test/rich-results

## Troubleshooting

### "No pages found"
- Check that `page_content` table has rows
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly

### "Module not found" errors
- Run `npm run prebuild` manually
- Check that JSON files exist in `src/content/pages/`

### Build fails in CI
- Verify GitHub secrets are set
- Check Actions logs for specific errors

## Next Steps

1. **Update package.json** (see above)
2. **Add GitHub secret** for `SUPABASE_SERVICE_ROLE_KEY`
3. **Create content** in Supabase `page_content` table
4. **Test build** locally
5. **Deploy** and verify pages are accessible

## Files Created

- `scripts/sync-pages-from-db.js` - Syncs pages from Supabase
- `scripts/generate-routes.js` - Generates route manifest
- `src/pages/ContentPage.tsx` - Dynamic page component
- `src/content/pages/*.json` - Page content (generated at build)
- `src/content/routes-manifest.json` - Routes list (generated at build)
- `.github/workflows/build.yml` - CI/CD configuration (updated)

## Architecture

```
┌─────────────────────┐
│ Supabase Database   │
│  page_content table │
└──────────┬──────────┘
           │
           │ Build Time
           ▼
┌─────────────────────┐
│ sync-pages-from-db  │
│   (Node script)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ JSON files created  │
│ src/content/pages/  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ generate-routes     │
│   (Node script)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ routes-manifest.json│
└──────────┬──────────┘
           │
           │ Runtime
           ▼
┌─────────────────────┐
│   ContentPage.tsx   │
│ Loads JSON + renders│
└─────────────────────┘
```

## Support

For issues or questions, check:
1. Build logs for specific errors
2. Browser console for runtime errors
3. Supabase logs for database issues
