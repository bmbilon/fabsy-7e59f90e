import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CacheTicketRequest {
  ticketData: Record<string, unknown>;
  cacheKey?: string;
}

interface GetTicketRequest {
  cacheKey: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const method = req.method;

    if (method === 'POST') {
      // Cache ticket data
      const { ticketData, cacheKey }: CacheTicketRequest = await req.json();

      if (!ticketData) {
        return new Response(
          JSON.stringify({ error: 'ticketData is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate cache key if not provided
      const finalCacheKey = cacheKey || `ticket_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Store in database
      const { data, error } = await supabase
        .from('ticket_cache')
        .upsert({
          cache_key: finalCacheKey,
          ticket_data: ticketData,
          accessed_at: new Date().toISOString()
        }, {
          onConflict: 'cache_key'
        })
        .select('cache_key, created_at, expires_at')
        .single();

      if (error) {
        console.error('Error caching ticket data:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to cache ticket data' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Ticket data cached with key: ${finalCacheKey}`);

      return new Response(
        JSON.stringify({
          success: true,
          cacheKey: finalCacheKey,
          expiresAt: data.expires_at,
          message: 'Ticket data cached successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (method === 'GET') {
      // Retrieve cached ticket data
      const cacheKey = url.searchParams.get('cacheKey');

      if (!cacheKey) {
        return new Response(
          JSON.stringify({ error: 'cacheKey parameter is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch from database
      const { data, error } = await supabase
        .from('ticket_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString()) // Only get non-expired records
        .single();

      if (error || !data) {
        console.log(`Ticket data not found or expired for key: ${cacheKey}`);
        return new Response(
          JSON.stringify({ error: 'Ticket data not found or expired' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update accessed_at timestamp
      await supabase
        .from('ticket_cache')
        .update({ accessed_at: new Date().toISOString() })
        .eq('cache_key', cacheKey);

      console.log(`Ticket data retrieved for key: ${cacheKey}`);

      return new Response(
        JSON.stringify({
          success: true,
          ticketData: data.ticket_data,
          cacheKey: data.cache_key,
          cachedAt: data.created_at,
          expiresAt: data.expires_at,
          lastAccessed: data.accessed_at
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Cache ticket data function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});