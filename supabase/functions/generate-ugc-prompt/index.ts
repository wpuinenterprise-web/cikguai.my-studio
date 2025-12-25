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
    const { productName, productDescription, platform, gender, openaiApiKey } = await req.json();

    if (!productName || !productDescription || !platform || !gender) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use provided API key or fallback to env
    const apiKey = openaiApiKey || Deno.env.get('OPENAI_API_KEY');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ctaText = platform === 'tiktok' 
      ? 'tekan beg kuning sekarang' 
      : 'tekan learn more untuk tahu lebih lanjut';

    const characterDescription = gender === 'female'
      ? 'A Malay woman in her 30s wearing a stylish hijab (tudung), warm friendly expression, natural makeup, casual modest fashion suitable for a lifestyle influencer, expressive hand gestures'
      : 'A Malay man in his 30s, well-groomed with neat hair, clean-shaven or light stubble, polite and confident appearance, no earrings/chains/bracelets, wearing long pants (absolutely no shorts), stylish casual influencer fashion, approachable demeanor';

    const systemPrompt = `You are an expert UGC (User Generated Content) video prompt generator for AI video generation (Sora 2.0). Create EXTREMELY DETAILED prompts for 15-second product videos.

CRITICAL RULES:
1. Generate prompts in ENGLISH that Sora AI understands perfectly
2. Video is 15 seconds - MUST have 5 distinct segments of 3 seconds each
3. EACH 3-second segment MUST have COMPLETELY DIFFERENT:
   - Camera angle (close-up, medium shot, over-shoulder, POV, wide, Dutch angle, low angle, high angle)
   - Camera movement (static, slow pan left/right, dolly in/out, tracking shot, handheld shake)
   - Lighting mood (soft natural, golden hour, ring light, dramatic side light)
   - Composition (rule of thirds, centered, off-center, negative space)
4. NO text/subtitles in video EXCEPT CTA text at the end
5. Character speaks in casual Malaysian Malay - dialog must be TIMED perfectly for each segment
6. Include micro-expressions, body language, hand gestures in every segment
7. Describe background environment, props, colors in detail

CHARACTER:
${characterDescription}

STRUCTURE (15 seconds total):
- 0-3s: HOOK - Grab attention immediately, dramatic/surprising moment
- 3-6s: PROBLEM/NEED - Show the pain point or desire
- 6-9s: SOLUTION/PRODUCT - Introduce product naturally
- 9-12s: BENEFIT/RESULT - Show transformation or result
- 12-15s: CTA - Call to action with text "${ctaText}"

OUTPUT FORMAT (JSON):
{
  "videoPrompt": "Complete consolidated prompt for Sora AI - include ALL visual details, camera work, lighting, expressions for the entire 15 seconds",
  "dialogScript": "Complete dialog script in casual Malaysian Malay with timestamps",
  "segments": [
    {
      "time": "0-3s",
      "hook": "What grabs attention",
      "scene": "Detailed scene description (location, props, atmosphere)",
      "character": "Character action, expression, body language, hand gestures",
      "cameraAngle": "Specific camera angle (e.g., 'Extreme close-up on face, slight Dutch angle')",
      "cameraMovement": "Camera movement (e.g., 'Slow dolly in from medium to close-up')",
      "lighting": "Lighting setup (e.g., 'Soft golden hour light from left, subtle rim light')",
      "dialog": "Exact Malaysian Malay dialog for this 3 seconds",
      "visualStyle": "Color grading, mood, aesthetic"
    }
  ]
}`;

    const userPrompt = `Create an ULTRA-DETAILED UGC video prompt for:

PRODUCT: ${productName}
DESCRIPTION: ${productDescription}
PLATFORM: ${platform}
CHARACTER: ${gender === 'female' ? 'Perempuan Melayu bertudung, 30-an' : 'Lelaki Melayu sopan, 30-an, tiada aksesori'}

REQUIREMENTS:
1. Hook kena KUAT dalam 3 saat pertama
2. Setiap 3 saat MESTI tukar camera angle dan visual style
3. Dialog bahasa Melayu Malaysia santai, ringkas, sync dengan visual
4. Tunjuk produk secara natural, bukan hard sell
5. CTA akhir dengan text "${ctaText}"

Generate the most detailed, professional UGC prompt possible. Each segment must be distinctly different visually.`;

    console.log('Calling OpenAI API for detailed UGC prompt generation...');

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
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to generate prompt from OpenAI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log('Generated UGC prompt successfully');

    // Try to parse as JSON, otherwise return as text
    let parsedContent;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = generatedContent.match(/```json\n?([\s\S]*?)\n?```/) || 
                        generatedContent.match(/```\n?([\s\S]*?)\n?```/);
      const jsonString = jsonMatch ? jsonMatch[1] : generatedContent;
      parsedContent = JSON.parse(jsonString);
    } catch {
      parsedContent = { videoPrompt: generatedContent, dialogScript: '', segments: [] };
    }

    return new Response(
      JSON.stringify({ success: true, data: parsedContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in generate-ugc-prompt:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
