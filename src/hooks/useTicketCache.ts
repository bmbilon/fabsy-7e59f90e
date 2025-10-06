import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TicketData {
  ticketNumber?: string;
  issueDate?: string;
  location?: string;
  officer?: string;
  officerBadge?: string;
  offenceSection?: string;
  offenceSubSection?: string;
  offenceDescription?: string;
  violation?: string;
  fineAmount?: string;
  courtDate?: string;
  courtJurisdiction?: string;
  [key: string]: unknown;
}

export interface CachedTicketData {
  ticketData: TicketData;
  cacheKey: string;
  cachedAt: string;
  expiresAt: string;
  lastAccessed: string;
}

export const useTicketCache = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Cache ticket data immediately after OCR extraction
   */
  const cacheTicketData = async (ticketData: TicketData, customCacheKey?: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[TicketCache] Caching ticket data:', ticketData);
      
      const { data, error: cacheError } = await supabase.functions.invoke('cache-ticket-data', {
        body: {
          ticketData,
          cacheKey: customCacheKey
        }
      });

      if (cacheError) {
        console.error('[TicketCache] Cache error:', cacheError);
        setError('Failed to cache ticket data');
        return null;
      }

      console.log('[TicketCache] Data cached successfully:', data.cacheKey);
      return data.cacheKey;

    } catch (err) {
      console.error('[TicketCache] Exception caching data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Retrieve cached ticket data by cache key
   */
  const getCachedTicketData = async (cacheKey: string): Promise<CachedTicketData | null> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[TicketCache] Retrieving cached data for key:', cacheKey);

      const { data, error: retrieveError } = await supabase.functions.invoke('cache-ticket-data', {
        method: 'GET'
      });

      // For GET requests, construct the URL manually with environment variables
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      
      const response = await fetch(
        `${supabaseUrl}/functions/v1/cache-ticket-data?cacheKey=${encodeURIComponent(cacheKey)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[TicketCache] Retrieve error:', errorData.error);
        setError(errorData.error || 'Failed to retrieve cached data');
        return null;
      }

      const result = await response.json();
      console.log('[TicketCache] Data retrieved successfully:', result.cacheKey);
      
      return result;

    } catch (err) {
      console.error('[TicketCache] Exception retrieving data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Check if a cache key is valid and not expired
   */
  const isCacheKeyValid = async (cacheKey: string): Promise<boolean> => {
    try {
      const cachedData = await getCachedTicketData(cacheKey);
      return cachedData !== null;
    } catch {
      return false;
    }
  };

  /**
   * Generate a cache key from ticket data for consistent keying
   */
  const generateCacheKey = (ticketData: TicketData): string => {
    const ticketNumber = ticketData.ticketNumber || 'unknown';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `ticket_${ticketNumber}_${timestamp}_${random}`;
  };

  return {
    cacheTicketData,
    getCachedTicketData,
    isCacheKeyValid,
    generateCacheKey,
    isLoading,
    error
  };
};