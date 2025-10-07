# Internal Linking System Deployment Guide

This document outlines how to deploy and use the AEO-optimized internal linking system for Fabsy's Alberta traffic ticket content pages.

## ✅ System Overview

The internal linking system automatically generates contextual links between Alberta city landing pages and hub content to strengthen entity/topic signals for AEO. It follows the strategy outlined in Block 8 of the AEO snapshot.

### Key Features

- **Automatic sibling linking**: Links between same-city, different-offence pages
- **Hub page integration**: Strategic links to foundation content pages
- **Smart anchor generation**: Context-aware anchor text using templates
- **Placement rules**: Links inserted at optimal locations (intro, FAQ, pre-CTA)
- **Validation & safeguards**: Prevents broken links, duplicates, and excessive linking

## 📁 System Architecture

```
src/
├── config/
│   └── internalLinking.ts     # Configuration & types
├── lib/
│   ├── internalLinkGenerator.ts  # Core generator logic
│   └── linkInsertion.ts          # HTML insertion system
└── hooks/
    └── useInternalLinks.ts       # React hook (future)

scripts/
├── generate-internal-links.cjs  # Main automation script
└── test-internal-links.cjs      # Test with mock data

data/
├── hub-pages-sample.json        # Sample hub page content
└── test-internal-links.json     # Test results
```

## 🔧 Configuration

### Hub Pages (`internalLinkingConfig.hub_pages`)

Four foundation hub pages provide topical depth:

1. **Alberta Tickets 101** (foundation role)
   - `/content/alberta-tickets-101`
   - Covers: how tickets work, options, deadlines

2. **Demerits & Insurance Alberta** (risk role)
   - `/content/demerits-and-insurance-alberta`
   - Covers: point system, insurance impact, avoidance

3. **Photo Radar vs Officer Alberta** (photo-radar role)
   - `/content/photo-radar-vs-officer-alberta`
   - Covers: differences, defense strategies

4. **Court Options & Deadlines Alberta** (procedural role)
   - `/content/court-options-and-deadlines-alberta`
   - Covers: court procedures, timelines, preparation

### Offence Mapping (`offence_map`)

Each offence type is mapped to:
- **Siblings**: Up to 2 related offences for same-city crosslinks
- **Hub**: One foundation hub for topical depth

Example:
```typescript
"speeding": {
  siblings: ["red-light", "following-too-close"],
  hub: "risk"  // Links to demerits-and-insurance hub
}
```

### Anchor Templates

Dynamic anchor text generation:
- **Sibling links**: `"Fix a {OffenceB} ticket in {City}"`
- **Hub links**: `"Learn more: {HubAnchor}"`

## 🚀 Deployment Steps

### Step 1: Create Hub Pages

Use the sample content in `data/hub-pages-sample.json` to create the 4 hub pages in your CMS:

```bash
# Hub pages needed:
/content/alberta-tickets-101
/content/demerits-and-insurance-alberta
/content/photo-radar-vs-officer-alberta
/content/court-options-and-deadlines-alberta
```

Each hub should include:
- Rich, helpful content about the topic
- FAQ sections with schema markup
- Internal links out to city landing pages

### Step 2: Set Environment Variables

```bash
export VITE_SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
```

### Step 3: Run Initial Generation

```bash
# Test the system first
node scripts/test-internal-links.cjs

# Run full generation (requires database access)
node scripts/generate-internal-links.cjs
```

### Step 4: Schedule Automation

Set up the automation to run nightly and on content publish:

```bash
# Crontab entry for nightly run at 2 AM
0 2 * * * cd /path/to/fabsy && node scripts/generate-internal-links.cjs

# Or integrate with your CI/CD pipeline
```

## 📊 Test Results

The test script with mock data shows the system working correctly:

```
Pages processed: 5
Pages with links: 5
Total links generated: 12
Sibling links: 7
Hub links: 5
```

### Example Generated Links

**Calgary Speeding Ticket Page** gets:
- Sibling: "Fix a Red Light ticket in Calgary" → `/content/fight-red-light-ticket-calgary`
- Hub: "Learn more: Avoiding insurance hikes" → `/content/demerits-and-insurance-alberta`

**Calgary Red Light Ticket Page** gets:
- Sibling: "Fix a Careless Driving ticket in Calgary"
- Sibling: "Fight Speeding in Calgary"
- Hub: "Learn more: How Alberta traffic tickets actually work"

## 🎯 AEO Impact

### Expected Benefits

1. **Entity Signal Strengthening**
   - City-offence entity relationships reinforced
   - Topical authority through hub connections
   - Geographic clustering (same-city links)

2. **Crawl Path Improvement**
   - Better page discovery by search engines
   - Reduced orphan pages
   - Strategic link distribution

3. **Featured Snippet Eligibility**
   - Hub pages optimized for answer box capture
   - FAQ sections with proper schema markup
   - Contextual relevance signals

### Success Metrics

Track these KPIs after deployment:

- **Position improvements** for pages ranking 12-25
- **Featured snippet captures** from hub pages
- **Click-through rates** on internal links
- **Crawl depth** reduction in GSC
- **Entity recognition** improvements in SERP features

## 🔄 Maintenance

### Adding New Cities/Offences

1. Update `offence_map` in `internalLinking.ts`
2. Add human-readable names to `offenceHumanMap`
3. Test with new mock data
4. Deploy and monitor results

### Monitoring & Optimization

- **Weekly**: Review link insertion logs for errors
- **Monthly**: Analyze CTR and position changes
- **Quarterly**: A/B test anchor text variations

### Troubleshooting

Common issues and solutions:

- **No links generated**: Check page metadata extraction from URLs
- **Broken targets**: Verify hub pages exist and are published
- **Duplicate links**: Review safeguard rules and existing content
- **Long anchor text**: Links over 80 chars are automatically rejected

## 📈 Next Steps

### Immediate (Week 1-2)
- [x] Complete system implementation
- [ ] Deploy hub pages with rich content
- [ ] Run initial link generation
- [ ] Submit hub pages for indexing

### Short-term (Month 1)
- [ ] Monitor position changes for target pages
- [ ] A/B test anchor text variations
- [ ] Expand to additional offence types

### Long-term (Month 2-3)
- [ ] Scale to other provinces (Ontario, BC)
- [ ] Add seasonal/temporal linking patterns
- [ ] Integrate with content recommendation engine

---

## 📞 Support

For questions or issues with the internal linking system:

1. Check the test script output: `node scripts/test-internal-links.cjs`
2. Review logs in `data/internal-links-generated.json`
3. Validate configuration in `src/config/internalLinking.ts`

The system is designed to be safe and conservative - it won't break existing content and includes comprehensive validation to prevent issues.