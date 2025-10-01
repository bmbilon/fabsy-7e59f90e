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
    const { topic, city, targetKeyword } = await req.json();
    
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

    const systemPrompt = `You are an AEO content writer for fabsy.ca, an Alberta service helping women with traffic tickets.

Create complete page content optimized for AI search engines and featured snippets.

TONE: Supportive, plain-language, conversational, female-friendly
AUDIENCE: Women in Alberta dealing with traffic tickets
SEO GOAL: Rank #1 in AI queries, beat all competitors

CRITICAL AEO RULES:
1. Hook FIRST - direct one-sentence answer (for voice search)
2. Simple sentences, conversational language
3. Answer the question immediately, then explain
4. Use exact wording in FAQs that matches common voice queries
5. Alberta-specific examples and references
6. Practical, actionable advice
7. FAQ answers: 20-50 words, start with direct answer`;

    const userPrompt = `Generate complete page content for: "${topic}"
${city ? `\nCity focus: ${city}` : ''}
${targetKeyword ? `\nTarget keyword: ${targetKeyword}` : ''}

Create content for this exact template structure:

# {{H1}} - Include main keyword, max 60 chars

{{HOOK}} - One-sentence direct answer to the main question

**Key facts**
- {{bullet1}} - Short, actionable fact
- {{bullet2}} - Short, actionable fact
- {{bullet3}} - Short, actionable fact
- {{bullet4}} - Short, actionable fact
- {{bullet5}} - Short, actionable fact

## What
{{what_section}} - 2-4 short paragraphs explaining what this is

## How
{{how_section}} - 2-4 short paragraphs explaining the process

## Next steps
{{next_section}} - 2-4 short paragraphs on what to do next

**Frequently asked questions**
{{faq1.q}} through {{faq6.q}} - 6 Q&A pairs
- Questions must sound like real queries women ask
- Answers: 20-50 words, direct answer first
- At least 3 must be Alberta/city-specific

Return ONLY valid JSON with this exact structure:
{
  "meta_title": "SEO title (max 60 chars)",
  "meta_description": "SEO description (max 155 chars)",
  "slug": "url-friendly-slug",
  "h1": "Page heading",
  "hook": "One-sentence direct answer",
  "bullets": [
    "Bullet 1",
    "Bullet 2",
    "Bullet 3",
    "Bullet 4",
    "Bullet 5"
  ],
  "what_section": "2-4 paragraphs as a single string",
  "how_section": "2-4 paragraphs as a single string",
  "next_section": "2-4 paragraphs as a single string",
  "faqs": [
    {"q": "Question text", "a": "Direct answer 20-50 words"},
    ...6 total
  ]
}`;

    console.log(`Generating page content for: ${topic}`);

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
        JSON.stringify({ error: 'Failed to generate page content', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;
    const content = JSON.parse(generatedContent);
    
    console.log('Page content generated successfully');

    return new Response(
      JSON.stringify(content),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-page-content function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
