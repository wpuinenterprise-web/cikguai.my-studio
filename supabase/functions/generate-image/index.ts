import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TODO: Replace with poyo.ai API configuration
// const POYO_API_BASE = 'https://api.poyo.ai/...';

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
        console.log('Mode:', mode);
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

        // TODO: Implement poyo.ai API call here
        // For now, return error message that image generation is being reconfigured
        throw new Error('Image generation sedang dalam proses penyelenggaraan. Sila cuba lagi kemudian.');

        // When poyo.ai is implemented:
        // 1. Make API call to poyo.ai
        // 2. Get generated image URL
        // 3. Save to image_generations table
        // 4. Update user's image count
        // 5. Return success response

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
