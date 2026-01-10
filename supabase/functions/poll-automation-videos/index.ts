import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function polls for generating videos, checks their status,
// and posts to Telegram when completed
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



        // Get items that are currently generating
        const { data: generatingItems, error: queueError } = await supabase
            .from('automation_posts_queue')
            .select('*, automation_workflows(*)')
            .eq('status', 'generating')
            .not('geminigen_uuid', 'is', null)
            .order('generation_started_at', { ascending: true })
            .limit(10);

        if (queueError) throw queueError;



        if (!generatingItems || generatingItems.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: 'No generating items to check', processed: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        let completedCount = 0;
        let failedCount = 0;
        const results: unknown[] = [];

        for (const item of generatingItems) {
            try {


                // Check video status from GeminiGen History API
                const statusResponse = await fetch(
                    `https://api.geminigen.ai/uapi/v1/history/${item.geminigen_uuid}`,
                    {
                        method: 'GET',
                        headers: { 'x-api-key': GEMINIGEN_API_KEY }
                    }
                );

                const statusData = await statusResponse.json();


                // GeminiGen status codes: 1 = processing, 2 = completed, 3 = failed
                if (statusData.status === 2) {
                    // Video completed - get URL and post to Telegram
                    // Try video_url first (streaming) then file_download_url
                    let videoUrl: string | null = null;

                    if (statusData.generated_video && statusData.generated_video.length > 0) {
                        const video = statusData.generated_video[0];
                        videoUrl = video.video_url || video.file_download_url;
                    }

                    if (!videoUrl) throw new Error('Video completed but no URL found');



                    // Get user's Telegram settings
                    const { data: telegramAccount } = await supabase
                        .from('social_media_accounts')
                        .select('extra_data')
                        .eq('user_id', item.user_id)
                        .eq('platform', 'telegram')
                        .eq('is_connected', true)
                        .single();

                    const chatId = telegramAccount?.extra_data?.chat_id;
                    const userBotToken = telegramAccount?.extra_data?.bot_token;

                    if (!chatId || !userBotToken) {
                        throw new Error('No Telegram account or bot token configured');
                    }

                    // Update queue with content URL
                    await supabase
                        .from('automation_posts_queue')
                        .update({
                            content_url: videoUrl,
                            status: 'posting',
                            generation_completed_at: new Date().toISOString(),
                            posting_started_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    // Post to Telegram - download video and upload as form-data
                    // because Telegram can't access GeminiGen's URLs directly
                    const telegramApiUrl = `https://api.telegram.org/bot${userBotToken}`;

                    // Download video bytes from GeminiGen

                    const videoResponse = await fetch(videoUrl);
                    if (!videoResponse.ok) {
                        throw new Error(`Failed to download video: ${videoResponse.status}`);
                    }
                    const videoBlob = await videoResponse.blob();


                    // Upload to Telegram as multipart form-data
                    const formData = new FormData();
                    formData.append('chat_id', chatId);
                    formData.append('video', videoBlob, 'video.mp4');

                    // Build caption with prompt included
                    let telegramCaption = item.caption || '';
                    if (item.prompt_used) {
                        telegramCaption += `\n\n━━━━━━━━━━━━━━━━\n🎬 <b>Prompt Used:</b>\n<code>${item.prompt_used.substring(0, 800)}${item.prompt_used.length > 800 ? '...' : ''}</code>`;
                    }

                    formData.append('caption', telegramCaption);
                    formData.append('parse_mode', 'HTML');
                    formData.append('supports_streaming', 'true');

                    const telegramResponse = await fetch(`${telegramApiUrl}/sendVideo`, {
                        method: 'POST',
                        body: formData,
                    });

                    const telegramResult = await telegramResponse.json();


                    if (!telegramResult.ok) {
                        throw new Error(telegramResult.description || 'Failed to post to Telegram');
                    }

                    // Update queue to completed
                    await supabase
                        .from('automation_posts_queue')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    // Log to post history
                    await supabase
                        .from('automation_post_history')
                        .insert({
                            queue_id: item.id,
                            user_id: item.user_id,
                            platform: 'telegram',
                            post_id: telegramResult.result?.message_id?.toString(),
                            content_url: videoUrl,
                            caption: item.caption,
                            status: 'success',
                            response_data: telegramResult,
                        });

                    completedCount++;
                    results.push({ id: item.id, status: 'completed', videoUrl });


                } else if (statusData.status === 3) {
                    // Video failed
                    const errorMsg = statusData.error_message || 'Video generation failed';

                    await supabase
                        .from('automation_posts_queue')
                        .update({
                            status: 'failed',
                            error_message: errorMsg,
                            retry_count: (item.retry_count || 0) + 1
                        })
                        .eq('id', item.id);

                    failedCount++;
                    results.push({ id: item.id, status: 'failed', error: errorMsg });

                } else {
                    // Still processing - log progress
                    const progress = statusData.status_percentage || 0;

                    results.push({ id: item.id, status: 'generating', progress });
                }

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';


                await supabase
                    .from('automation_posts_queue')
                    .update({
                        status: 'failed',
                        error_message: errorMessage,
                        retry_count: (item.retry_count || 0) + 1
                    })
                    .eq('id', item.id);

                failedCount++;
                results.push({ id: item.id, status: 'failed', error: errorMessage });
            }
        }

        return new Response(
            JSON.stringify({ s: true, c: completedCount, f: failedCount }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: unknown) {
        return new Response(
            JSON.stringify({ s: false }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
