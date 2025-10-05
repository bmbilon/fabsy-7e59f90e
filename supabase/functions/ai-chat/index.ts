import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAT_SYSTEM_PROMPT = `You are an AI assistant for Fabsy Traffic Services, Alberta's premier traffic ticket defense service for women. You are knowledgeable, friendly, and helpful.

PERSONALITY:
- Professional but conversational and approachable
- Empathetic toward people dealing with traffic tickets
- Confident in Alberta traffic law knowledge
- Supportive and encouraging

KNOWLEDGE BASE:
- Alberta Traffic Safety Act and Motor Vehicle Act
- Traffic court procedures in Alberta cities (Calgary, Edmonton, etc.)
- Common traffic violations: speeding, red light cameras, distracted driving, etc.
- Court options: early resolution, trial, guilty plea with explanation
- Demerit points system and insurance impacts
- How traffic ticket defense services work

GUIDELINES:
- Always be helpful and provide actionable advice
- Explain things in simple, easy-to-understand terms
- Never give specific legal advice - provide general information only
- When appropriate, suggest users consider professional representation
- Include relevant deadlines and time-sensitive information
- Be encouraging about fighting tickets when there are good grounds
- Mention Fabsy's services naturally when relevant, but don't be pushy

WHAT NOT TO DO:
- Don't give specific legal advice
- Don't guarantee outcomes
- Don't provide false or outdated information
- Don't be overly salesy or pushy about Fabsy's services

Always end conversations by offering further help and mentioning Fabsy's free consultation if the user seems like they could benefit from professional help.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, context = [] } = await req.json();
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try OpenAI first, fallback to other options
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    let aiResponse;
    let responseData;

    if (OPENAI_API_KEY) {
      console.log("Using OpenAI GPT-4 for chat");
      
      // Build conversation history for OpenAI
      const messages = [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...context.map((msg: { sender: string; text: string }) => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        })),
        { role: "user", content: message }
      ];

      aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: messages,
          max_tokens: 800,
          temperature: 0.7,
          presence_penalty: 0.1,
          frequency_penalty: 0.1,
        }),
      });

      if (aiResponse.ok) {
        responseData = await aiResponse.json();
        const reply = responseData.choices?.[0]?.message?.content;

        if (reply) {
          return new Response(
            JSON.stringify({ reply: reply.trim() }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.warn("OpenAI failed, trying fallback:", await aiResponse.text());
      }
    }

    // Fallback to Lovable AI Gateway
    if (LOVABLE_API_KEY) {
      console.log("Using Lovable AI (Claude) for chat");
      
      const messages = [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...context.slice(-6).map((msg: { sender: string; text: string }) => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        })),
        { role: "user", content: message }
      ];

      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",  // Much better than Gemini for chat
          messages: messages,
          max_tokens: 800,
          temperature: 0.7,
        }),
      });

      if (aiResponse.ok) {
        responseData = await aiResponse.json();
        const reply = responseData.choices?.[0]?.message?.content;

        if (reply) {
          return new Response(
            JSON.stringify({ reply: reply.trim() }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        const errorText = await aiResponse.text();
        console.error("Lovable AI error:", errorText);
        
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "I'm getting too many requests right now. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Final fallback - basic response
    console.log("Both AI services failed, using fallback");
    
    const fallbackResponses = [
      "I'd be happy to help you with your traffic ticket question! For the most accurate and up-to-date information about Alberta traffic law, I'd recommend getting a free consultation from our team at 403-669-5353.",
      "That's a great question about Alberta traffic tickets. While I can provide general information, each case is unique. Would you like to speak with one of our traffic ticket specialists for personalized advice?",
      "Thanks for your question! Alberta traffic law can be complex, and the best approach often depends on the specific details of your situation. Our team offers free consultations to review your case - would that be helpful?",
    ];
    
    const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

    return new Response(
      JSON.stringify({ reply: randomResponse }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-chat:", error);
    return new Response(
      JSON.stringify({ 
        error: "I'm having trouble processing your request right now. Please try again or call us at 403-669-5353 for immediate assistance.",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});