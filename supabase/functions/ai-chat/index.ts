import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVICE_STATUS = "Fabsy is an agent service, not a law firm.";
const EXACT_PRICING = "Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.";
const EXACT_TICKET_TRIAGE = "Ticket Triage costs $149 plus GST and includes priority placement in Fabsy's representation queue for the same eligible matter. If the matter is upgraded to the $488 representation service, the $149 is credited toward the flat fee, leaving a $339 base-fee balance plus GST; the 30% success fee still applies to any fine reduction.";
const SAFE_REPLY = `I can provide general process information, but I cannot provide case-specific legal advice or calculate a fine, demerit count, or response deadline. Check the values and instructions printed on your ticket. ${SERVICE_STATUS} ${EXACT_PRICING} Outcomes vary.`;

const CHAT_SYSTEM_PROMPT = `You are Fabsy's automated assistant for Alberta traffic ticket questions.

SERVICE BOUNDARIES:
- Use non-gendered language and serve all eligible users.
- Fabsy is an agent service, not a law firm.
- Give general process information only, not case-specific legal advice.
- Do not recommend a plea or tell a user what legal step to choose.
- Outcomes vary. Do not promise or predict a result.

FACT SAFETY:
- Do not state a fine amount, demerit count, response period, court date, or deadline unless the exact value appears in the structured TICKET DATA supplied with the user message.
- Never infer a number from a charge name, location, or general knowledge.
- When structured ticket data is absent, tell the user to check the ticket and the applicable official Alberta or court source.
- Do not state a success rate above 95%.
- Avoid refund-based, outcome-promise, and no-fee marketing claims.
- Use a standard hyphen or comma instead of a long dash.

PRICING:
- For representation pricing, use this exact sentence: "${EXACT_PRICING}"
- For Ticket Triage pricing or upgrade benefits, use this exact wording: "${EXACT_TICKET_TRIAGE}"

STYLE:
- Be concise, calm, and plain-language.
- Offer a free Fabsy ticket check when useful, while making clear that it is not legal advice.
- Do not claim that a consultation or outcome is free.`;

type UnknownRecord = Record<string, unknown>;

interface ChatMessage {
  sender: string;
  text: string;
}

interface TicketEvidence {
  amounts: Set<string>;
  demerits: Set<string>;
  deadlines: Set<string>;
}

const forbiddenOutputPatterns = [
  new RegExp(["no", "win", "no", "fee"].join("\\s+"), "i"),
  new RegExp(["risk", "free"].join("[-\\s]+"), "i"),
  new RegExp(["money", "back"].join("[-\\s]+"), "i"),
  new RegExp(["zero", "risk"].join("[-\\s]+"), "i"),
  new RegExp(`\\b${["guar", "antee"].join("")}(?:s|d|ing)?\\b`, "i"),
];

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeEvidenceValue = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();

const numericTokens = (value: string): string[] =>
  value.match(/\d+(?:\.\d+)?/g) ?? [];

const addEvidence = (target: Set<string>, value: unknown) => {
  const normalized = normalizeEvidenceValue(value);
  if (!normalized) return;

  target.add(normalized);
  numericTokens(normalized).forEach((token) => target.add(token.replace(/^0+(?=\d)/, "")));
};

const collectTicketEvidence = (ticketData: unknown): TicketEvidence => {
  const evidence: TicketEvidence = {
    amounts: new Set<string>(),
    demerits: new Set<string>(),
    deadlines: new Set<string>(),
  };

  const visit = (value: unknown, parentKey = "") => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, parentKey));
      return;
    }

    if (isRecord(value)) {
      Object.entries(value).forEach(([key, item]) => visit(item, key.toLowerCase()));
      return;
    }

    if (value === null || value === undefined || value === "") return;

    if (/(?:fine|amount|penalty)/i.test(parentKey)) addEvidence(evidence.amounts, value);
    if (/(?:demerit|point)/i.test(parentKey)) addEvidence(evidence.demerits, value);
    if (/(?:date|deadline|due|appear|court|respond)/i.test(parentKey)) addEvidence(evidence.deadlines, value);
  };

  visit(ticketData);
  return evidence;
};

const isSupportedBy = (claim: string, evidence: Set<string>): boolean => {
  const normalizedClaim = normalizeEvidenceValue(claim);
  if ([...evidence].some((value) => value.length > 2 && normalizedClaim.includes(value))) {
    return true;
  }

  const claimNumbers = numericTokens(normalizedClaim).map((token) => token.replace(/^0+(?=\d)/, ""));
  return claimNumbers.length > 0 && claimNumbers.every((token) => evidence.has(token));
};

const hasUnsupportedMatches = (
  text: string,
  pattern: RegExp,
  evidence: Set<string>,
): boolean => {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (!isSupportedBy(match[0], evidence)) return true;
  }
  return false;
};

const hasOverCapPercentage = (text: string): boolean => {
  for (const match of text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*%\+?/g)) {
    if (Number(match[1]) > 95) return true;
  }
  return false;
};

const hasUnsupportedTicketNumbers = (text: string, ticketData: unknown): boolean => {
  const evidence = collectTicketEvidence(ticketData);
  const withoutApprovedPricing = text.split(EXACT_PRICING).join("").split(EXACT_TICKET_TRIAGE).join("");

  const amountPattern = /(?:CA\$|CAD\s*\$?)\s*\d[\d,.]*|\$\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:CAD|dollars?)\b|\bfine(?:\s+\w+){0,3}\s+\d[\d,.]*/gi;
  const demeritPattern = /\b\d+(?:\.\d+)?\s+demerit(?:\s+points?)?\b/gi;
  const responsePeriodPattern = /\b\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?)\b/gi;
  const numericDatePattern = /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi;
  const namedDatePattern = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi;

  return hasUnsupportedMatches(withoutApprovedPricing, amountPattern, evidence.amounts)
    || hasUnsupportedMatches(withoutApprovedPricing, demeritPattern, evidence.demerits)
    || hasUnsupportedMatches(withoutApprovedPricing, responsePeriodPattern, evidence.deadlines)
    || hasUnsupportedMatches(withoutApprovedPricing, numericDatePattern, evidence.deadlines)
    || hasUnsupportedMatches(withoutApprovedPricing, namedDatePattern, evidence.deadlines);
};

const sanitizeAiReply = (reply: unknown, ticketData: unknown): string => {
  if (typeof reply !== "string" || !reply.trim()) return SAFE_REPLY;

  const normalized = reply
    .replace(/\u2014|\u2013/g, ",")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  const hasForbiddenLanguage = forbiddenOutputPatterns.some((pattern) => pattern.test(normalized));
  const hasGenderedAudience = /\b(?:for women|women-only|female drivers?)\b/i.test(normalized);
  const withoutApprovedPricing = normalized.split(EXACT_PRICING).join("").split(EXACT_TICKET_TRIAGE).join("");
  const hasInexactPricing = /\b(?:price|pricing|fee|cost)\b|\bFabsy\b[^.!?\n]{0,80}(?:\bcharges?\b|\$)/i.test(withoutApprovedPricing);

  if (
    hasForbiddenLanguage
    || hasGenderedAudience
    || hasInexactPricing
    || hasOverCapPercentage(normalized)
    || hasUnsupportedTicketNumbers(normalized, ticketData)
  ) {
    return SAFE_REPLY;
  }

  const withStatus = normalized.includes(SERVICE_STATUS)
    ? normalized
    : `${normalized}\n\n${SERVICE_STATUS}`;

  return /\boutcomes vary\b/i.test(withStatus)
    ? withStatus
    : `${withStatus} Outcomes vary.`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: UnknownRecord = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const context = Array.isArray(body.context)
      ? body.context.filter((item): item is ChatMessage =>
        isRecord(item) && typeof item.sender === "string" && typeof item.text === "string"
      )
      : [];
    const ticketData = isRecord(body.ticketData) ? body.ticketData : {};

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ticketContext = Object.keys(ticketData).length > 0
      ? `\n\nSTRUCTURED TICKET DATA:\n${JSON.stringify(ticketData, null, 2)}`
      : "\n\nSTRUCTURED TICKET DATA: none supplied";

    if (OPENAI_API_KEY) {
      console.log("Using OpenAI for chat");

      const messages = [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...context.slice(-6).map((item) => ({
          role: item.sender === "user" ? "user" : "assistant",
          content: item.text,
        })),
        { role: "user", content: `${message}${ticketContext}` },
      ];

      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages,
          max_tokens: 800,
          temperature: 0.2,
          presence_penalty: 0,
          frequency_penalty: 0,
        }),
      });

      if (aiResponse.ok) {
        const responseData = await aiResponse.json();
        const reply = responseData.choices?.[0]?.message?.content;
        if (reply) {
          return new Response(
            JSON.stringify({ reply: sanitizeAiReply(reply, ticketData) }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        console.warn("OpenAI chat request failed with status:", aiResponse.status);
      }
    }

    if (LOVABLE_API_KEY) {
      console.log("Using Lovable AI for chat");

      const messages = [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...context.slice(-6).map((item) => ({
          role: item.sender === "user" ? "user" : "assistant",
          content: item.text,
        })),
        { role: "user", content: `${message}${ticketContext}` },
      ];

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          messages,
          max_tokens: 800,
          temperature: 0.2,
        }),
      });

      if (aiResponse.ok) {
        const responseData = await aiResponse.json();
        const reply = responseData.choices?.[0]?.message?.content;
        if (reply) {
          return new Response(
            JSON.stringify({ reply: sanitizeAiReply(reply, ticketData) }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "The assistant is receiving too many requests. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } else {
        console.warn("Lovable AI chat request failed with status:", aiResponse.status);
      }
    }

    return new Response(
      JSON.stringify({ reply: SAFE_REPLY }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in ai-chat:", error);
    return new Response(
      JSON.stringify({
        error: "The assistant could not process that request. Please try again or request a free Fabsy ticket check.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
