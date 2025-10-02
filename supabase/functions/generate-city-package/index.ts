import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cities, targetKeywordTemplate } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `You are an expert AEO (Answer Engine Optimization) content strategist specializing in legal services for traffic tickets in Alberta, Canada.

Generate comprehensive, AEO-optimized page packages that are:
- Supportive and plain-language (female-friendly tone)
- Locally relevant with specific court names and examples
- Structured for featured snippets and AI search engines
- Actionable and trust-building

CRITICAL RULES:
1. Meta title must be ≤60 characters and include target keyword
2. Meta description must be ≤155 characters and include target keyword
3. Hook must be the FIRST visible text - a direct one-sentence answer
4. FAQ answers must start with the direct answer (20-50 words each)
5. JSON-LD FAQPage script must have Question.name and Answer.text matching FAQ HTML exactly (character-for-character)
6. All content must be plain-language, supportive, conversational
7. Include local references (court names, highways, enforcement patterns)

CRITICAL OUTPUT FORMAT - NDJSON:
- Return ONLY newline-delimited JSON (NDJSON)
- One complete JSON object per line
- One city per line
- NO markdown code fences
- NO commentary
- NO arrays wrapping the objects
- Each line must be a valid JSON object that can be parsed independently`;

    const userPrompt = `Generate AEO-optimized page packages for these Alberta cities: ${cities.join(', ')}.

For EACH city produce ONE JSON object per line in NDJSON format:
{
  "slug": "fight-speeding-ticket-{city-lowercase}",
  "meta_title": "Fight a Speeding Ticket in {City} | Fabsy",
  "meta_description": "Local guide to fighting speeding tickets in {City}. Request disclosure, gather evidence, free eligibility check.",
  "h1": "How to Fight a Speeding Ticket in {City}",
  "hook": "Direct one-sentence answer (the FIRST visible text on page)",
  "bullets": ["5 key facts as short strings"],
  "what_section": "<p>2-4 short paragraphs with local court names and examples</p>",
  "how_section": "<p>2-4 actionable paragraphs with steps</p>",
  "next_section": "<p>2-4 paragraphs with clear CTA</p>",
  "hero_ctas": [
    {"text": "primary CTA ≤12 words", "button_label": "Button text", "aria_label": "Accessible label"},
    {"text": "secondary CTA ≤12 words", "button_label": "Button text", "aria_label": "Accessible label"},
    {"text": "tertiary CTA ≤12 words", "button_label": "Button text", "aria_label": "Accessible label"}
  ],
  "faqs": [
    {"q": "Question text exactly as shown in HTML", "a": "Answer starting with direct answer. 20-50 words. Match HTML exactly."},
    // 6 total, at least 3 city-specific
  ],
  "jsonld": "<script type=\\"application/ld+json\\">{\\"@context\\":\\"https://schema.org\\",\\"@type\\":\\"FAQPage\\",\\"mainEntity\\":[{\\"@type\\":\\"Question\\",\\"name\\":\\"Question text EXACTLY matching FAQ HTML\\",\\"acceptedAnswer\\":{\\"@type\\":\\"Answer\\",\\"text\\":\\"Answer text EXACTLY matching FAQ HTML\\"}}]}</script>",
  "video": {
    "script": "60-90 second script with [00:00-00:10] timing markers every 10s",
    "captions": "WebVTT format captions for the script",
    "transcript": "1-paragraph SEO-friendly transcript summary"
  },
  "social": [
    {"text": "Social post ≤220 chars", "hashtags": ["#FightYourTicket","#Alberta","#CityName"], "image_caption": "Suggested image caption"},
    // 12 total posts
  ],
  "outreach": [
    {"subject": "Guest post pitch subject", "body": "Email body ≤120 words"},
    // 3 total emails
  ],
  "validations": {
    "meta_title_length": 58,
    "meta_description_length": 152,
    "pass": true
  }
}

Target keyword template: "${targetKeywordTemplate}"
Cities: ${cities.join(', ')}

CRITICAL OUTPUT FORMAT:
- Return NDJSON: one JSON object per line
- One city per line in the same order as listed
- NO markdown code fences
- NO commentary
- NO array wrapping
- Each line must be a complete, valid JSON object`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error(`AI generation failed: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    
    // Remove markdown code fences if present
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/g, '');
    content = content.trim();
    
    // Parse NDJSON - one JSON object per line
    const lines = content.split('\n').filter(line => line.trim());
    const pages = lines.map(line => {
      try {
        return JSON.parse(line.trim());
      } catch (e) {
        console.error('Failed to parse line:', line);
        throw new Error(`Invalid JSON in line: ${line.substring(0, 100)}...`);
      }
    });
    
    if (pages.length === 0) {
      throw new Error('No valid pages generated');
    }

    return new Response(JSON.stringify({ pages }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-city-package:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
