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
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const GEMINIGEN_API_KEY = Deno.env.get('GEMINIGEN_API_KEY');
        // Fallback bot token from env (user's token from database is preferred)
        const ENV_TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

        if (!GEMINIGEN_API_KEY) {
            throw new Error('GEMINIGEN_API_KEY is not configured');
        }

        const body = await req.json().catch(() => ({}));
        const specificQueueId = body.queue_id;

        console.log('🚀 Processing automation queue...');

        // Get pending items from queue
        let query = supabase
            .from('automation_posts_queue')
            .select('*')
            .in('status', ['pending', 'generating'])
            .order('created_at', { ascending: true })
            .limit(5);

        if (specificQueueId) {
            query = supabase
                .from('automation_posts_queue')
                .select('*')
                .eq('id', specificQueueId);
        }

        const { data: queueItems, error: queueError } = await query;

        if (queueError) {
            console.error('Error fetching queue:', queueError);
            throw queueError;
        }

        console.log(`Found ${queueItems?.length || 0} items to process`);

        if (!queueItems || queueItems.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: 'No items to process', processed: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        let processedCount = 0;
        const results: any[] = [];

        for (const item of queueItems) {
            try {
                console.log(`Processing queue item: ${item.id}`);

                // Update status to generating
                await supabase
                    .from('automation_posts_queue')
                    .update({
                        status: 'generating',
                        generation_started_at: new Date().toISOString()
                    })
                    .eq('id', item.id);

                // Get user's Telegram chat_id
                const { data: telegramAccount } = await supabase
                    .from('social_media_accounts')
                    .select('extra_data')
                    .eq('user_id', item.user_id)
                    .eq('platform', 'telegram')
                    .eq('is_connected', true)
                    .single();

                const chatId = telegramAccount?.extra_data?.chat_id;
                const userBotToken = telegramAccount?.extra_data?.bot_token;

                if (!chatId) {
                    throw new Error('No Telegram account connected');
                }

                // User must have their own bot token - no fallback
                if (!userBotToken) {
                    throw new Error('No Telegram Bot Token configured. User must set up their own bot.');
                }

                let contentUrl: string | null = null;

                // Generate content based on type
                if (item.content_type === 'video') {
                    // Generate video using GeminiGen API
                    contentUrl = await generateVideo(
                        item.prompt_used,
                        item.workflow_id,
                        supabase,
                        GEMINIGEN_API_KEY
                    );
                } else {
                    // Generate image
                    contentUrl = await generateImage(
                        item.prompt_used,
                        supabase,
                        GEMINIGEN_API_KEY
                    );
                }

                if (!contentUrl) {
                    throw new Error('Failed to generate content');
                }

                // Update queue with content URL
                await supabase
                    .from('automation_posts_queue')
                    .update({
                        content_url: contentUrl,
                        status: 'posting',
                        generation_completed_at: new Date().toISOString(),
                        posting_started_at: new Date().toISOString()
                    })
                    .eq('id', item.id);

                // Post to Telegram
                const telegramApiUrl = `https://api.telegram.org/bot${userBotToken}`;

                let telegramResponse;
                if (item.content_type === 'video') {
                    telegramResponse = await fetch(`${telegramApiUrl}/sendVideo`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            video: contentUrl,
                            caption: item.caption || '',
                            parse_mode: 'HTML',
                            supports_streaming: true,
                        }),
                    });
                } else {
                    telegramResponse = await fetch(`${telegramApiUrl}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            photo: contentUrl,
                            caption: item.caption || '',
                            parse_mode: 'HTML',
                        }),
                    });
                }

                const telegramResult = await telegramResponse.json();
                console.log('Telegram response:', telegramResult);

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
                        content_url: contentUrl,
                        caption: item.caption,
                        status: 'success',
                        response_data: telegramResult,
                    });

                processedCount++;
                results.push({ id: item.id, status: 'completed' });

            } catch (err) {
                console.error(`Error processing item ${item.id}:`, err);

                // Update queue to failed
                await supabase
                    .from('automation_posts_queue')
                    .update({
                        status: 'failed',
                        error_message: err.message,
                        retry_count: (item.retry_count || 0) + 1
                    })
                    .eq('id', item.id);

                // Log failure
                await supabase
                    .from('automation_post_history')
                    .insert({
                        queue_id: item.id,
                        user_id: item.user_id,
                        platform: 'telegram',
                        status: 'failed',
                        error_message: err.message,
                    });

                results.push({ id: item.id, status: 'failed', error: err.message });
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Processed ${processedCount} items`,
                processed: processedCount,
                results,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error in process-automation:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

// Generate video using GeminiGen API
async function generateVideo(
    prompt: string,
    workflowId: string,
    supabase: any,
    apiKey: string,
    productImageUrl?: string
): Promise<string | null> {
    console.log('Generating video with prompt:', prompt.substring(0, 100));

    // Get workflow settings
    const { data: workflow } = await supabase
        .from('automation_workflows')
        .select('aspect_ratio, duration, product_image_url')
        .eq('id', workflowId)
        .single();

    const aspectRatio = workflow?.aspect_ratio || '16:9';
    const duration = workflow?.duration || 10;
    const imageUrl = productImageUrl || workflow?.product_image_url;

    // Call GeminiGen API
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', 'sora-2');
    formData.append('resolution', 'small');
    formData.append('duration', duration.toString());
    formData.append('aspect_ratio', aspectRatio);

    // Add product image for I2V if available
    if (imageUrl && imageUrl.startsWith('http')) {
        console.log('Adding reference image for I2V:', imageUrl);
        formData.append('first_frame_url', imageUrl);
        formData.append('image_url', imageUrl);
    }


    const response = await fetch('https://api.geminigen.ai/uapi/v1/video-gen/sora', {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData,
    });

    const data = await response.json();
    console.log('GeminiGen response:', data);

    if (!response.ok || !data.uuid) {
        throw new Error(data.detail?.message || 'Failed to start video generation');
    }

    // Poll for completion (max 5 minutes)
    const maxAttempts = 60;
    const pollInterval = 5000; // 5 seconds

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await fetch(
            `https://api.geminigen.ai/uapi/v1/video-gen/sora/${data.uuid}/fetch`,
            { headers: { 'x-api-key': apiKey } }
        );

        const statusData = await statusResponse.json();
        console.log(`Video status (attempt ${i + 1}):`, statusData.status_percentage);

        if (statusData.video_url) {
            return statusData.video_url;
        }

        if (statusData.status === 'failed') {
            throw new Error('Video generation failed');
        }
    }

    throw new Error('Video generation timed out');
}

// Generate image using GeminiGen API
async function generateImage(
    prompt: string,
    supabase: any,
    apiKey: string
): Promise<string | null> {
    console.log('Generating image with prompt:', prompt.substring(0, 100));

    const response = await fetch('https://api.geminigen.ai/uapi/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
        body: JSON.stringify({
            prompt: prompt,
            model: 'flux-pro-1.1-ultra',
            aspect_ratio: '16:9',
        }),
    });

    const data = await response.json();
    console.log('Image generation response:', data);

    if (data.images && data.images.length > 0) {
        return data.images[0].url;
    }

    throw new Error('Failed to generate image');
}
