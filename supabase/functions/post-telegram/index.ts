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
        // Get Telegram Bot Token from environment
        const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (!TELEGRAM_BOT_TOKEN) {
            throw new Error('TELEGRAM_BOT_TOKEN is not configured');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

        const body: TelegramPostRequest = await req.json();
        const { chat_id, content_url, content_type, caption, queue_id } = body;

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
