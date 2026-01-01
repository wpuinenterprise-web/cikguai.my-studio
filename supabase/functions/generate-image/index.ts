import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// poyo.ai API configuration
const POYO_API_BASE = 'https://api.poyo.ai/api/generate';
const POYO_API_KEY = 'sk-kz-2sgabHO6G2l5jkUvArZhfSvYrOcoufFRTMDvGPX6HlmIjDJ34fWS6kuNA3r';
const POYO_MODEL = 'nano-banana-2';

// Convert aspect ratio to poyo.ai format
function getPoyoImageSize(ratio: string): string {
    switch (ratio) {
        case '16:9':
            return '16:9';
        case '9:16':
            return '9:16';
        case '1:1':
        default:
            return '1:1';
    }
}

// Poll for task completion with timeout
async function pollTaskCompletion(taskId: string, maxAttempts = 60): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls

        const response = await fetch(`${POYO_API_BASE}/status/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${POYO_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();
        console.log(`Poll attempt ${attempt + 1}:`, data.data?.status);

        if (data.data?.status === 'finished') {
            // Get image URL from files array
            if (data.data.files && data.data.files.length > 0) {
                return data.data.files[0].file_url;
            }
            throw new Error('No image URL in result');
        } else if (data.data?.status === 'failed') {
            throw new Error(data.data?.error_message || 'Image generation failed');
        }
        // Status is 'not_started' or 'running', continue polling
    }
    throw new Error('Image generation timed out');
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Verify user using anon key client with user's JWT
        const authHeader = req.headers.get('authorization');
        console.log('Auth header present:', !!authHeader);

        if (!authHeader) {
            throw new Error('No authorization header');
        }

        // Create client with user's JWT for auth verification
        const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: { Authorization: authHeader },
            },
        });

        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        console.log('Auth result:', { hasUser: !!user, error: authError?.message });

        if (authError || !user) {
            console.error('Auth error:', authError);
            throw new Error('Unauthorized: ' + (authError?.message || 'No user'));
        }

        // Use service role client for database operations
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { prompt, mode, aspect_ratio, reference_image_url, second_image_url } = await req.json();

        console.log('Image generation request for user:', user.id);
        console.log('Mode:', mode || 't2i');
        console.log('Prompt:', prompt);
        console.log('Aspect ratio:', aspect_ratio);

        // Check user's image limit
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('images_used, image_limit, total_images_generated')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('Profile fetch error:', profileError);
            throw new Error('Failed to fetch user profile');
        }

        if (profile.images_used >= profile.image_limit) {
            throw new Error('Image generation limit reached');
        }

        // Build input for poyo.ai API
        const apiInput: any = {
            prompt: prompt,
            size: getPoyoImageSize(aspect_ratio || '1:1'),
            resolution: '2K',
        };

        // Note: nano-banana-2 supports both t2i and i2i
        // For i2i, add reference image if provided
        if (reference_image_url && (mode === 'i2i' || mode === 'merge')) {
            apiInput.image_url = reference_image_url;
            console.log('Including reference image for i2i mode');
        }

        console.log('Creating poyo.ai task with nano-banana-2 model...');

        // Submit task to poyo.ai
        const submitResponse = await fetch(`${POYO_API_BASE}/submit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${POYO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: POYO_MODEL,
                input: apiInput,
            }),
        });

        const submitData = await submitResponse.json();
        console.log('poyo.ai submit response:', JSON.stringify(submitData).substring(0, 500));

        if (!submitResponse.ok || !submitData.data?.task_id) {
            throw new Error(submitData.message || submitData.error || 'Failed to create image generation task');
        }

        const taskId = submitData.data.task_id;
        console.log('Task created with ID:', taskId);

        // Poll for completion
        const generatedImageUrl = await pollTaskCompletion(taskId);
        console.log('Generated image URL:', generatedImageUrl);

        // Save to image_generations table
        const { error: saveError } = await supabase
            .from('image_generations')
            .insert({
                user_id: user.id,
                prompt: prompt,
                mode: mode || 't2i',
                aspect_ratio: aspect_ratio || '1:1',
                image_url: generatedImageUrl,
                reference_image_url: reference_image_url || null,
                second_image_url: second_image_url || null,
            });

        if (saveError) {
            console.error('Save error:', saveError);
            // Don't throw - image was generated successfully
        }

        // Update user's image count
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                images_used: profile.images_used + 1,
                total_images_generated: (profile.total_images_generated || 0) + 1,
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('Update error:', updateError);
        }

        console.log('Image generation successful!');

        return new Response(
            JSON.stringify({
                success: true,
                image_url: generatedImageUrl,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error) {
        console.error('Error in generate-image function:', error);
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
