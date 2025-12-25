import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { geminigen_uuid } = await req.json();

    if (!geminigen_uuid) {
      console.error('Missing geminigen_uuid');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing geminigen_uuid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINIGEN_API_KEY = Deno.env.get('GEMINIGEN_API_KEY');
    if (!GEMINIGEN_API_KEY) {
      console.error('GEMINIGEN_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching fresh URL for video:', geminigen_uuid);

    // Fetch fresh video data from GeminiGen API using the correct endpoint
    const response = await fetch(
      `https://api.geminigen.ai/uapi/v1/history/${geminigen_uuid}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': GEMINIGEN_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GeminiGen API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch from GeminiGen' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('GeminiGen response:', JSON.stringify(data));

    // Extract video URL from response
    let videoUrl = null;
    let thumbnailUrl = null;

    if (data.generated_video && data.generated_video.length > 0) {
      const video = data.generated_video[0];
      // Use file_download_url for direct download
      videoUrl = video.file_download_url || video.video_url;
      
      // Get thumbnail
      if (data.thumbnail_url) {
        thumbnailUrl = data.thumbnail_url;
      } else if (data.last_frame_url) {
        thumbnailUrl = data.last_frame_url;
      } else if (video.last_frame && video.last_frame.startsWith('http')) {
        thumbnailUrl = video.last_frame;
      } else if (video.last_frame) {
        thumbnailUrl = `https://cdn.geminigen.ai/${video.last_frame}`;
      }
    }

    console.log('Fresh video URL:', videoUrl);
    console.log('Fresh thumbnail URL:', thumbnailUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        status: data.status === 2 ? 'completed' : data.status === 3 ? 'failed' : 'processing'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
