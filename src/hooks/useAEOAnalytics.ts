import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";

// Generate or retrieve session ID from sessionStorage
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('aeo_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('aeo_session_id', sessionId);
  }
  return sessionId;
};

// Event types matching the KPI names
export type AEOEventType = 
  | 'page_impression'
  | 'rich_result_win'
  | 'ai_query'
  | 'micro_lead'
  | 'human_review_request'
  | 'conversion_paid'
  | 'traffic_from_llm';

interface TrackEventParams {
  eventType: AEOEventType;
  pageSlug?: string;
  eventData?: Record<string, any>;
}

/**
 * Track AEO analytics events
 */
export const trackAEOEvent = async ({
  eventType,
  pageSlug,
  eventData = {}
}: TrackEventParams) => {
  try {
    const sessionId = getSessionId();
    const userAgent = navigator.userAgent;
    const referrer = document.referrer;

    await supabase.from('aeo_analytics').insert({
      event_type: eventType,
      page_slug: pageSlug,
      session_id: sessionId,
      user_agent: userAgent,
      referrer: referrer,
      event_data: eventData
    });

    console.log(`[AEO Analytics] Tracked: ${eventType}`, { pageSlug, eventData });
  } catch (error) {
    console.error('[AEO Analytics] Tracking error:', error);
    // Don't throw - analytics should never break the app
  }
};

/**
 * Hook to track page impressions
 */
export const usePageImpression = (pageSlug?: string) => {
  const tracked = useRef(false);

  useEffect(() => {
    if (pageSlug && !tracked.current) {
      trackAEOEvent({
        eventType: 'page_impression',
        pageSlug,
        eventData: {
          url: window.location.href,
          timestamp: new Date().toISOString()
        }
      });
      tracked.current = true;
    }
  }, [pageSlug]);
};

/**
 * Hook to detect and track traffic from LLMs
 */
export const useTrafficSource = () => {
  useEffect(() => {
    const referrer = document.referrer.toLowerCase();
    const llmSources = [
      'chatgpt.com',
      'chat.openai.com',
      'bard.google.com',
      'claude.ai',
      'perplexity.ai',
      'you.com'
    ];

    const isFromLLM = llmSources.some(source => referrer.includes(source));
    
    if (isFromLLM) {
      trackAEOEvent({
        eventType: 'traffic_from_llm',
        eventData: {
          referrer: document.referrer,
          landing_page: window.location.href,
          timestamp: new Date().toISOString()
        }
      });
    }
  }, []);
};

/**
 * Track AI helper queries
 */
export const trackAIQuery = async (query: string, ticketData?: any) => {
  await trackAEOEvent({
    eventType: 'ai_query',
    eventData: {
      query,
      ticket_data: ticketData,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Track micro-conversion lead captures
 */
export const trackMicroLead = async (leadData: {
  name: string;
  email: string;
  ticketType: string;
  source: string;
}) => {
  await trackAEOEvent({
    eventType: 'micro_lead',
    eventData: {
      ...leadData,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Track human review requests
 */
export const trackHumanReviewRequest = async (ticketInfo: any) => {
  await trackAEOEvent({
    eventType: 'human_review_request',
    eventData: {
      ticket_info: ticketInfo,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Track paid conversions
 */
export const trackPaidConversion = async (conversionData: {
  amount: number;
  ticketId?: string;
  clientId?: string;
}) => {
  await trackAEOEvent({
    eventType: 'conversion_paid',
    eventData: {
      ...conversionData,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Track rich result wins (call this from your SEO monitoring or when you detect featured snippets)
 */
export const trackRichResultWin = async (pageSlug: string, resultType: string) => {
  await trackAEOEvent({
    eventType: 'rich_result_win',
    pageSlug,
    eventData: {
      result_type: resultType,
      timestamp: new Date().toISOString()
    }
  });
};
