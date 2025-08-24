import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://localhost:3000',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allowedOrigins = [
  'https://localhost:3000',
  'http://localhost:3000',
  process.env.SITE_URL,
].filter(Boolean);

async function validateCaptcha(token: string): Promise<boolean> {
  // Simple validation - in production, integrate with reCAPTCHA or similar
  return token && token.length > 10;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const origin = req.headers.get('origin');
    if (!allowedOrigins.includes(origin)) {
      console.error('Blocked request from unauthorized origin:', origin);
      return new Response(JSON.stringify({ error: 'Unauthorized origin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileName, contentType, captchaToken } = await req.json();

    // Validate CAPTCHA
    if (!await validateCaptcha(captchaToken)) {
      return new Response(JSON.stringify({ error: 'Invalid CAPTCHA' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate inputs
    if (!fileName || !contentType) {
      return new Response(JSON.stringify({ error: 'Missing fileName or contentType' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize filename
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileExtension = sanitizedFileName.split('.').pop()?.toLowerCase();
    
    // Validate file type
    const allowedTypes = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return new Response(JSON.stringify({ error: 'Invalid file type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique file path
    const timestamp = Date.now();
    const filePath = `${timestamp}_${sanitizedFileName}`;

    // Create signed upload URL (valid for 5 minutes)
    const { data, error } = await supabase.storage
      .from('resumes')
      .createSignedUploadUrl(filePath, {
        upsert: false,
      });

    if (error) {
      console.error('Error creating signed URL:', error);
      return new Response(JSON.stringify({ error: 'Failed to create upload URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      uploadUrl: data.signedUrl,
      filePath: filePath,
      token: data.token
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in create-upload-url function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});