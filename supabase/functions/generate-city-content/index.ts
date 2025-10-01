import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { cityName, localCourt, baseContent } = await req.json();
    
    if (!cityName || !localCourt) {
      return new Response(
        JSON.stringify({ error: 'cityName and localCourt are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an AEO content writer for fabsy.ca, a service helping Alberta women with traffic tickets.

Your task is to rewrite content for specific cities in Alberta, making it feel local and relevant.

TONE: Supportive, plain-language, conversational, female-friendly
AUDIENCE: Women in Alberta dealing with traffic tickets
SEO: Answer-first (AEO), simple sentences, local examples

IMPORTANT RULES:
1. Hook comes FIRST - direct answer in one sentence
2. Short sections (2-4 paragraphs each)
3. Replace generic examples with city-specific ones
4. Add 3 city-specific FAQs
5. Use simple, supportive language
6. Focus on practical, actionable advice`;

    const userPrompt = `Rewrite the following traffic ticket content for ${cityName}, Alberta.

City Name: ${cityName}
Local Court: ${localCourt}

${baseContent ? `Base Content:\n${baseContent}\n\n` : ''}

Generate a complete AEO page with:
- meta_title (max 60 chars, include city name)
- meta_description (max 155 chars, include city name)
- slug (URL-friendly, include city)
- h1 (include city name)
- hook (one-sentence direct answer to the main question)
- bullets (5 short, actionable bullets)
- sections object with:
  - what (2-4 paragraphs explaining what this is)
  - how (2-4 paragraphs explaining the process)
  - next (2-4 paragraphs on next steps)
- faqs array (6 Q&A pairs, at least 3 must be city-specific)

Use local examples like:
- "${localCourt}" instead of generic courts
- Local streets/areas in ${cityName}
- "${cityName} drivers" or "women in ${cityName}"

Return ONLY valid JSON with this exact structure:
{
  "meta_title": "string",
  "meta_description": "string", 
  "slug": "string",
  "h1": "string",
  "hook": "string",
  "bullets": ["string", "string", ...],
  "sections": {
    "what": "string",
    "how": "string",
    "next": "string"
  },
  "faqs": [
    {"q": "string", "a": "string"},
    ...
  ]
}`;

    console.log(`Generating city content for ${cityName}...`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 4000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate content', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;
    
    console.log('Content generated successfully for', cityName);

    return new Response(
      JSON.stringify({ content: JSON.parse(generatedContent) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-city-content function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
