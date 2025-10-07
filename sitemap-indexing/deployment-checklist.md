# Alberta City Expansion - Sitemap & Indexing Checklist

## Pre-Deployment
- [ ] Review generated sitemap entries for accuracy
- [ ] Validate all 29 URLs are properly formatted
- [ ] Backup existing sitemap-content.xml
- [ ] Test sitemap XML syntax

## Deployment Steps
1. **Integrate Sitemap**
   ```bash
   node sitemap-indexing/integrate-sitemap.cjs
   ```

2. **Update Robots.txt**
   - Add content from robots-txt-additions.txt to main robots.txt
   - Verify sitemap reference is correct

3. **Submit to GSC**
   - Configure GSC API credentials
   - Run submission script: `node sitemap-indexing/submit-to-gsc.cjs`
   - Submit updated sitemap-content.xml to GSC

## Phase 1 Submission (Week 1-2)
Cities: Grande Prairie, Spruce Grove, Wetaskiwin, Camrose, Cold Lake
- [ ] Submit 15 URLs to GSC
- [ ] Monitor daily for first impressions
- [ ] Track indexation rate

## Phase 2 Submission (Week 3-4)  
Cities: Canmore, High River, Okotoks, Lloydminster, Strathmore
- [ ] Submit 14 URLs to GSC
- [ ] Continue daily monitoring
- [ ] Compare indexation rates between phases

## Success Metrics
- **Target:** 100% indexation within 14 days
- **KPI:** Each city shows first impressions within 7 days
- **Monitor:** GSC Search Analytics for new URL impressions

## Files Created
- sitemap-city-expansion.xml (29 URLs)
- gsc-indexing-plan.json (phased submission strategy)
- integrate-sitemap.cjs (deployment script)
- submit-to-gsc.cjs (GSC submission template)
- robots-txt-additions.txt (crawler guidance)
