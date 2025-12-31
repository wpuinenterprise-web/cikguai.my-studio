import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gemini API Keys - rotate to avoid rate limits
const API_KEYS = [
    Deno.env.get('GEMINI_API_KEY_1'),
    Deno.env.get('GEMINI_API_KEY_2'),
    Deno.env.get('GEMINI_API_KEY_3'),
].filter(Boolean) as string[];

// Round-robin key rotation based on minute
function getApiKey(): string {
    if (API_KEYS.length === 0) {
        throw new Error('No Gemini API keys configured');
    }
    const index = Math.floor(Date.now() / 60000) % API_KEYS.length;
    console.log(`Using API key index: ${index}`);
    return API_KEYS[index];
}

// Convert aspect ratio to Gemini format
function getAspectRatioDimensions(ratio: string): { width: number; height: number } {
    switch (ratio) {
        case '16:9':
            return { width: 1344, height: 768 };
        case '9:16':
            return { width: 768, height: 1344 };
        case '1:1':
        default:
            return { width: 1024, height: 1024 };
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify user
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            throw new Error('No authorization header');
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (authError || !user) {
            throw new Error('Unauthorized');
        }

        const { prompt, mode, aspect_ratio, reference_image_url, second_image_url } = await req.json();

        console.log('Generating image for user:', user.id);
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

        // Create image generation record
        const { data: imageRecord, error: insertError } = await supabase
            .from('image_generations')
            .insert({
                user_id: user.id,
                prompt,
                mode,
                aspect_ratio: aspect_ratio || '1:1',
                reference_image_url,
                second_image_url,
                status: 'processing',
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            throw new Error('Failed to create image record');
        }

        console.log('Image record created:', imageRecord.id);

        // Get rotating API key
        const apiKey = getApiKey();
        const dimensions = getAspectRatioDimensions(aspect_ratio || '1:1');

        let generatedImageUrl: string | null = null;

        try {
            if (mode === 't2i') {
                // Text to Image using Gemini Imagen 3.0
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            instances: [{ prompt }],
                            parameters: {
                                sampleCount: 1,
                                aspectRatio: aspect_ratio === '16:9' ? '16:9' : aspect_ratio === '9:16' ? '9:16' : '1:1',
                            },
                        }),
                    }
                );

                const data = await response.json();
                console.log('Gemini response:', JSON.stringify(data).substring(0, 500));

                if (!response.ok) {
                    throw new Error(data.error?.message || 'Failed to generate image');
                }

                if (data.predictions?.[0]?.bytesBase64Encoded) {
                    // Upload base64 image to Supabase Storage
                    const base64Image = data.predictions[0].bytesBase64Encoded;
                    const imageBuffer = Uint8Array.from(atob(base64Image), c => c.charCodeAt(0));

                    const fileName = `${user.id}/${Date.now()}.png`;
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('generated-images')
                        .upload(fileName, imageBuffer, {
                            contentType: 'image/png',
                            upsert: true,
                        });

                    if (uploadError) {
                        console.error('Upload error:', uploadError);
                    } else {
                        const { data: publicUrlData } = supabase.storage
                            .from('generated-images')
                            .getPublicUrl(fileName);
                        generatedImageUrl = publicUrlData.publicUrl;
                    }
                }
            } else if (mode === 'i2i' || mode === 'merge') {
                // Image to Image or Merge using Gemini with vision
                const contents: any[] = [];

                if (mode === 'i2i' && reference_image_url) {
                    // Fetch reference image and convert to base64
                    const imgResponse = await fetch(reference_image_url);
                    const imgBuffer = await imgResponse.arrayBuffer();
                    const base64Img = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

                    contents.push({
                        parts: [
                            { inline_data: { mime_type: 'image/png', data: base64Img } },
                            { text: `Edit this image based on the following instruction: ${prompt}` }
                        ]
                    });
                } else if (mode === 'merge' && reference_image_url && second_image_url) {
                    // Fetch both images
                    const [img1Resp, img2Resp] = await Promise.all([
                        fetch(reference_image_url),
                        fetch(second_image_url)
                    ]);
                    const [img1Buffer, img2Buffer] = await Promise.all([
                        img1Resp.arrayBuffer(),
                        img2Resp.arrayBuffer()
                    ]);
                    const base64Img1 = btoa(String.fromCharCode(...new Uint8Array(img1Buffer)));
                    const base64Img2 = btoa(String.fromCharCode(...new Uint8Array(img2Buffer)));

                    contents.push({
                        parts: [
                            { inline_data: { mime_type: 'image/png', data: base64Img1 } },
                            { inline_data: { mime_type: 'image/png', data: base64Img2 } },
                            { text: `Merge these two images creatively based on this instruction: ${prompt}. Create a new composite image.` }
                        ]
                    });
                }

                // Use Gemini Pro Vision for I2I/Merge
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents,
                            generationConfig: {
                                responseModalities: ["image", "text"],
                            },
                        }),
                    }
                );

                const data = await response.json();
                console.log('Gemini I2I response:', JSON.stringify(data).substring(0, 500));

                if (!response.ok) {
                    throw new Error(data.error?.message || 'Failed to edit/merge image');
                }

                // Extract generated image from response
                const candidate = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inline_data);
                if (candidate?.inline_data?.data) {
                    const base64Image = candidate.inline_data.data;
                    const imageBuffer = Uint8Array.from(atob(base64Image), c => c.charCodeAt(0));

                    const fileName = `${user.id}/${Date.now()}.png`;
                    const { error: uploadError } = await supabase.storage
                        .from('generated-images')
                        .upload(fileName, imageBuffer, {
                            contentType: 'image/png',
                            upsert: true,
                        });

                    if (!uploadError) {
                        const { data: publicUrlData } = supabase.storage
                            .from('generated-images')
                            .getPublicUrl(fileName);
                        generatedImageUrl = publicUrlData.publicUrl;
                    }
                }
            }

            // Update record with result
            if (generatedImageUrl) {
                await supabase
                    .from('image_generations')
                    .update({ image_url: generatedImageUrl, status: 'completed' })
                    .eq('id', imageRecord.id);

                // Increment user's image count
                await supabase
                    .from('profiles')
                    .update({
                        images_used: profile.images_used + 1,
                        total_images_generated: (profile.total_images_generated || 0) + 1
                    })
                    .eq('id', user.id);

                console.log('Image generation successful:', generatedImageUrl);

                return new Response(
                    JSON.stringify({
                        success: true,
                        image_id: imageRecord.id,
                        image_url: generatedImageUrl,
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            } else {
                throw new Error('No image generated');
            }

        } catch (genError: any) {
            console.error('Generation error:', genError);

            // Update record with failure
            await supabase
                .from('image_generations')
                .update({ status: 'failed' })
                .eq('id', imageRecord.id);

            throw genError;
        }

    } catch (error: unknown) {
        console.error('Error in generate-image function:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
