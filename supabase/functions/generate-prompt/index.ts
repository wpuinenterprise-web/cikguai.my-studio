import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gemini 2.5 Flash-Lite API for prompt generation
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || 'AIzaSyDHRfnrHDyvSyUjf5xcYRmhwRQMoCp5cgY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

// Master System Instruction for Gemini
const SYSTEM_INSTRUCTION = `# ROLE: Anti-Gravity Director (Sora 2 Specialist)

# LOGIC GATE:
1. METHOD [AUTO/MANUAL]: 
   - If AUTO: Expand the idea into a high-conversion script.
   - If MANUAL: Optimize user's text for Sora 2 physics without changing the core intent.
2. INPUT [T2V/I2V]:
   - If T2V: Describe scene from scratch.
   - If I2V: Use image as 'Keyframe 0'. Focus on animating specific elements of the image.
3. STYLE [UGC/STORYBOARD]:
   - UGC: 9:16, handheld, ring-light, casual Malay, influencer vibe.
   - STORYBOARD: 16:9, anamorphic, cinematic lighting, dramatic/formal Malay.
4. FORMAT: Match [RATIO] and [DURATION: 10s/15s].

# OUTPUT REQUIREMENTS:
Return a JSON object only. Ensure motion descriptions are progressive and do not loop.
The output MUST be valid JSON with this structure:
{
  "system_decision": {
    "workflow_path": "METHOD_INPUT_STYLE",
    "resolution": "RATIO_SELECTED",
    "timer": "DURATION_SELECTED"
  },
  "sora_2_payload": {
    "visual_prompt": "(Technical English: Subject + Action + Environment + Camera + Lighting. Optimized for Sora 2 physics.)",
    "i2v_motion_reference": "(Only if I2V: Describe how the static pixels in the source image transform into motion over DURATION.)",
    "motion_sequence": {
      "0_5s": "Initial motion",
      "5_10s": "Progressive change",
      "10_15s": "Climax/Ending (if 15s)"
    }
  },
  "audio_payload": {
    "dialogue_bm": "(Bahasa Melayu Malaysia based on STYLE selection)",
    "tone": "Casual/Energetic for UGC or Deep/Cinematic for Storyboard"
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
    ctaType?: 'fb' | 'tiktok' | 'general';
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
            targetAudience = 'general audience',
            contentStyle = 'professional',
            promptMode,
            videoType,
            videoStyle,
            aspectRatio,
            duration,
            manualPrompt,
            ctaType = 'general'
        } = body;

        // Build user prompt based on mode
        let userPrompt: string;

        if (promptMode === 'manual' && manualPrompt) {
            // Manual mode - optimize user's text
            userPrompt = `METHOD: MANUAL
INPUT: ${videoType.toUpperCase()}
STYLE: ${videoStyle.toUpperCase()}
RATIO: ${aspectRatio === 'portrait' ? '9:16' : '16:9'}
DURATION: ${duration}s
CTA_TYPE: ${ctaType}

USER'S ORIGINAL PROMPT:
${manualPrompt}

Optimize this prompt for Sora 2 video generation while keeping the core intent intact.`;
        } else {
            // Auto mode - generate from product details
            userPrompt = `METHOD: AUTO
INPUT: ${videoType.toUpperCase()}
STYLE: ${videoStyle.toUpperCase()}
RATIO: ${aspectRatio === 'portrait' ? '9:16' : '16:9'}
DURATION: ${duration}s
CTA_TYPE: ${ctaType}

PRODUCT DETAILS:
- Name: ${productName}
- Description: ${productDescription}
- Target Audience: ${targetAudience}
- Content Style: ${contentStyle}

Generate a high-conversion video script for this product. ${videoType === 'i2v' ? 'The product image will be provided as keyframe 0.' : ''}`;
        }

        console.log('Calling Gemini API with prompt:', userPrompt.substring(0, 200) + '...');

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
                    temperature: 0.7,
                    maxOutputTokens: 2048,
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
                sora_2_payload: {
                    visual_prompt: responseText,
                },
                audio_payload: {
                    dialogue_bm: '',
                    tone: videoStyle === 'ugc' ? 'Casual/Energetic' : 'Deep/Cinematic'
                }
            };
        }

        // Extract the final prompt for Sora 2
        const visualPrompt = promptData.sora_2_payload?.visual_prompt || responseText;
        const i2vMotionRef = promptData.sora_2_payload?.i2v_motion_reference || '';
        const motionSequence = promptData.sora_2_payload?.motion_sequence || {};
        const dialogueBm = promptData.audio_payload?.dialogue_bm || '';

        // Build final prompt with motion sequence for better video generation
        let finalPrompt = visualPrompt;

        if (videoType === 'i2v' && i2vMotionRef) {
            finalPrompt = `${visualPrompt}\n\nMOTION REFERENCE: ${i2vMotionRef}`;
        }

        // Add motion sequence if available
        if (Object.keys(motionSequence).length > 0) {
            finalPrompt += `\n\nMOTION SEQUENCE:\n`;
            if (motionSequence['0_5s']) finalPrompt += `0-5s: ${motionSequence['0_5s']}\n`;
            if (motionSequence['5_10s']) finalPrompt += `5-10s: ${motionSequence['5_10s']}\n`;
            if (duration === 15 && motionSequence['10_15s']) {
                finalPrompt += `10-15s: ${motionSequence['10_15s']}\n`;
            }
        }

        // Generate caption for Telegram
        const caption = generateCaption(productName, productDescription, dialogueBm, ctaType);

        console.log('Generated prompt:', finalPrompt.substring(0, 300) + '...');

        return new Response(
            JSON.stringify({
                success: true,
                prompt: finalPrompt,
                caption: caption,
                fullResponse: promptData,
                metadata: {
                    promptMode,
                    videoType,
                    videoStyle,
                    aspectRatio,
                    duration
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
            cta = '👉 Klik link di bio untuk dapatkan sekarang!';
            break;
        case 'tiktok':
            cta = '🛒 Tekan keranjang kuning untuk beli!';
            break;
        default:
            cta = '📲 Hubungi kami untuk maklumat lanjut!';
    }

    const caption = dialogueBm
        ? `${dialogueBm}\n\n✨ ${productName}\n${productDescription}\n\n${cta}`
        : `✨ ${productName}\n${productDescription}\n\n${cta}`;

    return caption;
}
