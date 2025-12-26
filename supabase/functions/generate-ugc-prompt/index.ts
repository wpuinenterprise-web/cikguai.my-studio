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
7. NEVER START WITH "Hai semua!" - Use creative visual hooks instead!

CHARACTER:
${characterDescription}

HOOK TYPES (RANDOMLY SELECT ONE - NEVER USE "Hai semua!"):
1. PROBLEM HOOK: Start with character showing frustration/problem, then discovering product as solution
   - Example visual: Character sighing while looking at problem, then eyes widen seeing the product
   - Example dialog: "Aku dah penat dah..." / "Korang pernah tak rasa macam ni?" / "Masalah ni selalu sangat..."
   
2. VISUAL PRODUCT HOOK: Start with dramatic close-up of product, then reveal character
   - Example visual: Cinematic slow-mo of product being placed on table, camera pulls back to reveal impressed character
   - Example dialog: "Tengok ni..." / "Korang kena tengok benda ni..." / "Best gila benda ni..."
   
3. CURIOSITY HOOK: Character looking secretive/excited about sharing something
   - Example visual: Character leaning in close to camera with mysterious smile, whispering
   - Example dialog: "Jangan bagitahu orang..." / "Aku nak share secret..." / "Korang nak tahu tak..."
   
4. BEFORE/AFTER HOOK: Quick contrast showing transformation
   - Example visual: Split-second of 'before' state, dramatic transition to 'after' with product
   - Example dialog: "Dulu macam ni..." / "Sekarang? Tengok!" / "Beza dia gila..."
   
5. ACTION HOOK: Start mid-action with product, capture attention immediately
   - Example visual: Character already using product with visible results, energetic movement
   - Example dialog: "Tengok result dia!" / "Serious berkesan!" / "Confirm korang nak ni..."

STRUCTURE to follow (but write as ONE PARAGRAPH):
- 0-3s: HOOK - Use one of the creative hooks above (NEVER "Hai semua!")
- 3-6s: PRODUCT INTRO - Close-up of product, showcase features
- 6-9s: DEMONSTRATION - Dynamic side shot, show how to use
- 9-12s: RESULT/BENEFIT - Close-up face, satisfied expression
- 12-15s: CTA - Eye-level shot, point at camera, text overlay: "${ctaText}"

OUTPUT FORMAT (JSON):
{
  "videoPrompt": "ONE COMPLETE PARAGRAPH with CREATIVE VISUAL HOOK. Start with an attention-grabbing opening (problem, product reveal, curiosity, or action). Include camera angles, character expressions, product interactions, lighting, and Malaysian Malay dialog in quotes. NO TIMESTAMPS. End with CTA text overlay.",
  "dialogScript": "Dialog bahasa Melayu Malaysia dengan timestamp:\\n0-3s: '[CREATIVE HOOK - NOT Hai semua!]'\\n3-6s: '[product excitement]'\\n6-9s: '[demonstration]'\\n9-12s: '[satisfaction]'\\n12-15s: [CTA text]"
}

EXAMPLE OUTPUTS (VARY THE HOOK TYPE):

PROBLEM HOOK EXAMPLE:
"The video opens with a close-up of a 30-year-old Malay woman in hijab looking frustrated, rubbing her temples with a tired expression. Soft dramatic lighting emphasizes her struggle. 'Aku dah penat dah dengan masalah ni...' she sighs. Suddenly her eyes widen as the camera whip-pans to reveal the product on the table with dramatic lighting. She picks it up with growing excitement..."

VISUAL PRODUCT HOOK EXAMPLE:
"The video opens with a cinematic extreme close-up of the product being slowly placed on a marble surface, golden hour lighting catching its features. The camera smoothly pulls back in a dramatic reveal to show a 30-year-old Malay woman in stylish hijab looking impressed. 'Tengok ni best gila...' she says with wide eyes..."

CURIOSITY HOOK EXAMPLE:
"The video opens with a tight close-up of a 30-year-old Malay woman in hijab leaning towards the camera with a mischievous smile, finger to her lips. Intimate lighting creates a secretive mood. 'Jangan bagitahu orang tau...' she whispers conspiratorially, then pulls back to reveal the product she's been hiding..."

ACTION HOOK EXAMPLE:
"The video opens mid-action with a dynamic shot of a 30-year-old Malay woman in hijab actively using the product, visible results already showing. Energetic camera movement follows her excitement. 'Tengok result dia! Gila kan?' she exclaims with genuine amazement..."`;


    const userPrompt = `Create an UGC video prompt for:

PRODUCT: ${productName}
DESCRIPTION: ${productDescription}
PLATFORM: ${platform}
CHARACTER: ${gender === 'female' ? 'Perempuan Melayu bertudung, 30-an' : 'Lelaki Melayu sopan, 30-an, tiada aksesori'}

IMPORTANT: 
- RANDOMLY select ONE hook type from: PROBLEM, VISUAL PRODUCT, CURIOSITY, BEFORE/AFTER, or ACTION hook
- NEVER start with "Hai semua!" or any generic greeting
- The hook must grab attention in the first 3 seconds

Write ONE FLOWING PARAGRAPH prompt that describes the entire 15-second video naturally. Include:
1. CREATIVE VISUAL HOOK (first 3 seconds - problem/curiosity/action/product reveal)
2. Camera shots and angles for each scene transition
3. Character expressions, gestures, clothing
4. Product showcase moments
5. Malaysian Malay dialog in quotes (casual, relatable language)
6. Lighting and atmosphere descriptions
7. End with CTA text overlay: "${ctaText}"

DO NOT use timestamps or bullet points in the videoPrompt. Write it as one cohesive paragraph starting with an attention-grabbing visual hook.`;

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

    console.log('Raw generated content:', generatedContent.substring(0, 500));

    // Try to parse as JSON, otherwise return as text
    let parsedContent;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = generatedContent.match(/```json\n?([\s\S]*?)\n?```/) || 
                        generatedContent.match(/```\n?([\s\S]*?)\n?```/);
      
      let jsonString = jsonMatch ? jsonMatch[1].trim() : generatedContent.trim();
      
      // If no code block found, try to find JSON object directly
      if (!jsonMatch) {
        const jsonStartIndex = generatedContent.indexOf('{');
        const jsonEndIndex = generatedContent.lastIndexOf('}');
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
          jsonString = generatedContent.substring(jsonStartIndex, jsonEndIndex + 1);
        }
      }
      
      console.log('Attempting to parse JSON:', jsonString.substring(0, 200));
      parsedContent = JSON.parse(jsonString);
      console.log('Successfully parsed JSON, videoPrompt length:', parsedContent.videoPrompt?.length || 0);
    } catch (parseError) {
      console.log('JSON parse failed, using raw content as videoPrompt');
      // If parsing fails, use the entire content as videoPrompt
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
