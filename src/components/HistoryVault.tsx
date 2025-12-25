import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Play, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VideoGeneration {
  id: string;
  prompt: string;
  status: string;
  status_percentage: number;
  video_url: string | null;
  thumbnail_url: string | null;
  duration: number;
  aspect_ratio: string;
  created_at: string;
  geminigen_uuid: string | null;
}

interface HistoryVaultProps {
  userProfile: UserProfile;
}

const HistoryVault: React.FC<HistoryVaultProps> = ({ userProfile }) => {
  const [videos, setVideos] = useState<VideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  const fetchVideos = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('get-user-videos');

      if (response.error) {
        console.error('Fetch error:', response.error);
        toast.error('Gagal memuatkan sejarah video');
        return;
      }

      setVideos(response.data.videos || []);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Gagal memuatkan sejarah video');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Auto-sync all processing videos with GeminiGen
  const syncProcessingVideos = async (videoList: VideoGeneration[]) => {
    const processingVideos = videoList.filter(
      v => v.status === 'processing' && v.geminigen_uuid
    );
    
    for (const video of processingVideos) {
      await checkAndUpdateStatus(video);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // Poll for status updates every 5 seconds for processing videos
  useEffect(() => {
    const processingVideos = videos.filter(v => v.status === 'processing' && v.geminigen_uuid);
    
    if (processingVideos.length === 0) return;

    const interval = setInterval(() => {
      processingVideos.forEach(video => {
        checkAndUpdateStatus(video);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [videos]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchVideos();
    // Also sync with GeminiGen after fetching
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const response = await supabase.functions.invoke('get-user-videos');
      if (response.data?.videos) {
        await syncProcessingVideos(response.data.videos);
      }
    }
  };

  const checkAndUpdateStatus = async (video: VideoGeneration) => {
    if (!video.geminigen_uuid || video.status === 'completed' || video.status === 'failed') return;

    try {
      const response = await supabase.functions.invoke('check-video-status', {
        body: { geminigen_uuid: video.geminigen_uuid, video_id: video.id },
      });

      console.log('Status check response:', response.data);

      if (response.data?.success) {
        // Update local state with latest data from GeminiGen
        setVideos(prev => prev.map(v => 
          v.id === video.id 
            ? { 
                ...v, 
                status: response.data.status,
                status_percentage: response.data.status_percentage || v.status_percentage,
                video_url: response.data.video_url || v.video_url, 
                thumbnail_url: response.data.thumbnail_url || v.thumbnail_url 
              }
            : v
        ));

        if (response.data.status === 'completed') {
          toast.success('Video telah siap!');
        } else if (response.data.status === 'failed') {
          toast.error('Video gagal dijana');
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  const getFreshVideoUrl = async (geminigenUuid: string): Promise<{ videoUrl: string | null; downloadUrl: string | null }> => {
    try {
      const response = await supabase.functions.invoke('get-fresh-video-url', {
        body: { geminigen_uuid: geminigenUuid },
      });

      console.log('Fresh URL response:', response.data);

      if (response.data?.success) {
        return {
          videoUrl: response.data.video_url || null,
          downloadUrl: response.data.download_url || response.data.video_url || null
        };
      }
      return { videoUrl: null, downloadUrl: null };
    } catch (error) {
      console.error('Error fetching fresh URL:', error);
      return { videoUrl: null, downloadUrl: null };
    }
  };

  const handleDownload = async (video: VideoGeneration) => {
    if (!video.geminigen_uuid) {
      toast.error('Video tidak mempunyai UUID');
      return;
    }

    setLoadingUrl(video.id);
    toast.info('Mendapatkan URL muat turun...');

    const { downloadUrl } = await getFreshVideoUrl(video.geminigen_uuid);
    setLoadingUrl(null);

    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
      toast.success('Video dibuka di tab baru');
    } else if (video.video_url) {
      window.open(video.video_url, '_blank');
      toast.success('Video dibuka di tab baru');
    } else {
      toast.error('Gagal mendapatkan URL video');
    }
  };

  const handlePreview = async (video: VideoGeneration) => {
    if (!video.geminigen_uuid) {
      if (video.video_url) {
        setPreviewVideo(video.video_url);
      } else {
        toast.error('Video tidak mempunyai UUID untuk mendapatkan URL');
      }
      return;
    }

    setLoadingUrl(video.id);
    toast.info('Mendapatkan URL video...');

    const { videoUrl } = await getFreshVideoUrl(video.geminigen_uuid);
    setLoadingUrl(null);

    if (videoUrl) {
      setPreviewVideo(videoUrl);
    } else if (video.video_url) {
      setPreviewVideo(video.video_url);
    } else {
      toast.error('Gagal mendapatkan URL video');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ms-MY', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in flex items-center justify-between">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
              ARCHIVE <span className="text-primary neon-text">VAULT</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-xl">
              Your generated masterpieces, preserved and ready for download.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          /* Empty State */
          <div className="glass-panel-elevated p-12 text-center animate-fade-in">
            <svg className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-bold text-foreground mb-2">Vault is Empty</h3>
            <p className="text-muted-foreground text-sm">Your generated videos will appear here</p>
          </div>
        ) : (
          /* Video Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video, index) => (
              <div
                key={video.id}
                className="glass-panel-elevated overflow-hidden group animate-fade-in hover:border-primary/30 transition-all duration-300"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Thumbnail */}
                <div className={cn(
                  "relative overflow-hidden bg-background/50",
                  video.aspect_ratio === 'portrait' ? "aspect-[9/16]" : "aspect-video"
                )}>
                  {video.status === 'processing' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-2" />
                      <span className="text-xs text-muted-foreground">{video.status_percentage}%</span>
                      <button
                        onClick={() => checkAndUpdateStatus(video)}
                        className="mt-2 text-xs text-primary hover:text-primary/80"
                      >
                        Check Status
                      </button>
                    </div>
                  ) : video.status === 'completed' ? (
                    <>
                      {video.thumbnail_url ? (
                        <img 
                          src={video.thumbnail_url} 
                          alt="Thumbnail" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-neon-blue/10">
                          <Play className="w-12 h-12 text-primary/40" />
                        </div>
                      )}
                      {/* Play Overlay */}
                      <div 
                        className={cn(
                          "absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
                          loadingUrl === video.id && "opacity-100"
                        )}
                        onClick={() => handlePreview(video)}
                      >
                        {loadingUrl === video.id ? (
                          <Loader2 className="w-8 h-8 text-white animate-spin" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
                            <Play className="w-6 h-6 text-primary-foreground ml-1" />
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
                      <span className="text-destructive text-xs">Failed</span>
                    </div>
                  )}
                  
                  {/* Status Badge */}
                  <div className={cn(
                    "absolute top-3 right-3 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                    video.status === 'completed' && "bg-primary/20 text-primary border border-primary/30",
                    video.status === 'processing' && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                    video.status === 'failed' && "bg-destructive/20 text-destructive border border-destructive/30"
                  )}>
                    {video.status}
                  </div>

                  {/* Duration */}
                  <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-background/80 backdrop-blur-sm text-xs font-mono text-foreground">
                    {video.duration}s
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <p className="text-sm text-foreground line-clamp-2 mb-2">{video.prompt}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{formatDate(video.created_at)}</span>
                    {video.status === 'completed' && video.geminigen_uuid && (
                      <button 
                        onClick={() => handleDownload(video)}
                        disabled={loadingUrl === video.id}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
                      >
                        {loadingUrl === video.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Download
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video Preview Modal */}
      {previewVideo && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewVideo(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewVideo(null)}
              className="absolute -top-12 right-0 text-white hover:text-primary transition-colors"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <video 
              src={previewVideo} 
              controls 
              autoPlay
              className="w-full rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryVault;
