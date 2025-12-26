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

    console.log('Fetching video for download:', geminigen_uuid);

    // First get the fresh download URL
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
    console.log('GeminiGen response status:', data.status);

    // Get download URL - use video_url (signed R2 URL) as file_download_url returns 403
    let downloadUrl = null;
    if (data.generated_video && data.generated_video.length > 0) {
      const video = data.generated_video[0];
      // Prefer video_url (signed URL) over file_download_url which returns 403
      downloadUrl = video.video_url || video.file_download_url;
    }

    if (!downloadUrl) {
      console.error('No download URL found');
      return new Response(
        JSON.stringify({ success: false, error: 'No video URL available' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Downloading video from:', downloadUrl);

    // Fetch the actual video file
    const videoResponse = await fetch(downloadUrl);
    
    if (!videoResponse.ok) {
      console.error('Failed to fetch video:', videoResponse.status);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to download video' }),
        { status: videoResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the video as array buffer
    const videoBuffer = await videoResponse.arrayBuffer();
    console.log('Video downloaded, size:', videoBuffer.byteLength);

    // Return the video file directly
    return new Response(videoBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="video-${geminigen_uuid.substring(0, 8)}.mp4"`,
        'Content-Length': videoBuffer.byteLength.toString(),
      },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
