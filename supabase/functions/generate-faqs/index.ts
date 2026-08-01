import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { assertGeneratedContentSafe, EXACT_FABSY_PRICING } from "../_shared/generated-content-guardrails.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic } = await req.json();
    
    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'topic is required' }),
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

    const systemPrompt = `You are an AEO content writer for fabsy.ca, helping Alberta drivers with traffic tickets.

Generate 6 concise, helpful FAQs optimized for voice search and featured snippets.

CRITICAL RULES:
1. Each answer: 20-50 words maximum
2. Start with the direct answer sentence
3. Use simple, supportive language
4. Focus on practical, actionable info
5. Alberta-specific context
6. Do not gender the audience or make gender-based assumptions
7. Do not invent testimonials, ratings, outcomes, fines, demerit counts, deadlines, legal dates, speed thresholds, or insurance figures
8. Fabsy is an agent service, not a law firm. Do not claim lawyer status or legal advice
9. If pricing is relevant, use exactly: "${EXACT_FABSY_PRICING}"`;

    const userPrompt = `Generate 6 FAQs about: "${topic}"

Return ONLY valid JSON array with this exact structure:
[
  {"q": "question text", "a": "direct answer in 20-50 words"},
  {"q": "question text", "a": "direct answer in 20-50 words"},
  ...
]

Requirements:
- Questions should cover the most common concerns
- Answers must start with the direct answer
- Keep answers between 20-50 words
- Use plain language
- Include Alberta-specific details where relevant`;

    console.log(`Generating FAQs for topic: ${topic}`);

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
        max_completion_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate FAQs', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;
    const parsed = JSON.parse(generatedContent);
    
    // Handle if the response is wrapped in an object
    const faqs = Array.isArray(parsed) ? parsed : (parsed.faqs || []);
    assertGeneratedContentSafe(faqs);
    
    console.log(`Generated ${faqs.length} FAQs successfully`);

    return new Response(
      JSON.stringify({ faqs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-faqs function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
