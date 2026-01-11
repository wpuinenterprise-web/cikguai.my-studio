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

        if (queueError) throw queueError;



        if (!queueItems || queueItems.length === 0) {
            return new Response('0', { headers: corsHeaders });
        }

        let n = 0; // started count

        for (const item of queueItems) {
            try {


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

                // Get workflow details to check prompt_mode
                let promptToUse = item.prompt_used;

                if (item.workflow_id) {
                    const { data: workflow } = await supabase
                        .from('automation_workflows')
                        .select('prompt_mode, product_name, product_description, target_audience, content_style, aspect_ratio, duration, cta_type')
                        .eq('id', item.workflow_id)
                        .single();

                    // If auto mode, regenerate prompt fresh for variety
                    if (workflow?.prompt_mode === 'auto' && workflow.product_name) {
                        try {
                            const enhanceResponse = await fetch(`${supabaseUrl}/functions/v1/enhance-video-prompt`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${supabaseServiceKey}`,
                                },
                                body: JSON.stringify({
                                    productName: workflow.product_name,
                                    productDescription: workflow.product_description || '',
                                    targetAudience: workflow.target_audience || '',
                                    contentStyle: workflow.content_style || 'professional',
                                    aspectRatio: workflow.aspect_ratio || 'portrait',
                                    duration: workflow.duration || 15,
                                    ctaType: workflow.cta_type || 'general',
                                }),
                            });

                            if (enhanceResponse.ok) {
                                const enhanceData = await enhanceResponse.json();
                                if (enhanceData.enhancedPrompt) {
                                    promptToUse = enhanceData.enhancedPrompt;

                                    // Update queue with new prompt
                                    await supabase
                                        .from('automation_posts_queue')
                                        .update({
                                            prompt_used: promptToUse,
                                            caption: enhanceData.caption || item.caption
                                        })
                                        .eq('id', item.id);
                                }
                            }
                        } catch (enhanceError) {
                            // If enhance fails, use existing prompt
                            console.error('Failed to enhance prompt:', enhanceError);
                        }
                    }
                }

                // Start content generation based on type
                if (item.content_type === 'video') {
                    // Start video generation and get UUID
                    const geminigenUuid = await startVideoGeneration(
                        promptToUse,
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


                    n++;

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

                    n++;
                }

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';


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


            }
        }

        return new Response(String(n), { headers: corsHeaders });

    } catch {
        return new Response('e', { status: 500, headers: corsHeaders });
    }
});

// Start video generation and return UUID immediately (no polling)
async function startVideoGeneration(
    prompt: string,
    workflowId: string,
    supabase: ReturnType<typeof createClient>,
    apiKey: string
): Promise<string> {

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

    // Call GeminiGen API
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', 'sora-2');
    formData.append('resolution', 'small');
    formData.append('duration', duration.toString());
    formData.append('aspect_ratio', aspectRatio);

    // Add product image for I2V if available
    if (imageUrl && imageUrl.startsWith('http')) {
        formData.append('first_frame_url', imageUrl);
        formData.append('image_url', imageUrl);
        formData.append('file_urls', imageUrl);
    }

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
        throw new Error(`Video generation failed: API returned status ${response.status} - ${textResponse.substring(0, 200)}`);
    }

    if (!response.ok || !data.uuid) {
        const errorDetail = (typeof data.detail === 'object' ? data.detail?.message : data.detail) ||
            data.message || data.error || JSON.stringify(data);
        throw new Error(`Video generation failed (${response.status}): ${errorDetail}`);
    }

    return data.uuid;
}

async function generateImage(
    prompt: string,
    apiKey: string
): Promise<string | null> {
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

    if (data.images && data.images.length > 0) {
        return data.images[0].url;
    }

    throw new Error('Failed to generate image');
}
