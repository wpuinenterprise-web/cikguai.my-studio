import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GrokStudioProps {
    userProfile: {
        username: string;
        videos_used?: number;
        video_limit?: number;
        is_approved: boolean;
        is_admin?: boolean;
    } | null;
    onProfileRefresh?: () => Promise<void>;
}

interface ActiveGeneration {
    id: string;
    geminigen_uuid: string;
    prompt: string;
    status: string;
    status_percentage: number;
    video_url: string | null;
}

const GrokStudio: React.FC<GrokStudioProps> = ({ userProfile, onProfileRefresh }) => {
    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState<10 | 15>(10);
    const [aspectRatio, setAspectRatio] = useState<'landscape' | 'portrait'>('landscape');
    const [isGenerating, setIsGenerating] = useState(false);
    const lastGenerateTimeRef = useRef<number>(0);

    // Active generations
    const [activeGenerations, setActiveGenerations] = useState<ActiveGeneration[]>([]);
    const [completedGenerations, setCompletedGenerations] = useState<ActiveGeneration[]>([]);
    const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

    // Check limits
    const videosUsed = userProfile?.videos_used || 0;
    const videoLimit = userProfile?.video_limit || 0;
    const hasReachedLimit = userProfile && !userProfile.is_admin && videosUsed >= videoLimit;
    const isLocked = userProfile && !userProfile.is_admin && !userProfile.is_approved;

    // Fetch active generations on mount
    useEffect(() => {
        const fetchActiveGenerations = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data: videos } = await supabase
                .from('video_generations')
                .select('id, geminigen_uuid, prompt, status, status_percentage, video_url')
                .eq('user_id', session.user.id)
                .eq('model', 'grok')
                .eq('status', 'processing')
                .order('created_at', { ascending: false })
                .limit(4);

            if (videos && videos.length > 0) {
                const activeVids = videos.filter(v => v.geminigen_uuid) as ActiveGeneration[];
                setActiveGenerations(activeVids);
                if (activeVids.length > 0) {
                    setSelectedGenerationId(activeVids[0].id);
                }
            }
        };

        fetchActiveGenerations();
    }, []);

    // Poll for status updates
    useEffect(() => {
        if (activeGenerations.length === 0) return;

        const pollInterval = setInterval(async () => {
            const updatedGenerations = [...activeGenerations];
            let hasChanges = false;
            const newlyCompleted: ActiveGeneration[] = [];

            for (let i = 0; i < updatedGenerations.length; i++) {
                const gen = updatedGenerations[i];
                if (!gen.geminigen_uuid) continue;

                try {
                    const response = await supabase.functions.invoke('check-video-status', {
                        body: { geminigen_uuid: gen.geminigen_uuid, video_id: gen.id },
                    });

                    if (response.data?.success) {
                        const { status, status_percentage, video_url } = response.data;

                        if (status !== gen.status || status_percentage !== gen.status_percentage || video_url !== gen.video_url) {
                            hasChanges = true;
                            updatedGenerations[i] = {
                                ...gen,
                                status,
                                status_percentage: status_percentage || gen.status_percentage,
                                video_url: video_url || gen.video_url,
                            };

                            if (status === 'completed' && video_url) {
                                toast.success(`Video Grok siap!`);
                                newlyCompleted.push(updatedGenerations[i]);
                            } else if (status === 'failed') {
                                toast.error(`Video Grok gagal`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error polling status:', error);
                }
            }

            if (hasChanges) {
                setActiveGenerations(updatedGenerations.filter(g => g.status === 'processing'));
                if (newlyCompleted.length > 0) {
                    setCompletedGenerations(prev => [...newlyCompleted, ...prev].slice(0, 10));
                    if (newlyCompleted[0]) {
                        setSelectedGenerationId(newlyCompleted[0].id);
                    }
                }
            }
        }, 3000);

        return () => clearInterval(pollInterval);
    }, [activeGenerations]);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            toast.error('Sila masukkan prompt');
            return;
        }

        if (hasReachedLimit) {
            toast.error('Had penjanaan video telah dicapai');
            return;
        }

        // Debounce
        const now = Date.now();
        if (now - lastGenerateTimeRef.current < 2000) return;
        lastGenerateTimeRef.current = now;

        setIsGenerating(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error('Sila log masuk semula');
                return;
            }

            const response = await supabase.functions.invoke('generate-video', {
                body: {
                    prompt,
                    duration,
                    aspect_ratio: aspectRatio,
                    model: 'grok',
                },
            });

            if (response.error) {
                throw new Error(response.error.message);
            }

            const { success, video_id, geminigen_uuid, error } = response.data;

            if (!success) {
                throw new Error(error || 'Gagal memulakan penjanaan video');
            }

            toast.success('Penjanaan video Grok dimulakan!');

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
                setSelectedGenerationId(video_id);
            }

            if (onProfileRefresh) {
                await onProfileRefresh();
            }

            setPrompt('');

        } catch (error: any) {
            console.error('Grok generation error:', error);
            toast.error(error.message || 'Gagal menjana video');
        } finally {
            setIsGenerating(false);
        }
    };

    // Get selected generation
    const selectedGeneration = activeGenerations.find(g => g.id === selectedGenerationId)
        || completedGenerations.find(g => g.id === selectedGenerationId);
    const allGenerations = [...activeGenerations, ...completedGenerations];

    // Locked UI
    if (isLocked) {
        return (
            <div className="min-h-screen pt-16 pb-24 px-3 sm:px-6 lg:px-8 flex items-center justify-center">
                <div className="glass-panel-elevated p-8 sm:p-12 text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
                        <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-foreground mb-3">Akaun Belum Diluluskan</h2>
                    <p className="text-muted-foreground text-sm">Sila hubungi admin untuk kelulusan akaun.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-16 pb-24 px-3 sm:px-6 lg:px-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6 animate-fade-in">
                    <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
                        GROK <span className="text-primary neon-text">VIDEO</span> ✨
                    </h2>
                    <p className="text-muted-foreground text-xs sm:text-sm max-w-xl">
                        Grok Imagine video generation - Create cinematic videos with coherent motion and synchronized audio.
                    </p>
                </div>

                {/* Limit Warning */}
                {hasReachedLimit && (
                    <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-amber-500">Had Video Telah Dicapai</h3>
                                <p className="text-xs text-muted-foreground">
                                    Anda telah menggunakan {videosUsed}/{videoLimit} video.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Generations Status */}
                {allGenerations.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-border/50">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Video Grok ({activeGenerations.length} aktif)
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {allGenerations.map((gen) => (
                                <button
                                    key={gen.id}
                                    onClick={() => setSelectedGenerationId(gen.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                                        selectedGenerationId === gen.id
                                            ? "bg-primary/20 border border-primary/50 text-primary"
                                            : gen.status === 'completed'
                                                ? "bg-green-500/10 border border-green-500/30 text-green-500"
                                                : "bg-secondary/50 border border-border text-muted-foreground"
                                    )}
                                >
                                    {gen.status === 'processing' ? (
                                        <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    ) : gen.status === 'completed' ? (
                                        <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : null}
                                    <span className="max-w-[100px] truncate">{gen.prompt.substring(0, 15)}...</span>
                                    {gen.status === 'processing' && (
                                        <span className="text-[10px] text-muted-foreground">{gen.status_percentage}%</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
                    {/* Left Panel - Input */}
                    <div className="glass-panel-elevated p-6 animate-fade-in">
                        {/* Prompt Section */}
                        <div className="mb-6">
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                                Video Prompt
                            </label>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe your video scene... Grok excels at cinematic and creative content."
                                className="min-h-[120px]"
                                disabled={isGenerating || hasReachedLimit}
                            />
                        </div>

                        {/* Duration & Aspect Ratio */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                                    Duration
                                </label>
                                <div className="flex gap-2">
                                    {([10, 15] as const).map((d) => (
                                        <button
                                            key={d}
                                            onClick={() => setDuration(d)}
                                            disabled={isGenerating || hasReachedLimit}
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

                            <div>
                                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                                    Aspect Ratio
                                </label>
                                <div className="flex gap-2">
                                    {(['landscape', 'portrait'] as const).map((ar) => (
                                        <button
                                            key={ar}
                                            onClick={() => setAspectRatio(ar)}
                                            disabled={isGenerating || hasReachedLimit}
                                            className={cn(
                                                "flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-300 border flex items-center justify-center",
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

                        {/* Model Info */}
                        <div className="mb-6 p-4 rounded-xl bg-secondary/30 border border-border/50">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <span className="text-lg">✨</span>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-foreground">Grok Imagine</h4>
                                    <p className="text-[10px] text-muted-foreground">by xAI via GeminiGen</p>
                                </div>
                            </div>
                            <ul className="text-[10px] text-muted-foreground space-y-1">
                                <li>✓ Coherent motion</li>
                                <li>✓ Synchronized audio</li>
                                <li>✓ Creative & cinematic style</li>
                            </ul>
                        </div>

                        {/* Generate Button */}
                        <Button
                            onClick={handleGenerate}
                            disabled={!prompt.trim() || isGenerating || hasReachedLimit}
                            className="w-full py-6 text-sm font-black uppercase tracking-wider"
                        >
                            {isGenerating ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Menjana...
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    Jana Video Grok
                                </div>
                            )}
                        </Button>
                    </div>

                    {/* Right Panel - Preview */}
                    <div className="glass-panel-elevated p-6 animate-fade-in" style={{ animationDelay: '100ms' }}>
                        {selectedGeneration?.status === 'completed' && selectedGeneration.video_url ? (
                            <div className="aspect-video rounded-xl overflow-hidden bg-black">
                                <video
                                    src={selectedGeneration.video_url}
                                    controls
                                    autoPlay
                                    className="w-full h-full"
                                />
                            </div>
                        ) : selectedGeneration?.status === 'processing' ? (
                            <div className="aspect-video rounded-xl bg-secondary/30 border-2 border-dashed border-border flex flex-col items-center justify-center">
                                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                                <p className="text-sm font-bold text-foreground mb-1">Menjana Video...</p>
                                <p className="text-xs text-muted-foreground">{selectedGeneration.status_percentage}% siap</p>
                            </div>
                        ) : (
                            <div className="aspect-video rounded-xl bg-secondary/30 border-2 border-dashed border-border flex items-center justify-center">
                                <div className="text-center">
                                    <svg className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-xs text-muted-foreground">Tiada video dipilih</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GrokStudio;
