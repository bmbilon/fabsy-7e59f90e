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
    const { topic, keyPoints, cta } = await req.json();
    
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

    const systemPrompt = `You are a video scriptwriter for fabsy.ca, creating short explainer videos about traffic tickets in Alberta.

Create engaging 60-90 second video scripts optimized for social media and landing pages.

TONE: Friendly, clear, empowering, conversational
AUDIENCE: Women in Alberta dealing with traffic tickets
FORMAT: Short-form video (Instagram Reels, TikTok, YouTube Shorts)

CRITICAL RULES:
1. Total duration: 60-90 seconds
2. Hook: 10 seconds (grab attention immediately)
3. Step 1: 15-20 seconds
4. Step 2: 15-20 seconds  
5. Step 3: 15-20 seconds
6. CTA: 10 seconds (clear action)
7. Write for voice/audio (conversational, not essay-like)
8. Include timing markers
9. Generate WebVTT captions with timestamps
10. Create 1-paragraph transcript for SEO`;

    const userPrompt = `Create a video script about: "${topic}"

${keyPoints && keyPoints.length > 0 ? `Key Points to Cover:\n${keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n` : ''}
${cta ? `Call to Action: ${cta}\n` : ''}

Generate a complete video package including:

1. SCRIPT: Full narration script with timing markers
   - [00:00-00:10] Hook: Attention-grabbing opening
   - [00:10-00:30] Step 1: First key point
   - [00:30-00:50] Step 2: Second key point
   - [00:50-01:10] Step 3: Third key point
   - [01:10-01:20] CTA: Clear call to action

2. CAPTIONS: WebVTT format captions for on-screen text
   Format each caption entry as:
   00:00.000 --> 00:03.000
   Caption text here

3. TRANSCRIPT: Single paragraph for page embedding (SEO-optimized)

Return ONLY valid JSON with this exact structure:
{
  "script": "Full script with timing markers included in the text",
  "captions": "WebVTT formatted captions with timestamps",
  "transcript": "One paragraph transcript"
}

Make the hook compelling and the CTA actionable for Alberta women.`;

    console.log(`Generating video script for: ${topic}`);

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
        max_completion_tokens: 3000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate video script', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;
    const content = JSON.parse(generatedContent);
    
    console.log('Video script generated successfully');

    return new Response(
      JSON.stringify(content),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-video-script function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
