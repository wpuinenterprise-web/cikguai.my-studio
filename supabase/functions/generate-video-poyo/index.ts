import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Poyo.ai API endpoint
const POYO_API_URL = 'https://api.poyo.ai/api/generate/submit';

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const POYO_API_KEY = Deno.env.get('POYO_API_KEY');
        if (!POYO_API_KEY) {
            throw new Error('POYO_API_KEY is not set');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get authorization header for user verification
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            throw new Error('No authorization header');
        }

        // Verify user
        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (authError || !user) {
            throw new Error('Unauthorized');
        }

        const {
            prompt,
            duration = 15,
            aspect_ratio = '16:9',
            style, // Optional: thanksgiving, comic, news, selfie, nostalgic, anime
        } = await req.json();

        console.log('=== Poyo.ai Video Generation Request ===');
        console.log('User:', user.id);
        console.log('Prompt:', prompt?.substring(0, 100) + '...');
        console.log('Duration:', duration);
        console.log('Aspect ratio:', aspect_ratio);
        console.log('Style:', style || 'none');

        // Check user's video limit
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('videos_used, video_limit, total_videos_generated')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('Profile fetch error:', profileError);
            throw new Error('Failed to fetch user profile');
        }

        if (profile.videos_used >= profile.video_limit) {
            throw new Error('Video generation limit reached');
        }

        // Create video generation record
        const { data: videoRecord, error: insertError } = await supabase
            .from('video_generations')
            .insert({
                user_id: user.id,
                prompt,
                duration,
                aspect_ratio,
                model: 'sora-2-pro',
                api_provider: 'poyo',
                status: 'processing',
                status_percentage: 1,
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            throw new Error('Failed to create video record');
        }

        console.log('Video record created:', videoRecord.id);

        // Build request body for Poyo.ai
        const requestBody: any = {
            model: 'sora-2-pro',
            input: {
                prompt,
                duration,
                aspect_ratio,
            },
        };

        // Add style if provided
        if (style) {
            requestBody.input.style = style;
        }

        console.log('=== Calling Poyo.ai API ===');
        console.log('Request body:', JSON.stringify(requestBody));

        const poyoResponse = await fetch(POYO_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${POYO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const poyoData = await poyoResponse.json();
        console.log('Poyo.ai response:', JSON.stringify(poyoData));

        if (!poyoResponse.ok || poyoData.code !== 200) {
            console.error('Poyo.ai API error:', poyoData);

            // Update video record with failure
            await supabase
                .from('video_generations')
                .update({
                    status: 'failed',
                    status_percentage: 0,
                })
                .eq('id', videoRecord.id);

            throw new Error(poyoData.message || poyoData.error || 'Failed to generate video');
        }

        // Update video record with Poyo task_id
        const taskId = poyoData.data?.task_id;
        const { error: updateError } = await supabase
            .from('video_generations')
            .update({
                poyo_task_id: taskId,
                status_percentage: 5,
            })
            .eq('id', videoRecord.id);

        if (updateError) {
            console.error('Update error:', updateError);
        } else {
            console.log('Updated video with poyo_task_id:', taskId);
        }

        // Update user's video count
        await supabase
            .from('profiles')
            .update({
                videos_used: profile.videos_used + 1,
                total_videos_generated: (profile.total_videos_generated || 0) + 1,
            })
            .eq('id', user.id);

        console.log('Video generation initiated successfully');

        return new Response(
            JSON.stringify({
                success: true,
                video_id: videoRecord.id,
                poyo_task_id: taskId,
                status: 'processing',
                message: 'Video generation started via Poyo.ai',
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: unknown) {
        console.error('Error in generate-video-poyo function:', error);
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
