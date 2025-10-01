import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `SYSTEM: You are Fabsy's AEO-first assistant. Be concise, accurate, and local (Alberta). NEVER give legal advice. Always start with a one-sentence direct answer (the "hook"). At the end, include "If you'd like a human review, upload your ticket."

INSTRUCTIONS TO THE LLM:
- Input: a user question about a traffic ticket and optional ticket data (city, charge, date).
- Output **ONLY** a JSON object with two fields: "ai_answer" and "page_json".

1) "ai_answer": an object { "hook": "<one-sentence answer>", "explain": "<2-3 short paragraphs>", "faqs":[{"q":"...","a":"..."}], "disclaimer":"<text>" }
   - Keep ai_answer display-friendly (use simple sentences). Each FAQ answer must start with a short direct answer sentence.

2) "page_json": the canonical page JSON to be published via our upsertPage edge function. Format EXACTLY:
{
  "slug":"<url-friendly-slug>",
  "meta_title":"<=60 chars",
  "meta_description":"<=155 chars",
  "h1":"<H1>",
  "hook":"<same text as ai_answer.hook>",
  "bullets":["...","..."],
  "what":"<HTML paragraph(s)>",
  "how":"<HTML paragraph(s)>",
  "next":"<HTML paragraph(s) with CTA>",
  "faqs":[{"q":"...","a":"..."}],
  "video": {"youtubeUrl":"","transcript":""},
  "status":"draft"
}

REQUIREMENTS:
- THE hook string must be identical between ai_answer.hook and page_json.hook.
- Each FAQ q/a must be plain text (no HTML) and identical between ai_answer.faqs[*] and page_json.faqs[*].
- Do not claim statistics or rates unless you have a source; use neutral phrasing like "may", "can", "often".
- Limit meta_title <=60 chars and meta_description <=155 chars.
- For safety, append ai_answer.disclaimer: "This tool provides general information only and is not legal advice. Results are probabilistic. For case-specific legal advice, request a free human review from Fabsy"
- Output only valid JSON (no extra commentary).`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, ticketData } = await req.json();
    
    if (!question) {
      return new Response(
        JSON.stringify({ error: "Question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build user message with optional ticket data
    let userMessage = question;
    if (ticketData) {
      userMessage += `\n\nTicket details: ${JSON.stringify(ticketData, null, 2)}`;
    }

    console.log("Analyzing ticket with AI:", { question, ticketData });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error("No response from AI");
    }

    // Parse the AI response (should be JSON)
    let parsedResponse;
    try {
      // Remove markdown code blocks if present
      const cleanedContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedContent);
    } catch (e) {
      console.error("Failed to parse AI response:", aiContent);
      throw new Error("AI returned invalid JSON");
    }

    // Validate response structure
    if (!parsedResponse.ai_answer || !parsedResponse.page_json) {
      throw new Error("AI response missing required fields");
    }

    // Ensure disclaimer is present
    if (!parsedResponse.ai_answer.disclaimer) {
      parsedResponse.ai_answer.disclaimer = "This tool provides general information only and is not legal advice. Results are probabilistic. For case-specific legal advice, request a free human review from Fabsy";
    }

    console.log("Successfully generated AI response");

    return new Response(
      JSON.stringify(parsedResponse),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-ticket-ai:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
