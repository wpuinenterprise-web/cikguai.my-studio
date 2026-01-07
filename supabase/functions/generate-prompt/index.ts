import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gemini 2.5 Flash-Lite API for prompt generation
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || 'AIzaSyDHRfnrHDyvSyUjf5xcYRmhwRQMoCp5cgY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

// Enhanced Master System Instruction for Gemini with detailed UGC specs
const SYSTEM_INSTRUCTION = `# ROLE: Anti-Gravity Director (Sora 2 Specialist)

You are an expert video prompt generator for Sora 2 AI. Generate detailed, optimized prompts that create high-converting product videos.

# VIDEO STRUCTURE RULES:
1. **UGC STYLE (15 seconds)**:
   - 0-3s: HOOK - Attention-grabbing opening, face close-up or product reveal
   - 3-6s: PROBLEM/DESIRE - Show the need or aspiration  
   - 6-9s: PRODUCT SHOWCASE - Different angle, product in use
   - 9-12s: BENEFIT/RESULT - Show transformation or satisfaction
   - 12-15s: CTA - Clear call-to-action with presenter

2. **CAMERA CHANGES**: Change camera angle/shot type every 3 seconds
   - Close-up → Medium shot → Product detail → Wide shot → Face close-up

3. **CHARACTER DESCRIPTIONS**:
   - FEMALE: "A confident Malaysian Malay woman in her 30s wearing a beautiful modest hijab, natural makeup, warm friendly smile, looking directly at camera with genuine enthusiasm"
   - MALE: "A well-groomed Malaysian Malay man in his 30s with a neat appearance, wearing a smart casual outfit (no earrings, no chains, no bracelets, no shorts), confident influencer style, engaging with camera naturally"

4. **VISUAL RULES**:
   - NO text overlays or subtitles in the video EXCEPT for CTA text at the end
   - Clean, professional lighting (ring light or soft natural light)
   - Vertical 9:16 format for UGC, horizontal 16:9 for Storyboard
   - Smooth, natural movements - no robotic motion

5. **DIALOGUE RULES**:
   - Bahasa Melayu Malaysia yang santai dan natural
   - Short, punchy sentences that fit the timing
   - Sync perfectly with the speaking duration
   - Casual tone like talking to a friend

# CTA TYPES:
- TikTok: "Tekan beg kuning sekarang!"
- Facebook: "Tekan Learn More untuk tahu lebih lanjut"
- General: "Hubungi kami sekarang di [platform]"

# OUTPUT FORMAT:
Return a JSON object with:
{
  "visual_prompt": "(Detailed English technical prompt for Sora 2 - describe every 3-second segment with camera angles, lighting, movements, expressions)",
  "dialogue_bm": "(Bahasa Melayu dialogue script with timing - e.g., [0-3s] 'Korang nak tahu tak...')",
  "motion_sequence": {
    "0_3s": "Hook description",
    "3_6s": "Problem/desire description", 
    "6_9s": "Product showcase description",
    "9_12s": "Benefit description",
    "12_15s": "CTA description"
  }
}`;

interface PromptRequest {
    productName: string;
    productDescription: string;
    targetAudience?: string;
    contentStyle?: string;
    promptMode: 'auto' | 'manual';
    videoType: 't2v' | 'i2v';
    videoStyle: 'ugc' | 'storyboard';
    aspectRatio: 'landscape' | 'portrait';
    duration: 10 | 15;
    manualPrompt?: string;
    ctaType: 'fb' | 'tiktok' | 'general';
    characterGender: 'male' | 'female';
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body: PromptRequest = await req.json();
        console.log('Generate prompt request:', JSON.stringify(body));

        const {
            productName,
            productDescription,
            targetAudience = 'wanita Malaysia 25-45 tahun',
            contentStyle = 'professional',
            promptMode,
            videoType,
            videoStyle,
            aspectRatio,
            duration,
            manualPrompt,
            ctaType,
            characterGender = 'female'
        } = body;

        // Get character description based on gender
        const characterDesc = characterGender === 'female'
            ? "A confident Malaysian Malay woman in her 30s wearing a beautiful modest hijab, natural makeup, warm friendly smile"
            : "A well-groomed Malaysian Malay man in his 30s, smart casual outfit (no earrings, no chains, no bracelets, no shorts), confident influencer style";

        // Get CTA text based on type
        const ctaText = ctaType === 'tiktok'
            ? "Tekan beg kuning sekarang!"
            : ctaType === 'fb'
                ? "Tekan Learn More untuk tahu lebih lanjut"
                : "Hubungi kami sekarang!";

        // Build user prompt based on mode
        let userPrompt: string;

        if (promptMode === 'manual' && manualPrompt) {
            // Manual mode - optimize user's text
            userPrompt = `OPTIMIZE THIS PROMPT for Sora 2 video generation.

USER'S ORIGINAL PROMPT:
${manualPrompt}

SETTINGS:
- Video Type: ${videoType.toUpperCase()} ${videoType === 'i2v' ? '(animate from a product image as keyframe 0)' : '(generate from text)'}
- Style: ${videoStyle.toUpperCase()} ${videoStyle === 'ugc' ? '(vertical 9:16, casual influencer style)' : '(horizontal 16:9, cinematic)'}
- Duration: ${duration} seconds
- Character: ${characterGender.toUpperCase()} - ${characterDesc}
- CTA: "${ctaText}"

Transform into a detailed Sora 2 prompt with:
1. Camera angle changes every 3 seconds
2. Character matching the description
3. No text/subtitles except CTA at end
4. Bahasa Melayu dialogue script`;
        } else {
            // Auto mode - generate from product details
            userPrompt = `CREATE A ${duration}-SECOND ${videoStyle.toUpperCase()} VIDEO PROMPT for Sora 2.

PRODUCT DETAILS:
- Name: ${productName}
- Description: ${productDescription}
- Target Audience: ${targetAudience}
- Content Feel: ${contentStyle}

VIDEO SETTINGS:
- Type: ${videoType.toUpperCase()} ${videoType === 'i2v' ? '(Product image will be keyframe 0 - animate it coming to life)' : '(Generate everything from text)'}
- Style: ${videoStyle.toUpperCase()} ${videoStyle === 'ugc' ? '(Vertical 9:16, TikTok-style, casual influencer energy)' : '(Horizontal 16:9, cinematic, dramatic)'}
- Duration: ${duration} seconds
- Character: ${characterGender.toUpperCase()} presenter - ${characterDesc}
- CTA Type: "${ctaText}"

REQUIREMENTS:
1. Create a compelling ${duration}-second video structure with HOOKS that grab attention
2. Change camera angle/shot type every 3 seconds
3. Character must match the exact description (${characterGender === 'female' ? 'Malay woman with hijab' : 'Malay man, no accessories'})
4. NO text overlays or subtitles EXCEPT the CTA text at the end
5. Include Bahasa Melayu Malaysia dialogue that's casual, punchy, and perfectly timed
6. For I2V: Describe how the product image transforms and comes alive

Generate the complete video prompt with visual descriptions and dialogue script.`;
        }

        console.log('Calling Gemini API with prompt:', userPrompt.substring(0, 300) + '...');

        // Call Gemini 2.5 Flash-Lite API
        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: userPrompt }]
                    }
                ],
                systemInstruction: {
                    parts: [{ text: SYSTEM_INSTRUCTION }]
                },
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 3000,
                    responseMimeType: 'application/json'
                }
            })
        });

        const geminiData = await geminiResponse.json();
        console.log('Gemini response:', JSON.stringify(geminiData).substring(0, 500));

        if (!geminiResponse.ok) {
            console.error('Gemini API error:', geminiData);
            throw new Error(geminiData.error?.message || 'Gemini API error');
        }

        // Extract text from response
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            throw new Error('No response from Gemini');
        }

        // Parse JSON response
        let promptData;
        try {
            // Clean up response - remove markdown code blocks if present
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            promptData = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('Failed to parse Gemini response as JSON:', responseText);
            // Fallback - use the raw text as visual prompt
            promptData = {
                visual_prompt: responseText,
                dialogue_bm: '',
                motion_sequence: {}
            };
        }

        // Extract the final prompt for Sora 2
        const visualPrompt = promptData.visual_prompt || responseText;
        const dialogueBm = promptData.dialogue_bm || '';
        const motionSequence = promptData.motion_sequence || {};

        // Build final prompt with all details
        let finalPrompt = visualPrompt;

        // Add motion sequence if available (helps Sora 2 understand timing)
        if (Object.keys(motionSequence).length > 0) {
            finalPrompt += `\n\n[MOTION TIMELINE for ${duration}s video]:\n`;
            if (motionSequence['0_3s']) finalPrompt += `[0-3s] ${motionSequence['0_3s']}\n`;
            if (motionSequence['3_6s']) finalPrompt += `[3-6s] ${motionSequence['3_6s']}\n`;
            if (motionSequence['6_9s']) finalPrompt += `[6-9s] ${motionSequence['6_9s']}\n`;
            if (motionSequence['9_12s']) finalPrompt += `[9-12s] ${motionSequence['9_12s']}\n`;
            if (duration === 15 && motionSequence['12_15s']) {
                finalPrompt += `[12-15s] ${motionSequence['12_15s']}\n`;
            }
        }

        // Generate caption for Telegram with proper CTA
        const caption = generateCaption(productName, productDescription, dialogueBm, ctaType);

        console.log('Generated prompt length:', finalPrompt.length, 'chars');

        return new Response(
            JSON.stringify({
                success: true,
                prompt: finalPrompt,
                caption: caption,
                dialogue: dialogueBm,
                fullResponse: promptData,
                metadata: {
                    promptMode,
                    videoType,
                    videoStyle,
                    aspectRatio,
                    duration,
                    characterGender,
                    ctaType
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: unknown) {
        console.error('Error generating prompt:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

function generateCaption(
    productName: string,
    productDescription: string,
    dialogueBm: string,
    ctaType: 'fb' | 'tiktok' | 'general'
): string {
    let cta = '';

    switch (ctaType) {
        case 'fb':
            cta = '👉 Tekan Learn More untuk tahu lebih lanjut!';
            break;
        case 'tiktok':
            cta = '🛒 Tekan beg kuning sekarang!';
            break;
        default:
            cta = '📲 Hubungi kami untuk maklumat lanjut!';
    }

    // Extract a hook or use product name
    const hook = dialogueBm ? dialogueBm.split(']')[1]?.substring(0, 50) || '' : '';

    const caption = `✨ ${productName}

${productDescription}

${cta}

#${productName.replace(/\s+/g, '')} #viral #fyp #tiktokmalaysia`;

    return caption;
}
