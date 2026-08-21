import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Zap, Upload, Send, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AILeadCapture from "./AILeadCapture";
import { trackAIQuery } from "@/hooks/useAEOAnalytics";
import FAQSection from "@/components/FAQSection";

interface AIAnswer {
  hook: string;
  explain: string;
  faqs: Array<{ q: string; a: string }>;
  disclaimer: string;
}

type UnknownRecord = Record<string, unknown>;

const SERVICE_STATUS = "Fabsy is an agent service, not a law firm.";
const EXACT_PRICING = "Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.";
const REQUIRED_DISCLAIMER = `This tool provides general automated extraction plus a Fabsy agent review. It is not case-specific legal advice. ${SERVICE_STATUS} Outcomes vary.`;

const forbiddenOutputPatterns = [
  new RegExp(["no", "win", "no", "fee"].join("\\s+"), "i"),
  new RegExp(["risk", "free"].join("[-\\s]+"), "i"),
  new RegExp(["money", "back"].join("[-\\s]+"), "i"),
  new RegExp(["zero", "risk"].join("[-\\s]+"), "i"),
  new RegExp(`\\b${["guar", "antee"].join("")}(?:s|d|ing)?\\b`, "i"),
];

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizePlainText = (value: unknown, maximum: number): string => {
  if (typeof value !== "string") return "";

  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\u2014|\u2013/g, ",")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length <= maximum ? normalized : "";
};

const hasOverCapPercentage = (text: string): boolean => {
  if (/\b(?:above|greater\s+than|more\s+than|over)\s+95\s*%/i.test(text)) return true;
  for (const match of text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*%\+?/g)) {
    if (Number(match[1]) > 95) return true;
  }
  return false;
};

const hasUnsupportedNumericClaim = (text: string): boolean => {
  const withoutApprovedPricing = text.split(EXACT_PRICING).join("");
  const numberWord = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
  const wordNumericClaim = new RegExp(
    `\\b${numberWord}(?:[-\\s]+${numberWord}){0,4}[-\\s]+(?:dollars?|demerit(?:s|\\s+points?)?|days?|weeks?|months?|years?|percent)\\b`,
    "i",
  );
  const amountPattern = /(?:CA\$|CAD\s*\$?)\s*\d[\d,.]*|\$\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:CAD|dollars?)\b|\bfine(?:\s+\w+){0,3}\s+\d[\d,.]*/i;
  const demeritPattern = /\b\d+(?:\.\d+)?\s+demerit(?:\s+points?)?\b/i;
  const responsePeriodPattern = /\b\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?)\b/i;
  const numericDatePattern = /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i;
  const namedDatePattern = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/i;

  return /\b\d{1,3}(?:\.\d+)?\s*%\+?\b/.test(withoutApprovedPricing)
    || wordNumericClaim.test(withoutApprovedPricing)
    || amountPattern.test(withoutApprovedPricing)
    || demeritPattern.test(withoutApprovedPricing)
    || responsePeriodPattern.test(withoutApprovedPricing)
    || numericDatePattern.test(withoutApprovedPricing)
    || namedDatePattern.test(withoutApprovedPricing);
};

const validateAiAnswer = (value: unknown): AIAnswer | null => {
  if (!isRecord(value) || !Array.isArray(value.faqs)) return null;

  const hook = sanitizePlainText(value.hook, 300);
  const explain = sanitizePlainText(value.explain, 3500);
  const faqs = value.faqs.slice(0, 6).map((item) => {
    if (!isRecord(item)) return null;
    const q = sanitizePlainText(item.q, 220);
    const a = sanitizePlainText(item.a, 700);
    return q && a ? { q, a } : null;
  });

  if (!hook || !explain || faqs.length === 0 || !faqs.every((item) => item !== null)) {
    return null;
  }

  const answer: AIAnswer = {
    hook,
    explain,
    faqs: faqs as Array<{ q: string; a: string }>,
    disclaimer: REQUIRED_DISCLAIMER,
  };
  const serialized = JSON.stringify(answer);
  const hasForbiddenLanguage = forbiddenOutputPatterns.some((pattern) => pattern.test(serialized));
  const hasGenderedAudience = /\b(?:for women|women-only|female drivers?)\b/i.test(serialized);
  const attributesLawyersToFabsy = /\bFabsy(?:'s)?\s+(?:lawyers?|attorneys?|legal team)\b/i.test(serialized);
  const givesCaseSpecificDirection = /\b(?:you should|I recommend that you|your best option is|you need to)\s+(?:plead|file|dispute|fight|pay|admit|accept|go to trial)\b/i.test(serialized);
  const withoutApprovedPricing = serialized.split(EXACT_PRICING).join("");
  const hasInexactPricing = /\b(?:price|pricing|fee|cost)\b|\bFabsy\b[^.!?\n]{0,80}(?:\bcharges?\b|\$)/i.test(withoutApprovedPricing);

  if (
    hasForbiddenLanguage
    || hasGenderedAudience
    || attributesLawyersToFabsy
    || givesCaseSpecificDirection
    || hasInexactPricing
    || hasOverCapPercentage(serialized)
    || hasUnsupportedNumericClaim(serialized)
  ) {
    return null;
  }

  return answer;
};

const AIQuestionWidget = () => {
  console.log("AIQuestionWidget rendering");
  const [question, setQuestion] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<AIAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAskQuestion = async () => {
    if (!question.trim()) {
      toast.error("Please enter a question");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAiAnswer(null);

    try {
      // Track AI query
      await trackAIQuery(question, {});

      // Call AI analysis function
      const { data, error: functionError } = await supabase.functions.invoke('analyze-ticket-ai', {
        body: {
          question: question.trim(),
          ticketData: {}
        }
      });

      if (functionError) {
        throw functionError;
      }

      if (!data || !data.ai_answer) {
        throw new Error('Invalid automated response');
      }

      const validatedAnswer = validateAiAnswer(data.ai_answer);
      if (!validatedAnswer) {
        throw new Error('The automated response did not pass safety checks');
      }

      setAiAnswer(validatedAnswer);

    } catch (err) {
      console.error('Analysis error:', err);
      setError('The automated review could not be completed safely.');
      toast.error('Review unavailable', {
        description: 'Please try again or request a free Fabsy ticket check.'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUploadTicket = () => {
    // Trigger the same file upload as the Hero section
    const uploadInput = document.getElementById('drag-upload') as HTMLInputElement;
    if (uploadInput) {
      uploadInput.click();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Automated Ticket Information</CardTitle>
          </div>
          {isAnalyzing && (
            <Badge variant="secondary" className="animate-pulse">
              Reviewing...
            </Badge>
          )}
        </div>
        <div className="space-y-2 mt-3">
          <p className="text-lg font-semibold text-foreground">
            Understand the information on your Alberta ticket
          </p>
          <p className="text-sm text-muted-foreground">
            Ask for general process information or upload a ticket for automated extraction. This is not legal advice.
          </p>
          <p className="text-xs text-muted-foreground">
            {SERVICE_STATUS} {EXACT_PRICING} Outcomes vary.
          </p>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!aiAnswer ? (
          <>
            <div className="space-y-3">
              <Textarea
                placeholder="Ask a general question about the process shown on your Alberta traffic ticket."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={handleKeyPress}
                className="min-h-[100px] text-base"
                disabled={isAnalyzing}
              />
              
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={handleAskQuestion}
                  disabled={isAnalyzing || !question.trim()}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white"
                  size="lg"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Reviewing...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Review Question
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleUploadTicket}
                  variant="outline"
                  className="flex-1 border-primary/30 hover:bg-primary/10"
                  size="lg"
                  disabled={isAnalyzing}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Ticket
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">Review Unavailable</p>
                  <p className="text-xs text-muted-foreground">{error}</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleAskQuestion}
                >
                  Try Again
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <Badge variant="default" className="bg-green-500">
                Automated Review Complete
              </Badge>
            </div>

            {/* Hook - Direct Answer */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-lg font-semibold text-foreground">
                {aiAnswer.hook}
              </p>
            </div>

            {/* Explanation */}
            <div className="space-y-3">
              {aiAnswer.explain.split('\n\n').map((paragraph, idx) => (
                <p key={idx} className="text-sm text-muted-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>

            {/* FAQs */}
            {aiAnswer && Array.isArray(aiAnswer.faqs) && aiAnswer.faqs.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Common Questions</h4>
                <FAQSection
                  faqs={aiAnswer.faqs.slice(0, 3).map((faq) => ({ q: faq.q.trim(), a: faq.a.trim() }))}
                  pageName={question || "Traffic ticket help"}
                  pageUrl={typeof window !== "undefined" ? window.location.href : "https://fabsy.ca"}
                />
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Disclaimer:</strong> {aiAnswer.disclaimer}
              </p>
            </div>

            {/* CTA */}
            <AILeadCapture 
              variant="open"
              ticketType="Traffic Ticket"
              aiAnswer={aiAnswer.hook}
            />

            {/* Ask Another Question */}
            <Button
              onClick={() => {
                setAiAnswer(null);
                setQuestion("");
              }}
              variant="outline"
              className="w-full"
            >
              Ask Another Question
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AIQuestionWidget;
