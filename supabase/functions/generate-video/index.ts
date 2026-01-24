import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supported video models and their API endpoints
// API Docs: https://docs.geminigen.ai
const MODEL_ENDPOINTS: Record<string, string> = {
  // Sora models
  'sora-2': 'https://api.geminigen.ai/uapi/v1/video-gen/sora',
  'sora-2-pro': 'https://api.geminigen.ai/uapi/v1/video-gen/sora',
  'sora-2-pro-hd': 'https://api.geminigen.ai/uapi/v1/video-gen/sora',
  // Veo models  
  'veo-2': 'https://api.geminigen.ai/uapi/v1/video-gen/veo',
  'veo-3.1': 'https://api.geminigen.ai/uapi/v1/video-gen/veo',
  'veo-3.1-fast': 'https://api.geminigen.ai/uapi/v1/video-gen/veo',
  // Grok model
  'grok-3': 'https://api.geminigen.ai/uapi/v1/video-gen/grok',
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

    const {
      prompt,
      duration,
      aspect_ratio,
      reference_image_url,
      model = 'sora-2',
      // Additional parameters from studios
      first_frame,
      last_frame,
      image_url,
      resolution: clientResolution,
      mode // For Grok
    } = await req.json();

    // Validate model
    if (!VALID_MODELS.includes(model)) {
      throw new Error(`Invalid model: ${model}. Valid models: ${VALID_MODELS.join(', ')}`);
    }

    console.log('=== Video Generation Request ===');
    console.log('User:', user.id);
    console.log('Prompt:', prompt?.substring(0, 100) + '...');
    console.log('Duration:', duration);
    console.log('Aspect ratio:', aspect_ratio);
    console.log('Model:', model);
    console.log('Reference image:', reference_image_url ? 'provided' : 'none');
    console.log('First Frame:', first_frame ? 'provided' : 'none');
    console.log('Image URL:', image_url ? 'provided' : 'none');
    console.log('Client Resolution:', clientResolution);

    // Determine the image URL to use for I2V
    const imageForI2V = first_frame || image_url || reference_image_url;

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

    // Create video generation record
    const { data: videoRecord, error: insertError } = await supabase
      .from('video_generations')
      .insert({
        user_id: user.id,
        prompt,
        duration,
        aspect_ratio,
        reference_image_url: imageForI2V,
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

    // Build FormData for GeminiGen API
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', model);

    // Determine model type
    const isSoraModel = model.startsWith('sora');
    const isVeoModel = model.startsWith('veo');
    const isGrokModel = model.startsWith('grok');

    // === RESOLUTION ===
    // Sora: uses 'small' (720p) or 'large' (1080p)
    // Veo: uses '720p' or '1080p' (veo-2 only supports 720p)
    // Grok: uses '360p' or '720p'
    if (isSoraModel) {
      const soraResolution = clientResolution === '1080p' || model.includes('hd') ? 'large' : 'small';
      formData.append('resolution', soraResolution);
    } else if (isVeoModel) {
      const veoResolution = clientResolution || (model === 'veo-2' ? '720p' : '720p');
      formData.append('resolution', veoResolution);
    } else if (isGrokModel) {
      formData.append('resolution', clientResolution || '720p');
    }

    // === DURATION ===
    // Sora: 10/15 for sora-2, 25 for sora-2-pro, 15 for sora-2-pro-hd
    // Grok: only 6 seconds
    if (isGrokModel) {
      formData.append('duration', '6'); // Grok only supports 6s
    } else {
      formData.append('duration', duration?.toString() || '10');
    }

    // === ASPECT RATIO ===
    // Sora: 'landscape', 'portrait', 'square'
    // Veo: '16:9', '9:16'
    // Grok: 'landscape', 'portrait', 'square'
    let aspectRatioFormatted = aspect_ratio || 'landscape';
    if (isVeoModel) {
      // Map to Veo format
      if (aspect_ratio === 'landscape' || aspect_ratio === '16:9') {
        aspectRatioFormatted = '16:9';
      } else if (aspect_ratio === 'portrait' || aspect_ratio === '9:16') {
        aspectRatioFormatted = '9:16';
      } else {
        aspectRatioFormatted = '16:9'; // Default for Veo
      }
    }
    formData.append('aspect_ratio', aspectRatioFormatted);

    // === MODE (Grok only) ===
    if (isGrokModel) {
      formData.append('mode', mode || 'custom');
    }

    // === IMAGE TO VIDEO (I2V) ===
    // Sora & Grok: use 'file_urls' (array of strings)
    // Veo: use 'ref_images' (array, up to 2 items)
    if (imageForI2V && imageForI2V.startsWith('http')) {
      console.log('Adding reference image for I2V:', imageForI2V);

      if (isVeoModel) {
        // Veo uses ref_images array
        formData.append('ref_images', imageForI2V);
        if (last_frame && last_frame.startsWith('http')) {
          formData.append('ref_images', last_frame);
        }
      } else {
        // Sora and Grok use file_urls
        formData.append('file_urls', imageForI2V);
      }
    }

    // Get the appropriate API endpoint for the model
    const apiEndpoint = MODEL_ENDPOINTS[model];

    console.log('=== Calling GeminiGen API ===');
    console.log('Endpoint:', apiEndpoint);
    console.log('Model:', model);
    console.log('Has I2V:', !!imageForI2V);

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

      throw new Error(geminigenData.detail?.message || geminigenData.message || 'Failed to generate video');
    }

    // Update video record with GeminiGen UUID
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

    console.log('Video generation initiated successfully');

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
