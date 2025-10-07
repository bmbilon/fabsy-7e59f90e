export interface AEOPatterns {
  title_pattern: string;
  h1_pattern: string;
  h2_blocks: string[];
  meta_description_pattern: string;
  above_fold_requirements: string[];
  content_snippet_pattern: string;
  legal_disclaimer_snippet: string;
}

export interface FAQQuestion {
  q: string;
  a: string;
}

export interface FAQPAABank {
  generic: FAQQuestion[];
  offence_specific: Record<string, FAQQuestion[]>;
  city_tone_notes: Record<string, string>;
}

export interface RenderingRules {
  faq_onpage_count: number;
  faq_schema_count: number;
  min_words_per_lander: number;
  keyword_mirroring: string[];
  answer_box_position: string;
  cta_rules: {
    primary_cta_text: string;
    soft_cta_text: string;
    cta_repeat: string;
  };
}

export interface AEOPageTokens {
  City: string;
  Offence: string; // Human readable (e.g., "Speeding")
  offence: string; // Slug format (e.g., "speeding")
}

export interface GeneratedContent {
  title: string;
  h1: string;
  h2_blocks: string[];
  meta_description: string;
  content_snippet: string;
  legal_disclaimer: string;
  faqs: FAQQuestion[];
  faq_schema: FAQQuestion[];
}

// AEO On-Page Patterns Configuration
export const aeoPatterns: AEOPatterns = {
  title_pattern: "{Offence} Ticket in {City} — Can You Fight It? | Fabsy",
  h1_pattern: "Got a {Offence} Ticket in {City}?",
  h2_blocks: [
    "Can I fight a {offence} ticket in {City}?",
    "What to do next (60-second answer)",
    "{City} {offence} penalties & demerits",
    "Your options before court day",
    "Frequently asked questions — {City} {offence}"
  ],
  meta_description_pattern: "{Offence} ticket in {City}? In many cases, Fabsy can keep demerits off your record and help you avoid insurance hikes. Zero-risk: you only pay if we win. Start a free analysis in 60 seconds.",
  above_fold_requirements: [
    "Answer Box module (from Block 6) directly below H1",
    "Primary CTA visible without scroll", 
    "City + offence echoed in first paragraph"
  ],
  content_snippet_pattern: "Short answer: Yes — many {City} {offence} tickets can be fixed before your court date. Upload your ticket, we pull your court file, then confirm options to protect your record.",
  legal_disclaimer_snippet: "This page provides general information only and is not legal advice. Outcomes vary by offence and courthouse."
};

// FAQ/PAA Question Bank
export const faqPAABank: FAQPAABank = {
  generic: [
    {
      q: "Can I fight a {offence} ticket in {City}?",
      a: "Often, yes. Many cases can be resolved to avoid a conviction that affects your record or insurance."
    },
    {
      q: "Do I have to go to court for a {offence} ticket in {City}?", 
      a: "Not always. Depending on the courthouse and offence, resolutions can be reached without you attending."
    },
    {
      q: "How many demerits for {offence} in {City}?",
      a: "Demerits depend on the specific charge. Our goal is to resolve your ticket to keep demerits off your abstract."
    },
    {
      q: "Will my insurance go up for a {offence} ticket?",
      a: "A conviction can lead to higher premiums. We focus on outcomes that avoid insurance-impacting convictions."
    },
    {
      q: "What's the deadline to act on a {offence} ticket?",
      a: "Deadlines vary; acting before the first appearance/court date preserves more options. Start with a free analysis."
    }
  ],

  offence_specific: {
    speeding: [
      {
        q: "What if it's photo-radar speeding in {City}?",
        a: "Photo-radar has unique rules and defenses. Upload your notice; we'll check for resolution paths."
      },
      {
        q: "Can I reduce a speeding fine in {City}?",
        a: "In many cases fines and/or points can be reduced or re-characterized to protect your record."
      }
    ],
    "red-light": [
      {
        q: "Is a red-light camera ticket different from officer-issued?",
        a: "Yes. Evidentiary and procedural differences can change your options. We assess the exact charge type."
      }
    ],
    "careless-driving": [
      {
        q: "Is careless driving criminal?",
        a: "No, it's a traffic offence — but it's serious. We prioritize outcomes that avoid an insurance-impacting conviction."
      }
    ],
    "distracted-driving": [
      {
        q: "Can distracted driving be negotiated down?",
        a: "Options vary. We review the file for resolution paths that keep your abstract clean."
      }
    ],
    seatbelt: [
      {
        q: "Can a seatbelt ticket impact insurance?",
        a: "A conviction can. We look for outcomes that prevent insurance-impacting records."
      }
    ]
  },

  city_tone_notes: {
    default: "Keep local references neutral; avoid courthouse names unless you maintain them.",
    calgary: "Use 'Calgary' explicitly in H1, Answer Box, and first paragraph.",
    edmonton: "Mirror user phrasing like 'Edmonton speeding ticket options' in one H2.",
    smaller_cities: "Add a line noting small-city tickets can still be resolved; avoids perceived bias."
  }
};

// Rendering Rules
export const renderingRules: RenderingRules = {
  faq_onpage_count: 3,        // Show 3 Q/A pairs in content body
  faq_schema_count: 2,        // Include 2-3 in FAQPage JSON-LD
  min_words_per_lander: 500,  // Enough for coverage; keep concise & scannable
  keyword_mirroring: [
    "Use exact 'ticket' + '{offence}' + '{City}' in H1 and first paragraph",
    "Include '{offence} ticket {City}' once in an H2"
  ],
  answer_box_position: "Immediately below H1",
  cta_rules: {
    primary_cta_text: "Get a free analysis →",
    soft_cta_text: "Check your options (no obligation)",
    cta_repeat: "Once above the fold, once pre-footer"
  }
};

// Helper functions
export function replaceTokens(template: string, tokens: AEOPageTokens): string {
  return template
    .replace(/{City}/g, tokens.City)
    .replace(/{Offence}/g, tokens.Offence)
    .replace(/{offence}/g, tokens.offence);
}

export function generatePageContent(tokens: AEOPageTokens): GeneratedContent {
  // Generate base content using patterns
  const title = replaceTokens(aeoPatterns.title_pattern, tokens);
  const h1 = replaceTokens(aeoPatterns.h1_pattern, tokens);
  const h2_blocks = aeoPatterns.h2_blocks.map(block => replaceTokens(block, tokens));
  const meta_description = replaceTokens(aeoPatterns.meta_description_pattern, tokens);
  const content_snippet = replaceTokens(aeoPatterns.content_snippet_pattern, tokens);
  const legal_disclaimer = aeoPatterns.legal_disclaimer_snippet;

  // Select FAQs (1 generic + 2 offence-specific when available)
  const genericFAQs = faqPAABank.generic.map(faq => ({
    q: replaceTokens(faq.q, tokens),
    a: replaceTokens(faq.a, tokens)
  }));

  const offenceSpecificFAQs = faqPAABank.offence_specific[tokens.offence]?.map(faq => ({
    q: replaceTokens(faq.q, tokens),
    a: replaceTokens(faq.a, tokens)
  })) || [];

  // Combine FAQs according to rendering rules
  const faqs: FAQQuestion[] = [];
  
  // Add 1 generic FAQ
  if (genericFAQs.length > 0) {
    faqs.push(genericFAQs[0]);
  }
  
  // Add up to 2 offence-specific FAQs
  faqs.push(...offenceSpecificFAQs.slice(0, 2));
  
  // Fill remaining slots with more generic FAQs if needed
  while (faqs.length < renderingRules.faq_onpage_count && genericFAQs.length > faqs.filter(f => 
    genericFAQs.some(g => g.q === f.q)
  ).length) {
    const remainingGeneric = genericFAQs.filter(g => !faqs.some(f => f.q === g.q));
    if (remainingGeneric.length > 0) {
      faqs.push(remainingGeneric[0]);
    } else {
      break;
    }
  }

  // Select FAQs for schema (subset of on-page FAQs)
  const faq_schema = faqs.slice(0, renderingRules.faq_schema_count);

  return {
    title,
    h1,
    h2_blocks,
    meta_description,
    content_snippet,
    legal_disclaimer,
    faqs,
    faq_schema
  };
}

export function validateTitle(title: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const length = title.length;
  
  if (length < 45) {
    issues.push(`Title too short: ${length} chars (minimum 45)`);
  }
  if (length > 62) {
    issues.push(`Title too long: ${length} chars (maximum 62)`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

export function validateH1(h1: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const length = h1.length;
  
  if (length > 65) {
    issues.push(`H1 too long: ${length} chars (maximum 65)`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

export function generateFAQSchema(faqs: FAQQuestion[]): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(faq => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a
      }
    }))
  };
}

// Offence humanization mapping
export const offenceHumanMap: Record<string, string> = {
  "speeding": "Speeding",
  "red-light": "Red Light",
  "careless-driving": "Careless Driving",
  "distracted-driving": "Distracted Driving",
  "following-too-close": "Following Too Close",
  "fail-to-stop": "Fail to Stop",
  "fail-to-yield": "Fail to Yield",
  "seatbelt": "Seatbelt",
  "stunting": "Stunting",
  "street-racing": "Street Racing",
  "no-insurance": "No Insurance",
  "tinted-windows": "Tinted Windows"
};

export function humanizeOffence(offenceSlug: string): string {
  return offenceHumanMap[offenceSlug] || offenceSlug.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

// City name helpers
export function getCityToneNote(city: string): string {
  const cityKey = city.toLowerCase();
  return faqPAABank.city_tone_notes[cityKey] || faqPAABank.city_tone_notes.default;
}

// Export all for easy importing
export {
  aeoPatterns as default,
  faqPAABank,
  renderingRules
};