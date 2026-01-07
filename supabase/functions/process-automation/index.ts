import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function STARTS video/image generation and returns immediately
// Polling for completion is done by poll-automation-videos function
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const GEMINIGEN_API_KEY = Deno.env.get('GEMINIGEN_API_KEY');

        if (!GEMINIGEN_API_KEY) {
            throw new Error('GEMINIGEN_API_KEY is not configured');
        }

        const body = await req.json().catch(() => ({}));
        const specificQueueId = body.queue_id;

        console.log('🚀 Processing automation queue (async mode)...');

        // Get ONLY pending items - 'generating' items are handled by poll function
        let query = supabase
            .from('automation_posts_queue')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(5);

        if (specificQueueId) {
            query = supabase
                .from('automation_posts_queue')
                .select('*')
                .eq('id', specificQueueId)
                .eq('status', 'pending');
        }

        const { data: queueItems, error: queueError } = await query;

        if (queueError) {
            console.error('Error fetching queue:', queueError);
            throw queueError;
        }

        console.log(`Found ${queueItems?.length || 0} pending items to start`);

        if (!queueItems || queueItems.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: 'No pending items to process', processed: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        let startedCount = 0;
        const results: unknown[] = [];

        for (const item of queueItems) {
            try {
                console.log(`Starting generation for queue item: ${item.id}`);

                // Validate Telegram connection before starting
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

                if (!userBotToken) {
                    throw new Error('No Telegram Bot Token configured. User must set up their own bot.');
                }

                // Start content generation based on type
                if (item.content_type === 'video') {
                    // Start video generation and get UUID
                    const geminigenUuid = await startVideoGeneration(
                        item.prompt_used,
                        item.workflow_id,
                        supabase,
                        GEMINIGEN_API_KEY
                    );

                    // Update queue with UUID and set status to generating
                    await supabase
                        .from('automation_posts_queue')
                        .update({
                            status: 'generating',
                            geminigen_uuid: geminigenUuid,
                            generation_started_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    console.log(`Video generation started for ${item.id}, UUID: ${geminigenUuid}`);
                    startedCount++;
                    results.push({ id: item.id, status: 'generating', geminigen_uuid: geminigenUuid });

                } else {
                    // Generate image (sync - usually fast)
                    const imageUrl = await generateImage(
                        item.prompt_used,
                        GEMINIGEN_API_KEY
                    );

                    if (!imageUrl) {
                        throw new Error('Failed to generate image');
                    }

                    // Update queue with image URL
                    await supabase
                        .from('automation_posts_queue')
                        .update({
                            content_url: imageUrl,
                            status: 'posting',
                            generation_started_at: new Date().toISOString(),
                            generation_completed_at: new Date().toISOString(),
                            posting_started_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    // Post image to Telegram immediately
                    const telegramApiUrl = `https://api.telegram.org/bot${userBotToken}`;
                    const telegramResponse = await fetch(`${telegramApiUrl}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            photo: imageUrl,
                            caption: item.caption || '',
                            parse_mode: 'HTML',
                        }),
                    });

                    const telegramResult = await telegramResponse.json();
                    console.log('Telegram response:', JSON.stringify(telegramResult));

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
                            content_url: imageUrl,
                            caption: item.caption,
                            status: 'success',
                            response_data: telegramResult,
                        });

                    startedCount++;
                    results.push({ id: item.id, status: 'completed', content_url: imageUrl });
                }

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                console.error(`Error starting generation for item ${item.id}:`, errorMessage);

                // Update queue to failed
                await supabase
                    .from('automation_posts_queue')
                    .update({
                        status: 'failed',
                        error_message: errorMessage,
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
                        error_message: errorMessage,
                    });

                results.push({ id: item.id, status: 'failed', error: errorMessage });
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Started ${startedCount} items. Use poll-automation-videos to check video completion.`,
                started: startedCount,
                results,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: unknown) {
        console.error('Error in process-automation:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

// Start video generation and return UUID immediately (no polling)
async function startVideoGeneration(
    prompt: string,
    workflowId: string,
    supabase: ReturnType<typeof createClient>,
    apiKey: string
): Promise<string> {
    console.log('Starting video generation with prompt:', prompt.substring(0, 100));

    // Get workflow settings
    const { data: workflow } = await supabase
        .from('automation_workflows')
        .select('aspect_ratio, duration, product_image_url')
        .eq('id', workflowId)
        .single();

    const aspectRatioRaw = workflow?.aspect_ratio || 'landscape';
    const duration = workflow?.duration || 10;
    const imageUrl = workflow?.product_image_url;

    // Map aspect ratio to GeminiGen format (landscape/portrait)
    // Database stores 'portrait' or 'landscape' directly, or '9:16'/'16:9' 
    let aspectRatio: string;
    if (aspectRatioRaw === 'portrait' || aspectRatioRaw === '9:16') {
        aspectRatio = 'portrait';
    } else {
        aspectRatio = 'landscape';
    }

    console.log('Workflow settings:', {
        aspect_ratio_raw: aspectRatioRaw,
        aspect_ratio_mapped: aspectRatio,
        duration,
        product_image_url: imageUrl,
    });

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
        formData.append('file_urls', imageUrl);
    }

    console.log('Calling GeminiGen API with params:', {
        prompt: prompt.substring(0, 100) + '...',
        model: 'sora-2',
        duration,
        aspect_ratio: aspectRatio,
        has_reference_image: !!imageUrl,
    });

    const response = await fetch('https://api.geminigen.ai/uapi/v1/video-gen/sora', {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData,
    });

    let data: { uuid?: string; detail?: { message?: string } | string; message?: string; error?: string };
    try {
        data = await response.json();
    } catch (_e) {
        const textResponse = await response.text().catch(() => 'Unable to read response');
        console.error('GeminiGen API returned non-JSON response:', response.status, textResponse);
        throw new Error(`Video generation failed: API returned status ${response.status} - ${textResponse.substring(0, 200)}`);
    }

    console.log('GeminiGen response:', JSON.stringify(data));

    if (!response.ok || !data.uuid) {
        const errorDetail = (typeof data.detail === 'object' ? data.detail?.message : data.detail) ||
            data.message || data.error || JSON.stringify(data);
        console.error('GeminiGen API error:', response.status, errorDetail);
        throw new Error(`Video generation failed (${response.status}): ${errorDetail}`);
    }

    // Return UUID immediately - polling is handled by poll-automation-videos
    console.log('Video generation started with UUID:', data.uuid);
    return data.uuid;
}

// Generate image using GeminiGen API (sync - usually fast)
async function generateImage(
    prompt: string,
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
    console.log('Image generation response:', JSON.stringify(data));

    if (data.images && data.images.length > 0) {
        return data.images[0].url;
    }

    throw new Error('Failed to generate image');
}
