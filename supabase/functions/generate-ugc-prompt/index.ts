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
1. Generate ONE CONSOLIDATED PARAGRAPH prompt in ENGLISH that Sora AI understands perfectly
2. Video is 15 seconds - describe 5 distinct segments of 3 seconds each IN ONE FLOWING PARAGRAPH
3. EACH 3-second segment MUST have COMPLETELY DIFFERENT camera angles and shots
4. NO text/subtitles in video EXCEPT CTA text overlay at the very end
5. Include casual Malaysian Malay dialog for character speech (in quotes)
6. Describe everything in vivid detail: expressions, gestures, lighting, camera movements

CHARACTER:
${characterDescription}

STRUCTURE to follow (but write as ONE PARAGRAPH):
- 0-3s: HOOK - Medium shot, warm greeting, friendly wave
- 3-6s: PRODUCT INTRO - Close-up of product, showcase features
- 6-9s: DEMONSTRATION - Dynamic side shot, show how to use
- 9-12s: RESULT/BENEFIT - Close-up face, satisfied expression
- 12-15s: CTA - Eye-level shot, point at camera, text overlay: "${ctaText}"

OUTPUT FORMAT (JSON):
{
  "videoPrompt": "ONE COMPLETE PARAGRAPH describing the entire 15-second video. Start with opening shot description, then flow naturally through each scene change. Include camera angles (medium shot, close-up, side shot, eye-level), character actions and expressions, product interactions, lighting descriptions, and Malaysian Malay dialog in quotes. End with CTA text overlay description. NO TIMESTAMPS in the prompt - just flowing description.",
  "dialogScript": "Dialog bahasa Melayu Malaysia dengan timestamp:\\n0-3s: 'Hai semua!'\\n3-6s: 'Ni [produk] yang best gila!'\\n6-9s: 'Senang gila nak guna!'\\n9-12s: 'Confirm puas hati!'\\n12-15s: [CTA text]"
}

EXAMPLE OUTPUT FORMAT:
"The video opens with a medium shot of a 30-year-old Malay woman wearing a stylish hijab and trendy modest clothing. She smiles warmly at the camera and waves enthusiastically, creating an inviting atmosphere. The lighting is bright and cheerful, highlighting her friendly expression. 'Hai semua!' she says. The camera transitions to a close-up shot of the product, showcasing its sleek design and features. The focus is on the product details. 'Ni [produk] yang best gila!' she explains. The camera shifts to a dynamic side shot as the character picks up the product with excitement. She gestures animatedly while explaining how easy it is to use. 'Senang gila nak guna!' she adds. A close-up shot captures her face as she shows a satisfied expression, eyes lighting up with joy. She nods and smiles, conveying genuine happiness. 'Confirm puas hati!' she shares. The final scene is an eye-level shot where she points directly at the camera with enthusiasm. The background is slightly blurred to focus on her engaging expression. The video ends with the text overlay: '${ctaText}'."`;

    const userPrompt = `Create an UGC video prompt for:

PRODUCT: ${productName}
DESCRIPTION: ${productDescription}
PLATFORM: ${platform}
CHARACTER: ${gender === 'female' ? 'Perempuan Melayu bertudung, 30-an' : 'Lelaki Melayu sopan, 30-an, tiada aksesori'}

Write ONE FLOWING PARAGRAPH prompt (like the example) that describes the entire 15-second video naturally. Include:
1. Camera shots and angles for each scene transition
2. Character expressions, gestures, clothing
3. Product showcase moments
4. Malaysian Malay dialog in quotes
5. Lighting and atmosphere descriptions
6. End with CTA text overlay: "${ctaText}"

DO NOT use timestamps or bullet points in the videoPrompt. Write it as one cohesive paragraph.`;

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
