# AEO On-Page Patterns + FAQ/PAA Implementation Guide

This document outlines the complete implementation of Block 9 from your AEO snapshot: standardized on-page patterns and FAQ/PAA question bank system for Alberta traffic ticket content pages.

## ✅ **System Overview**

The AEO On-Page system creates consistent, search engine optimized patterns for all Alberta content pages while maintaining the flexibility to customize for different cities and offence types. It's designed to maximize featured snippet eligibility and improve AEO performance.

### **Key Components Implemented**

1. **📋 AEO Pattern Configuration** (`src/config/aeoPatterns.ts`)
2. **🔧 Content Standardization Engine** (`src/lib/contentStandardizer.ts`)
3. **🤖 AEO Standardizer Automation** (`scripts/aeo-standardizer.cjs`)
4. **📄 Sample Implementation** (`data/sample-aeo-page-calgary-speeding.html`)

## 🎯 **AEO Patterns Implemented**

### **Title Pattern**
```
{Offence} Ticket in {City}: Can You Fight It? | Fabsy
```
**Examples:**
- "Speeding Ticket in Calgary: Can You Fight It? | Fabsy" ✅ 55 chars
- "Red Light Ticket in Edmonton: Can You Fight It? | Fabsy" ✅ 58 chars

### **H1 Pattern**
```
Got a {Offence} Ticket in {City}?
```
**Examples:**
- "Got a Speeding Ticket in Calgary?" ✅ 35 chars
- "Got a Red Light Ticket in Edmonton?" ✅ 36 chars

### **H2 Block Structure**
1. `Can I fight a {offence} ticket in {City}?`
2. `What to do next (60-second answer)`
3. `{City} {offence} penalties & demerits`
4. `Your options before court day`
5. `Frequently asked questions: {City} {offence}`

### **Meta Description Pattern**
```
{Offence} ticket in {City}? Fabsy is a traffic ticket agent service, not a law firm. Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.
```

## 📚 **FAQ/PAA Question Bank**

### **Generic Questions (All Offences)**
1. "Can I fight a {offence} ticket in {City}?"
2. "Do I have to go to court for a {offence} ticket in {City}?"
3. "How many demerits for {offence} in {City}?"
4. "Will my insurance go up for a {offence} ticket?"
5. "What's the deadline to act on a {offence} ticket?"

### **Offence-Specific Questions**
- **Speeding:** Photo-radar specifics, fine reduction options
- **Red Light:** Camera vs officer-issued differences
- **Distracted Driving:** Negotiation possibilities
- **Careless Driving:** Criminal vs traffic clarification
- **Seatbelt:** Insurance impact details

### **City Tone Guidelines**
- **Calgary:** Explicit city mentions in H1, Answer Box, first paragraph
- **Edmonton:** Mirror user phrasing like "Edmonton speeding ticket options"
- **Smaller Cities:** Note that small-city tickets can still be resolved

## 🔧 **Technical Implementation**

### **Pattern Generation System**

```typescript
// Generate standardized content for any city/offence combination
const tokens: AEOPageTokens = {
  City: "Calgary",
  Offence: "Speeding", 
  offence: "speeding"
};

const content = generatePageContent(tokens);
// Returns: title, h1, h2_blocks, meta_description, faqs, schema, etc.
```

### **FAQ Schema Generation**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Can I fight a speeding ticket in Calgary?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Often, yes. Many cases can be resolved to avoid a conviction that affects your record or insurance."
      }
    }
  ]
}
```

### **Content Validation System**

- ✅ **Title Length:** 45-62 characters
- ✅ **H1 Length:** ≤65 characters  
- ✅ **Meta Description:** 120-160 characters
- ✅ **FAQ Schema:** 2-3 questions for Rich Results
- ✅ **On-Page FAQs:** 3 questions (1 generic + 2 offence-specific)

## 🤖 **Automation Features**

### **AEO Standardizer Script**

The automation script (`aeo-standardizer.cjs`) provides:

- **🔍 Content Auditing:** Analyzes existing pages against AEO standards
- **📊 Scoring System:** 100-point scale with detailed issue breakdown
- **🎯 Priority Identification:** Highlights pages most needing AEO work
- **📈 Recommendations:** Actionable steps to improve each page
- **📋 Reporting:** Comprehensive reports with statistics and trends

### **Sample Audit Results**

```
📊 Score Distribution:
   Average score: 77.7/100
   High (90+): 0 pages
   Medium (70-89): 3 pages  
   Low (<70): 0 pages

⚠️ Common Issues:
   AEO: Meta description could be optimized with AEO pattern (3 pages)
   AEO: Title does not match AEO pattern (2 pages)
   AEO: Missing FAQ section for featured snippet optimization (2 pages)
   AEO: Missing Answer Box module (2 pages)
```

## 📄 **Above-the-Fold Requirements**

Every AEO-optimized page includes:

1. **✅ Standardized H1** following the pattern
2. **✅ Answer Box Module** directly below H1 with:
   - Content snippet using the pattern
   - Primary CTA visible without scrolling
   - City + offence echoed prominently
3. **✅ First Paragraph** includes exact "ticket" + "{offence}" + "{City}" terms

### **Answer Box Example**

```html
<div class="answer-box" data-city="Calgary" data-offence="speeding">
  <p>Short answer: Options may be available for a Calgary speeding ticket before your court date. Upload your ticket and Fabsy can review the available information and discuss next steps.</p>
  <button class="cta-primary">Request a ticket review</button>
</div>
```

## 🎯 **AEO Benefits & Expected Impact**

### **Featured Snippet Optimization**
- **Structured FAQ Schema:** Targets People Also Ask boxes
- **Answer Box Format:** Optimized for direct answer snippets  
- **Question-Answer Patterns:** Mirror common search queries
- **Local Entity Signals:** Strong city-offence relationships

### **Search Performance Improvements**
- **Consistent Title Patterns:** Better CTR and recognition
- **Keyword Mirroring:** Exact match for user queries
- **Local Relevance:** City-specific optimization
- **Schema Markup:** Enhanced rich results eligibility

### **Content Quality Standards**
- **Minimum 500 Words:** Adequate coverage without bloat
- **Scannable Format:** Clear H2 structure and bullet points
- **Legal Compliance:** Consistent disclaimers
- **CTA Optimization:** Strategic placement with clear, compliant messaging

## 🚀 **Deployment Checklist**

### **Phase 1: Core Implementation**
- [x] AEO pattern configuration system
- [x] Content standardization engine  
- [x] FAQ/PAA question bank
- [x] Automation script for auditing
- [x] Sample page implementation

### **Phase 2: Content Application** 
- [ ] Apply patterns to top 20 Alberta landing pages
- [ ] Add Answer Box modules to all pages
- [ ] Implement 3 FAQs per page with schema
- [ ] Update meta descriptions with patterns
- [ ] Add legal disclaimer snippets

### **Phase 3: Validation & Testing**
- [ ] Test FAQ schema with Rich Results Test
- [ ] Validate title/H1 lengths across all pages  
- [ ] Ensure canonical URLs and robots meta
- [ ] Submit updated pages to GSC for indexing
- [ ] Monitor featured snippet appearances

## 📊 **Success Metrics**

Track these KPIs after deployment:

### **Technical Metrics**
- **✅ 100% pages** pass AEO validation (score ≥90)
- **✅ 100% pages** include Answer Box modules
- **✅ 100% pages** have 3+ FAQs with schema markup
- **✅ Schema validation** passes Rich Results Test

### **Search Performance Metrics**
- **📈 Featured snippet captures** for target Alberta queries
- **📈 CTR improvements** on standardized titles
- **📈 Position improvements** for pages in ranks 12-25
- **📈 Local entity recognition** in SERPs

### **Content Quality Metrics** 
- **⏱️ Reduced bounce rate** from better above-fold content
- **🎯 Increased engagement** with Answer Box CTAs
- **📱 Mobile optimization** score improvements
- **🔍 FAQ interaction rates** in Google Analytics

## 🔧 **Usage Examples**

### **Generate Content for New City/Offence**

```typescript
import { generatePageContent, humanizeOffence } from '@/config/aeoPatterns';

// Create content for Red Deer careless driving
const content = generatePageContent({
  City: "Red Deer",
  Offence: humanizeOffence("careless-driving"), // "Careless Driving"
  offence: "careless-driving"
});

console.log(content.title);
// "Careless Driving Ticket in Red Deer: Can You Fight It? | Fabsy"
```

### **Audit Existing Page**

```bash
# Run AEO standardizer
node scripts/aeo-standardizer.cjs

# Check specific page score and recommendations
# Results saved to data/aeo-audit-results.json
```

### **Apply Patterns to Existing Content**

```typescript
import ContentStandardizer from '@/lib/contentStandardizer';

// Standardize existing page
const result = ContentStandardizer.standardizeExistingPage(
  existingHTML,
  "Calgary", 
  "speeding",
  { include_answer_box: true }
);

console.log(result.modifications);
// ["Updated title tag", "Added Answer Box placeholder", "Added FAQ schema"]
```

## 📈 **Next Steps**

### **Immediate (Week 1-2)**
1. Run AEO audit on all Alberta content pages
2. Apply patterns to lowest-scoring pages first  
3. Add FAQ schemas to pages missing them
4. Deploy Answer Box modules site-wide

### **Short-term (Month 1)**
1. Monitor featured snippet captures
2. A/B test anchor text variations in FAQs
3. Expand question bank for more offence types
4. Add seasonal/temporal FAQ variations

### **Long-term (Month 2-3)**
1. Scale patterns to Ontario and BC content
2. Implement dynamic FAQ recommendation system
3. Add user interaction tracking on FAQ sections
4. Integrate with search console API for automated monitoring

---

## 🛠️ **Technical Support**

For issues or questions:

1. **Check the AEO audit:** `node scripts/aeo-standardizer.cjs`
2. **Review patterns:** Check `src/config/aeoPatterns.ts`
3. **Validate schema:** Use Google's Rich Results Test
4. **Sample implementation:** See `data/sample-aeo-page-calgary-speeding.html`

The system is designed to be maintainable and scalable - adding new cities or offences is as simple as updating the configuration and running the standardizer script.

🎯 **The ultimate goal:** Every Alberta traffic ticket landing page follows consistent AEO patterns optimized for featured snippet capture and maximum search visibility.
