import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ADMIN_PRESHARED_KEY = Deno.env.get('ADMIN_PRESHARED_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    // Optional: Check admin preshared key for security
    if (ADMIN_PRESHARED_KEY) {
      const authHeader = req.headers.get('x-admin-key');
      if (authHeader !== ADMIN_PRESHARED_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const pageData = await req.json();

    // Validate required fields
    if (!pageData.slug || !pageData.meta_title || !pageData.h1) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: slug, meta_title, h1' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize FAQs: ensure q and a are plain strings (no HTML)
    if (pageData.faqs && Array.isArray(pageData.faqs)) {
      pageData.faqs = pageData.faqs.map((faq: any) => ({
        q: String(faq.q || '').trim(),
        a: String(faq.a || '').trim(),
      }));
    }

    // Create Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upsert page content
    const { data, error } = await supabase
      .from('page_content')
      .upsert({
        slug: pageData.slug,
        meta_title: pageData.meta_title,
        meta_description: pageData.meta_description || '',
        h1: pageData.h1,
        hook: pageData.hook || '',
        bullets: pageData.bullets || [],
        what: pageData.what || null,
        how: pageData.how || null,
        next: pageData.next || null,
        faqs: pageData.faqs || [],
        video: pageData.video || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✓ Upserted page: ${pageData.slug}`);

    return new Response(JSON.stringify({ 
      success: true, 
      slug: pageData.slug,
      data 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
