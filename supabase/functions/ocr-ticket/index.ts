import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Ensure the image has the proper data URL format
    const imageUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;

    console.log("Processing image with URL format:", imageUrl.substring(0, 50) + "...");

    // Call Gemini vision model to extract ticket data
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract information from this traffic ticket image. Return the data in JSON format with these fields:
- ticketNumber: the ticket or violation number
- issueDate: date in YYYY-MM-DD format
- location: location where violation occurred
- officer: officer name
- officerBadge: officer badge number (if visible)
- offenceSection: the section number from "DID UNLAWFULLY CONTRAVENE SECTION" (e.g., "86")
- offenceSubSection: the sub-section number (e.g., "(4)(c)" or "4(c)")
- offenceDescription: the description of the offence (e.g., "Fail to carry proof of registration or license plate")
- violation: type of violation (e.g., "Speeding (16-30 km/h over)", "Red Light Violation", etc.)
- fineAmount: fine amount as number without currency symbol
- courtDate: court date in YYYY-MM-DD format if present, otherwise null

If any field is not clearly visible, set it to null. Be as accurate as possible.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_ticket_data",
              description: "Extract structured data from a traffic ticket",
              parameters: {
                type: "object",
                properties: {
                  ticketNumber: { type: "string", nullable: true },
                  issueDate: { type: "string", nullable: true },
                  location: { type: "string", nullable: true },
                  officer: { type: "string", nullable: true },
                  officerBadge: { type: "string", nullable: true },
                  offenceSection: { type: "string", nullable: true },
                  offenceSubSection: { type: "string", nullable: true },
                  offenceDescription: { type: "string", nullable: true },
                  violation: { type: "string", nullable: true },
                  fineAmount: { type: "string", nullable: true },
                  courtDate: { type: "string", nullable: true },
                },
                required: [],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_ticket_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to process image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data));

    // Extract the structured data from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "extract_ticket_data") {
      return new Response(
        JSON.stringify({ error: "Failed to extract ticket data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    
    // Map to a stable, backward-compatible shape expected by clients
    // Returns both a wrapper { success, data } and mirrored legacy keys within data
    const payload = {
      success: true,
      data: {
        // Canonical fields used by the form
        ticketNumber: extractedData.ticketNumber ?? null,
        issueDate: extractedData.issueDate ?? null,
        location: extractedData.location ?? null,
        officer: extractedData.officer ?? null,
        officerBadge: extractedData.officerBadge ?? null,
        offenceSection: extractedData.offenceSection ?? null,
        offenceSubSection: extractedData.offenceSubSection ?? null,
        offenceDescription: extractedData.offenceDescription ?? null,
        violation: extractedData.violation ?? null,
        // Provide fineAmount as numeric/string without currency symbol for client to format
        fineAmount: extractedData.fineAmount ?? null,
        courtDate: extractedData.courtDate ?? null,
        // Compatibility mirrors (legacy consumers)
        section: extractedData.offenceSection ?? null,
        subsection: extractedData.offenceSubSection ?? null,
        offenseDescription: extractedData.offenceDescription ?? null,
        // Convenience formatted fine string for consumers that display directly
        fine: extractedData.fineAmount ? `$${extractedData.fineAmount}` : null,
      },
    };

    return new Response(
      JSON.stringify(payload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OCR error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
