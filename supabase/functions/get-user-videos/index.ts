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

    if (!geminigenResponse.ok) {
      console.error('GeminiGen API error:', geminigenResponse.status);
      // Continue with database-only fetch if GeminiGen fails
    }

    let videoHistories: any[] = [];
    
    if (geminigenResponse.ok) {
      const geminigenData = await geminigenResponse.json();
      console.log('GeminiGen response received, total items:', geminigenData.result?.length || 0);

      // Filter for video generations only
      videoHistories = geminigenData.result?.filter((item: any) => 
        item.type === 'video' || item.type === 'video_generation' || item.model_name?.includes('sora')
      ) || [];

      console.log('Found', videoHistories.length, 'video generations from GeminiGen');

      // Get existing videos from database - use geminigen_uuid as unique key
      const { data: existingVideos } = await supabase
        .from('video_generations')
        .select('id, geminigen_uuid, video_url, status, status_percentage')
        .eq('user_id', user.id);

      const existingMap = new Map(
        existingVideos?.filter(v => v.geminigen_uuid).map(v => [v.geminigen_uuid, v]) || []
      );

      console.log('Existing videos in DB:', existingVideos?.length || 0);

      // Sync videos to database (upsert by geminigen_uuid)
      for (const history of videoHistories) {
        if (!history.uuid) {
          console.log('Skipping history item without UUID');
          continue;
        }

        // Determine status
        let status = 'processing';
        if (history.status === 2) status = 'completed';
        else if (history.status === 3) status = 'failed';

        // Get video URL and thumbnail from generated_video array if available
        let videoUrl = null;
        let thumbnailUrl = history.thumbnail_url || history.last_frame_url || null;
        let duration = 10;
        let aspectRatio = 'landscape';
        
        if (history.generated_video && history.generated_video.length > 0) {
          const video = history.generated_video[0];
          videoUrl = video.file_download_url || video.video_url;
          duration = video.duration || 10;
          aspectRatio = video.aspect_ratio || 'landscape';
          
          if (!thumbnailUrl) {
            if (video.last_frame && video.last_frame.startsWith('http')) {
              thumbnailUrl = video.last_frame;
            } else if (video.last_frame) {
              thumbnailUrl = `https://cdn.geminigen.ai/${video.last_frame}`;
            }
          }
        }

        const existing = existingMap.get(history.uuid);
        
        if (!existing) {
          // Insert new video - check for existing by geminigen_uuid first
          const { data: checkExisting } = await supabase
            .from('video_generations')
            .select('id')
            .eq('geminigen_uuid', history.uuid)
            .single();

          if (!checkExisting) {
            console.log('Inserting new video:', history.uuid);
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
                duration: duration,
                aspect_ratio: aspectRatio,
                created_at: history.created_at,
                updated_at: history.updated_at || new Date().toISOString(),
              });

            if (insertError) {
              console.error('Failed to insert video:', insertError.message);
            }
          } else {
            console.log('Video already exists, skipping insert:', history.uuid);
          }
        } else {
          // Only update if status changed or data is missing
          const needsUpdate = 
            existing.status !== status || 
            (status === 'completed' && !existing.video_url) ||
            existing.status_percentage !== history.status_percentage;

          if (needsUpdate) {
            console.log('Updating video:', history.uuid, 'status:', status);
            const { error: updateError } = await supabase
              .from('video_generations')
              .update({
                status: status,
                status_percentage: history.status_percentage || (status === 'completed' ? 100 : 0),
                video_url: videoUrl || existing.video_url,
                thumbnail_url: thumbnailUrl,
                duration: duration,
                aspect_ratio: aspectRatio,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);

            if (updateError) {
              console.error('Failed to update video:', updateError.message);
            }
          }
        }
      }
    }

    // Fetch all videos from database
    const { data: videos, error: fetchError } = await supabase
      .from('video_generations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      throw new Error('Failed to fetch videos');
    }

    // Deduplicate by geminigen_uuid (keep first occurrence which is newest)
    const seenUuids = new Set<string>();
    const deduplicatedVideos = videos?.filter(video => {
      if (!video.geminigen_uuid) return true; // Keep videos without UUID
      if (seenUuids.has(video.geminigen_uuid)) return false;
      seenUuids.add(video.geminigen_uuid);
      return true;
    }) || [];

    console.log('Returning', deduplicatedVideos.length, 'unique videos');

    return new Response(
      JSON.stringify({
        success: true,
        videos: deduplicatedVideos,
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
