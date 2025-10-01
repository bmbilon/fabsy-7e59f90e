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
    const { pageTitle, bullets, cta } = await req.json();
    
    if (!pageTitle || !bullets || !Array.isArray(bullets) || bullets.length < 3) {
      return new Response(
        JSON.stringify({ error: 'pageTitle and bullets (array of 3+) are required' }),
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

    const systemPrompt = `You are a social media content writer for fabsy.ca, a service helping Alberta women with traffic tickets.

Generate engaging social media posts optimized for platforms like Instagram, Facebook, and LinkedIn.

TONE: Friendly, urgent, supportive, local (Alberta)
AUDIENCE: Women in Alberta dealing with traffic tickets
GOAL: Drive engagement and action

CRITICAL RULES:
1. Each post: maximum 220 characters (including spaces)
2. Mix of formats: questions, tips, urgency, testimonials, facts
3. Include 3 relevant hashtags per post
4. Provide image caption for each post
5. Use friendly, conversational language
6. Create urgency without being pushy
7. Alberta-specific references`;

    const userPrompt = `Create 12 social media posts from this content:

Page Title: ${pageTitle}

Key Points:
${bullets.map((b: string, i: number) => `${i + 1}. ${b}`).join('\n')}

${cta ? `CTA: ${cta}` : ''}

Generate 12 different posts with variety:
- 3 question-based posts
- 3 tip/advice posts
- 3 urgency/deadline posts
- 3 empowerment/support posts

Each post should:
- Be ≤220 characters
- Feel natural and conversational
- Include Alberta references where appropriate
- Drive action

Return ONLY valid JSON with this exact structure:
{
  "posts": [
    {
      "text": "post text under 220 chars",
      "hashtags": ["tag1", "tag2", "tag3"],
      "imageCaption": "brief image description"
    },
    ...
  ]
}`;

    console.log(`Generating 12 social posts for: ${pageTitle}`);

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
        JSON.stringify({ error: 'Failed to generate social posts', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;
    const parsed = JSON.parse(generatedContent);
    
    const posts = parsed.posts || [];
    
    // Validate character count
    const validPosts = posts.filter((post: any) => post.text && post.text.length <= 220);
    
    console.log(`Generated ${validPosts.length} valid social posts`);

    return new Response(
      JSON.stringify({ posts: validPosts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-social-posts function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
