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

    console.log('Fetching videos for user:', user.id);

    // Fetch history from GeminiGen.AI API
    console.log('Fetching history from GeminiGen.AI...');
    const geminigenResponse = await fetch(
      'https://api.geminigen.ai/uapi/v1/histories?filter_by=all&items_per_page=100&page=1',
      {
        method: 'GET',
        headers: {
          'x-api-key': GEMINIGEN_API_KEY,
        },
      }
    );

    const geminigenData = await geminigenResponse.json();
    console.log('GeminiGen history response:', JSON.stringify(geminigenData).substring(0, 500));

    // Filter for video generations only
    const videoHistories = geminigenData.result?.filter((item: any) => 
      item.type === 'video' || item.type === 'video_generation' || item.model_name?.includes('sora')
    ) || [];

    console.log('Found', videoHistories.length, 'video generations from GeminiGen');

    // Get existing videos from database
    const { data: existingVideos } = await supabase
      .from('video_generations')
      .select('geminigen_uuid')
      .eq('user_id', user.id);

    const existingUuids = new Set(existingVideos?.map(v => v.geminigen_uuid) || []);

    // Sync new videos to database
    for (const history of videoHistories) {
      if (!existingUuids.has(history.uuid)) {
        console.log('Syncing new video:', history.uuid);
        
        // Determine status
        let status = 'processing';
        if (history.status === 2) status = 'completed';
        else if (history.status === 3) status = 'failed';

        // Get video URL and thumbnail from generated_video array if available
        let videoUrl = null;
        let thumbnailUrl = history.thumbnail_url || null;
        
        if (history.generated_video && history.generated_video.length > 0) {
          const video = history.generated_video[0];
          videoUrl = video.file_download_url || video.video_url;
          if (!thumbnailUrl) {
            if (video.last_frame && video.last_frame.startsWith('http')) {
              thumbnailUrl = video.last_frame;
            } else if (video.last_frame) {
              thumbnailUrl = `https://cdn.geminigen.ai/${video.last_frame}`;
            }
          }
        }

        // Insert new video into database
        const { error: insertError } = await supabase
          .from('video_generations')
          .insert({
            user_id: user.id,
            geminigen_uuid: history.uuid,
            prompt: history.input_text || 'No prompt',
            status: status,
            status_percentage: history.status_percentage || (status === 'completed' ? 100 : 0),
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl,
            duration: 10,
            aspect_ratio: 'landscape',
            created_at: history.created_at,
            updated_at: history.updated_at || new Date().toISOString(),
          });

        if (insertError) {
          console.error('Failed to insert video:', insertError);
        } else {
          console.log('Successfully synced video:', history.uuid);
        }
      }
    }

    // Now fetch all videos from database (including newly synced ones)
    const { data: videos, error: fetchError } = await supabase
      .from('video_generations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      throw new Error('Failed to fetch videos');
    }

    console.log('Returning', videos?.length || 0, 'videos');

    return new Response(
      JSON.stringify({
        success: true,
        videos: videos || [],
        synced_from_geminigen: videoHistories.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error('Error in get-user-videos function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        videos: [],
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
