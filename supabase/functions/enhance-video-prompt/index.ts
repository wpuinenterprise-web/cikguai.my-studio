import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const {
            productName,
            productDescription,
            targetAudience,
            contentStyle,
            aspectRatio,
            duration,
            openaiApiKey,
            ctaType,
            productImageUrl
        } = await req.json();

        if (!productName || !productDescription) {
            return new Response(
                JSON.stringify({ error: 'Product name and description are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Use provided API key or fallback to env
        const apiKey = openaiApiKey || Deno.env.get('OPENAI_API_KEY');

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'OpenAI API key required. Please provide your API key.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Build style description
        const styleDescriptions: Record<string, string> = {
            professional: 'professional, clean, corporate, trustworthy',
            creative: 'creative, artistic, eye-catching, unique',
            minimal: 'minimal, simple, elegant, sophisticated',
            dynamic: 'dynamic, energetic, engaging, modern'
        };

        const styleDesc = styleDescriptions[contentStyle] || styleDescriptions.professional;

        // Build aspect ratio description
        const aspectDesc = aspectRatio === 'portrait'
            ? 'vertical 9:16 (suitable for TikTok, Reels, Shorts)'
            : aspectRatio === 'square'
                ? 'square 1:1 (suitable for Instagram feed)'
                : 'horizontal 16:9 (suitable for YouTube, Facebook)';

        // CTA Instructions based on platform
        const ctaInstructions: Record<string, string> = {
            fb: `CALL-TO-ACTION (Facebook style):
- "Klik Learn More sekarang!"
- "Dapatkan sekarang di Facebook Shop"
- "PM kami untuk harga promosi"
- "Share dengan kawan yang memerlukan!"`,
            tiktok: `CALL-TO-ACTION (TikTok style):
- "Tekan beg kuning sekarang! 🛒"
- "DM untuk tempah!"
- "Link di bio! 🔗"
- "Comment [SAYA NAK] untuk info lanjut!"`,
            general: `CALL-TO-ACTION (Universal):
- "Tempah sekarang!"
- "Hubungi kami hari ini"
- "Dapatkan promosi eksklusif"
- "Jangan lepaskan peluang ini!"`
        };

        const ctaInstruction = ctaInstructions[ctaType] || ctaInstructions.general;

        // Product image instruction
        const imageInstruction = productImageUrl
            ? `IMPORTANT: The video MUST feature the exact product shown in the reference image. Maintain the product's appearance, colors, packaging exactly as shown.`
            : '';

        // Varied hook types for randomization
        const hookTypes = [
            'Start with a relatable problem statement - person looking frustrated',
            'Open with a shocking statistic or fact displayed visually',
            'Begin with a before/after teaser - quick glimpse of transformation',
            'Start with an unboxing moment - hands opening package',
            'Open with a reaction shot - person amazed at results',
            'Begin with product in action - immediate demonstration',
            'Start with a question pose - person looking curious at camera',
            'Open with lifestyle shot - product in beautiful setting'
        ];
        const randomHook = hookTypes[Math.floor(Math.random() * hookTypes.length)];

        const systemPrompt = `You are an expert AI video prompt engineer specializing in creating highly detailed prompts for Sora 2 AI video generation. Your task is to take simple product descriptions and transform them into cinematic, attention-grabbing video prompts.

CRITICAL RULES:
1. Generate prompts that Sora AI understands perfectly - focus on visual descriptions
2. Include specific camera movements, angles, and transitions
3. Describe lighting, atmosphere, and mood in detail
4. For UGC-style videos, include character descriptions and expressions
5. Keep the video length in mind (${duration} seconds)
6. Optimize for ${aspectDesc}
7. Style should be: ${styleDesc}
${imageInstruction}

LANGUAGE & DIALOG RULES:
- If people speak in the video, they MUST speak in BAHASA MELAYU MALAYSIA (Malaysian Malay dialect)
- Use natural Malaysian expressions and slang when appropriate
- DO NOT include any subtitles or text overlays in the video
- The video should be purely visual without on-screen text
- Dialog should sound natural like real Malaysian conversations

HOOK REQUIREMENT:
- Use this hook style: ${randomHook}
- Make the hook attention-grabbing in the first 2-3 seconds
- Each video should feel unique with different hook styles

PROMPT STRUCTURE for ${duration}-second video:
- HOOK (first 2-3 seconds): ${randomHook}
- PRODUCT DETAILS (middle): Showcase key features, benefits, how it looks
- CTA/CLOSING (last 2-3 seconds): Strong visual with call-to-action feeling

${ctaInstruction}

OUTPUT FORMAT:
You must return a JSON object with exactly this structure:
{
  "enhancedPrompt": "Your detailed video prompt here as ONE paragraph...",
  "caption": "Social media caption with emojis, hashtags, and CTA in Bahasa Malaysia..."
}

The enhancedPrompt should be written as ONE flowing paragraph describing the entire video sequence. Do NOT use timestamps or bullet points.
The caption MUST include the CTA and be written in Bahasa Malaysia.`;

        const userPrompt = `Transform this simple product description into a detailed, cinematic AI video prompt:

PRODUCT: ${productName}
DESCRIPTION: ${productDescription}
TARGET AUDIENCE: ${targetAudience || 'General audience'}
VIDEO DURATION: ${duration} seconds
ASPECT RATIO: ${aspectDesc}
STYLE: ${styleDesc}

Create a visually stunning video prompt that would make viewers stop scrolling. Include:
1. HOOK: Dramatic opening shot to grab attention (show a problem or eye-catching visual)
2. PRODUCT SHOWCASE: Smooth camera movements (dolly, pan, zoom) to show the product
3. DETAILS: Beautiful lighting and atmosphere highlighting product features
4. BENEFIT: Show product in use/action
5. CTA: Ending that makes viewer want to take action

Also create a catchy social media caption in Bahasa Malaysia with:
- Relevant emojis
- Call-to-action matching the platform
- Hashtags

Return as JSON with "enhancedPrompt" and "caption" fields.`;

        console.log('Calling OpenAI API for prompt enhancement...');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.8,
                max_tokens: 1500,
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenAI API error:', errorData);

            // Check for common errors
            if (response.status === 401) {
                return new Response(
                    JSON.stringify({ error: 'Invalid API key. Please check your OpenAI API key.' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify({ error: 'Failed to enhance prompt. Please try again.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const data = await response.json();
        const generatedContent = data.choices[0].message.content;

        console.log('Raw generated content:', generatedContent.substring(0, 300));

        // Parse the JSON response
        let parsedContent;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = generatedContent.match(/```json\n?([\s\S]*?)\n?```/) ||
                generatedContent.match(/```\n?([\s\S]*?)\n?```/);

            if (jsonMatch) {
                parsedContent = JSON.parse(jsonMatch[1].trim());
            } else {
                const trimmedContent = generatedContent.trim();
                if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
                    parsedContent = JSON.parse(trimmedContent);
                } else {
                    // Fallback: use content as prompt
                    parsedContent = {
                        enhancedPrompt: trimmedContent,
                        caption: `🔥 ${productName}\n\n${productDescription}\n\n#viral #fyp`
                    };
                }
            }
        } catch (parseError) {
            console.log('JSON parse failed, using raw content');
            parsedContent = {
                enhancedPrompt: generatedContent.trim(),
                caption: `🔥 ${productName}\n\n${productDescription}\n\n#viral #fyp`
            };
        }

        return new Response(
            JSON.stringify({
                success: true,
                enhancedPrompt: parsedContent.enhancedPrompt,
                caption: parsedContent.caption
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error in enhance-video-prompt:', errorMessage);
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
