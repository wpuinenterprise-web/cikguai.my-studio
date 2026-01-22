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

const SoraProStudio: React.FC<SoraProStudioProps> = ({ userProfile, onProfileRefresh }) => {
    const [totalDuration, setTotalDuration] = useState<15 | 25>(25);
    const [blocks, setBlocks] = useState<StoryBlock[]>([
        { id: '1', prompt: '', duration: 15 },
        { id: '2', prompt: '', duration: 10 },
    ]);
    const [activePreset, setActivePreset] = useState<DurationPreset>('equal');
    const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
    const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
    const [isGenerating, setIsGenerating] = useState(false);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Check limits
    const videosUsed = userProfile?.videos_used || 0;
    const videoLimit = userProfile?.video_limit || 0;
    const hasReachedLimit = userProfile && !userProfile.is_admin && videosUsed >= videoLimit;
    const isLocked = userProfile && !userProfile.is_admin && !userProfile.is_approved;

    // Calculate total block duration
    const totalBlockDuration = blocks.reduce((sum, b) => sum + b.duration, 0);

    // Apply distribution preset
    const applyPreset = useCallback((preset: DurationPreset) => {
        setActivePreset(preset);
        const count = blocks.length;
        if (count === 0) return;

        let newDurations: number[] = [];

        switch (preset) {
            case 'equal':
                const equalDuration = Math.floor(totalDuration / count);
                const remainder = totalDuration % count;
                newDurations = blocks.map((_, i) => equalDuration + (i < remainder ? 1 : 0));
                break;
            case 'ascending':
                // First block smallest, last block largest
                const ascStep = Math.floor(totalDuration / ((count * (count + 1)) / 2));
                newDurations = blocks.map((_, i) => Math.max(5, ascStep * (i + 1)));
                break;
            case 'descending':
                // First block largest, last block smallest
                const descStep = Math.floor(totalDuration / ((count * (count + 1)) / 2));
                newDurations = blocks.map((_, i) => Math.max(5, descStep * (count - i)));
                break;
            case 'focus-middle':
                // Middle blocks get more time
                const mid = Math.floor(count / 2);
                newDurations = blocks.map((_, i) => {
                    const distFromMid = Math.abs(i - mid);
                    return Math.max(5, Math.floor(totalDuration / count) + (mid - distFromMid) * 2);
                });
                break;
            case 'first-heavy':
                // First block gets 50%, rest split equally
                const firstHeavy = Math.floor(totalDuration * 0.5);
                const restFirst = Math.floor((totalDuration - firstHeavy) / Math.max(1, count - 1));
                newDurations = blocks.map((_, i) => i === 0 ? firstHeavy : restFirst);
                break;
            case 'last-heavy':
                // Last block gets 50%, rest split equally
                const lastHeavy = Math.floor(totalDuration * 0.5);
                const restLast = Math.floor((totalDuration - lastHeavy) / Math.max(1, count - 1));
                newDurations = blocks.map((_, i) => i === count - 1 ? lastHeavy : restLast);
                break;
        }

        // Normalize to match total duration
        const sum = newDurations.reduce((a, b) => a + b, 0);
        if (sum !== totalDuration && newDurations.length > 0) {
            newDurations[0] += totalDuration - sum;
        }

        setBlocks(blocks.map((b, i) => ({ ...b, duration: Math.max(5, newDurations[i] || 5) })));
    }, [blocks.length, totalDuration]);

    // Add new block
    const addBlock = () => {
        if (blocks.length >= totalDuration) {
            toast.error(`Maksimum ${totalDuration} block sahaja (1s per block)`);
            return;
        }
        const newId = Date.now().toString();
        // Calculate new duration: split evenly
        const newDuration = Math.max(1, Math.floor(totalDuration / (blocks.length + 1)));
        const updatedBlocks = blocks.map(b => ({
            ...b,
            duration: Math.max(1, Math.floor(b.duration * blocks.length / (blocks.length + 1)))
        }));
        setBlocks([...updatedBlocks, { id: newId, prompt: '', duration: newDuration }]);
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

    // Generate story video
    const handleGenerate = async () => {
        const emptyBlocks = blocks.filter(b => !b.prompt.trim());
        if (emptyBlocks.length > 0) {
            toast.error('Sila isi semua prompt block');
            return;
        }

        if (hasReachedLimit) {
            toast.error('Had video telah dicapai');
            return;
        }

        setIsGenerating(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error('Sila log masuk semula');
                return;
            }

            // Generate each block as separate video (for now)
            // In future, this could use a storyboard API endpoint
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                toast.info(`Menjana Block ${i + 1}/${blocks.length}...`);

                const response = await supabase.functions.invoke('generate-video', {
                    body: {
                        prompt: block.prompt,
                        duration: block.duration,
                        aspect_ratio: orientation,
                        model: 'sora-2-pro',
                    },
                });

                if (response.error) {
                    throw new Error(`Block ${i + 1}: ${response.error.message}`);
                }

                if (!response.data?.success) {
                    throw new Error(`Block ${i + 1}: ${response.data?.error || 'Gagal menjana'}`);
                }
            }

            toast.success('Semua block berjaya dimulakan!');

            if (onProfileRefresh) {
                await onProfileRefresh();
            }

        } catch (error: any) {
            console.error('Story generation error:', error);
            toast.error(error.message || 'Gagal menjana video');
        } finally {
            setIsGenerating(false);
        }
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
                                    Story Mode
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                Image Reference
                            </label>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary/50 border border-border hover:border-primary/50 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span className="text-sm font-medium">{referenceImage ? 'Change Image' : 'Select Image'}</span>
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                        </div>
                    </div>

                    {/* Prompt Section Header */}
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                            Prompt
                        </label>
                        <div className="flex items-center gap-2">
                            <button className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-secondary/50 text-muted-foreground">
                                ☰ Basic
                            </button>
                            <button className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-secondary/50 text-muted-foreground">
                                ⚙ Advanced
                            </button>
                            <button className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white">
                                ▷ Story
                            </button>
                        </div>
                    </div>

                    {/* Story Mode Panel */}
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
                                        onClick={() => {
                                            setTotalDuration(d);
                                            setTimeout(() => applyPreset(activePreset), 0);
                                        }}
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

                            {/* Duration Bar with Slider */}
                            <div className="relative mb-4">
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
                                                    "flex items-center justify-center text-xs font-bold text-white transition-all",
                                                    colors[i % colors.length]
                                                )}
                                            >
                                                {block.duration >= 2 ? `${block.duration}s` : ''}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Draggable handles at each block boundary */}
                                {blocks.length > 1 && blocks.slice(0, -1).map((_, handleIndex) => {
                                    const cumulativeDuration = blocks.slice(0, handleIndex + 1).reduce((sum, b) => sum + b.duration, 0);
                                    const leftPercent = (cumulativeDuration / totalDuration) * 100;

                                    return (
                                        <div
                                            key={`handle-${handleIndex}`}
                                            className="absolute top-0 h-10 z-20"
                                            style={{
                                                left: `${leftPercent}%`,
                                                transform: 'translateX(-50%)',
                                                width: '40px',
                                            }}
                                        >
                                            <input
                                                type="range"
                                                min={1 * (handleIndex + 1)}
                                                max={totalDuration - 1 * (blocks.length - handleIndex - 1)}
                                                value={cumulativeDuration}
                                                onChange={(e) => {
                                                    const newCumulative = parseInt(e.target.value);
                                                    const prevCumulative = blocks.slice(0, handleIndex).reduce((sum, b) => sum + b.duration, 0);
                                                    const newCurrentDuration = Math.max(1, newCumulative - prevCumulative);

                                                    const newBlocks = [...blocks];
                                                    const diff = newCurrentDuration - newBlocks[handleIndex].duration;
                                                    newBlocks[handleIndex].duration = newCurrentDuration;

                                                    if (handleIndex + 1 < blocks.length) {
                                                        newBlocks[handleIndex + 1].duration = Math.max(1, newBlocks[handleIndex + 1].duration - diff);
                                                    }

                                                    setBlocks(newBlocks);
                                                    setActivePreset('equal');
                                                }}
                                                className="w-full h-10 cursor-ew-resize opacity-0"
                                                style={{ position: 'absolute', left: '-20px', width: '40px' }}
                                            />
                                            {/* Visible handle */}
                                            <div
                                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg border-2 border-gray-300 cursor-ew-resize pointer-events-none"
                                                style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
                                            />
                                        </div>
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

                    {/* Credits Info */}
                    <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
                        <span>Credits: {userProfile?.is_admin ? '∞' : (videoLimit - videosUsed)} remaining</span>
                        <span className="text-amber-500">This generation will cost: {blocks.length * 20} Credits per video</span>
                    </div>

                    {/* Generate Button */}
                    <Button
                        onClick={handleGenerate}
                        disabled={isGenerating || hasReachedLimit || blocks.some(b => !b.prompt.trim())}
                        className="w-full py-6 text-sm font-black uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                    >
                        {isGenerating ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Menjana {blocks.length} Block...
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span>✨</span>
                                Generate with Sora ✨
                            </div>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SoraProStudio;
