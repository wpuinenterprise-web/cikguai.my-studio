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
      ? 'A Malay woman in her 30s wearing a hijab (tudung), with a warm friendly expression, casual modest fashion style suitable for a lifestyle influencer'
      : 'A Malay man in his 30s, well-groomed and polite appearance, no earrings or chains or bracelets, wearing long pants (no shorts), stylish influencer fashion with clean professional look';

    const systemPrompt = `You are an expert UGC (User Generated Content) video prompt generator for AI video generation. Your task is to create detailed, professional prompts for 15-second product promotion videos.

RULES:
1. Generate prompts in ENGLISH that AI video generators can understand
2. The video is 15 seconds total - divide into 5 segments of 3 seconds each
3. Each 3-second segment MUST have a different camera angle and visual style
4. NO text or subtitles in the video EXCEPT for the CTA at the end
5. The character speaks in casual Malaysian Malay (dialog provided separately)
6. Structure: Hook (0-3s) → Product Feature 1 (3-6s) → Product Feature 2 (6-9s) → Benefit/Result (9-12s) → CTA (12-15s)

CHARACTER DESCRIPTION:
${characterDescription}

CTA TEXT (only text shown in video):
"${ctaText}"

OUTPUT FORMAT (JSON):
{
  "videoPrompt": "Full detailed prompt for AI video generation in English",
  "dialogScript": "Dialog in casual Malaysian Malay, timestamped for each segment, natural speaking pace",
  "segments": [
    {
      "time": "0-3s",
      "scene": "Hook scene description",
      "cameraAngle": "Camera angle description",
      "visualStyle": "Visual style description"
    }
  ]
}`;

    const userPrompt = `Create a UGC video prompt for:
Product Name: ${productName}
Product Description: ${productDescription}
Platform: ${platform}
Character Gender: ${gender}

Generate a compelling 15-second video prompt with:
- Strong hook in first 3 seconds
- Clear product features
- Engaging delivery style
- Natural Malaysian Malay dialog (casual, brief, fits timing)
- Different camera angle every 3 seconds
- CTA at the end with text "${ctaText}"`;

    console.log('Calling OpenAI API for UGC prompt generation...');

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
