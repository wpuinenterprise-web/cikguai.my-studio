import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramPostRequest {
    chat_id: string; // Telegram channel/group ID (e.g., @channelname or -1001234567890)
    content_url: string; // URL to image or video
    content_type: 'image' | 'video';
    caption?: string;
    queue_id?: string; // For tracking in post history
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fallback to environment variable if user doesn't provide bot token
        const ENV_TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

        // Verify user (optional - can be called by scheduler without user auth)
        const authHeader = req.headers.get('authorization');
        let userId: string | null = null;

        if (authHeader) {
            const { data: { user }, error: authError } = await supabase.auth.getUser(
                authHeader.replace('Bearer ', '')
            );
            if (!authError && user) {
                userId = user.id;
            }
        }

        const body = await req.json();
        let { chat_id, content_url, content_type, caption, queue_id, bot_token } = body;

        // Use bot_token from request, or will be fetched from database later
        let TELEGRAM_BOT_TOKEN = bot_token;

        // If queue_id is provided, fetch the queue item and telegram account
        if (queue_id && (!chat_id || !content_url)) {
            console.log(`Fetching queue item: ${queue_id}`);

            // Get queue item
            const { data: queueItem, error: queueError } = await supabase
                .from('automation_posts_queue')
                .select('*')
                .eq('id', queue_id)
                .single();

            if (queueError || !queueItem) {
                throw new Error('Queue item not found');
            }

            // Get telegram account
            const { data: telegramAccount } = await supabase
                .from('social_media_accounts')
                .select('extra_data')
                .eq('user_id', queueItem.user_id)
                .eq('platform', 'telegram')
                .eq('is_connected', true)
                .single();

            if (!telegramAccount?.extra_data?.chat_id) {
                throw new Error('No Telegram account connected');
            }

            chat_id = telegramAccount.extra_data.chat_id;
            content_url = queueItem.content_url;
            content_type = queueItem.content_type;
            caption = queueItem.caption;
            userId = queueItem.user_id;

            // Get bot_token from user's saved account
            if (!TELEGRAM_BOT_TOKEN && telegramAccount.extra_data.bot_token) {
                TELEGRAM_BOT_TOKEN = telegramAccount.extra_data.bot_token;
            }

            if (!content_url) {
                throw new Error('Queue item has no content URL - video not yet generated');
            }
        }

        // Fallback to environment variable if no bot token provided
        if (!TELEGRAM_BOT_TOKEN) {
            throw new Error('No Telegram Bot Token configured. Please add your bot token in Telegram settings.');
        }

        if (!chat_id || !content_url || !content_type) {
            throw new Error('Missing required fields: chat_id, content_url, content_type');
        }

        console.log(`Posting ${content_type} to Telegram chat: ${chat_id}`);

        // Telegram API base URL
        const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

        let response;
        let postResult;

        if (content_type === 'image') {
            // Send photo
            response = await fetch(`${telegramApiUrl}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chat_id,
                    photo: content_url,
                    caption: caption || '',
                    parse_mode: 'HTML',
                }),
            });
        } else {
            // Send video
            response = await fetch(`${telegramApiUrl}/sendVideo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chat_id,
                    video: content_url,
                    caption: caption || '',
                    parse_mode: 'HTML',
                    supports_streaming: true,
                }),
            });
        }

        postResult = await response.json();
        console.log('Telegram API response:', postResult);

        // Log to post history if we have user context
        if (userId && queue_id) {
            const historyEntry = {
                queue_id,
                user_id: userId,
                platform: 'telegram',
                post_id: postResult.ok ? postResult.result?.message_id?.toString() : null,
                content_url,
                caption,
                status: postResult.ok ? 'success' : 'failed',
                response_data: postResult,
                error_message: postResult.ok ? null : postResult.description,
            };

            await supabase.from('automation_post_history').insert(historyEntry);

            // Update queue status
            await supabase
                .from('automation_posts_queue')
                .update({
                    status: postResult.ok ? 'completed' : 'failed',
                    completed_at: postResult.ok ? new Date().toISOString() : null,
                    error_message: postResult.ok ? null : postResult.description
                })
                .eq('id', queue_id);
        }

        if (!postResult.ok) {
            throw new Error(postResult.description || 'Failed to post to Telegram');
        }

        return new Response(
            JSON.stringify({
                success: true,
                message_id: postResult.result?.message_id,
                chat_id: chat_id,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error) {
        console.error('Error in post-telegram function:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message,
            }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
