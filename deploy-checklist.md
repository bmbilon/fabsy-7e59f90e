# Deploy checklist — AEO schema components & pages

1. Apply files:
   - src/components/FAQSchema.tsx
   - src/components/HowToSchema.tsx
   - src/components/ArticleSchema.tsx
   - src/components/FAQSection.tsx
   - update AIQuestionWidget per src/patches/AIQuestionWidget_UPDATE.md
   - insert ContentPage snippet per src/patches/ContentPage_UPDATE.md
   - update/replace pages: src/pages/FAQ.tsx and src/pages/HowItWorks.tsx

2. Local test:
   - npm install
   - npm run dev
   - Visit /faq and /how-it-works to verify visible FAQ UI and content.

3. Build & verify SSG/SSR:
   - npm run build
   - Inspect dist/ or generated HTML for:
     - <script type="application/ld+json"> containing FAQPage / HowTo / Article JSON-LD in <head>
     - Hook / first visible answer present above the fold for AEO pages

4. CI (optional but recommended):
   - Add the validate-faq-parity.js script to scripts/ and run in CI:
     node scripts/validate-faq-parity.js ssg-pages/*.json
   - Fail build if parity check fails.

5. Deployment:
   - Merge PR after CI passes
   - Deploy site
   - Submit updated sitemap.xml to Google Search Console

6. Post-deploy checks:
   - Check live page HTML for JSON-LD in head
   - Use Google Rich Results testing tool & Lighthouse
   - Monitor Search Console for indexing / rich result status
