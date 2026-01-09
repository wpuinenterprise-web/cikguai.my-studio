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

        // Character gender randomization
        const characterGenders = ['female', 'male'];
        const randomGender = characterGenders[Math.floor(Math.random() * characterGenders.length)];

        const characterDescription = randomGender === 'female'
            ? 'seorang wanita cantik Melayu berumur 30-an, bertudung labuh, berkulit cerah, senyuman mesra, penampilan sopan dan profesional'
            : 'seorang lelaki Melayu berumur 30-an, tampan dan kemas, berpenampilan seperti influencer, tiada subang/rantai/gelang, berpakaian sopan (kemeja atau baju Melayu)';

        // Platform-specific CTA
        const ctaText: Record<string, string> = {
            fb: 'Tekan Learn More untuk tahu lebih lanjut!',
            tiktok: 'Tekan beg kuning sekarang! 🛒',
            general: 'Dapatkan sekarang sebelum kehabisan!'
        };
        const platformCta = ctaText[ctaType] || ctaText.general;

        // Build aspect ratio description
        const aspectDesc = aspectRatio === 'portrait'
            ? 'vertical 9:16 (TikTok, Reels, Shorts)'
            : aspectRatio === 'square'
                ? 'square 1:1 (Instagram feed)'
                : 'horizontal 16:9 (YouTube, Facebook)';

        // Varied hook types for 0-3 seconds (NO DIALOG, visual only)
        const hookTypes = [
            'Close-up shot of hands holding the product, slowly revealing the packaging with soft lighting',
            'Person looking frustrated/tired, then notices the product on table - curious expression',
            'Unboxing moment - hands opening a package with anticipation',
            'Person scrolling phone, stops and looks surprised - sees product',
            'Before/after teaser - quick flash of dull skin then glowing skin',
            'Product hero shot with beautiful bokeh background, slow zoom in',
            'Person waking up, stretching, reaches for the product on bedside table',
            'Kitchen counter with natural morning light, product placed elegantly'
        ];
        const randomHook = hookTypes[Math.floor(Math.random() * hookTypes.length)];

        const systemPrompt = `You are an expert UGC (User Generated Content) video prompt engineer for Sora 2.0 AI. Create highly detailed, cinematic prompts that produce BEAUTIFUL, ENGAGING Malaysian UGC-style videos.

=== CRITICAL RULES ===

VIDEO SPECIFICATIONS:
- Resolution: 1080p HD
- Duration: ${duration} seconds
- Aspect Ratio: ${aspectDesc}
- Style: Natural UGC, feels authentic like real person reviewing product
- NO text, NO subtitles, NO watermarks on video EXCEPT CTA text shown at final moment

=== CHARACTER REQUIREMENTS ===

MUST use this character: ${characterDescription}

For FEMALE:
- Wanita Melayu cantik, umur 30-an
- MESTI bertudung labuh (hijab covering chest)
- Berkulit cerah dan berseri
- Senyuman manis dan mesra
- Penampilan sopan dan elegan
- Expresi wajah natural dan engaging

For MALE:
- Lelaki Melayu, umur 30-an
- Tampan dan kemas bergaya influencer
- TIADA subang, rantai, gelang
- TIADA seluar pendek (mesti seluar panjang)
- Berpakaian sopan (kemeja/baju casual)
- Ekspresi confident dan friendly

=== VIDEO STRUCTURE (WAJIB) ===

0-1 SAAT (HOOK - TANPA DIALOG):
${randomHook}
- Pure visual hook, NO speaking yet
- Grab attention immediately
- Show intrigue or problem

1-3 SAAT:
- Character starts speaking
- Introduce problem/relatability
- Camera: Medium close-up

3-6 SAAT:
- Show product clearly
- Character explains benefit
- Camera: Cut to product close-up, then back to character

6-9 SAAT:
- Demonstrate product (bancuh/apply/use)
- Character continues explaining
- Camera: Over-shoulder shot showing hands using product

9-12 SAAT:
- Share more benefits/testimonial feel
- Character excited expression
- Camera: Different angle - side profile or slightly lower angle

12-15 SAAT (CTA):
- Strong closing statement
- Show excitement/satisfaction
- END with CTA text on screen: "${platformCta}"
- Camera: Front facing, confident pose

=== CAMERA TECHNIQUE ===

EVERY 3 SECONDS CHANGE:
- Camera angle (front → side → close-up → over-shoulder)
- Shot composition
- Makes video dynamic, not boring

Camera movements: Subtle handheld feel (authentic UGC), occasional smooth zoom, natural transitions

=== DIALOG RULES ===

LANGUAGE: Bahasa Melayu Malaysia CASUAL (bukan formal)
SPEAKING: Character TALKS to camera (bukan voiceover)
TONE: Santai, mesra, macam kawan cerita dengan kawan
PACE: Natural, sync dengan mulut - cukup masa untuk habis cakap

Example dialog style:
"Korang tau tak..." / "Serious best gila..." / "Yang paling best..." / "Jom grab sekarang!"

JANGAN gunakan:
- Bahasa formal/baku
- Perkataan susah/teknikal
- Ayat panjang berjela

=== OUTPUT FORMAT ===

Return JSON:
{
  "enhancedPrompt": "Full detailed video prompt in ONE paragraph, describing exact sequence of shots, camera angles, character expressions, actions, and speaking moments. Write for Sora AI to understand perfectly.",
  "caption": "Social media caption in Bahasa Malaysia with emojis and hashtags",
  "dialog": "The exact Malaysian Malay casual dialog the character will speak"
}`;

        const userPrompt = `Generate a UGC-style product review video prompt for:

PRODUCT: ${productName}
DESCRIPTION: ${productDescription}
TARGET AUDIENCE: ${targetAudience || 'Malaysian consumers interested in beauty/health products'}
DURATION: ${duration} seconds
PLATFORM CTA: "${platformCta}"
CHARACTER: ${randomGender === 'female' ? 'FEMALE (wanita Melayu bertudung 30-an)' : 'MALE (lelaki Melayu 30-an style influencer)'}

Create a DETAILED Sora 2.0 video prompt that shows:
1. HOOK (0-1s): ${randomHook} - NO speaking, visual only
2. INTRODUCTION (1-3s): Character starts speaking, relatable problem
3. PRODUCT DEMO (3-9s): Show and use the product, explain benefits
4. BENEFITS (9-12s): More selling points, excited expression
5. CTA (12-15s): Strong close with "${platformCta}" text appearing on screen

IMPORTANT:
- Character is ${characterDescription}
- Dialog must be in casual Malaysian Malay
- Camera angle changes every 3 seconds
- NO text/subtitle except CTA at the end
- Make it feel like real UGC, not advertisement

Return JSON with enhancedPrompt, caption, and dialog fields.`;

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
