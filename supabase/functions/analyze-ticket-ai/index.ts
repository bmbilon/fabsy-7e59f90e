import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { detectOwnerNotice } from "../_shared/photo-radar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVICE_STATUS = "Fabsy is an agent service, not a law firm.";
const EXACT_PRICING = "Rapid Resolution costs $198 CAD plus applicable GST for eligible Alberta pre-trial matters. The Insurance Impact & Renewal Planning Report costs $49 CAD plus applicable GST, or both products cost $229 CAD plus applicable GST. Trial representation, government fines and out-of-scope matters are separate.";
const EXACT_RAPID_RESOLUTION = "Rapid Resolution includes secure intake, digital authorization, disclosure request and review, a fact-specific prosecutor-review submission, prompt status notifications, a plain-language Crown-response comparison and the client's final decision. Complete, readable disclosure is reviewed and the next authorized action is prepared or submitted within 48 hours; Crown response and final-outcome timing are separate.";
const REQUIRED_DISCLAIMER = `This tool provides general automated extraction plus a Fabsy agent review. It is not case-specific legal advice. ${SERVICE_STATUS} Outcomes vary.`;

const SYSTEM_PROMPT = `You are Fabsy's automated assistant for Alberta traffic ticket information.

Return ONLY a valid JSON object with "ai_answer" and "page_json" fields.

SERVICE BOUNDARIES:
- Fabsy is an agent service, not a law firm.
- Give general information only. Do not give case-specific legal advice, select a plea, or tell a user which legal step to choose.
- Use non-gendered language.
- Outcomes vary. Do not promise or predict a result.
- Avoid refund-based, outcome-promise, and no-fee marketing language.
- Use a standard hyphen or comma instead of a long dash.

FACT SAFETY:
- Only repeat a fine amount, demerit count, response period, court date, or deadline if that exact value appears in the structured TICKET DATA.
- Never infer a numeric value from a violation name, location, or general knowledge.
- If a value is not in TICKET DATA, tell the user to check the ticket and the applicable official Alberta or court source.
- Do not state unsourced statistics or any success-rate percentage.

PRICING:
- For current pricing, use this exact sentence: "${EXACT_PRICING}"
- For Rapid Resolution scope or timing, use this exact wording: "${EXACT_RAPID_RESOLUTION}"

OUTPUT SHAPE:
{
  "ai_answer": {
    "hook": "one direct, neutral sentence",
    "explain": "two or three short plain-text paragraphs",
    "faqs": [{"q": "plain-text question", "a": "plain-text direct answer"}],
    "disclaimer": "${REQUIRED_DISCLAIMER}"
  },
  "page_json": {
    "slug": "lowercase-url-slug",
    "meta_title": "60 characters or fewer",
    "meta_description": "155 characters or fewer",
    "h1": "plain-text heading",
    "hook": "identical to ai_answer.hook",
    "bullets": ["plain text"],
    "what": "simple HTML paragraphs",
    "how": "simple HTML paragraphs",
    "next": "simple HTML paragraphs",
    "faqs": [{"q": "identical to ai_answer FAQ", "a": "identical to ai_answer FAQ"}],
    "video": {"youtubeUrl": "", "transcript": ""},
    "status": "draft"
  }
}`;

type UnknownRecord = Record<string, unknown>;

interface FaqItem {
  q: string;
  a: string;
}

interface AiAnswer {
  hook: string;
  explain: string;
  faqs: FaqItem[];
  disclaimer: string;
}

interface PageJson {
  slug: string;
  meta_title: string;
  meta_description: string;
  h1: string;
  hook: string;
  bullets: string[];
  what: string;
  how: string;
  next: string;
  faqs: FaqItem[];
  video: { youtubeUrl: string; transcript: string };
  status: "draft";
}

interface AnalysisResponse {
  ai_answer: AiAnswer;
  page_json: PageJson;
}

interface TicketEvidence {
  all: Set<string>;
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

const FALLBACK_FAQS: FaqItem[] = [
  {
    q: "Can this tool choose a plea or legal strategy for me?",
    a: "No. It provides general automated extraction and process information only. Check the ticket instructions or obtain independent legal advice for a legal decision.",
  },
  {
    q: "Where can I confirm the response deadline?",
    a: "Use the deadline and instructions printed on your ticket, then confirm them with the applicable official court source if needed.",
  },
  {
    q: "What does Fabsy charge for an eligible matter?",
    a: EXACT_PRICING,
  },
];

const fallbackResponse = (): AnalysisResponse => {
  const hook = "The available process depends on the verified ticket details and the instructions printed on the ticket.";

  return {
    ai_answer: {
      hook,
      explain: "This automated tool can summarize information supplied from a ticket and provide general Alberta process information. It cannot decide a plea, predict an outcome, or replace case-specific legal advice.\n\nCheck every extracted detail against the ticket itself. A Fabsy agent can assess whether the matter is eligible for Fabsy's permitted agent services.",
      faqs: FALLBACK_FAQS,
      disclaimer: REQUIRED_DISCLAIMER,
    },
    page_json: {
      slug: "alberta-traffic-ticket-information",
      meta_title: "Alberta Traffic Ticket Information | Fabsy",
      meta_description: "Review general Alberta traffic ticket process information and request a free Fabsy ticket check for an eligible matter.",
      h1: "Alberta Traffic Ticket Information",
      hook,
      bullets: [
        "Verify extracted details against the ticket.",
        "Follow the response instructions printed on the ticket.",
        "Request a free Fabsy ticket check for an eligible matter.",
      ],
      what: "<p>This page provides general automated extraction and Alberta traffic ticket process information.</p>",
      how: "<p>Check the ticket details and use the official instructions and court source that apply to the matter.</p>",
      next: `<p>${EXACT_PRICING} Outcomes vary.</p>`,
      faqs: FALLBACK_FAQS,
      video: { youtubeUrl: "", transcript: "" },
      status: "draft",
    },
  };
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePlainText = (value: unknown): string => {
  if (typeof value !== "string") return "";

  return value
    .replace(/<\/(?:p|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u2014|\u2013/g, ",")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const toSafeParagraphHtml = (value: unknown): string => {
  const plainText = normalizePlainText(value);
  if (!plainText) return "";

  return plainText
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
};

const truncate = (value: string, maximum: number): string =>
  value.length <= maximum ? value : value.slice(0, maximum).trimEnd();

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
    all: new Set<string>(),
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

    addEvidence(evidence.all, value);
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
  if (/\b(?:above|greater\s+than|more\s+than|over)\s+95\s*%/i.test(text)) return true;
  for (const match of text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*%\+?/g)) {
    if (Number(match[1]) > 95) return true;
  }
  return false;
};

const hasUnsupportedTicketNumbers = (text: string, ticketData: unknown): boolean => {
  const evidence = collectTicketEvidence(ticketData);
  const withoutApprovedPricing = text.split(EXACT_PRICING).join("").split(EXACT_RAPID_RESOLUTION).join("");
  const numberWord = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
  const wordNumericClaim = new RegExp(
    `\\b${numberWord}(?:[-\\s]+${numberWord}){0,4}[-\\s]+(?:dollars?|demerit(?:s|\\s+points?)?|days?|weeks?|months?|years?|percent)\\b`,
    "i",
  );

  if (/\b\d{1,3}(?:\.\d+)?\s*%\+?\b/.test(withoutApprovedPricing)) return true;
  if (wordNumericClaim.test(withoutApprovedPricing)) return true;

  const outputNumbers = numericTokens(withoutApprovedPricing)
    .map((token) => token.replace(/^0+(?=\d)/, ""));
  if (outputNumbers.some((token) => !evidence.all.has(token))) return true;

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

const hasUnsafeLanguage = (text: string): boolean => {
  const hasForbiddenLanguage = forbiddenOutputPatterns.some((pattern) => pattern.test(text));
  const hasGenderedAudience = /\b(?:for women|women-only|female drivers?)\b/i.test(text);
  const attributesLawyersToFabsy = /\bFabsy(?:'s)?\s+(?:lawyers?|attorneys?|legal team)\b/i.test(text);
  const givesCaseSpecificDirection = /\b(?:you should|I recommend that you|your best option is|you need to)\s+(?:plead|file|dispute|fight|pay|admit|accept|go to trial)\b/i.test(text);
  const promisesOutcome = /\b(?:will|certain to|sure to)\s+(?:win|succeed|dismiss|cancel|reduce|remove)\b/i.test(text);

  return hasForbiddenLanguage
    || hasGenderedAudience
    || attributesLawyersToFabsy
    || givesCaseSpecificDirection
    || promisesOutcome;
};

const parseFaqs = (value: unknown): FaqItem[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;

  const faqs = value.slice(0, 6).map((item) => {
    if (!isRecord(item)) return null;
    const q = truncate(normalizePlainText(item.q), 220);
    const a = truncate(normalizePlainText(item.a), 700);
    return q && a ? { q, a } : null;
  });

  return faqs.every((item): item is FaqItem => item !== null) ? faqs : null;
};

const validateAndNormalizeResponse = (
  value: unknown,
  ticketData: unknown,
): AnalysisResponse | null => {
  if (!isRecord(value) || !isRecord(value.ai_answer) || !isRecord(value.page_json)) return null;

  const aiAnswerSource = value.ai_answer;
  const pageSource = value.page_json;
  const hook = truncate(normalizePlainText(aiAnswerSource.hook), 300);
  const explain = truncate(normalizePlainText(aiAnswerSource.explain), 3500);
  const faqs = parseFaqs(aiAnswerSource.faqs);
  const metaTitle = truncate(normalizePlainText(pageSource.meta_title), 60);
  const metaDescription = truncate(normalizePlainText(pageSource.meta_description), 155);
  const h1 = truncate(normalizePlainText(pageSource.h1), 180);
  const what = toSafeParagraphHtml(pageSource.what);
  const how = toSafeParagraphHtml(pageSource.how);
  const bullets = Array.isArray(pageSource.bullets)
    ? pageSource.bullets
      .slice(0, 8)
      .map((item) => truncate(normalizePlainText(item), 300))
      .filter(Boolean)
    : [];
  const rawSlug = normalizePlainText(pageSource.slug).toLowerCase();
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug) && rawSlug.length <= 100
    ? rawSlug
    : "alberta-traffic-ticket-information";

  if (!hook || !explain || !faqs || !metaTitle || !metaDescription || !h1 || !what || !how || bullets.length === 0) {
    return null;
  }

  const normalized: AnalysisResponse = {
    ai_answer: {
      hook,
      explain,
      faqs,
      disclaimer: REQUIRED_DISCLAIMER,
    },
    page_json: {
      slug,
      meta_title: metaTitle,
      meta_description: metaDescription,
      h1,
      hook,
      bullets,
      what,
      how,
      next: `<p>Check the instructions printed on the ticket and request a free Fabsy ticket check if the matter may be eligible. ${EXACT_PRICING} Outcomes vary.</p>`,
      faqs,
      video: { youtubeUrl: "", transcript: "" },
      status: "draft",
    },
  };

  const visibleText = [
    normalized.ai_answer.hook,
    normalized.ai_answer.explain,
    normalized.ai_answer.disclaimer,
    ...normalized.ai_answer.faqs.flatMap((faq) => [faq.q, faq.a]),
    normalized.page_json.slug,
    normalized.page_json.meta_title,
    normalized.page_json.meta_description,
    normalized.page_json.h1,
    ...normalized.page_json.bullets,
    normalized.page_json.what,
    normalized.page_json.how,
    normalized.page_json.next,
  ].join("\n");
  const withoutApprovedPricing = visibleText.split(EXACT_PRICING).join("").split(EXACT_RAPID_RESOLUTION).join("");
  const hasInexactPricing = /\b(?:price|pricing|fee|cost)\b|\bFabsy\b[^.!?\n]{0,80}(?:\bcharges?\b|\$)/i.test(withoutApprovedPricing);

  if (
    hasUnsafeLanguage(visibleText)
    || hasInexactPricing
    || hasOverCapPercentage(visibleText)
    || hasUnsupportedTicketNumbers(visibleText, ticketData)
  ) {
    return null;
  }

  return normalized;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: UnknownRecord = await req.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const ticketData = isRecord(body.ticketData) ? body.ticketData : {};

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const detected = detectOwnerNotice(ticketData);
    const ticketType = ticketData.ticket_type === "officer_issued" || ticketData.ticket_type === "photo_radar"
      ? ticketData.ticket_type : detected.ticket_type;
    if (ticketType === "photo_radar") {
      // Product-specific information is deterministic. Never sell an insurance
      // report for owner liability or turn extracted wording into a legal finding.
      const result = fallbackResponse();
      const hook = "A registered-owner camera notice has no demerits and no insurance impact. Only the fine is on the table.";
      const pricing = "Rapid Resolution: Photo Radar costs $79 CAD plus 5% GST ($82.95 total). No trial. No success fee. Government fines are separate.";
      const faqs = [
        { q: "Does photo radar affect insurance in Alberta?", a: "No. Alberta registered-owner automated enforcement notices under TSA s.160(1) have no insurance impact and carry no demerits." },
        { q: "What can Fabsy do?", a: "For an accepted notice, Fabsy enters the not-guilty plea, requests disclosure and pursues a Crown reduction or withdrawal. You approve any deal. No outcome is promised." },
        { q: "What does Photo Radar cost?", a: pricing },
        { q: "When does the 48-hour commitment start?", a: "After complete, readable disclosure is received and matched to the file. It covers Fabsy's next authorized action, not the Crown's response or a final outcome. Keep following the notice's deadlines." },
      ];
      result.ai_answer = { hook, explain: `${hook}\n\n${pricing} Check the extracted ticket type and ownership on the offence date. Missing evidence requires review; it does not prove that a notice is invalid.`, faqs, disclaimer: REQUIRED_DISCLAIMER };
      result.page_json = { ...result.page_json, hook, h1: "Alberta Photo Radar Notice Check", what: `<p>${hook}</p>`, how: `<p>${faqs[1].a}</p>`, next: `<p>${pricing}</p>`, faqs };
      return new Response(JSON.stringify({ ...result, ticket_type: ticketType, ticket_type_evidence: detected.ticket_type_evidence }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userMessage = `${question}\n\nSTRUCTURED TICKET DATA:\n${JSON.stringify(ticketData, null, 2)}`;
    console.log("Analyzing a traffic ticket question with structured ticket data fields:", Object.keys(ticketData));

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
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment is required for the configured AI service." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.error("AI gateway request failed with status:", aiResponse.status);
      throw new Error("AI gateway request failed");
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;
    let response = fallbackResponse();

    if (typeof aiContent === "string" && aiContent.trim()) {
      try {
        const cleanedContent = aiContent
          .replace(/```json\n?/gi, "")
          .replace(/```\n?/g, "")
          .trim();
        const parsedResponse: unknown = JSON.parse(cleanedContent);
        response = validateAndNormalizeResponse(parsedResponse, ticketData) ?? response;
      } catch (error) {
        console.warn("AI response failed validation; using the safe fallback:", error instanceof Error ? error.message : "invalid output");
      }
    }

    return new Response(
      JSON.stringify({ ...response, ticket_type: ticketType, ticket_type_evidence: detected.ticket_type_evidence }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in analyze-ticket-ai:", error);
    return new Response(
      JSON.stringify({
        error: "The automated analysis could not be completed. Please try again or request a free Fabsy ticket check.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
