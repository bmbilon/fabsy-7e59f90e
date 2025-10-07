import { 
  AEOPageTokens, 
  GeneratedContent, 
  generatePageContent, 
  validateTitle, 
  validateH1,
  generateFAQSchema,
  humanizeOffence,
  getCityToneNote
} from '@/config/aeoPatterns';

export interface PageMetadata {
  title: string;
  meta_description: string;
  canonical_url: string;
  robots: string;
  h1?: string;
  city?: string;
  offence_slug?: string;
}

export interface StandardizedPage {
  metadata: PageMetadata;
  content: GeneratedContent;
  validation: {
    title: { valid: boolean; issues: string[] };
    h1: { valid: boolean; issues: string[] };
    overall_valid: boolean;
    all_issues: string[];
  };
  schema: {
    faq: Record<string, any>;
  };
}

export interface ContentStandardizerOptions {
  include_answer_box?: boolean;
  custom_cta_text?: string;
  additional_faqs?: Array<{ q: string; a: string }>;
  city_tone_override?: string;
}

export class ContentStandardizer {
  /**
   * Generate standardized page content from city and offence
   */
  static generateStandardizedPage(
    city: string,
    offenceSlug: string,
    options: ContentStandardizerOptions = {}
  ): StandardizedPage {
    // Create tokens
    const tokens: AEOPageTokens = {
      City: city,
      Offence: humanizeOffence(offenceSlug),
      offence: offenceSlug
    };

    // Generate content using AEO patterns
    const content = generatePageContent(tokens);

    // Add custom FAQs if provided
    if (options.additional_faqs) {
      content.faqs.push(...options.additional_faqs);
      // Limit to rendering rules count
      content.faqs = content.faqs.slice(0, 3);
    }

    // Create metadata
    const metadata: PageMetadata = {
      title: content.title,
      meta_description: content.meta_description,
      canonical_url: `/content/fight-${offenceSlug}-ticket-${city.toLowerCase().replace(/\s+/g, '-')}`,
      robots: 'index,follow',
      h1: content.h1,
      city,
      offence_slug: offenceSlug
    };

    // Validate content
    const titleValidation = validateTitle(content.title);
    const h1Validation = validateH1(content.h1);
    
    const validation = {
      title: titleValidation,
      h1: h1Validation,
      overall_valid: titleValidation.valid && h1Validation.valid,
      all_issues: [...titleValidation.issues, ...h1Validation.issues]
    };

    // Generate schema
    const schema = {
      faq: generateFAQSchema(content.faq_schema)
    };

    return {
      metadata,
      content,
      validation,
      schema
    };
  }

  /**
   * Apply AEO patterns to existing page content
   */
  static standardizeExistingPage(
    existingContent: string,
    city: string,
    offenceSlug: string,
    options: ContentStandardizerOptions = {}
  ): { 
    standardized_content: string; 
    standardized_page: StandardizedPage;
    modifications: string[];
  } {
    const standardizedPage = this.generateStandardizedPage(city, offenceSlug, options);
    const modifications: string[] = [];

    // Parse existing content (simplified - would use proper HTML parser in production)
    let content = existingContent;

    // Replace or add title
    const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      content = content.replace(titleMatch[0], `<title>${standardizedPage.metadata.title}</title>`);
      modifications.push('Updated title tag');
    } else {
      modifications.push('Added title tag (was missing)');
    }

    // Replace or add meta description
    const metaDescMatch = content.match(/<meta[^>]*name=["']description["'][^>]*>/i);
    if (metaDescMatch) {
      content = content.replace(
        metaDescMatch[0], 
        `<meta name="description" content="${standardizedPage.metadata.meta_description}">`
      );
      modifications.push('Updated meta description');
    } else {
      modifications.push('Added meta description (was missing)');
    }

    // Replace or add canonical URL
    const canonicalMatch = content.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
    const canonicalTag = `<link rel="canonical" href="https://fabsy.ca${standardizedPage.metadata.canonical_url}">`;
    if (canonicalMatch) {
      content = content.replace(canonicalMatch[0], canonicalTag);
      modifications.push('Updated canonical URL');
    } else {
      modifications.push('Added canonical URL (was missing)');
    }

    // Add robots meta if missing
    if (!content.includes('robots')) {
      content = content.replace(
        '</head>', 
        `  <meta name="robots" content="${standardizedPage.metadata.robots}">\n</head>`
      );
      modifications.push('Added robots meta tag');
    }

    // Replace H1 (simplified pattern matching)
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) {
      content = content.replace(h1Match[0], `<h1>${standardizedPage.content.h1}</h1>`);
      modifications.push('Updated H1');
    } else {
      modifications.push('H1 needs to be added');
    }

    // Add Answer Box placeholder (would integrate with existing Answer Box component)
    if (options.include_answer_box && !content.includes('answer-box')) {
      const h1Index = content.indexOf('</h1>');
      if (h1Index !== -1) {
        const insertionPoint = h1Index + 5;
        const answerBoxPlaceholder = `\n\n<!-- Answer Box Module -->\n<div class="answer-box" data-city="${city}" data-offence="${offenceSlug}">\n  ${standardizedPage.content.content_snippet}\n</div>\n\n`;
        content = content.slice(0, insertionPoint) + answerBoxPlaceholder + content.slice(insertionPoint);
        modifications.push('Added Answer Box placeholder');
      }
    }

    // Add FAQ Schema (would integrate with existing JSON-LD system)
    if (!content.includes('"@type": "FAQPage"')) {
      const faqSchemaScript = `\n<script type="application/ld+json">\n${JSON.stringify(standardizedPage.schema.faq, null, 2)}\n</script>\n`;
      content = content.replace('</head>', faqSchemaScript + '</head>');
      modifications.push('Added FAQ schema');
    }

    return {
      standardized_content: content,
      standardized_page: standardizedPage,
      modifications
    };
  }

  /**
   * Audit existing page against AEO standards
   */
  static auditPage(
    pageContent: string,
    expectedCity: string,
    expectedOffence: string
  ): {
    issues: Array<{
      type: 'error' | 'warning' | 'info';
      category: string;
      message: string;
    }>;
    score: number;
    recommendations: string[];
  } {
    const issues: Array<{ type: 'error' | 'warning' | 'info'; category: string; message: string }> = [];
    const recommendations: string[] = [];

    // Check title
    const titleMatch = pageContent.match(/<title[^>]*>(.*?)<\/title>/i);
    if (!titleMatch) {
      issues.push({
        type: 'error',
        category: 'SEO',
        message: 'Missing title tag'
      });
    } else {
      const title = titleMatch[1];
      const validation = validateTitle(title);
      if (!validation.valid) {
        validation.issues.forEach(issue => {
          issues.push({
            type: 'warning',
            category: 'SEO',
            message: `Title: ${issue}`
          });
        });
      }

      // Check if title follows pattern
      if (!title.includes(expectedCity) || !title.includes('Ticket')) {
        issues.push({
          type: 'warning',
          category: 'AEO',
          message: 'Title does not follow AEO pattern'
        });
        recommendations.push('Update title to match AEO pattern: "{Offence} Ticket in {City} — Can You Fight It? | Fabsy"');
      }
    }

    // Check H1
    const h1Match = pageContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (!h1Match) {
      issues.push({
        type: 'error',
        category: 'SEO',
        message: 'Missing H1 tag'
      });
    } else {
      const h1 = h1Match[1];
      const validation = validateH1(h1);
      if (!validation.valid) {
        validation.issues.forEach(issue => {
          issues.push({
            type: 'warning',
            category: 'SEO',
            message: `H1: ${issue}`
          });
        });
      }

      if (!h1.includes(expectedCity)) {
        issues.push({
          type: 'warning',
          category: 'AEO',
          message: 'H1 does not include city name'
        });
      }
    }

    // Check meta description
    const metaDescMatch = pageContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (!metaDescMatch) {
      issues.push({
        type: 'error',
        category: 'SEO',
        message: 'Missing meta description'
      });
    } else {
      const metaDesc = metaDescMatch[1];
      if (metaDesc.length < 120 || metaDesc.length > 160) {
        issues.push({
          type: 'warning',
          category: 'SEO',
          message: `Meta description length: ${metaDesc.length} chars (should be 120-160)`
        });
      }
    }

    // Check canonical URL
    if (!pageContent.includes('rel="canonical"')) {
      issues.push({
        type: 'error',
        category: 'SEO',
        message: 'Missing canonical URL'
      });
    }

    // Check for FAQ schema
    if (!pageContent.includes('"@type": "FAQPage"')) {
      issues.push({
        type: 'info',
        category: 'AEO',
        message: 'Missing FAQ schema - consider adding for featured snippets'
      });
      recommendations.push('Add FAQ schema using standardized questions');
    }

    // Check for Answer Box
    if (!pageContent.includes('answer-box') && !pageContent.includes('data-answer-box')) {
      issues.push({
        type: 'info',
        category: 'AEO',
        message: 'Missing Answer Box module'
      });
      recommendations.push('Add Answer Box module directly below H1');
    }

    // Calculate score (100 - number of errors*10 - warnings*5 - info*1)
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const infoCount = issues.filter(i => i.type === 'info').length;
    
    const score = Math.max(0, 100 - (errorCount * 10) - (warningCount * 5) - (infoCount * 1));

    return {
      issues,
      score,
      recommendations
    };
  }

  /**
   * Generate HTML template for new AEO-optimized page
   */
  static generateHTMLTemplate(
    city: string,
    offenceSlug: string,
    options: ContentStandardizerOptions = {}
  ): string {
    const standardizedPage = this.generateStandardizedPage(city, offenceSlug, options);
    const { content, metadata, schema } = standardizedPage;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.title}</title>
  <meta name="description" content="${metadata.meta_description}">
  <meta name="robots" content="${metadata.robots}">
  <link rel="canonical" href="https://fabsy.ca${metadata.canonical_url}">
  
  <!-- FAQ Schema -->
  <script type="application/ld+json">
${JSON.stringify(schema.faq, null, 2)}
  </script>
</head>
<body>
  <!-- Header component would be here -->
  
  <main>
    <!-- Hero Section -->
    <section class="hero">
      <div class="container">
        <h1>${content.h1}</h1>
        
        <!-- Answer Box Module (immediately below H1) -->
        <div class="answer-box" data-city="${city}" data-offence="${offenceSlug}">
          <p>${content.content_snippet}</p>
          <button class="cta-primary" data-cta="primary">
            ${options.custom_cta_text || 'Get a free analysis →'}
          </button>
        </div>
      </div>
    </section>

    <!-- Content Sections -->
    ${content.h2_blocks.map(h2 => `
    <section>
      <div class="container">
        <h2>${h2}</h2>
        <!-- Content would be added here based on H2 topic -->
      </div>
    </section>
    `).join('')}

    <!-- FAQ Section -->
    <section class="faq-section">
      <div class="container">
        <h2>Frequently asked questions — ${city} ${offenceSlug}</h2>
        
        <div class="faq-list">
          ${content.faqs.map((faq, index) => `
          <div class="faq-item" itemscope itemtype="https://schema.org/Question">
            <h3 class="faq-question" itemprop="name">${faq.q}</h3>
            <div class="faq-answer" itemscope itemtype="https://schema.org/Answer">
              <p itemprop="text">${faq.a}</p>
            </div>
          </div>
          `).join('')}
        </div>

        <!-- CTA after FAQ -->
        <div class="faq-cta">
          <button class="cta-secondary">
            Check your options (no obligation)
          </button>
        </div>
      </div>
    </section>

    <!-- Legal Disclaimer -->
    <section class="disclaimer">
      <div class="container">
        <p class="text-sm text-gray-600">${content.legal_disclaimer}</p>
      </div>
    </section>
  </main>

  <!-- Footer component would be here -->
</body>
</html>`;
  }

  /**
   * Get city tone note for content guidelines
   */
  static getCityGuidelines(city: string): {
    tone_note: string;
    specific_requirements: string[];
  } {
    const tone_note = getCityToneNote(city);
    const specific_requirements: string[] = [];

    const cityLower = city.toLowerCase();
    if (cityLower === 'calgary') {
      specific_requirements.push("Use 'Calgary' explicitly in H1, Answer Box, and first paragraph");
    } else if (cityLower === 'edmonton') {
      specific_requirements.push("Mirror user phrasing like 'Edmonton speeding ticket options' in one H2");
    } else {
      specific_requirements.push("Add a line noting small-city tickets can still be resolved; avoids perceived bias");
    }

    return {
      tone_note,
      specific_requirements
    };
  }
}

export default ContentStandardizer;