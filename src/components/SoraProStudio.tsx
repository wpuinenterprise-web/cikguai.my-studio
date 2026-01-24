import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SoraProStudioProps {
    userProfile: {
        username: string;
        videos_used?: number;
        video_limit?: number;
        is_approved: boolean;
        is_admin?: boolean;
    } | null;
    onProfileRefresh?: () => Promise<void>;
}

interface StoryBlock {
    id: string;
    prompt: string;
    duration: number;
}

type DurationPreset = 'equal' | 'ascending' | 'descending' | 'focus-middle' | 'first-heavy' | 'last-heavy';
type PromptMode = 'basic' | 'advanced' | 'story';

const SoraProStudio: React.FC<SoraProStudioProps> = ({ userProfile, onProfileRefresh }) => {
    const [totalDuration, setTotalDuration] = useState<15 | 25>(25);
    const [blocks, setBlocks] = useState<StoryBlock[]>([
        { id: '1', prompt: '', duration: 13 },
        { id: '2', prompt: '', duration: 12 },
    ]);
    const [activePreset, setActivePreset] = useState<DurationPreset>('equal');
    const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
    const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
    const [isGenerating, setIsGenerating] = useState(false);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sliderRef = useRef<HTMLDivElement>(null);
    const [draggingHandle, setDraggingHandle] = useState<number | null>(null);
    const [promptMode, setPromptMode] = useState<PromptMode>('basic');
    const [basicPrompt, setBasicPrompt] = useState('');

    // Progress tracking state
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Handler for changing total duration - directly updates blocks
    const handleDurationChange = (newDuration: 15 | 25) => {
        if (newDuration === totalDuration) return;

        const currentTotal = blocks.reduce((sum, b) => sum + b.duration, 0);
        const ratio = newDuration / currentTotal;

        // Calculate new block durations
        let newBlocks = blocks.map(b => ({
            ...b,
            duration: Math.max(1, Math.round(b.duration * ratio))
        }));

        // Ensure exact match to newDuration
        let newTotal = newBlocks.reduce((sum, b) => sum + b.duration, 0);
        let diff = newDuration - newTotal;

        // Distribute the difference
        let idx = 0;
        while (diff !== 0 && idx < 100) {
            const blockIdx = idx % newBlocks.length;
            if (diff > 0) {
                newBlocks[blockIdx].duration += 1;
                diff -= 1;
            } else if (diff < 0 && newBlocks[blockIdx].duration > 1) {
                newBlocks[blockIdx].duration -= 1;
                diff += 1;
            }
            idx++;
        }

        // Update both states together
        setTotalDuration(newDuration);
        setBlocks(newBlocks);
    };

    // Check limits
    const videosUsed = userProfile?.videos_used || 0;
    const videoLimit = userProfile?.video_limit || 0;
    const hasReachedLimit = userProfile && !userProfile.is_admin && videosUsed >= videoLimit;
    const isLocked = userProfile && !userProfile.is_admin && !userProfile.is_approved;

    // Calculate total block duration
    const totalBlockDuration = blocks.reduce((sum, b) => sum + b.duration, 0);

    // Helper function to normalize durations to exact total
    const normalizeDurations = (durations: number[], targetTotal: number): number[] => {
        // Ensure minimum of 1 per block
        let result = durations.map(d => Math.max(1, Math.round(d)));
        let sum = result.reduce((a, b) => a + b, 0);
        let diff = targetTotal - sum;

        // Distribute difference evenly
        let idx = 0;
        while (diff !== 0 && idx < 100) {
            const blockIdx = idx % result.length;
            if (diff > 0) {
                result[blockIdx] += 1;
                diff -= 1;
            } else if (diff < 0 && result[blockIdx] > 1) {
                result[blockIdx] -= 1;
                diff += 1;
            }
            idx++;
        }
        return result;
    };

    // Poll video generation status
    const pollVideoStatus = async (videoId: string, taskId: string) => {
        try {
            const response = await supabase.functions.invoke('check-video-status-poyo', {
                body: { poyo_task_id: taskId, video_id: videoId },
            });

            if (response.error) {
                console.error('Status check error:', response.error);
                return;
            }

            const data = response.data;
            console.log('Status update:', data);

            setGenerationProgress(data.status_percentage || 0);

            if (data.status === 'completed' && data.video_url) {
                setGeneratedVideoUrl(data.video_url);
                setIsGenerating(false);
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
                toast.success('Video berjaya dijana!');
                if (onProfileRefresh) await onProfileRefresh();
            } else if (data.status === 'failed') {
                setIsGenerating(false);
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
                toast.error('Video gagal dijana: ' + (data.error_message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    };

    // Cleanup polling on unmount
    React.useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    // Apply distribution preset
    const applyPreset = useCallback((preset: DurationPreset) => {
        setActivePreset(preset);
        const count = blocks.length;
        if (count === 0) return;

        let rawDurations: number[] = [];

        switch (preset) {
            case 'equal':
                rawDurations = Array(count).fill(totalDuration / count);
                break;
            case 'ascending':
                // First block smallest, last block largest
                const ascTotal = (count * (count + 1)) / 2;
                rawDurations = blocks.map((_, i) => (totalDuration * (i + 1)) / ascTotal);
                break;
            case 'descending':
                // First block largest, last block smallest
                const descTotal = (count * (count + 1)) / 2;
                rawDurations = blocks.map((_, i) => (totalDuration * (count - i)) / descTotal);
                break;
            case 'focus-middle':
                // Middle blocks get more time
                const mid = (count - 1) / 2;
                const weights = blocks.map((_, i) => 1 + Math.max(0, 2 - Math.abs(i - mid)));
                const weightSum = weights.reduce((a, b) => a + b, 0);
                rawDurations = weights.map(w => (totalDuration * w) / weightSum);
                break;
            case 'first-heavy':
                // First block gets 50%, rest split equally
                rawDurations = blocks.map((_, i) =>
                    i === 0 ? totalDuration * 0.5 : (totalDuration * 0.5) / Math.max(1, count - 1)
                );
                break;
            case 'last-heavy':
                // Last block gets 50%, rest split equally
                rawDurations = blocks.map((_, i) =>
                    i === count - 1 ? totalDuration * 0.5 : (totalDuration * 0.5) / Math.max(1, count - 1)
                );
                break;
            default:
                rawDurations = Array(count).fill(totalDuration / count);
        }

        // Normalize to exact total
        const normalizedDurations = normalizeDurations(rawDurations, totalDuration);
        setBlocks(blocks.map((b, i) => ({ ...b, duration: normalizedDurations[i] })));
    }, [blocks.length, totalDuration]);

    // Add new block
    const addBlock = () => {
        if (blocks.length >= totalDuration) {
            toast.error(`Maksimum ${totalDuration} block sahaja (1s per block)`);
            return;
        }
        const newId = Date.now().toString();
        const newCount = blocks.length + 1;

        // Redistribute all blocks equally including new one
        const rawDurations = Array(newCount).fill(totalDuration / newCount);
        const normalizedDurations = normalizeDurations(rawDurations, totalDuration);

        const updatedBlocks = blocks.map((b, i) => ({
            ...b,
            duration: normalizedDurations[i]
        }));

        setBlocks([...updatedBlocks, { id: newId, prompt: '', duration: normalizedDurations[newCount - 1] }]);
    };

    // Remove block
    const removeBlock = (id: string) => {
        if (blocks.length <= 1) {
            toast.error('Minimum 1 block diperlukan');
            return;
        }
        setBlocks(blocks.filter(b => b.id !== id));
    };

    // Update block prompt
    const updateBlockPrompt = (id: string, prompt: string) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, prompt } : b));
    };

    // Update block duration via slider
    const updateBlockDuration = (index: number, newDuration: number) => {
        const minDuration = 5;
        const clampedDuration = Math.max(minDuration, Math.min(totalDuration - (blocks.length - 1) * minDuration, newDuration));

        const diff = clampedDuration - blocks[index].duration;
        if (diff === 0) return;

        // Redistribute the difference to other blocks
        const newBlocks = [...blocks];
        newBlocks[index].duration = clampedDuration;

        // Take from/give to adjacent blocks
        const adjacentIndex = index < blocks.length - 1 ? index + 1 : index - 1;
        if (adjacentIndex >= 0 && adjacentIndex < blocks.length) {
            newBlocks[adjacentIndex].duration = Math.max(minDuration, newBlocks[adjacentIndex].duration - diff);
        }

        setBlocks(newBlocks);
        setActivePreset('equal'); // Clear preset when manually adjusting
    };

    // Handle image upload
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                setReferenceImage(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            toast.error('Gagal memuat imej');
        }
    };

    // Handle drag start
    const handleDragStart = (handleIndex: number) => (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        setDraggingHandle(handleIndex);
    };

    // Handle drag move
    const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (draggingHandle === null || !sliderRef.current) return;

        const rect = sliderRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const newCumulative = Math.round((percent / 100) * totalDuration);

        const prevCumulative = blocks.slice(0, draggingHandle).reduce((sum, b) => sum + b.duration, 0);
        const minCumulative = prevCumulative + 1;
        const maxCumulative = totalDuration - (blocks.length - draggingHandle - 1);

        const clampedCumulative = Math.max(minCumulative, Math.min(maxCumulative, newCumulative));
        const newDuration = clampedCumulative - prevCumulative;

        const newBlocks = [...blocks];
        const diff = newDuration - newBlocks[draggingHandle].duration;
        newBlocks[draggingHandle].duration = newDuration;

        if (draggingHandle + 1 < blocks.length) {
            newBlocks[draggingHandle + 1].duration = Math.max(1, newBlocks[draggingHandle + 1].duration - diff);
        }

        setBlocks(newBlocks);
        setActivePreset('equal');
    }, [draggingHandle, blocks, totalDuration]);

    // Handle drag end
    const handleDragEnd = useCallback(() => {
        setDraggingHandle(null);
    }, []);

    // Add/remove global mouse listeners when dragging
    React.useEffect(() => {
        if (draggingHandle !== null) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            window.addEventListener('touchmove', handleDragMove);
            window.addEventListener('touchend', handleDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [draggingHandle, handleDragMove, handleDragEnd]);

    // Generate video
    const handleGenerate = async () => {
        // Validate based on mode
        if (promptMode === 'story') {
            const emptyBlocks = blocks.filter(b => !b.prompt.trim());
            if (emptyBlocks.length > 0) {
                toast.error('Sila isi semua prompt block');
                return;
            }
        } else {
            // Basic or Advanced mode
            if (!basicPrompt.trim()) {
                toast.error('Sila masukkan prompt');
                return;
            }
        }

        if (hasReachedLimit) {
            toast.error('Had video telah dicapai');
            return;
        }

        // Reset progress state
        setGenerationProgress(0);
        setGeneratedVideoUrl(null);
        setCurrentVideoId(null);
        setCurrentTaskId(null);
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }

        setIsGenerating(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error('Sila log masuk semula');
                return;
            }

            if (promptMode === 'story') {
                // Story mode - combine all blocks into ONE video with timed segments
                // Build combined prompt with timing for each segment
                let combinedPrompt = '';
                let currentTime = 0;

                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i];
                    const startTime = currentTime;
                    const endTime = currentTime + block.duration;

                    // Add timing segment to prompt
                    combinedPrompt += `[${startTime}s - ${endTime}s]: ${block.prompt}\n`;
                    currentTime = endTime;
                }

                // Clean up prompt
                combinedPrompt = combinedPrompt.trim();

                console.log('Combined storyboard prompt:', combinedPrompt);
                toast.info('Menjana video storyboard...');

                const response = await supabase.functions.invoke('generate-video-poyo', {
                    body: {
                        prompt: combinedPrompt,
                        duration: totalDuration,
                        aspect_ratio: '16:9',
                        model: 'sora-2-pro',
                    },
                });

                if (response.error) {
                    throw new Error(response.error.message);
                }

                if (!response.data?.success) {
                    throw new Error(response.data?.error || 'Gagal menjana video');
                }

                // Start polling for story mode
                const videoId = response.data.video_id;
                const taskId = response.data.poyo_task_id;
                setCurrentVideoId(videoId);
                setCurrentTaskId(taskId);
                setGenerationProgress(5);

                // Start polling every 3 seconds
                pollingRef.current = setInterval(() => {
                    pollVideoStatus(videoId, taskId);
                }, 3000);

                toast.success('Video storyboard sedang dijana...');
            } else {
                // Basic mode - single video
                toast.info('Menjana video...');

                const response = await supabase.functions.invoke('generate-video-poyo', {
                    body: {
                        prompt: basicPrompt,
                        duration: totalDuration,
                        aspect_ratio: '16:9',
                        model: 'sora-2-pro',
                    },
                });

                if (response.error) {
                    throw new Error(response.error.message);
                }

                if (!response.data?.success) {
                    throw new Error(response.data?.error || 'Gagal menjana video');
                }

                // Start polling for basic mode
                const videoId = response.data.video_id;
                const taskId = response.data.poyo_task_id;
                setCurrentVideoId(videoId);
                setCurrentTaskId(taskId);
                setGenerationProgress(5);

                // Start polling every 3 seconds
                pollingRef.current = setInterval(() => {
                    pollVideoStatus(videoId, taskId);
                }, 3000);

                toast.success('Video sedang dijana...');
            }

        } catch (error: any) {
            console.error('Video generation error:', error);
            toast.error(error.message || 'Gagal menjana video');
            setIsGenerating(false);
        }
        // Note: setIsGenerating(false) is called by pollVideoStatus when complete/failed
    };

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

    const presets: { id: DurationPreset; label: string; icon: string }[] = [
        { id: 'equal', label: 'Equal', icon: '↔' },
        { id: 'ascending', label: 'Ascending', icon: '↗' },
        { id: 'descending', label: 'Descending', icon: '↘' },
        { id: 'focus-middle', label: 'Focus Middle', icon: '📊' },
        { id: 'first-heavy', label: 'First Heavy', icon: '📊' },
        { id: 'last-heavy', label: 'Last Heavy', icon: '📊' },
    ];

    return (
        <div className="min-h-screen pt-16 pb-24 px-3 sm:px-6 lg:px-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6 animate-fade-in">
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground">
                            SORA <span className="text-primary neon-text">PRO</span>
                        </h2>
                        <span className="px-3 py-1 text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full">
                            Story Mode
                        </span>
                    </div>
                    <p className="text-muted-foreground text-xs sm:text-sm max-w-xl">
                        Create cinematic multi-scene videos with storyboard-style block prompts.
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
                            <div>
                                <h3 className="text-sm font-bold text-amber-500">Had Video Dicapai</h3>
                                <p className="text-xs text-muted-foreground">{videosUsed}/{videoLimit} video digunakan</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="glass-panel-elevated p-6 animate-fade-in">
                    {/* Top Row: Model & Reference Image */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                Model
                            </label>
                            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary/50 border border-border">
                                <span className="text-amber-500">✨</span>
                                <span className="text-sm font-bold">Sora 2 Pro</span>
                                <span className="ml-auto text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                    Premium
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                Image Reference
                            </label>
                            {referenceImage ? (
                                <div className="relative">
                                    <div className="relative rounded-xl overflow-hidden border-2 border-primary/50 bg-secondary/50">
                                        <img
                                            src={referenceImage}
                                            alt="Reference"
                                            className="w-full h-24 object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-white/90 bg-black/40 px-2 py-1 rounded-md">
                                                ✓ Image Selected
                                            </span>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all"
                                                    title="Change Image"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => setReferenceImage(null)}
                                                    className="p-1.5 rounded-lg bg-red-500/70 hover:bg-red-500 text-white transition-all"
                                                    title="Remove Image"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary/50 border border-border hover:border-primary/50 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-sm font-medium">Select Image</span>
                                </button>
                            )}
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                        </div>
                    </div>

                    {/* Prompt Section Header with Mode Tabs */}
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                            Prompt
                        </label>
                        <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-lg">
                            <button
                                onClick={() => setPromptMode('basic')}
                                className={cn(
                                    "px-3 py-1.5 text-[10px] font-bold rounded-md transition-all",
                                    promptMode === 'basic'
                                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                ☰ Basic
                            </button>
                            <button
                                onClick={() => setPromptMode('story')}
                                className={cn(
                                    "px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1",
                                    promptMode === 'story'
                                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                ▷ Story
                                <span className="px-1.5 py-0.5 text-[8px] bg-orange-400 text-white rounded-full">New</span>
                            </button>
                        </div>
                    </div>

                    {/* Basic Mode Panel */}
                    {promptMode === 'basic' && (
                        <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 mb-6">
                            <Textarea
                                value={basicPrompt}
                                onChange={(e) => setBasicPrompt(e.target.value)}
                                placeholder="Describe the video you want to generate with Sora..."
                                className="min-h-[120px] bg-background/50 border-border/50 resize-none text-sm"
                                disabled={isGenerating || hasReachedLimit}
                            />

                            {/* Duration selector for basic mode */}
                            <div className="mt-4">
                                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                    Duration
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleDurationChange(15)}
                                        className={cn(
                                            "flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                                            totalDuration === 15
                                                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-500"
                                                : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/50"
                                        )}
                                    >
                                        15s
                                    </button>
                                    <button
                                        onClick={() => handleDurationChange(25)}
                                        className={cn(
                                            "flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2",
                                            totalDuration === 25
                                                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-500"
                                                : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/50"
                                        )}
                                    >
                                        25s
                                        <span className="px-1.5 py-0.5 text-[8px] bg-orange-400 text-white rounded-full">New</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Story Mode Panel */}
                    {promptMode === 'story' && (
                        <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 mb-6">
                            {/* Video Duration */}
                            <div className="mb-4">
                                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                    Video Duration
                                </label>
                                <div className="flex gap-2">
                                    {([15, 25] as const).map((d) => (
                                        <button
                                            key={d}
                                            onClick={() => handleDurationChange(d)}
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-sm font-bold border transition-all",
                                                totalDuration === d
                                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-500"
                                                    : "bg-secondary/50 border-border text-muted-foreground"
                                            )}
                                        >
                                            {d === 15 ? '○' : '●'} {d}s
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Duration Slider */}
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                        Duration For Each Block
                                    </label>
                                    <span className="text-[10px] text-muted-foreground">Total: {totalBlockDuration}s</span>
                                </div>

                                {/* Duration Bar with Draggable Handles */}
                                <div
                                    ref={sliderRef}
                                    className="relative mb-4 select-none"
                                >
                                    {/* Colored bar showing block proportions - rainbow colors */}
                                    <div className="flex rounded-xl overflow-hidden h-10 relative">
                                        {blocks.map((block, i) => {
                                            const colors = [
                                                'bg-pink-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400',
                                                'bg-cyan-400', 'bg-blue-400', 'bg-purple-400', 'bg-pink-500',
                                                'bg-red-400', 'bg-indigo-400'
                                            ];
                                            return (
                                                <div
                                                    key={block.id}
                                                    style={{ width: `${(block.duration / totalDuration) * 100}%` }}
                                                    className={cn(
                                                        "flex items-center justify-center text-xs font-bold text-white transition-all min-w-[8px]",
                                                        colors[i % colors.length]
                                                    )}
                                                >
                                                    {block.duration >= 2 ? `${block.duration}s` : ''}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Draggable handle circles at boundaries */}
                                    {blocks.length > 1 && blocks.slice(0, -1).map((_, i) => {
                                        const cumulative = blocks.slice(0, i + 1).reduce((sum, b) => sum + b.duration, 0);
                                        const leftPercent = (cumulative / totalDuration) * 100;
                                        return (
                                            <div
                                                key={`handle-${i}`}
                                                onMouseDown={handleDragStart(i)}
                                                onTouchStart={handleDragStart(i)}
                                                className={cn(
                                                    "absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full border-2 cursor-ew-resize z-30 transition-transform",
                                                    draggingHandle === i ? "border-cyan-500 scale-110" : "border-gray-400 hover:border-gray-500 hover:scale-105"
                                                )}
                                                style={{
                                                    left: `calc(${leftPercent}% - 12px)`,
                                                    boxShadow: draggingHandle === i
                                                        ? '0 0 0 4px rgba(6, 182, 212, 0.3), 0 2px 8px rgba(0,0,0,0.3)'
                                                        : '0 2px 8px rgba(0,0,0,0.25)'
                                                }}
                                            />
                                        );
                                    })}
                                </div>

                                {/* Block duration labels */}
                                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground mb-3">
                                    {blocks.map((block, i) => {
                                        const colors = [
                                            'text-pink-400', 'text-orange-400', 'text-yellow-500', 'text-green-400',
                                            'text-cyan-400', 'text-blue-400', 'text-purple-400', 'text-pink-500',
                                            'text-red-400', 'text-indigo-400'
                                        ];
                                        return (
                                            <span key={block.id} className={cn("font-bold", colors[i % colors.length])}>
                                                Block {i + 1}: {block.duration}s
                                            </span>
                                        );
                                    })}
                                </div>

                                {/* Individual block duration sliders for fine control */}
                                <div className="space-y-2 mb-3">
                                    {blocks.map((block, i) => (
                                        <div key={block.id} className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-muted-foreground w-16">Block {i + 1}:</span>
                                            <input
                                                type="range"
                                                min={5}
                                                max={totalDuration - 5 * (blocks.length - 1)}
                                                value={block.duration}
                                                onChange={(e) => {
                                                    const newDuration = parseInt(e.target.value);
                                                    const diff = newDuration - block.duration;

                                                    const newBlocks = [...blocks];
                                                    newBlocks[i].duration = newDuration;

                                                    // Distribute difference to other blocks
                                                    const othersCount = blocks.length - 1;
                                                    if (othersCount > 0) {
                                                        const diffPerBlock = Math.floor(diff / othersCount);
                                                        let remaining = diff;

                                                        for (let j = 0; j < blocks.length; j++) {
                                                            if (j !== i) {
                                                                const reduction = Math.min(remaining, newBlocks[j].duration - 5);
                                                                newBlocks[j].duration = Math.max(5, newBlocks[j].duration - reduction);
                                                                remaining -= reduction;
                                                                if (remaining <= 0) break;
                                                            }
                                                        }
                                                    }

                                                    setBlocks(newBlocks);
                                                    setActivePreset('equal');
                                                }}
                                                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                                                style={{
                                                    background: `linear-gradient(to right, ${i % 2 === 0 ? '#3b82f6' : '#a78bfa'} ${(block.duration / totalDuration) * 100}%, #374151 0%)`,
                                                }}
                                            />
                                            <span className="text-xs font-bold text-foreground w-8">{block.duration}s</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Distribution Presets */}
                                <div className="flex flex-wrap gap-2">
                                    {presets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => applyPreset(preset.id)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1",
                                                activePreset === preset.id
                                                    ? "bg-primary/20 border-primary/50 text-primary"
                                                    : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                                            )}
                                        >
                                            {preset.icon} {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Block Prompts */}
                            {blocks.map((block, i) => (
                                <div key={block.id} className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                "w-3 h-3 rounded-full",
                                                i % 2 === 0 ? "bg-amber-500" : "bg-purple-500"
                                            )} />
                                            <span className="text-xs font-bold text-foreground">
                                                Block {i + 1} ({block.duration}s)
                                            </span>
                                        </div>
                                        {blocks.length > 1 && (
                                            <button
                                                onClick={() => removeBlock(block.id)}
                                                className="text-xs text-destructive hover:text-destructive/80"
                                            >
                                                ✕ Remove
                                            </button>
                                        )}
                                    </div>
                                    <Textarea
                                        value={block.prompt}
                                        onChange={(e) => updateBlockPrompt(block.id, e.target.value)}
                                        placeholder={`Describe what you want to generate for Block ${i + 1}...`}
                                        className="min-h-[80px]"
                                        disabled={isGenerating || hasReachedLimit}
                                    />
                                </div>
                            ))}

                            {/* Add Block Button */}
                            <button
                                onClick={addBlock}
                                disabled={blocks.length >= totalDuration}
                                className="w-full py-2 rounded-xl border-2 border-dashed border-border text-sm font-bold text-muted-foreground hover:border-primary/50 hover:text-primary transition-all disabled:opacity-50"
                            >
                                + Add Block ({blocks.length}/{totalDuration})
                            </button>
                        </div>
                    )}

                    {/* Bottom Options */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {/* Orientation */}
                        <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                Orientation
                            </label>
                            <div className="flex gap-2">
                                {(['landscape', 'portrait'] as const).map((o) => (
                                    <button
                                        key={o}
                                        onClick={() => setOrientation(o)}
                                        className={cn(
                                            "flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all",
                                            orientation === o
                                                ? "bg-amber-500/20 border-amber-500/50"
                                                : "bg-secondary/50 border-border"
                                        )}
                                    >
                                        <div className={cn(
                                            "border-2 rounded-sm",
                                            o === 'landscape' ? "w-8 h-5" : "w-5 h-8",
                                            orientation === o ? "border-amber-500" : "border-muted-foreground"
                                        )} />
                                        <span className={cn(
                                            "text-[10px] font-bold",
                                            orientation === o ? "text-amber-500" : "text-muted-foreground"
                                        )}>
                                            {o === 'landscape' ? 'Landscape (16:9)' : 'Portrait (9:16)'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Resolution */}
                        <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                Resolution
                            </label>
                            <div className="flex gap-2">
                                {(['720p', '1080p'] as const).map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setResolution(r)}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all",
                                            resolution === r
                                                ? "bg-amber-500/20 border-amber-500/50"
                                                : "bg-secondary/50 border-border"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-3 h-3 rounded-full border-2",
                                            resolution === r ? "bg-amber-500 border-amber-500" : "border-muted-foreground"
                                        )} />
                                        <span className={cn(
                                            "text-xs font-bold",
                                            resolution === r ? "text-amber-500" : "text-muted-foreground"
                                        )}>
                                            {r === '720p' ? 'Standard 720p (HD)' : 'Full HD 1080p'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Generation Progress */}
                    {isGenerating && (
                        <div className="mb-4 p-4 rounded-xl bg-secondary/30 border border-amber-500/30">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-amber-500">Menjana Video...</span>
                                <span className="text-sm font-black text-amber-500">{generationProgress}%</span>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500 ease-out"
                                    style={{ width: `${generationProgress}%` }}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Video sedang diproses oleh Sora 2 Pro. Ini mungkin mengambil masa beberapa minit...
                            </p>
                        </div>
                    )}

                    {/* Generated Video Result */}
                    {generatedVideoUrl && !isGenerating && (
                        <div className="mb-4 p-4 rounded-xl bg-secondary/30 border border-green-500/30">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-bold text-green-500">✅ Video Berjaya Dijana!</span>
                                <a
                                    href={generatedVideoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-amber-500 hover:underline"
                                >
                                    Buka dalam tab baru ↗
                                </a>
                            </div>
                            <video
                                controls
                                className="w-full rounded-lg max-h-[400px] bg-black"
                                src={generatedVideoUrl}
                            >
                                Your browser does not support the video tag.
                            </video>
                        </div>
                    )}

                    {/* Generate Button */}
                    <Button
                        onClick={handleGenerate}
                        disabled={isGenerating || hasReachedLimit || (promptMode === 'story' ? blocks.some(b => !b.prompt.trim()) : !basicPrompt.trim())}
                        className="w-full py-6 text-sm font-black uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                    >
                        {isGenerating ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Menjana Video... {generationProgress}%
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span>✨</span>
                                Generate with Sora 2 Pro ✨
                            </div>
                        )}
                    </Button>
                </div>
            </div >
        </div >
    );
};

export default SoraProStudio;
