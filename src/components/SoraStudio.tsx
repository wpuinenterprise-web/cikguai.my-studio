import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SoraStudioProps {
  userProfile: { username: string; videos_used: number; video_limit: number } | null;
}

const SoraStudio: React.FC<SoraStudioProps> = ({ userProfile }) => {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<10 | 15>(10);
  const [aspectRatio, setAspectRatio] = useState<'landscape' | 'portrait'>('landscape');
  const [isGenerating, setIsGenerating] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const { success, geminigen_uuid, error } = response.data;

      if (!success) {
        throw new Error(error || 'Gagal memulakan penjanaan video');
      }

      toast.success('Penjanaan video dimulakan!');

      // Start polling for status
      if (geminigen_uuid) {
        pollVideoStatus(geminigen_uuid);
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

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
            SORA <span className="text-primary neon-text">2.0</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl">
            State-of-the-art video synthesis powered by advanced AI. Transform your imagination into stunning visual narratives.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
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
