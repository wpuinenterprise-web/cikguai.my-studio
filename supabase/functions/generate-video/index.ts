import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { prompt, duration, aspect_ratio, reference_image_url } = await req.json();

    console.log('Generating video for user:', user.id);
    console.log('Prompt:', prompt);
    console.log('Duration:', duration);
    console.log('Aspect ratio:', aspect_ratio);

    // Check user's video limit
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('videos_used, video_limit')
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
        reference_image_url,
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

    // Call GeminiGen API
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', 'sora-2');
    formData.append('resolution', 'small');
    formData.append('duration', duration.toString());
    formData.append('aspect_ratio', aspect_ratio);
    
    // Send reference image URL for I2V (Image to Video)
    if (reference_image_url && reference_image_url.startsWith('http')) {
      console.log('Adding reference image for I2V:', reference_image_url);
      formData.append('file_urls', reference_image_url);
    } else if (reference_image_url) {
      console.log('Invalid reference image URL format:', reference_image_url.substring(0, 50));
    }

    console.log('Calling GeminiGen API...');

    const geminigenResponse = await fetch('https://api.geminigen.ai/uapi/v1/video-gen/sora', {
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

    // Increment user's video count
    await supabase
      .from('profiles')
      .update({ videos_used: profile.videos_used + 1 })
      .eq('id', user.id);

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
