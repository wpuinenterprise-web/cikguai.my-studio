import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Poyo.ai API status endpoint
const POYO_STATUS_URL = 'https://api.poyo.ai/api/generate/status';

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Use same API key as image generator
        const POYO_API_KEY = 'sk-kz-2sgabHO6G2l5jkUvArZhfSvYrOcoufFRTMDvGPX6HlmIjDJ34fWS6kuNA3r';

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { poyo_task_id, video_id } = await req.json();

        if (!poyo_task_id) {
            throw new Error('poyo_task_id is required');
        }

        console.log('Checking Poyo.ai status for task:', poyo_task_id);

        // Call Poyo.ai status API
        const statusResponse = await fetch(`${POYO_STATUS_URL}/${poyo_task_id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${POYO_API_KEY}`,
            },
        });

        const statusData = await statusResponse.json();
        console.log('Poyo.ai status response:', JSON.stringify(statusData));

        if (!statusResponse.ok || statusData.code !== 200) {
            throw new Error(statusData.message || 'Failed to get status');
        }

        const data = statusData.data;

        // Map Poyo.ai status to our status
        let status = 'processing';
        let statusPercentage = data.progress || 0;
        let videoUrl: string | null = null;
        let thumbnailUrl: string | null = null;

        switch (data.status) {
            case 'not_started':
                status = 'processing';
                statusPercentage = Math.max(statusPercentage, 5);
                break;
            case 'running':
                status = 'processing';
                statusPercentage = Math.max(statusPercentage, 10);
                break;
            case 'finished':
                status = 'completed';
                statusPercentage = 100;
                // Get video URL from files array
                if (data.files && data.files.length > 0) {
                    const videoFile = data.files.find((f: any) => f.file_type === 'video');
                    if (videoFile) {
                        videoUrl = videoFile.file_url;
                    }
                    // Check for thumbnail if available
                    const imageFile = data.files.find((f: any) => f.file_type === 'image');
                    if (imageFile) {
                        thumbnailUrl = imageFile.file_url;
                    }
                }
                break;
            case 'failed':
                status = 'failed';
                statusPercentage = 0;
                console.error('Poyo.ai task failed:', data.error_message);
                break;
        }

        // Update database if video_id provided
        if (video_id) {
            const updateData: any = {
                status,
                status_percentage: statusPercentage,
            };

            if (videoUrl) {
                updateData.video_url = videoUrl;
            }
            if (thumbnailUrl) {
                updateData.thumbnail_url = thumbnailUrl;
            }

            const { error: updateError } = await supabase
                .from('video_generations')
                .update(updateData)
                .eq('id', video_id);

            if (updateError) {
                console.error('Update error:', updateError);
            } else {
                console.log('Updated video record:', video_id, 'status:', status);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                status,
                status_percentage: statusPercentage,
                video_url: videoUrl,
                thumbnail_url: thumbnailUrl,
                raw_status: data.status,
                error_message: data.error_message,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: unknown) {
        console.error('Error in check-video-status-poyo function:', error);
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
