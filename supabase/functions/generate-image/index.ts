import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// kie.ai API configuration
const KIE_API_BASE = 'https://api.kie.ai/api/v1/jobs';
const KIE_MODEL = 'google/nano-banana';

// Convert aspect ratio to kie.ai format
function getKieImageSize(ratio: string): string {
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
async function pollTaskCompletion(taskId: string, apiKey: string, maxAttempts = 60): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls

        const response = await fetch(`${KIE_API_BASE}/recordInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();
        console.log(`Poll attempt ${attempt + 1}:`, data.data?.state);

        if (data.data?.state === 'success') {
            // Parse resultJson to get the image URL
            const resultJson = JSON.parse(data.data.resultJson);
            if (resultJson.resultUrls && resultJson.resultUrls.length > 0) {
                return resultJson.resultUrls[0];
            }
            throw new Error('No image URL in result');
        } else if (data.data?.state === 'failed') {
            throw new Error(data.data?.failedMessage || 'Image generation failed');
        }
        // State is 'pending' or 'processing', continue polling
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

        const { prompt, mode, aspect_ratio } = await req.json();

        console.log('Generating image for user:', user.id);
        console.log('Mode:', mode);
        console.log('Prompt:', prompt);
        console.log('Aspect ratio:', aspect_ratio);

        // Get kie.ai API keys array from app_settings
        const { data: apiKeySetting, error: apiKeyError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'kie_api_keys')
            .single();

        if (apiKeyError || !apiKeySetting?.value) {
            console.error('API keys error:', apiKeyError);
            throw new Error('kie.ai API keys not configured. Please set them in Admin Dashboard.');
        }

        // Parse JSON array of keys and filter out empty ones
        let kieApiKeys: string[] = [];
        try {
            kieApiKeys = JSON.parse(apiKeySetting.value).filter((k: string) => k && k.trim());
        } catch {
            // Fallback for single key
            if (apiKeySetting.value.trim()) {
                kieApiKeys = [apiKeySetting.value];
            }
        }

        if (kieApiKeys.length === 0) {
            throw new Error('No valid kie.ai API keys configured. Please add at least one key in Admin Dashboard.');
        }

        // Rotate through keys - use milliseconds for better distribution
        const keyIndex = Math.floor(Date.now() / 1000) % kieApiKeys.length;
        const kieApiKey = kieApiKeys[keyIndex];
        console.log(`Using kie.ai API key ${keyIndex + 1} of ${kieApiKeys.length} keys`);

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

        let generatedImageUrl: string | null = null;

        // Text to Image using kie.ai nano banana
        console.log('Creating kie.ai task with nano banana model...');

        const createTaskResponse = await fetch(`${KIE_API_BASE}/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kieApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: KIE_MODEL,
                input: {
                    prompt: prompt,
                    output_format: 'png',
                    image_size: getKieImageSize(aspect_ratio || '1:1'),
                },
            }),
        });

        const taskData = await createTaskResponse.json();
        console.log('kie.ai createTask response:', JSON.stringify(taskData).substring(0, 500));

        if (!createTaskResponse.ok || !taskData.data?.taskId) {
            throw new Error(taskData.msg || taskData.message || 'Failed to create image generation task');
        }

        const taskId = taskData.data.taskId;
        console.log('Task created with ID:', taskId);

        // Poll for completion
        generatedImageUrl = await pollTaskCompletion(taskId, kieApiKey);
        console.log('Generated image URL:', generatedImageUrl);

        // Save to image_generations table
        const { data: imageGen, error: insertError } = await supabase
            .from('image_generations')
            .insert({
                user_id: user.id,
                prompt: prompt,
                mode: mode || 't2i',
                aspect_ratio: aspect_ratio || '1:1',
                image_url: generatedImageUrl,
                status: 'completed',
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
        }

        // Update user's image count
        await supabase
            .from('profiles')
            .update({
                images_used: profile.images_used + 1,
                total_images_generated: (profile.total_images_generated || 0) + 1,
            })
            .eq('id', user.id);

        return new Response(
            JSON.stringify({
                success: true,
                image_url: generatedImageUrl,
                image_id: imageGen?.id,
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
