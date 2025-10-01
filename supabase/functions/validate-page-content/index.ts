import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  details: {
    metaTitleLength: number;
    metaDescriptionLength: number;
    contentWordCount: number;
    hookVisible: boolean;
    faqsMatch: boolean;
    jsonLdValid: boolean;
  };
}

interface PageContent {
  meta_title: string;
  meta_description: string;
  h1: string;
  hook: string;
  content: string; // Full page content for word count
  faqs: Array<{ q: string; a: string }>;
  jsonLd?: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pageContent: PageContent = await req.json();
    
    const validation: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      details: {
        metaTitleLength: 0,
        metaDescriptionLength: 0,
        contentWordCount: 0,
        hookVisible: false,
        faqsMatch: false,
        jsonLdValid: false
      }
    };

    // 1. Validate meta title length
    validation.details.metaTitleLength = pageContent.meta_title?.length || 0;
    if (validation.details.metaTitleLength === 0) {
      validation.errors.push("Meta title is missing");
      validation.passed = false;
    } else if (validation.details.metaTitleLength > 60) {
      validation.errors.push(`Meta title too long (${validation.details.metaTitleLength} chars, max 60)`);
      validation.passed = false;
    } else if (validation.details.metaTitleLength > 55) {
      validation.warnings.push(`Meta title is close to limit (${validation.details.metaTitleLength}/60 chars)`);
    }

    // 2. Validate meta description length
    validation.details.metaDescriptionLength = pageContent.meta_description?.length || 0;
    if (validation.details.metaDescriptionLength === 0) {
      validation.errors.push("Meta description is missing");
      validation.passed = false;
    } else if (validation.details.metaDescriptionLength > 155) {
      validation.errors.push(`Meta description too long (${validation.details.metaDescriptionLength} chars, max 155)`);
      validation.passed = false;
    } else if (validation.details.metaDescriptionLength > 145) {
      validation.warnings.push(`Meta description is close to limit (${validation.details.metaDescriptionLength}/155 chars)`);
    }

    // 3. Validate hook is present
    if (!pageContent.hook || pageContent.hook.trim().length === 0) {
      validation.errors.push("Hook sentence is missing");
      validation.passed = false;
    } else {
      validation.details.hookVisible = true;
      validation.warnings.push("Manually verify hook is first visible text on page");
    }

    // 4. Validate content word count
    const wordCount = pageContent.content
      ? pageContent.content.trim().split(/\s+/).filter(word => word.length > 0).length
      : 0;
    validation.details.contentWordCount = wordCount;
    
    if (wordCount < 300) {
      validation.errors.push(`Content too short (${wordCount} words, minimum 300)`);
      validation.passed = false;
    } else if (wordCount < 350) {
      validation.warnings.push(`Content is minimal (${wordCount} words, recommended 350-600)`);
    }

    // 5. Validate FAQs
    if (!pageContent.faqs || pageContent.faqs.length === 0) {
      validation.errors.push("No FAQs provided");
      validation.passed = false;
    } else if (pageContent.faqs.length < 3) {
      validation.warnings.push(`Only ${pageContent.faqs.length} FAQs (recommended 6+)`);
    } else {
      // Check FAQ answer lengths (20-50 words for AEO)
      pageContent.faqs.forEach((faq, index) => {
        const answerWords = faq.a.trim().split(/\s+/).length;
        if (answerWords < 20) {
          validation.warnings.push(`FAQ ${index + 1} answer too short (${answerWords} words, min 20)`);
        } else if (answerWords > 50) {
          validation.warnings.push(`FAQ ${index + 1} answer too long (${answerWords} words, max 50)`);
        }
      });
    }

    // 6. Validate JSON-LD if provided
    if (pageContent.jsonLd) {
      try {
        const jsonLdString = typeof pageContent.jsonLd === 'string' 
          ? pageContent.jsonLd 
          : JSON.stringify(pageContent.jsonLd);
        
        const parsedJsonLd = JSON.parse(jsonLdString);
        validation.details.jsonLdValid = true;

        // Check if FAQs in JSON-LD match page FAQs
        if (parsedJsonLd['@type'] === 'FAQPage' && parsedJsonLd.mainEntity) {
          const jsonLdFaqs = parsedJsonLd.mainEntity;
          
          if (jsonLdFaqs.length !== pageContent.faqs.length) {
            validation.errors.push(`FAQ count mismatch: ${pageContent.faqs.length} in content vs ${jsonLdFaqs.length} in JSON-LD`);
            validation.passed = false;
          } else {
            // Check exact wording match (CRITICAL for AEO)
            let allMatch = true;
            pageContent.faqs.forEach((faq, i) => {
              if (jsonLdFaqs[i]) {
                if (faq.q !== jsonLdFaqs[i].name) {
                  validation.errors.push(`FAQ ${i + 1} question mismatch: HTML and JSON-LD must be identical`);
                  allMatch = false;
                  validation.passed = false;
                }
                if (faq.a !== jsonLdFaqs[i].acceptedAnswer?.text) {
                  validation.errors.push(`FAQ ${i + 1} answer mismatch: HTML and JSON-LD must be identical`);
                  allMatch = false;
                  validation.passed = false;
                }
              }
            });
            validation.details.faqsMatch = allMatch;
          }
        }
      } catch (e) {
        validation.errors.push("Invalid JSON-LD structure");
        validation.passed = false;
      }
    } else {
      validation.warnings.push("No JSON-LD provided for validation");
    }

    // 7. Manual checks reminder
    validation.warnings.push("⚠️ MANUAL CHECKS REQUIRED:");
    validation.warnings.push("- Test with Google Rich Results tool: https://search.google.com/test/rich-results");
    validation.warnings.push("- Run Lighthouse/PageSpeed (mobile load < 3s)");
    validation.warnings.push("- Verify CTA/form is above the fold");
    validation.warnings.push("- Check hook is first visible text on page");
    validation.warnings.push("- Optimize top 3 Lighthouse issues (images, JS, caching)");

    console.log(`Validation complete: ${validation.passed ? 'PASSED' : 'FAILED'}`);

    return new Response(
      JSON.stringify(validation),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in validate-page-content function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
