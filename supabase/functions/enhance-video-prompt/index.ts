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
            productImageUrl,
            characterGender // User's gender choice from workflow settings
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

        // Use user's gender choice (LOCKED - no random override)
        // Default to 'female' if not specified
        const selectedGender = characterGender || 'female';

        const characterDescription = selectedGender === 'female'
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

        // Random elements for VARIETY - each video generation gets different combination
        const settings = ['cozy living room', 'bright modern kitchen', 'minimalist bedroom', 'outdoor garden', 'cafe setting', 'bathroom vanity area', 'office desk', 'balcony with city view'];
        const cameraStyles = ['handheld natural movement', 'smooth gimbal shot', 'static tripod with slight pan', 'dynamic angles with cuts', 'close-up focus transitions'];
        const colorGrades = ['warm golden tones', 'cool blue aesthetic', 'natural daylight colors', 'soft pastel vibes', 'vibrant saturated colors'];
        const timeOfDay = ['morning golden hour', 'afternoon natural light', 'evening warm glow', 'bright midday'];

        const randomSetting = settings[Math.floor(Math.random() * settings.length)];
        const randomCameraStyle = cameraStyles[Math.floor(Math.random() * cameraStyles.length)];
        const randomColorGrade = colorGrades[Math.floor(Math.random() * colorGrades.length)];
        const randomTimeOfDay = timeOfDay[Math.floor(Math.random() * timeOfDay.length)];
        const randomVariationId = Math.floor(Math.random() * 10000); // Unique ID to force different outputs

        // Detect I2V mode (image-to-video)
        const isI2V = !!productImageUrl;
        const dialogStartTime = isI2V ? '1-2' : '0-1'; // I2V videos start slower, delay dialog

        const systemPrompt = `You are an expert UGC (User Generated Content) video prompt engineer for Sora 2.0 AI. Create highly detailed, cinematic prompts that produce BEAUTIFUL, ENGAGING Malaysian UGC-style videos.

=== CRITICAL TIMING RULES (MOST IMPORTANT) ===

⚠️ VIDEO MUST BE EXACTLY ${duration} SECONDS - NOT A SECOND LESS!
⚠️ DIALOG MUST BE SHORT (max 6-8 ayat pendek) BUT COMPLETE until CTA
⚠️ Character MUST finish speaking BEFORE video ends
⚠️ CTA MUST appear in last 2-3 seconds

VIDEO SPECIFICATIONS:
- Resolution: 1080p HD
- Duration: EXACTLY ${duration} seconds (WAJIB!)
- Aspect Ratio: ${aspectDesc}
- Style: Natural UGC, feels authentic like real person reviewing product

=== ⚠️ ABSOLUTELY NO SUBTITLES ⚠️ ===
DO NOT include any subtitles, captions, or text overlays showing what the character is saying.
NO burned-in subtitles. NO auto-captions. NO text following the dialog.

ONLY ALLOWED TEXT:
- CTA text at the end (e.g., "Dapatkan Sekarang!", button text)
- Text effects to highlight KEY words (product name, price, promo) - NOT full sentences
- Product label/packaging text (already on the product)

FORBIDDEN:
- Subtitles showing character's speech
- Caption text at bottom of video
- Any text that "follows" what the character says
- Full sentences as text overlays


${isI2V ? `
=== I2V MODE DETECTED - PRODUCT PRESERVATION + CHARACTER SEPARATION ===

⚠️⚠️⚠️ CRITICAL FOR I2V: PRODUCT AND CHARACTER ARE SEPARATE! ⚠️⚠️⚠️

The reference image is ONLY the PRODUCT - NOT the character!
- The CHARACTER is generated fresh by AI (not from the image)
- The PRODUCT must look exactly like the reference image
- Character HOLDS, PRESENTS, or DISPLAYS the product
- Character is NEVER inside/part of the product image

PRODUCT PRESERVATION RULES:
1. Product label/text MUST remain unchanged and readable
2. Product shape MUST NOT morph or transform
3. Product colors MUST stay identical to reference
4. Product packaging design MUST be preserved

CHARACTER + PRODUCT INTERACTION:
- Character picks up/holds the product
- Character shows product to camera
- Character demonstrates using the product
- Product is a SEPARATE object the character interacts with
- Character face/body is NOT in the reference image

PROMPT MUST INCLUDE:
- "Character holds the product in hand"
- "Product appearance matches reference image exactly"
- "Character is separate from product, not generated from product image"

VIDEO TIMING FOR I2V (DIALOG MUST REACH CTA!):
- 0-1s: Product comes alive from still image
- 1-3s: Character appears and picks up product, starts speaking (AYAT 1)
- 3-6s: Character shows product, explains benefits (AYAT 2-3)
- 6-9s: Demo product usage (AYAT 4-5)
- 9-12s: Share results (AYAT 6-7)
- 12-15s: CTA - MUST reach this! (AYAT 8 + CTA text)

⚠️ DIALOG MUST BE COMPLETE AND REACH CTA BY 15 SECONDS!
` : ''}

=== CHARACTER REQUIREMENTS ===

MUST use this character: ${characterDescription}

For FEMALE:
- Wanita Melayu cantik, umur 30-an
- MESTI bertudung labuh (hijab covering chest)
- Berkulit cerah dan berseri
- Senyuman manis dan mesra
- Penampilan sopan dan elegan

For MALE:
- Lelaki Melayu, umur 30-an
- Tampan dan kemas bergaya influencer
- TIADA subang, rantai, gelang
- Berpakaian sopan (kemeja/baju casual)
- Ekspresi confident dan friendly

=== VIDEO STRUCTURE (EXACTLY ${duration} SECONDS) ===

${isI2V ? `0-2 SAAT (I2V TRANSITION - TANPA DIALOG):
- Image slowly comes to life
- Subtle movement begins
- Character becomes animated
- NO speaking yet - let video start smoothly` : `0-1 SAAT (HOOK - TANPA DIALOG):
${randomHook}
- Pure visual hook, NO speaking yet
- Grab attention immediately`}

${isI2V ? '2-4' : '1-3'} SAAT:
- Character starts speaking (AYAT 1)
- "Korang tau tak..." or similar opener
- Camera: Medium close-up

${isI2V ? '4-7' : '3-6'} SAAT:
- Show product clearly (AYAT 2-3)
- Quick benefit mention
- Camera: Cut to product, back to character

${isI2V ? '7-10' : '6-9'} SAAT:
- Demo product briefly (AYAT 4-5)
- Show how to use
- Camera: Over-shoulder shot

${isI2V ? '10-13' : '9-12'} SAAT:
- Share result/benefit (AYAT 6)
- Excited expression
- Camera: Different angle

${isI2V ? '13-15' : '12-15'} SAAT (CTA - WAJIB!):
- Strong closing (AYAT 7-8 max)
- "Jom cuba sekarang!" / "${platformCta}"
- CTA text appears on screen
- Camera: Front facing, confident smile

=== DIALOG RULES (SANGAT PENTING!) ===

⚠️ DIALOG MESTI PENDEK: Max 8 ayat sahaja!
⚠️ SETIAP AYAT: 3-5 patah perkataan sahaja (SANGAT PENDEK!)
⚠️ MESTI SAMPAI CTA: Dialog WAJIB habis dengan ajakan beli
⚠️ PACING: Satu ayat = 1.5-2 saat sahaja!

LANGUAGE: Bahasa Melayu Malaysia CASUAL
SPEAKING: Character TALKS to camera (bukan voiceover)
PACE: LAJU tapi jelas - jangan lambat!

CONTOH DIALOG LENGKAP (8 ayat dalam 15 saat):
1. [1-3s] "Korang tau tak..." (opener)
2. [3-4s] "Produk ni terbaik!" (claim)
3. [4-6s] "Tengok ni..." (show)
4. [6-8s] "Senang nak guna" (demo)
5. [8-10s] "Hasilnya wow!" (result)
6. [10-11s] "Serious berbaloi!" (testimonial)
7. [11-13s] "Jom grab sekarang!" (CTA)
8. [13-15s] "${platformCta}" (final CTA)

JANGAN:
- Ayat panjang (video habis sebelum CTA!)
- Cakap lambat-lambat
- Skip CTA di akhir

=== OUTPUT FORMAT ===

Return JSON:
{
  "enhancedPrompt": "Full detailed video prompt in ONE paragraph. MUST describe exact ${duration}-second sequence from start to CTA ending. Include all camera angles, character actions, and speaking moments.",
  "caption": "Social media caption in Bahasa Malaysia with emojis and hashtags",
  "dialog": "The exact 6-8 short sentences in casual Malaysian Malay, MUST end with CTA"
}`;

        const userPrompt = `Generate a UGC-style product review video prompt for:

PRODUCT: ${productName}
DESCRIPTION: ${productDescription}
TARGET AUDIENCE: ${targetAudience || 'Malaysian consumers interested in beauty/health products'}
DURATION: ${duration} seconds
PLATFORM CTA: "${platformCta}"
CHARACTER: ${selectedGender === 'female' ? 'FEMALE (wanita Melayu bertudung 30-an)' : 'MALE (lelaki Melayu 30-an style influencer)'}

=== VARIATION REQUIREMENTS (MUST USE THESE EXACT ELEMENTS) ===
- SETTING: ${randomSetting}
- CAMERA STYLE: ${randomCameraStyle}
- COLOR GRADE: ${randomColorGrade}
- TIME OF DAY: ${randomTimeOfDay}
- VARIATION ID: #${randomVariationId} (make this video UNIQUE from others)

${isI2V ? `
⚠️ THIS IS I2V (IMAGE-TO-VIDEO) - PRODUCT PRESERVATION IS CRITICAL:
- The product in video MUST look EXACTLY like the reference image
- Product label/text MUST remain unchanged and readable
- Product shape MUST NOT morph or transform
- Product colors MUST stay identical to the image
- Include these phrases in the prompt: "maintain exact product appearance from reference image", "product label must remain unchanged"
` : ''}
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
${isI2V ? '- PRODUCT MUST REMAIN IDENTICAL TO REFERENCE IMAGE IN EVERY FRAME' : ''}

Return JSON with enhancedPrompt, caption, and dialog fields.`;


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
                temperature: 0.95, // High temperature for maximum variety
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

        // Parse the JSON response
        let parsedContent;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = generatedContent.match(/```json\n?([\s\S]*?) \n?```/) ||
                generatedContent.match(/```\n ? ([\s\S] *?) \n ? ```/);

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
        } catch {
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
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
