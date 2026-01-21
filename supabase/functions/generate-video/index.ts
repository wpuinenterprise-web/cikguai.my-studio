import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supported video models and their API endpoints
const MODEL_ENDPOINTS: Record<string, string> = {
  'sora-2': 'https://api.geminigen.ai/uapi/v1/video-gen/sora',
  'sora-2-pro': 'https://api.geminigen.ai/uapi/v1/video-gen/sora',
  'veo-3.1-fast': 'https://api.geminigen.ai/uapi/v1/video-gen/veo',
  'grok': 'https://api.geminigen.ai/uapi/v1/video-gen/grok',
};

const VALID_MODELS = Object.keys(MODEL_ENDPOINTS);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINIGEN_API_KEY = Deno.env.get('GEMINIGEN_API_KEY');
    if (!GEMINIGEN_API_KEY) {
      throw new Error('GEMINIGEN_API_KEY is not set');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header for user verification
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { prompt, duration, aspect_ratio, reference_image_url, model = 'sora-2' } = await req.json();

    // Validate model
    if (!VALID_MODELS.includes(model)) {
      throw new Error(`Invalid model: ${model}. Valid models: ${VALID_MODELS.join(', ')}`);
    }

    console.log('Generating video for user:', user.id);
    console.log('Prompt:', prompt);
    console.log('Duration:', duration);
    console.log('Aspect ratio:', aspect_ratio);
    console.log('Model:', model);

    // Check user's video limit
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('videos_used, video_limit, total_videos_generated')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      throw new Error('Failed to fetch user profile');
    }

    if (profile.videos_used >= profile.video_limit) {
      throw new Error('Video generation limit reached');
    }

    // Create video generation record with model
    const { data: videoRecord, error: insertError } = await supabase
      .from('video_generations')
      .insert({
        user_id: user.id,
        prompt,
        duration,
        aspect_ratio,
        reference_image_url,
        model,
        status: 'processing',
        status_percentage: 1,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw new Error('Failed to create video record');
    }

    console.log('Video record created:', videoRecord.id);

    // Call GeminiGen API with selected model
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('resolution', model.includes('pro') ? 'medium' : 'small');
    formData.append('duration', duration.toString());
    formData.append('aspect_ratio', aspect_ratio);

    // Send reference image URL for I2V (Image to Video)
    // Try multiple parameter names that GeminiGen API might accept
    if (reference_image_url && reference_image_url.startsWith('http')) {
      console.log('Adding reference image for I2V:', reference_image_url);
      // Add as multiple possible parameter names for I2V
      formData.append('first_frame_url', reference_image_url);
      formData.append('image_url', reference_image_url);
      formData.append('file_urls', reference_image_url);
    } else if (reference_image_url) {
      console.log('Invalid reference image URL format:', reference_image_url.substring(0, 50));
    }

    // Get the appropriate API endpoint for the model
    const apiEndpoint = MODEL_ENDPOINTS[model];

    console.log('Calling GeminiGen API with params:', {
      prompt: prompt.substring(0, 100) + '...',
      model,
      endpoint: apiEndpoint,
      duration,
      aspect_ratio,
      has_reference_image: !!reference_image_url,
    });

    const geminigenResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'x-api-key': GEMINIGEN_API_KEY,
      },
      body: formData,
    });

    const geminigenData = await geminigenResponse.json();
    console.log('GeminiGen response:', JSON.stringify(geminigenData));

    if (!geminigenResponse.ok) {
      console.error('GeminiGen API error:', geminigenData);

      // Update video record with failure
      await supabase
        .from('video_generations')
        .update({
          status: 'failed',
          status_percentage: 0,
        })
        .eq('id', videoRecord.id);

      throw new Error(geminigenData.detail?.message || 'Failed to generate video');
    }

    // Update video record with GeminiGen UUID - THIS IS CRITICAL for sync
    const { error: updateError } = await supabase
      .from('video_generations')
      .update({
        geminigen_uuid: geminigenData.uuid,
        status_percentage: geminigenData.status_percentage || 10,
      })
      .eq('id', videoRecord.id);

    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('Updated video with geminigen_uuid:', geminigenData.uuid);
    }

    // NOTE: videos_used is NOT incremented here anymore
    // It will be incremented in check-video-status when video actually completes
    // This prevents users losing quota when generation fails
    console.log('Video generation initiated successfully (limit will be counted on completion)');

    return new Response(
      JSON.stringify({
        success: true,
        video_id: videoRecord.id,
        geminigen_uuid: geminigenData.uuid,
        status: 'processing',
        message: 'Video generation started',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error('Error in generate-video function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
