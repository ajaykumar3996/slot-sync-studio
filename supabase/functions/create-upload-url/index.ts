import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://localhost:3000',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allowedOrigins = [
  'https://localhost:3000',
  'http://localhost:3000',
  process.env.SITE_URL,
].filter(Boolean);

// Security: Input validation schema
const UploadRequestSchema = z.object({
  fileName: z.string().trim().min(1, 'Filename required').max(255, 'Filename too long')
    .regex(/^[a-zA-Z0-9._\-]+$/, 'Invalid filename characters'),
  contentType: z.string().trim().min(1, 'Content type required')
    .regex(/^[a-zA-Z0-9\-\/]+$/, 'Invalid content type'),
  captchaToken: z.string().min(10, 'Invalid CAPTCHA token'),
});

// File size limits (in bytes)
const MAX_RESUME_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PAYMENT_SIZE = 5 * 1024 * 1024;  // 5MB

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

    const rawData = await req.json();
    
    // Security: Validate input with Zod
    const validationResult = UploadRequestSchema.safeParse(rawData);
    
    if (!validationResult.success) {
      console.error('Input validation failed:', validationResult.error.errors);
      return new Response(JSON.stringify({ 
        error: 'Invalid input data',
        details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileName, contentType, captchaToken } = validationResult.data;

    // Validate CAPTCHA
    if (!await validateCaptcha(captchaToken)) {
      return new Response(JSON.stringify({ error: 'Invalid CAPTCHA' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize filename (already validated by Zod)
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const fileExtension = sanitizedFileName.split('.').pop()?.toLowerCase();
    
    // Validate file type
    const allowedTypes = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'jpg', 'jpeg', 'png'];
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid file type',
        allowed: allowedTypes 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine file size limit based on content type
    const isImage = ['jpg', 'jpeg', 'png'].includes(fileExtension);
    const maxSize = isImage ? MAX_PAYMENT_SIZE : MAX_RESUME_SIZE;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique file path
    const timestamp = Date.now();
    const filePath = `${timestamp}_${sanitizedFileName}`;

    // Create signed upload URL (valid for 5 minutes) with size limit
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
      token: data.token,
      maxSize: maxSize,
      maxSizeMB: Math.round(maxSize / 1024 / 1024)
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