import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ActiveGeneration {
  id: string;
  geminigen_uuid: string;
  prompt: string;
  status: string;
  status_percentage: number;
  video_url: string | null;
}

interface SoraStudioProps {
  userProfile: { 
    username: string; 
    videos_used: number; 
    video_limit: number;
    is_approved: boolean;
    is_admin?: boolean;
  } | null;
}

const SoraStudio: React.FC<SoraStudioProps> = ({ userProfile }) => {
  // Check if feature should be locked
  const isLocked = userProfile && !userProfile.is_admin && (!userProfile.is_approved || userProfile.video_limit <= 0);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<10 | 15>(10);
  const [aspectRatio, setAspectRatio] = useState<'landscape' | 'portrait'>('landscape');
  const [isGenerating, setIsGenerating] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Active generations - persisted from database
  const [activeGenerations, setActiveGenerations] = useState<ActiveGeneration[]>([]);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);

  // UGC Prompt Generator state
  const [showPromptGenerator, setShowPromptGenerator] = useState(false);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [platform, setPlatform] = useState<'tiktok' | 'facebook'>('tiktok');
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [generatedDialog, setGeneratedDialog] = useState('');
  const [generatedSegments, setGeneratedSegments] = useState<Array<{
    time: string; 
    hook?: string;
    scene: string; 
    character?: string;
    cameraAngle: string; 
    cameraMovement?: string;
    lighting?: string;
    dialog?: string;
    visualStyle: string;
  }>>([]); 

  // Fetch active/processing videos on mount
  useEffect(() => {
    const fetchActiveGenerations = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: videos } = await supabase
        .from('video_generations')
        .select('id, geminigen_uuid, prompt, status, status_percentage, video_url')
        .eq('user_id', session.user.id)
        .eq('status', 'processing')
        .order('created_at', { ascending: false });

      if (videos && videos.length > 0) {
        const activeVids = videos.filter(v => v.geminigen_uuid) as ActiveGeneration[];
        setActiveGenerations(activeVids);
        
        // If there's a processing video, show its status
        if (activeVids.length > 0) {
          setIsGenerating(true);
          setCurrentGenerationId(activeVids[0].id);
          setGenerationProgress(activeVids[0].status_percentage || 0);
        }
      }
    };

    fetchActiveGenerations();
  }, []);

  // Poll for active generations status
  useEffect(() => {
    if (activeGenerations.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const gen of activeGenerations) {
        if (!gen.geminigen_uuid) continue;

        try {
          const response = await supabase.functions.invoke('check-video-status', {
            body: { geminigen_uuid: gen.geminigen_uuid, video_id: gen.id },
          });

          if (response.data?.success) {
            const { status, status_percentage, video_url } = response.data;

            // Update local state
            setActiveGenerations(prev => prev.map(g => 
              g.id === gen.id 
                ? { ...g, status, status_percentage: status_percentage || g.status_percentage, video_url }
                : g
            ));

            // Update UI if this is the current generation
            if (gen.id === currentGenerationId) {
              setGenerationProgress(status_percentage || 0);

              if (status === 'completed' && video_url) {
                setGeneratedVideoUrl(video_url);
                setIsGenerating(false);
                setActiveGenerations(prev => prev.filter(g => g.id !== gen.id));
                toast.success('Video berjaya dijana!');
              } else if (status === 'failed') {
                setIsGenerating(false);
                setActiveGenerations(prev => prev.filter(g => g.id !== gen.id));
                toast.error('Gagal menjana video');
              }
            } else if (status === 'completed' || status === 'failed') {
              // Remove completed/failed from active list
              setActiveGenerations(prev => prev.filter(g => g.id !== gen.id));
              if (status === 'completed') {
                toast.success(`Video "${gen.prompt.substring(0, 30)}..." siap!`);
              }
            }
          }
        } catch (error) {
          console.error('Error polling status:', error);
        }
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [activeGenerations, currentGenerationId]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const checkVideoStatus = async (geminigenUuid: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const response = await supabase.functions.invoke('check-video-status', {
        body: { geminigen_uuid: geminigenUuid },
      });

      if (response.error) {
        console.error('Status check error:', response.error);
        return false;
      }

      const { status, status_percentage, video_url, error_message } = response.data;

      setGenerationProgress(status_percentage || 0);

      if (status === 'completed' && video_url) {
        setGeneratedVideoUrl(video_url);
        setIsGenerating(false);
        toast.success('Video berjaya dijana!');
        return true;
      } else if (status === 'failed') {
        setIsGenerating(false);
        toast.error(error_message || 'Gagal menjana video');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking status:', error);
      return false;
    }
  };

  const pollVideoStatus = async (geminigenUuid: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5s interval)

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setIsGenerating(false);
        toast.error('Penjanaan video tamat masa. Sila semak History.');
        return;
      }

      const isDone = await checkVideoStatus(geminigenUuid);
      if (!isDone) {
        attempts++;
        setTimeout(poll, 5000); // Check every 5 seconds
      }
    };

    poll();
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    if (userProfile && userProfile.videos_used >= userProfile.video_limit) {
      toast.error('Had penjanaan video telah dicapai');
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setGenerationProgress(1);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sila log masuk semula');
        setIsGenerating(false);
        return;
      }

      const response = await supabase.functions.invoke('generate-video', {
        body: {
          prompt,
          duration,
          aspect_ratio: aspectRatio,
          reference_image_url: filePreview,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { success, video_id, geminigen_uuid, error } = response.data;

      if (!success) {
        throw new Error(error || 'Gagal memulakan penjanaan video');
      }

      toast.success('Penjanaan video dimulakan!');

      // Add to active generations for tracking
      if (geminigen_uuid && video_id) {
        const newGeneration: ActiveGeneration = {
          id: video_id,
          geminigen_uuid,
          prompt,
          status: 'processing',
          status_percentage: 1,
          video_url: null,
        };
        setActiveGenerations(prev => [newGeneration, ...prev]);
        setCurrentGenerationId(video_id);
      }

    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || 'Gagal menjana video');
      setIsGenerating(false);
    }
  };

  const removeFile = () => {
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = () => {
    if (generatedVideoUrl) {
      window.open(generatedVideoUrl, '_blank');
    }
  };

  const handleGenerateUgcPrompt = async () => {
    if (!productName.trim() || !productDescription.trim()) {
      toast.error('Sila isi nama produk dan keterangan');
      return;
    }

    if (!openaiApiKey.trim()) {
      toast.error('Sila masukkan OpenAI API Key');
      return;
    }

    setIsGeneratingPrompt(true);

    try {
      const response = await supabase.functions.invoke('generate-ugc-prompt', {
        body: {
          productName,
          productDescription,
          platform,
          gender,
          openaiApiKey,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { success, data, error } = response.data;

      if (!success) {
        throw new Error(error || 'Gagal menjana prompt');
      }

      setPrompt(data.videoPrompt || '');
      setGeneratedDialog(data.dialogScript || '');
      setGeneratedSegments(data.segments || []);
      setDuration(15); // UGC prompts are designed for 15s
      toast.success('Prompt UGC berjaya dijana!');

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('UGC prompt generation error:', errorMessage);
      toast.error(errorMessage || 'Gagal menjana prompt');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Locked UI component
  if (isLocked) {
    const whatsappNumber = "601158833804"; // Admin WhatsApp number
    const whatsappMessage = encodeURIComponent(
      `Hai Admin, saya ${userProfile?.username || 'user baru'} ingin mohon kelulusan akaun / tambah had video untuk akaun saya. Email: ${userProfile ? 'registered user' : 'unknown'}`
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
        <div className="mb-6 animate-fade-in">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
            SORA <span className="text-primary neon-text">2.0</span>
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm max-w-xl">
            State-of-the-art video synthesis powered by advanced AI. Transform your imagination into stunning visual narratives.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left Panel - Input */}
          <div className="glass-panel-elevated p-6 animate-fade-in" style={{ animationDelay: '100ms' }}>
            {/* Prompt Section */}
            <div className="mb-6">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                Vision Prompt
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your video scene in detail... The more specific, the better the result."
                className="min-h-[140px]"
                disabled={isGenerating}
              />
              <div className="flex justify-between mt-2">
                <span className="text-xs text-muted-foreground">{prompt.length} characters</span>
                <span className="text-xs text-muted-foreground">Recommended: 50-500 chars</span>
              </div>
            </div>

            {/* Configuration Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Duration */}
              <div>
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                  Duration
                </label>
                <div className="flex gap-2">
                  {([10, 15] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      disabled={isGenerating}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-300 border",
                        duration === d
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                  Aspect Ratio
                </label>
                <div className="flex gap-2">
                  {(['landscape', 'portrait'] as const).map((ar) => (
                    <button
                      key={ar}
                      onClick={() => setAspectRatio(ar)}
                      disabled={isGenerating}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-300 border flex items-center justify-center gap-2",
                        aspectRatio === ar
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      <div className={cn(
                        "border-2 border-current rounded-sm",
                        ar === 'landscape' ? "w-5 h-3" : "w-3 h-5"
                      )} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Reference Image */}
            <div className="mb-6">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                Reference Image (Optional - Image to Video)
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
                disabled={isGenerating}
              />
              {!filePreview ? (
                <div
                  onClick={() => !isGenerating && fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all duration-300"
                >
                  <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-muted-foreground">Click to upload reference (I2V)</span>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={filePreview} alt="Reference" className="w-full h-32 object-cover" />
                  <button
                    onClick={removeFile}
                    className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-lg text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* UGC Prompt Generator */}
            <div className="mb-6">
              <button
                onClick={() => setShowPromptGenerator(!showPromptGenerator)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 hover:border-primary/40 transition-all duration-300"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span className="text-sm font-bold text-foreground">UGC Prompt Generator</span>
                </div>
                <svg className={cn("w-4 h-4 text-muted-foreground transition-transform", showPromptGenerator && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showPromptGenerator && (
                <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border/50 space-y-4">
                  {/* OpenAI API Key */}
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                      OpenAI API Key
                    </label>
                    <Input
                      type="password"
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="text-sm"
                    />
                  </div>

                  {/* Product Name */}
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                      Nama Produk
                    </label>
                    <Input
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Contoh: Serum Vitamin C"
                      className="text-sm"
                    />
                  </div>

                  {/* Product Description */}
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                      Keterangan Produk
                    </label>
                    <Textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="Terangkan produk anda, kelebihan, bahan utama..."
                      className="min-h-[80px] text-sm"
                    />
                  </div>

                  {/* Platform & Gender */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                        Platform
                      </label>
                      <div className="flex gap-2">
                        {(['tiktok', 'facebook'] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPlatform(p)}
                            className={cn(
                              "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border",
                              platform === p
                                ? "bg-primary/20 border-primary/50 text-primary"
                                : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                            )}
                          >
                            {p === 'tiktok' ? 'TikTok' : 'Facebook'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                        Watak
                      </label>
                      <div className="flex gap-2">
                        {(['female', 'male'] as const).map((g) => (
                          <button
                            key={g}
                            onClick={() => setGender(g)}
                            className={cn(
                              "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border",
                              gender === g
                                ? "bg-primary/20 border-primary/50 text-primary"
                                : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                            )}
                          >
                            {g === 'female' ? 'Perempuan' : 'Lelaki'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Generate Prompt Button */}
                  <Button
                    onClick={handleGenerateUgcPrompt}
                    disabled={isGeneratingPrompt || !productName.trim() || !productDescription.trim() || !openaiApiKey.trim()}
                    variant="outline"
                    className="w-full"
                  >
                    {isGeneratingPrompt ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2" />
                        Menjana Prompt...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Jana Prompt UGC
                      </>
                    )}
                  </Button>

                  {/* Generated Dialog & Segments */}
                  {generatedDialog && (
                    <div className="mt-4 p-3 rounded-lg bg-background/50 border border-border/30">
                      <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-2">
                        Dialog Script (BM)
                      </label>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{generatedDialog}</p>
                    </div>
                  )}

                  {generatedSegments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-2">
                        Segment Details (Per 3 Saat)
                      </label>
                      {generatedSegments.map((seg, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-background/40 border border-border/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg">{seg.time}</span>
                            {seg.hook && <span className="text-[10px] text-accent font-semibold">{seg.hook}</span>}
                          </div>
                          
                          {seg.scene && (
                            <div className="text-[10px]">
                              <span className="text-muted-foreground font-semibold">Scene: </span>
                              <span className="text-foreground/80">{seg.scene}</span>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            {seg.cameraAngle && (
                              <div>
                                <span className="text-muted-foreground font-semibold">📷 </span>
                                <span className="text-foreground/70">{seg.cameraAngle}</span>
                              </div>
                            )}
                            {seg.cameraMovement && (
                              <div>
                                <span className="text-muted-foreground font-semibold">🎬 </span>
                                <span className="text-foreground/70">{seg.cameraMovement}</span>
                              </div>
                            )}
                            {seg.lighting && (
                              <div>
                                <span className="text-muted-foreground font-semibold">💡 </span>
                                <span className="text-foreground/70">{seg.lighting}</span>
                              </div>
                            )}
                            {seg.visualStyle && (
                              <div>
                                <span className="text-muted-foreground font-semibold">🎨 </span>
                                <span className="text-foreground/70">{seg.visualStyle}</span>
                              </div>
                            )}
                          </div>
                          
                          {seg.dialog && (
                            <div className="text-[10px] bg-secondary/30 p-2 rounded-lg border-l-2 border-primary/50">
                              <span className="text-muted-foreground font-semibold">Dialog: </span>
                              <span className="text-foreground/90 italic">"{seg.dialog}"</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              variant="neon"
              size="lg"
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <div className="flex items-center gap-1 h-3">
                    <span className="w-1 h-full bg-primary-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-full bg-primary-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-full bg-primary-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>Generating... {generationProgress}%</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generate Video</span>
                </>
              )}
            </Button>

            {/* Usage Info */}
            {userProfile && (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Videos: {userProfile.videos_used}/{userProfile.video_limit}</span>
                <span className="text-primary/60">Powered by Sora 2.0</span>
              </div>
            )}
          </div>

          {/* Right Panel - Preview */}
          <div className="glass-panel-elevated p-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
              Output Preview
            </label>
            <div className={cn(
              "rounded-xl bg-background/50 border border-border/50 overflow-hidden flex items-center justify-center",
              aspectRatio === 'landscape' ? "aspect-video" : "aspect-[9/16] max-h-[400px]"
            )}>
              {isGenerating ? (
                <div className="text-center p-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <p className="text-primary font-medium animate-pulse mb-2">Processing your vision...</p>
                  <p className="text-xs text-muted-foreground italic">Progress: {generationProgress}%</p>
                  <p className="text-xs text-muted-foreground mt-1">This usually takes 2-4 minutes</p>
                </div>
              ) : generatedVideoUrl ? (
                <div className="relative w-full h-full">
                  <video 
                    src={generatedVideoUrl} 
                    controls 
                    className="w-full h-full object-contain"
                    autoPlay
                  />
                  <button
                    onClick={handleDownload}
                    className="absolute top-3 right-3 p-2 bg-primary/90 hover:bg-primary rounded-lg text-primary-foreground transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="text-center p-12 opacity-40">
                  <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">Video output will appear here</p>
                </div>
              )}
            </div>

            {/* Quick Tips */}
            <div className="mt-6 p-4 rounded-xl bg-secondary/30 border border-border/30">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Pro Tips</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Be descriptive about camera movement and lighting</li>
                <li>• Specify the mood and atmosphere you want</li>
                <li>• Include details about subjects and environment</li>
                <li>• Upload reference image for Image-to-Video (I2V)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoraStudio;
