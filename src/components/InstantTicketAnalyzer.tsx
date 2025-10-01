import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, FileText, Zap, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AILeadCapture from "./AILeadCapture";
import { usePageImpression, useTrafficSource, trackAIQuery } from "@/hooks/useAEOAnalytics";

interface InstantTicketAnalyzerProps {
  ticketImage: File | null;
  fineAmount: string;
  violation: string;
  section?: string;
  subsection?: string;
  city?: string;
  date?: string;
}

interface AIAnswer {
  hook: string;
  explain: string;
  faqs: Array<{ q: string; a: string }>;
  disclaimer: string;
}

interface PageJSON {
  slug: string;
  meta_title: string;
  meta_description: string;
  h1: string;
  hook: string;
  bullets: string[];
  what: string;
  how: string;
  next: string;
  faqs: Array<{ q: string; a: string }>;
  video: { youtubeUrl: string; transcript: string };
  status: string;
}

const InstantTicketAnalyzer = ({ ticketImage, fineAmount, violation, section, subsection, city, date }: InstantTicketAnalyzerProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<AIAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track traffic sources
  useTrafficSource();

  useEffect(() => {
    if (ticketImage && fineAmount && violation) {
      analyzeTicket();
    }
  }, [ticketImage, fineAmount, violation, section, subsection, city, date]);

  const analyzeTicket = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      // Prepare ticket data
      const ticketData = {
        violation,
        fine: fineAmount,
        ...(city && { city }),
        ...(date && { date })
      };

      const question = `I received a ${violation} ticket in Alberta${city ? ` in ${city}` : ''}. The fine is ${fineAmount}. Can I dispute this?`;

      // Track AI query
      await trackAIQuery(question, ticketData);

      // Call AI analysis function
      const { data, error: functionError } = await supabase.functions.invoke('analyze-ticket-ai', {
        body: {
          question,
          ticketData
        }
      });

      if (functionError) {
        throw functionError;
      }

      if (!data || !data.ai_answer) {
        throw new Error('Invalid response from AI');
      }

      setAiAnswer(data.ai_answer);
      setAnalysisComplete(true);

      // Optionally publish the page content
      if (data.page_json) {
        try {
          await supabase.functions.invoke('upsert-page-content', {
            body: data.page_json
          });
          console.log('Page content published:', data.page_json.slug);
        } catch (publishError) {
          console.error('Failed to publish page content:', publishError);
          // Don't show error to user - this is optional
        }
      }

    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze ticket');
      toast.error('Analysis failed', {
        description: 'Please try again or contact support.'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!ticketImage || !fineAmount || !violation) {
    return null;
  }

  return (
    <Card className="mt-6 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Instant Ticket Analysis</CardTitle>
          {isAnalyzing && (
            <Badge variant="secondary" className="animate-pulse">
              Analyzing...
            </Badge>
          )}
          {analysisComplete && (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isAnalyzing ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
              Analyzing your ticket with AI...
            </div>
            <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }}></div>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-sm">Analysis Failed</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={analyzeTicket}
              >
                Try Again
              </Button>
            </div>
          </div>
        ) : analysisComplete && aiAnswer ? (
          <div className="space-y-6">
            {/* OCR Detected Offence Details */}
            {(section || subsection || violation) && (
              <div className="bg-white dark:bg-white/5 border-2 border-primary/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <h4 className="font-semibold text-sm text-foreground">OCR Detected Offence</h4>
                </div>
                {section && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-muted-foreground font-medium">Section:</span>
                    <span className="text-foreground">{section}</span>
                  </div>
                )}
                {subsection && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-muted-foreground font-medium">Subsection:</span>
                    <span className="text-foreground">{subsection}</span>
                  </div>
                )}
                {violation && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-muted-foreground font-medium">Description:</span>
                    <span className="text-foreground">{violation}</span>
                  </div>
                )}
              </div>
            )}

            {/* Eligibility Header */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <h3 className="text-2xl font-bold text-green-600">ELIGIBLE FOR DISPUTE</h3>
              </div>
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-lg font-semibold text-foreground">Analysis: This Ticket is Worth Fighting</p>
              </div>
            </div>

            {/* Hook - Direct Answer */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <p className="text-lg font-semibold text-foreground mb-2">
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
            {aiAnswer.faqs && aiAnswer.faqs.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Common Questions
                </h4>
                {aiAnswer.faqs.map((faq, idx) => (
                  <Card key={idx} className="bg-white/50 dark:bg-black/20 border-primary/10">
                    <CardContent className="p-4 space-y-2">
                      <p className="font-medium text-sm text-foreground">{faq.q}</p>
                      <p className="text-sm text-muted-foreground">{faq.a}</p>
                    </CardContent>
                  </Card>
                ))}
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
              ticketType={violation}
              aiAnswer={aiAnswer.hook}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default InstantTicketAnalyzer;