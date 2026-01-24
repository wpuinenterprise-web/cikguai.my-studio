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
        // Use same API key as image generator
        const POYO_API_KEY = 'sk-kz-2sgabHO6G2l5jkUvArZhfSvYrOcoufFRTMDvGPX6HlmIjDJ34fWS6kuNA3r';

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
            reference_image, // Optional: base64 image for image-to-video
        } = await req.json();

        console.log('=== Poyo.ai Video Generation Request ===');
        console.log('User:', user.id);
        console.log('Prompt:', prompt?.substring(0, 100) + '...');
        console.log('Duration:', duration);
        console.log('Aspect ratio:', aspect_ratio);
        console.log('Style:', style || 'none');
        console.log('Has reference image:', !!reference_image);

        // If reference image provided, upload to Poyo.ai storage first
        let imageUrl: string | null = null;
        if (reference_image) {
            try {
                console.log('Uploading reference image to Poyo.ai storage...');

                // First upload to Supabase storage to get a public URL
                const base64Data = reference_image.replace(/^data:image\/\w+;base64,/, '');
                const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                const fileName = `sora-ref-${Date.now()}.jpg`;

                // Upload to Supabase storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('video-references')
                    .upload(fileName, imageBuffer, {
                        contentType: 'image/jpeg',
                        upsert: true,
                    });

                if (uploadError) {
                    console.error('Supabase upload error:', uploadError);
                } else {
                    // Get public URL from Supabase
                    const { data: { publicUrl } } = supabase.storage
                        .from('video-references')
                        .getPublicUrl(fileName);

                    console.log('Supabase public URL:', publicUrl);

                    // Now upload this URL to Poyo.ai storage
                    const poyoUploadResponse = await fetch('https://api.poyo.ai/api/common/upload/url', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${POYO_API_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            file_url: publicUrl,
                        }),
                    });

                    const poyoUploadData = await poyoUploadResponse.json();
                    console.log('Poyo.ai upload response:', JSON.stringify(poyoUploadData));

                    if (poyoUploadData.success && poyoUploadData.data?.file_url) {
                        imageUrl = poyoUploadData.data.file_url;
                        console.log('Image uploaded to Poyo.ai:', imageUrl);
                    } else {
                        console.error('Poyo.ai upload failed:', poyoUploadData);
                        // Fallback: try using Supabase URL directly
                        imageUrl = publicUrl;
                        console.log('Fallback to Supabase URL:', imageUrl);
                    }
                }
            } catch (uploadErr) {
                console.error('Image upload error:', uploadErr);
                // Continue without image
            }
        }

        // Check user's video limit
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('videos_used, video_limit, total_videos_generated, is_admin')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('Profile fetch error:', profileError);
            throw new Error('Failed to fetch user profile: ' + profileError.message);
        }

        console.log('Profile data:', JSON.stringify(profile));

        // Check video limit (admins bypass limit)
        const videosUsed = profile.videos_used ?? 0;
        const videoLimit = profile.video_limit ?? 0;
        const isAdmin = profile.is_admin ?? false;

        console.log('Limit check:', { isAdmin, videosUsed, videoLimit });

        if (!isAdmin && videosUsed >= videoLimit) {
            throw new Error('Video limit reached. Hubungi admin untuk tambahan.');
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
        // Use i2v model variant if we have a reference image
        const modelName = imageUrl ? 'sora-2-pro-i2v' : 'sora-2-pro';

        const requestBody: any = {
            model: modelName,
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

        // Add image reference for image-to-video if we have one
        // Try multiple parameter names for better compatibility
        if (imageUrl) {
            requestBody.input.image_url = imageUrl;
            requestBody.input.first_frame_image = imageUrl;
            requestBody.input.input_reference = imageUrl;
            console.log('Added image reference to request:', imageUrl);
            console.log('Using i2v model:', modelName);
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
                videos_used: videosUsed + 1,
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
