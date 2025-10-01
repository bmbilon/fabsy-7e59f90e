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
    const { blogName, blogFocus, recipientName, topicIdea } = await req.json();
    
    if (!blogName) {
      return new Response(
        JSON.stringify({ error: 'blogName is required' }),
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

    const systemPrompt = `You are a professional outreach writer for fabsy.ca, an Alberta-based service helping women with traffic tickets.

Write a 3-step email sequence to pitch a guest Q&A post to local Alberta blogs.

TONE: Friendly, professional, respectful, value-focused
GOAL: Get a "yes" to publish a helpful Q&A post

CRITICAL RULES:
1. Each email body: maximum 120 words
2. Subject lines: short, intriguing, not salesy
3. Email 1 (Initial): Introduce value, make specific pitch
4. Email 2 (Follow-up): Gentle reminder, add social proof
5. Email 3 (Final nudge): Last friendly check-in, easy out
6. No pushy language, respect their time
7. Emphasize value to their audience (Alberta women readers)`;

    const userPrompt = `Create a 3-step email outreach sequence for:

Blog: ${blogName}
${blogFocus ? `Blog Focus: ${blogFocus}` : ''}
${recipientName ? `Recipient: ${recipientName}` : 'Recipient: [Blog Editor]'}
${topicIdea ? `Topic Idea: ${topicIdea}` : ''}

Purpose: Pitch a guest Q&A post about traffic tickets in Alberta, aimed at helping their women readers.

Return ONLY valid JSON with this exact structure:
{
  "email1": {
    "subject": "subject line",
    "body": "email body (max 120 words)"
  },
  "email2": {
    "subject": "subject line",
    "body": "email body (max 120 words)"
  },
  "email3": {
    "subject": "subject line",
    "body": "email body (max 120 words)"
  }
}

Each email should:
- Feel personal and genuine
- Emphasize value for their audience
- Include a clear, easy ask
- Be professional but warm
- Reference Alberta/local context`;

    console.log(`Generating outreach sequence for: ${blogName}`);

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
        JSON.stringify({ error: 'Failed to generate outreach sequence', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;
    const sequence = JSON.parse(generatedContent);
    
    console.log('Outreach sequence generated successfully');

    return new Response(
      JSON.stringify(sequence),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-outreach-sequence function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
