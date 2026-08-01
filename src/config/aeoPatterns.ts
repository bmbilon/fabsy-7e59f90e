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
  title_pattern: "{Offence} Ticket in {City}, Can You Fight It? | Fabsy",
  h1_pattern: "Got a {Offence} Ticket in {City}?",
  h2_blocks: [
    "Can I fight a {offence} ticket in {City}?",
    "What to do next (60-second answer)",
    "{City} {offence} penalties & demerits",
    "Your options before court day",
    "Frequently asked questions, {City} {offence}"
  ],
  meta_description_pattern: "{Offence} ticket in {City}? Review the process, response options, and information to keep before the deadline printed on the ticket.",
  above_fold_requirements: [
    "Answer Box module (from Block 6) directly below H1",
    "Primary CTA visible without scroll", 
    "City + offence echoed in first paragraph"
  ],
  content_snippet_pattern: "Short answer: Check the deadline printed on the ticket and review the available response options. Fabsy can assess the submitted information and provide agent services where permitted.",
  legal_disclaimer_snippet: "This page provides general information only. Fabsy is an agent service, not a law firm. Outcomes vary by matter and court."
};

// FAQ/PAA Question Bank
export const faqPAABank: FAQPAABank = {
  generic: [
    {
      q: "Can I fight a {offence} ticket in {City}?",
      a: "You may dispute the ticket by following its response instructions before the printed deadline. The available options depend on the charge, evidence, and court process."
    },
    {
      q: "Do I have to go to court for a {offence} ticket in {City}?", 
      a: "Attendance requirements depend on the charge and the instructions for the matter. Check the ticket and confirm the requirements that apply before relying on an agent to appear."
    },
    {
      q: "How many demerits for {offence} in {City}?",
      a: "Demerits depend on the exact offence and disposition. Use the charge shown on the ticket when checking the current Alberta demerit schedule."
    },
    {
      q: "Will my insurance go up for a {offence} ticket?",
      a: "Insurance treatment depends on the insurer, policy, driving history, and final disposition. Ask your insurer or broker about your specific policy."
    },
    {
      q: "What's the deadline to act on a {offence} ticket?",
      a: "Use the response deadline printed on the ticket and follow its instructions before that date."
    }
  ],

  offence_specific: {
    speeding: [
      {
        q: "What if it's photo-radar speeding in {City}?",
        a: "Photo radar notices are issued to the registered owner and do not add demerits. Review the notice, images, location, and printed response instructions."
      },
      {
        q: "Can I reduce a speeding fine in {City}?",
        a: "A reduction is not certain. The available response depends on the allegation, evidence, and court process."
      }
    ],
    "red-light": [
      {
        q: "Is a red-light camera ticket different from officer-issued?",
        a: "The ticket type affects who receives the notice and whether demerits apply. Review the exact charge and evidence before choosing a response."
      }
    ],
    "careless-driving": [
      {
        q: "Is careless driving criminal?",
        a: "Review the exact charge shown on the ticket. Fabsy can assess whether agent representation is permitted, but it is not a law firm and does not provide legal advice."
      }
    ],
    "distracted-driving": [
      {
        q: "Can distracted driving be negotiated down?",
        a: "A particular resolution is not certain. The available response depends on the allegation, evidence, and court process."
      }
    ],
    seatbelt: [
      {
        q: "Can a seatbelt ticket impact insurance?",
        a: "Insurance treatment depends on the insurer, policy, driving history, and final disposition. Ask your insurer or broker about your specific policy."
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

export function generateFAQSchema(faqs: FAQQuestion[]): Record<string, unknown> {
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
