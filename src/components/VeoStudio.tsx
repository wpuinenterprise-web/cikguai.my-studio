import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VeoStudioProps {
    userProfile: {
        username: string;
        videos_used?: number;
        video_limit?: number;
        is_approved: boolean;
        is_admin?: boolean;
        // Per-model limits
        veo3_limit?: number;
        veo3_used?: number;
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

type PromptMode = 'basic' | 'advanced';

const VeoStudio: React.FC<VeoStudioProps> = ({ userProfile, onProfileRefresh }) => {
    // Use per-model limit for Veo 3
    const modelLimit = userProfile?.veo3_limit ?? 0;
    const modelUsed = userProfile?.veo3_used ?? 0;

    const [prompt, setPrompt] = useState('');
    const [promptMode, setPromptMode] = useState<PromptMode>('basic');
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
    const [isGenerating, setIsGenerating] = useState(false);
    const lastGenerateTimeRef = useRef<number>(0);

    // Image references
    const [firstFrame, setFirstFrame] = useState<string | null>(null);
    const [lastFrame, setLastFrame] = useState<string | null>(null);
    const [isUploadingFirst, setIsUploadingFirst] = useState(false);
    const [isUploadingLast, setIsUploadingLast] = useState(false);
    const firstFrameRef = useRef<HTMLInputElement>(null);
    const lastFrameRef = useRef<HTMLInputElement>(null);

    // Active generations
    const [activeGenerations, setActiveGenerations] = useState<ActiveGeneration[]>([]);
    const [completedGenerations, setCompletedGenerations] = useState<ActiveGeneration[]>([]);
    const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);

    // Check limits - use per-model
    const hasReachedLimit = userProfile && !userProfile.is_admin && modelUsed >= modelLimit;
    const isLocked = userProfile && !userProfile.is_admin && (!userProfile.is_approved || modelLimit <= 0);

    // Fetch active generations on mount
    useEffect(() => {
        const fetchActiveGenerations = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data: videos } = await supabase
                .from('video_generations')
                .select('id, geminigen_uuid, prompt, status, status_percentage, video_url')
                .eq('user_id', session.user.id)
                .eq('model', 'veo-3.1-fast')
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
                                toast.success(`Video Veo 3 siap!`);
                                newlyCompleted.push(updatedGenerations[i]);
                            } else if (status === 'failed') {
                                toast.error(`Video Veo 3 gagal`);
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

    // Handle image upload
    const handleImageUpload = async (file: File, type: 'first' | 'last') => {
        if (type === 'first') setIsUploadingFirst(true);
        else setIsUploadingLast(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const fileExt = file.name.split('.').pop();
            const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;

            const { error: uploadError, data } = await supabase.storage
                .from('reference-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('reference-images')
                .getPublicUrl(fileName);

            if (type === 'first') setFirstFrame(publicUrl);
            else setLastFrame(publicUrl);

            toast.success(`${type === 'first' ? 'First' : 'Last'} frame uploaded!`);
        } catch (error: any) {
            toast.error(error.message || 'Upload failed');
        } finally {
            if (type === 'first') setIsUploadingFirst(false);
            else setIsUploadingLast(false);
        }
    };

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
                    duration: 10,
                    aspect_ratio: aspectRatio === '16:9' ? 'landscape' : 'portrait',
                    model: 'veo-3.1-fast',
                    reference_image_url: firstFrame,
                },
            });

            if (response.error) {
                throw new Error(response.error.message);
            }

            const { success, video_id, geminigen_uuid, error } = response.data;

            if (!success) {
                throw new Error(error || 'Gagal memulakan penjanaan video');
            }

            toast.success('Penjanaan video Veo 3 dimulakan!');

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
            console.error('Veo generation error:', error);
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
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6 animate-fade-in">
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground">
                            VEO <span className="text-primary neon-text">3</span> 🎬
                        </h2>
                        {/* Limit Badge */}
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${modelUsed >= modelLimit
                                ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                                : modelUsed >= modelLimit * 0.8
                                    ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                    : 'bg-primary/20 text-primary border border-primary/30'
                            }`}>
                            Had: {modelUsed}/{modelLimit}
                        </div>
                    </div>
                    <p className="text-muted-foreground text-xs sm:text-sm max-w-xl">
                        Google DeepMind Veo 3.1 Fast - Ultra high quality video generation with superior motion.
                    </p>
                </div>

                {/* Limit Warning */}
                {hasReachedLimit && (
                    <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-amber-500">Had Veo 3 Telah Dicapai</h3>
                                <p className="text-xs text-muted-foreground">
                                    Anda telah menggunakan {modelUsed}/{modelLimit} video Veo 3. Hubungi admin untuk tambahan.
                                </p>
                            </div>
                            <a
                                href={`https://wa.me/601158833804?text=${encodeURIComponent(`Hai Admin, saya ${userProfile?.username || 'user'} ingin mohon tambahan had Veo 3. Had saya: ${modelUsed}/${modelLimit}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-all flex-shrink-0 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                                Hubungi Admin
                            </a>
                        </div>
                    </div>
                )}

                {/* Active Generations Status */}
                {allGenerations.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-border/50">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Video Veo 3 ({activeGenerations.length} aktif)
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
                    <div className="glass-panel-elevated p-6 animate-fade-in space-y-6">
                        {/* Model Display */}
                        <div>
                            <label className="block text-xs font-bold text-foreground mb-2">Model</label>
                            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary/50 border border-border">
                                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="text-sm font-medium text-foreground">Veo 3.1 Fast</span>
                            </div>
                        </div>

                        {/* Image References */}
                        <div>
                            <label className="block text-xs font-bold text-foreground mb-3">Image References (Optional)</label>
                            <div className="grid grid-cols-2 gap-4">
                                {/* First Frame */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-muted-foreground">First Frame</span>
                                        <button
                                            onClick={() => firstFrameRef.current?.click()}
                                            disabled={isUploadingFirst}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-border hover:border-primary/50 transition-colors"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            Select
                                        </button>
                                        <input
                                            ref={firstFrameRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'first')}
                                        />
                                    </div>
                                    <div className={cn(
                                        "aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden",
                                        firstFrame ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/30"
                                    )}>
                                        {isUploadingFirst ? (
                                            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        ) : firstFrame ? (
                                            <img src={firstFrame} alt="First Frame" className="w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <svg className="w-8 h-8 text-muted-foreground/50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs text-primary/70">First Frame</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Arrow */}
                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden">
                                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </div>

                                {/* Last Frame */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-muted-foreground">Last Frame</span>
                                        <button
                                            onClick={() => lastFrameRef.current?.click()}
                                            disabled={isUploadingLast}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-border hover:border-primary/50 transition-colors"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            Select
                                        </button>
                                        <input
                                            ref={lastFrameRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'last')}
                                        />
                                    </div>
                                    <div className={cn(
                                        "aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden",
                                        lastFrame ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/30"
                                    )}>
                                        {isUploadingLast ? (
                                            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        ) : lastFrame ? (
                                            <img src={lastFrame} alt="Last Frame" className="w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <svg className="w-8 h-8 text-muted-foreground/50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs text-primary/70">Last Frame</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Prompt Section */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-xs font-bold text-foreground">Prompt</label>
                                <div className="flex rounded-lg border border-border overflow-hidden">
                                    <button
                                        onClick={() => setPromptMode('basic')}
                                        className={cn(
                                            "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                                            promptMode === 'basic'
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-transparent text-muted-foreground hover:bg-secondary/50"
                                        )}
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                        </svg>
                                        Basic
                                    </button>
                                    <button
                                        onClick={() => setPromptMode('advanced')}
                                        className={cn(
                                            "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                                            promptMode === 'advanced'
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-transparent text-muted-foreground hover:bg-secondary/50"
                                        )}
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                        </svg>
                                        Advanced
                                    </button>
                                </div>
                            </div>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe the video you want to generate..."
                                className="min-h-[100px] resize-none"
                                disabled={isGenerating || hasReachedLimit}
                            />
                        </div>

                        {/* Aspect Ratio & Resolution */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Aspect Ratio */}
                            <div>
                                <label className="block text-xs font-bold text-foreground mb-3">Aspect Ratio</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAspectRatio('16:9')}
                                        disabled={isGenerating}
                                        className={cn(
                                            "flex-1 py-4 rounded-xl transition-all duration-300 border flex flex-col items-center gap-2",
                                            aspectRatio === '16:9'
                                                ? "bg-primary/10 border-primary/50"
                                                : "bg-secondary/30 border-border hover:border-primary/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-12 h-7 rounded-md flex items-center justify-center",
                                            aspectRatio === '16:9' ? "bg-primary/20" : "bg-secondary"
                                        )}>
                                            <svg className={cn("w-5 h-5", aspectRatio === '16:9' ? "text-primary" : "text-muted-foreground")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className={cn("text-xs font-medium", aspectRatio === '16:9' ? "text-foreground" : "text-muted-foreground")}>16:9</span>
                                    </button>
                                    <button
                                        onClick={() => setAspectRatio('9:16')}
                                        disabled={isGenerating}
                                        className={cn(
                                            "flex-1 py-4 rounded-xl transition-all duration-300 border flex flex-col items-center gap-2",
                                            aspectRatio === '9:16'
                                                ? "bg-primary/10 border-primary/50"
                                                : "bg-secondary/30 border-border hover:border-primary/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-7 h-10 rounded-md flex items-center justify-center",
                                            aspectRatio === '9:16' ? "bg-primary/20" : "bg-secondary"
                                        )}>
                                            <svg className={cn("w-4 h-4", aspectRatio === '9:16' ? "text-primary" : "text-muted-foreground")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className={cn("text-xs font-medium", aspectRatio === '9:16' ? "text-foreground" : "text-muted-foreground")}>9:16</span>
                                    </button>
                                </div>
                            </div>

                            {/* Resolution */}
                            <div>
                                <label className="block text-xs font-bold text-foreground mb-3">Resolution</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setResolution('720p')}
                                        disabled={isGenerating}
                                        className={cn(
                                            "flex-1 py-3 rounded-xl transition-all duration-300 border flex items-center justify-center gap-2",
                                            resolution === '720p'
                                                ? "bg-primary/10 border-primary/50"
                                                : "bg-secondary/30 border-border hover:border-primary/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                            resolution === '720p' ? "border-primary bg-primary" : "border-muted-foreground"
                                        )}>
                                            {resolution === '720p' && (
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <div className={cn("text-sm font-bold", resolution === '720p' ? "text-foreground" : "text-muted-foreground")}>720p</div>
                                            <div className="text-[10px] text-muted-foreground">HD Quality</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setResolution('1080p')}
                                        disabled={isGenerating}
                                        className={cn(
                                            "flex-1 py-3 rounded-xl transition-all duration-300 border flex items-center justify-center gap-2",
                                            resolution === '1080p'
                                                ? "bg-primary/10 border-primary/50"
                                                : "bg-secondary/30 border-border hover:border-primary/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                            resolution === '1080p' ? "border-primary bg-primary" : "border-muted-foreground"
                                        )}>
                                            {resolution === '1080p' && (
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <div className={cn("text-sm font-bold", resolution === '1080p' ? "text-foreground" : "text-muted-foreground")}>1080p</div>
                                            <div className="text-[10px] text-muted-foreground">Full HD</div>
                                        </div>
                                    </button>
                                </div>
                            </div>
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
                                    Jana Video Veo 3
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

                        {/* Info Card */}
                        <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border/50">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <span className="text-lg">🎬</span>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-foreground">Veo 3.1 Fast</h4>
                                    <p className="text-[10px] text-muted-foreground">by Google DeepMind</p>
                                </div>
                            </div>
                            <ul className="text-[10px] text-muted-foreground space-y-1">
                                <li>✓ Ultra high quality</li>
                                <li>✓ Superior motion</li>
                                <li>✓ First/Last frame support</li>
                                <li>✓ Up to 1080p resolution</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VeoStudio;
