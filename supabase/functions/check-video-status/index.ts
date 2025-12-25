import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { geminigen_uuid, video_id } = await req.json();

    console.log('Checking video status for UUID:', geminigen_uuid);

    // Call GeminiGen History API
    const response = await fetch(
      `https://api.geminigen.ai/uapi/v1/history/${geminigen_uuid}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': GEMINIGEN_API_KEY,
        },
      }
    );

    const data = await response.json();
    console.log('GeminiGen history response:', JSON.stringify(data));

    if (!response.ok) {
      throw new Error(data.detail?.message || 'Failed to check video status');
    }

    // Parse status: 1 = processing, 2 = completed, 3 = failed
    let status = 'processing';
    let videoUrl = null;
    let thumbnailUrl = null;
    let downloadUrl = null;
    let statusPercentage = data.status_percentage || 0;

    if (data.status === 2) {
      status = 'completed';
      statusPercentage = 100;
      // Get video URL from generated_video array
      if (data.generated_video && data.generated_video.length > 0) {
        const video = data.generated_video[0];
        // Use file_download_url for direct download, video_url for streaming
        videoUrl = video.file_download_url || video.video_url;
        downloadUrl = video.file_download_url || video.video_url;
        // Get thumbnail - use full URL if available
        if (data.thumbnail_url) {
          thumbnailUrl = data.thumbnail_url;
        } else if (data.last_frame_url) {
          thumbnailUrl = data.last_frame_url;
        } else if (video.last_frame && video.last_frame.startsWith('http')) {
          thumbnailUrl = video.last_frame;
        } else if (video.last_frame) {
          thumbnailUrl = `https://cdn.geminigen.ai/${video.last_frame}`;
        }
      }
    } else if (data.status === 3) {
      status = 'failed';
    }

    // Always sync to database if video_id is provided
    if (video_id) {
      const updateData: Record<string, unknown> = {
        status_percentage: statusPercentage,
        updated_at: new Date().toISOString(),
      };
      
      // Only update status if completed or failed
      if (status === 'completed' || status === 'failed') {
        updateData.status = status;
      }
      
      if (videoUrl) updateData.video_url = videoUrl;
      if (thumbnailUrl) updateData.thumbnail_url = thumbnailUrl;

      const { error: updateError } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', video_id);

      if (updateError) {
        console.error('Failed to update video in database:', updateError);
      } else {
        console.log('Video synced to database:', video_id, status, statusPercentage + '%');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status,
        status_percentage: statusPercentage,
        video_url: videoUrl,
        download_url: downloadUrl,
        thumbnail_url: thumbnailUrl,
        error_message: data.error_message || null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error('Error in check-video-status function:', error);
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
