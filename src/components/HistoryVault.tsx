import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Play, RefreshCw, Loader2, Search, X, Trash2, Check, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  // Check if feature should be locked
  const isLocked = userProfile && !userProfile.is_admin && (!userProfile.is_approved || userProfile.video_limit <= 0);
  
  const [videos, setVideos] = useState<VideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Selection states for bulk actions
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [aspectFilter, setAspectFilter] = useState<string>('all');

  // Separate recent videos (last 24 hours or processing)
  const recentVideos = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const seen = new Set<string>();
    return videos.filter(video => {
      if (video.geminigen_uuid) {
        if (seen.has(video.geminigen_uuid)) return false;
        seen.add(video.geminigen_uuid);
      }
      const isRecent = new Date(video.created_at).getTime() > oneDayAgo;
      const isProcessing = video.status === 'processing';
      return isRecent || isProcessing;
    });
  }, [videos]);

  // Filtered videos based on search and filters
  const filteredVideos = useMemo(() => {
    // Deduplicate by geminigen_uuid in frontend as well
    const seen = new Set<string>();
    return videos.filter(video => {
      // Deduplicate by geminigen_uuid
      if (video.geminigen_uuid) {
        if (seen.has(video.geminigen_uuid)) return false;
        seen.add(video.geminigen_uuid);
      }
      
      // Search filter
      const matchesSearch = searchQuery === '' || 
        video.prompt.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || video.status === statusFilter;
      
      // Aspect ratio filter
      const matchesAspect = aspectFilter === 'all' || video.aspect_ratio === aspectFilter;
      
      return matchesSearch && matchesStatus && matchesAspect;
    });
  }, [videos, searchQuery, statusFilter, aspectFilter]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setAspectFilter('all');
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || aspectFilter !== 'all';

  // Fast load from database cache first
  const loadFromCache = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: cachedVideos, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!error && cachedVideos) {
        // Deduplicate by geminigen_uuid
        const seen = new Set<string>();
        const unique = cachedVideos.filter(v => {
          if (!v.geminigen_uuid) return true;
          if (seen.has(v.geminigen_uuid)) return false;
          seen.add(v.geminigen_uuid);
          return true;
        });
        setVideos(unique);
      }
    } catch (error) {
      console.error('Cache load error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Background sync with GeminiGen
  const syncWithGeminiGen = async (showToast = false) => {
    if (isSyncing) return;
    
    try {
      setIsSyncing(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('get-user-videos');

      if (response.error) {
        console.error('Sync error:', response.error);
        return;
      }

      const newVideos = response.data.videos || [];
      setVideos(newVideos);
      
      if (showToast && response.data.synced_from_geminigen > 0) {
        toast.success(`Sync selesai - ${response.data.synced_from_geminigen} video`);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
      setRefreshing(false);
    }
  };

  // Initial load: cache first, then sync
  useEffect(() => {
    const initLoad = async () => {
      await loadFromCache();
      // Sync in background after cache loads
      syncWithGeminiGen();
    };
    initLoad();
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('video-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_generations',
        },
        (payload) => {
          console.log('Realtime update:', payload);
          if (payload.eventType === 'INSERT') {
            setVideos(prev => {
              const exists = prev.some(v => v.id === payload.new.id);
              if (exists) return prev;
              return [payload.new as VideoGeneration, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setVideos(prev => prev.map(v => 
              v.id === payload.new.id ? { ...v, ...payload.new } as VideoGeneration : v
            ));
          } else if (payload.eventType === 'DELETE') {
            setVideos(prev => prev.filter(v => v.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Poll for status updates every 6 seconds for processing videos only
  useEffect(() => {
    const processingVideos = videos.filter(v => v.status === 'processing' && v.geminigen_uuid);
    
    if (processingVideos.length === 0) return;

    const checkAll = () => {
      processingVideos.forEach(video => {
        checkAndUpdateStatus(video);
      });
    };

    // Check immediately when processing videos detected
    checkAll();
    
    const interval = setInterval(checkAll, 6000);
    return () => clearInterval(interval);
  }, [videos]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncWithGeminiGen(true);
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
    toast.info('Memuat turun video...');

    try {
      // Use fetch directly to get binary response properly
      const response = await fetch(
        `https://detznytjwofbqrvwqcdx.supabase.co/functions/v1/download-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHpueXRqd29mYnFydndxY2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NjU1NjMsImV4cCI6MjA4MjI0MTU2M30.7tH1Q-MMXHJE02gob8sNJ727Z1L1j7RVkDieAqgJ4Y0`,
          },
          body: JSON.stringify({ geminigen_uuid: video.geminigen_uuid }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download video');
      }

      // Get the response as blob directly
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${video.id.substring(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Video berjaya dimuat turun!');
    } catch (error) {
      console.error('Error downloading video:', error);
      toast.error('Gagal memuat turun video');
    } finally {
      setLoadingUrl(null);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (video: VideoGeneration) => {
    if (!confirm('Adakah anda pasti mahu padam video ini?')) return;

    setDeletingId(video.id);
    
    try {
      const { error } = await supabase
        .from('video_generations')
        .delete()
        .eq('id', video.id);

      if (error) {
        throw error;
      }

      // Remove from local state
      setVideos(prev => prev.filter(v => v.id !== video.id));
      toast.success('Video berjaya dipadam');
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Gagal memadam video');
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle video selection
  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  // Select all visible videos
  const selectAllVideos = () => {
    const allIds = filteredVideos.map(v => v.id);
    setSelectedVideos(new Set(allIds));
  };

  // Deselect all
  const deselectAllVideos = () => {
    setSelectedVideos(new Set());
  };

  // Toggle select mode
  const toggleSelectMode = () => {
    if (isSelectMode) {
      // Exiting select mode, clear selection
      setSelectedVideos(new Set());
    }
    setIsSelectMode(!isSelectMode);
  };

  // Bulk delete selected videos
  const handleBulkDelete = async () => {
    if (selectedVideos.size === 0) {
      toast.error('Sila pilih video untuk dipadam');
      return;
    }

    if (!confirm(`Adakah anda pasti mahu padam ${selectedVideos.size} video?`)) return;

    setIsBulkDeleting(true);
    
    try {
      const idsToDelete = Array.from(selectedVideos);
      const { error } = await supabase
        .from('video_generations')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      // Remove from local state
      setVideos(prev => prev.filter(v => !selectedVideos.has(v.id)));
      toast.success(`${selectedVideos.size} video berjaya dipadam`);
      setSelectedVideos(new Set());
      setIsSelectMode(false);
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error('Gagal memadam video');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Bulk download selected videos
  const handleBulkDownload = async () => {
    const selectedList = filteredVideos.filter(v => 
      selectedVideos.has(v.id) && v.status === 'completed' && v.geminigen_uuid
    );

    if (selectedList.length === 0) {
      toast.error('Tiada video yang boleh dimuat turun dipilih');
      return;
    }

    setIsBulkDownloading(true);
    toast.info(`Memuat turun ${selectedList.length} video...`);

    let successCount = 0;
    for (const video of selectedList) {
      try {
        const response = await fetch(
          `https://detznytjwofbqrvwqcdx.supabase.co/functions/v1/download-video`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHpueXRqd29mYnFydndxY2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NjU1NjMsImV4cCI6MjA4MjI0MTU2M30.7tH1Q-MMXHJE02gob8sNJ727Z1L1j7RVkDieAqgJ4Y0`,
            },
            body: JSON.stringify({ geminigen_uuid: video.geminigen_uuid }),
          }
        );

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `video-${video.id.substring(0, 8)}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          successCount++;
          // Small delay between downloads
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        console.error('Error downloading video:', video.id, error);
      }
    }

    setIsBulkDownloading(false);
    if (successCount > 0) {
      toast.success(`${successCount} video berjaya dimuat turun`);
    } else {
      toast.error('Gagal memuat turun video');
    }
    setSelectedVideos(new Set());
    setIsSelectMode(false);
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

  // Render a single video card
  const renderVideoCard = (video: VideoGeneration, index: number, compact = false) => {
    const isSelected = selectedVideos.has(video.id);
    
    return (
      <div
        key={video.id}
        className={cn(
          "glass-panel-elevated overflow-hidden group animate-fade-in transition-all duration-300 flex-shrink-0 relative",
          compact && "w-[200px] sm:w-[240px]",
          isSelectMode && "cursor-pointer",
          isSelected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/30"
        )}
        style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
        onClick={isSelectMode ? () => toggleVideoSelection(video.id) : undefined}
      >
        {/* Selection Checkbox */}
        {isSelectMode && (
          <div className="absolute top-2 left-2 z-20">
            <div className={cn(
              "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
              isSelected 
                ? "bg-primary border-primary" 
                : "bg-background/80 border-muted-foreground/50 backdrop-blur-sm"
            )}>
              {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
            </div>
          </div>
        )}
        
        {/* Thumbnail */}
        <div className={cn(
          "relative overflow-hidden bg-background/50",
          compact ? "aspect-video" : (video.aspect_ratio === 'portrait' ? "aspect-[9/16]" : "aspect-video")
        )}>
          {video.status === 'processing' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-2" />
              <span className="text-xs text-muted-foreground">{video.status_percentage}%</span>
              <button
                onClick={() => checkAndUpdateStatus(video)}
                className="mt-1 text-[10px] text-primary hover:text-primary/80"
              >
                Semak Status
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
                  <Play className="w-8 h-8 text-primary/40" />
                </div>
              )}
              {/* Play Overlay - always visible on mobile */}
              <div 
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity cursor-pointer",
                  "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                  loadingUrl === video.id && "opacity-100",
                  isSelectMode && "opacity-50"
                )}
                onClick={(e) => { 
                  if (!isSelectMode) {
                    e.stopPropagation();
                    handlePreview(video); 
                  }
                }}
              >
                {loadingUrl === video.id ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center">
                    <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
              <span className="text-destructive text-xs">Gagal</span>
            </div>
          )}
          
          {/* Status Badge */}
          <div className={cn(
            "absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
            video.status === 'completed' && "bg-primary/20 text-primary border border-primary/30",
            video.status === 'processing' && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
            video.status === 'failed' && "bg-destructive/20 text-destructive border border-destructive/30"
          )}>
            {video.status === 'processing' ? 'Memproses' : video.status === 'completed' ? 'Siap' : 'Gagal'}
          </div>

          {/* Duration */}
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm text-[10px] font-mono text-foreground">
            {video.duration}s
          </div>
        </div>

        {/* Content */}
        <div className="p-3">
          <p className="text-xs text-foreground line-clamp-2 mb-2">{video.prompt}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground truncate">{formatDate(video.created_at)}</span>
            <div className="flex items-center gap-2">
              {!isSelectMode && video.status === 'completed' && video.geminigen_uuid && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDownload(video); }}
                  disabled={loadingUrl === video.id}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-semibold transition-colors disabled:opacity-50"
                >
                  {loadingUrl === video.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                </button>
              )}
              {!isSelectMode && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(video); }}
                  disabled={deletingId === video.id}
                  className="flex items-center gap-1 text-[10px] text-destructive hover:text-destructive/80 font-semibold transition-colors disabled:opacity-50"
                >
                  {deletingId === video.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Locked UI component
  if (isLocked) {
    const whatsappNumber = "601158833804"; // Admin WhatsApp number
    const whatsappMessage = encodeURIComponent(
      `Hai Admin, saya ${userProfile?.username || 'user baru'} ingin mohon kelulusan akaun / tambah had video untuk akaun saya.`
    );
    const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

    return (
      <div className="min-h-screen pt-16 pb-24 px-3 sm:px-6 lg:px-8 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="glass-panel-elevated p-8 sm:p-12 text-center animate-fade-in">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
              <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-foreground mb-3">
              {!userProfile?.is_approved ? 'Akaun Belum Diluluskan' : 'Had Video: 0'}
            </h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
              {!userProfile?.is_approved 
                ? 'Akaun anda sedang menunggu kelulusan dari admin. Sila hubungi admin untuk mempercepatkan proses kelulusan.'
                : 'Anda belum mempunyai had video. Sila hubungi admin untuk mendapatkan had video.'
              }
            </p>
            
            <div className="flex flex-col gap-3 items-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                  {!userProfile?.is_approved ? 'Menunggu Kelulusan' : 'Limit: 0 Video'}
                </span>
              </div>
              
              <a 
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-all shadow-lg hover:shadow-green-500/25 active:scale-95"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Hubungi Admin via WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 pb-24 px-3 sm:px-6 lg:px-8 overflow-y-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 animate-fade-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
              ARCHIVE <span className="text-primary neon-text">VAULT</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-xl flex items-center gap-2">
              Your generated masterpieces, preserved and ready for download.
              {isSyncing && (
                <span className="inline-flex items-center gap-1 text-primary text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Syncing...
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant={isSelectMode ? "default" : "outline"}
              size="sm"
              onClick={toggleSelectMode}
              className="gap-2"
            >
              {isSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {isSelectMode ? 'Batal' : 'Pilih'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || isSyncing}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", (refreshing || isSyncing) && "animate-spin")} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Bulk Action Bar - Show when in select mode */}
        {isSelectMode && (
          <div className="mb-4 glass-panel p-3 animate-fade-in border-primary/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedVideos.size} dipilih
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectedVideos.size === filteredVideos.length ? deselectAllVideos : selectAllVideos}
                  className="text-xs"
                >
                  {selectedVideos.size === filteredVideos.length ? 'Nyahpilih Semua' : 'Pilih Semua'}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDownload}
                  disabled={isBulkDownloading || selectedVideos.size === 0}
                  className="gap-2 text-primary border-primary/30 hover:bg-primary/10"
                >
                  {isBulkDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Muat Turun
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting || selectedVideos.size === 0}
                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  {isBulkDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Padam
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filter Bar */}
        <div className="mb-6 glass-panel p-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari prompt video..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
            
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px] bg-background/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Aspect Ratio Filter */}
            <Select value={aspectFilter} onValueChange={setAspectFilter}>
              <SelectTrigger className="w-full sm:w-[140px] bg-background/50">
                <SelectValue placeholder="Aspect Ratio" />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="all">Semua Ratio</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
                <SelectItem value="portrait">Portrait</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
                Clear
              </Button>
            )}
          </div>

          {/* Results Count */}
          {videos.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              Menunjukkan {filteredVideos.length} daripada {videos.length} video
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          /* Empty State */
          <div className="glass-panel-elevated p-8 sm:p-12 text-center animate-fade-in">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-bold text-foreground mb-2">Vault Kosong</h3>
            <p className="text-muted-foreground text-sm">Video yang dijana akan muncul di sini</p>
          </div>
        ) : (
          <>
            {/* Recent Videos Section - Horizontal Scroll */}
            {recentVideos.length > 0 && !hasActiveFilters && (
              <div className="mb-6 animate-fade-in">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  BARU DIJANA
                </h3>
                <div 
                  className="flex gap-3 overflow-x-auto pb-3 -mx-3 px-3 scrollbar-hide"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {recentVideos.slice(0, 10).map((video, index) => renderVideoCard(video, index, true))}
                </div>
              </div>
            )}

            {/* Filtered Results or No Results */}
            {filteredVideos.length === 0 ? (
              <div className="glass-panel-elevated p-8 sm:p-12 text-center animate-fade-in">
                <Search className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-lg font-bold text-foreground mb-2">Tiada Hasil Dijumpai</h3>
                <p className="text-muted-foreground text-sm mb-4">Cuba ubah carian atau penapis anda</p>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset Penapis
                </Button>
              </div>
            ) : (
              /* Video Grid */
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3">SEMUA VIDEO</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {filteredVideos.map((video, index) => renderVideoCard(video, index))}
                </div>
              </div>
            )}
          </>
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
              className="absolute -top-10 sm:-top-12 right-0 text-white hover:text-primary transition-colors"
            >
              <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <video 
              src={previewVideo} 
              controls 
              autoPlay
              playsInline
              className="w-full rounded-xl max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryVault;
