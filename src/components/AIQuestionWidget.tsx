import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Zap, Upload, Send, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AILeadCapture from "./AILeadCapture";
import { useNavigate } from "react-router-dom";
import { trackAIQuery } from "@/hooks/useAEOAnalytics";

interface AIAnswer {
  hook: string;
  explain: string;
  faqs: Array<{ q: string; a: string }>;
  disclaimer: string;
}

const AIQuestionWidget = () => {
  const [question, setQuestion] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<AIAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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
        throw new Error('Invalid response from AI');
      }

      setAiAnswer(data.ai_answer);

      // Optionally publish the page content
      if (data.page_json) {
        try {
          await supabase.functions.invoke('upsert-page-content', {
            body: data.page_json
          });
          console.log('Page content published:', data.page_json.slug);
        } catch (publishError) {
          console.error('Failed to publish page content:', publishError);
        }
      }

    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze question');
      toast.error('Analysis failed', {
        description: 'Please try again or contact support.'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUploadTicket = () => {
    navigate("/ticket-form");
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
            <CardTitle className="text-2xl">Free Ticket Analysis</CardTitle>
          </div>
          {isAnalyzing && (
            <Badge variant="secondary" className="animate-pulse">
              Analyzing...
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Ask a question about your traffic ticket or upload it for instant AI analysis
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!aiAnswer ? (
          <>
            <div className="space-y-3">
              <Textarea
                placeholder="E.g., Can I dispute a speeding ticket in Calgary? What are my options for a red light camera ticket?"
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
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Ask Question
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
                  <p className="font-semibold text-sm">Analysis Failed</p>
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
                Analysis Complete
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
            {aiAnswer.faqs && aiAnswer.faqs.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Common Questions</h4>
                {aiAnswer.faqs.slice(0, 3).map((faq, idx) => (
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