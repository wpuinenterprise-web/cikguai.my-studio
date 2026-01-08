import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserProfile, ContentType, ScheduleType, SocialPlatform } from '@/types';
import {
    Loader2,
    Save,
    X,
    Video,
    Image,
    Clock,
    Calendar,
    Send,
    Facebook,
    Instagram,
    Youtube,
    Sparkles,
    ChevronRight,
    ChevronLeft,
    Upload,
    Key,
    Wand2,
    RefreshCw,
    Edit3,
    Check
} from 'lucide-react';

interface WorkflowBuilderProps {
    userProfile: UserProfile;
    onClose: () => void;
    onSuccess: () => void;
    editWorkflow?: any; // For editing existing workflow
}

interface WorkflowFormData {
    name: string;
    description: string;
    productName: string;
    productDescription: string;
    targetAudience: string;
    contentStyle: string;
    contentType: ContentType;
    aspectRatio: 'landscape' | 'portrait';
    duration: 10 | 15;
    scheduleType: ScheduleType;
    hourOfDay: number;
    minuteOfHour: number;
    platforms: SocialPlatform[];
    productImageUrl: string;
    promptMode: 'auto' | 'manual';
    videoType: 't2v' | 'i2v';
    videoStyle: 'ugc' | 'storyboard';
    manualPrompt: string;
    ctaType: 'fb' | 'tiktok' | 'general';
    characterGender: 'male' | 'female';
}

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
    userProfile,
    onClose,
    onSuccess,
    editWorkflow
}) => {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<WorkflowFormData>({
        name: editWorkflow?.name || '',
        description: editWorkflow?.description || '',
        productName: editWorkflow?.product_name || editWorkflow?.name || '',
        productDescription: editWorkflow?.product_description || editWorkflow?.description || '',
        targetAudience: editWorkflow?.target_audience || '',
        contentStyle: editWorkflow?.content_style || 'professional',
        contentType: editWorkflow?.content_type || 'video',
        aspectRatio: editWorkflow?.aspect_ratio || 'portrait',
        duration: editWorkflow?.duration || 10,
        scheduleType: 'daily',
        hourOfDay: 9,
        minuteOfHour: 0,
        platforms: ['telegram'],
        productImageUrl: editWorkflow?.product_image_url || '',
        promptMode: editWorkflow?.prompt_mode || 'auto',
        videoType: editWorkflow?.product_image_url ? 'i2v' : (editWorkflow?.video_type || 't2v'),
        videoStyle: editWorkflow?.video_style || 'ugc',
        manualPrompt: editWorkflow?.prompt_template || '',
        ctaType: editWorkflow?.cta_type || 'tiktok',
        characterGender: editWorkflow?.character_gender || 'female',
    });

    const [uploading, setUploading] = useState(false);

    // Auto-Prompt states - initialize with existing templates when editing
    const [enhancedPrompt, setEnhancedPrompt] = useState(editWorkflow?.prompt_template || '');
    const [enhancedCaption, setEnhancedCaption] = useState(editWorkflow?.caption_template || '');
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [showPromptPreview, setShowPromptPreview] = useState(!!editWorkflow?.prompt_template);
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);

    // Load schedule data when editing existing workflow
    useEffect(() => {
        const loadScheduleData = async () => {
            console.log('WorkflowBuilder - editWorkflow:', editWorkflow);
            console.log('WorkflowBuilder - editWorkflow.id:', editWorkflow?.id);

            if (editWorkflow?.id) {
                const { data: scheduleData, error } = await supabase
                    .from('automation_schedules')
                    .select('*')
                    .eq('workflow_id', editWorkflow.id)
                    .maybeSingle();

                // Cast to any for dynamic fields not in TypeScript types yet
                const schedule = scheduleData as any;

                console.log('WorkflowBuilder - loaded schedule:', schedule);
                console.log('WorkflowBuilder - schedule error:', error);

                if (schedule) {
                    console.log('WorkflowBuilder - setting schedule data:', {
                        scheduleType: schedule.schedule_type,
                        hourOfDay: schedule.hour_of_day,
                        minuteOfHour: schedule.minute_of_hour,
                        platforms: schedule.platforms,
                    });
                    setFormData(prev => ({
                        ...prev,
                        scheduleType: (schedule.schedule_type as ScheduleType) || 'daily',
                        hourOfDay: schedule.hour_of_day ?? 9,
                        minuteOfHour: schedule.minute_of_hour ?? 0,
                        platforms: schedule.platforms || ['telegram'],
                    }));
                }
            }
        };

        loadScheduleData();
    }, [editWorkflow?.id]);

    const updateField = (field: keyof WorkflowFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const togglePlatform = (platform: SocialPlatform) => {
        setFormData(prev => ({
            ...prev,
            platforms: prev.platforms.includes(platform)
                ? prev.platforms.filter(p => p !== platform)
                : [...prev.platforms, platform]
        }));
    };

    // Handle product image upload
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${userProfile.id}/${Date.now()}.${fileExt}`;

            const { data, error } = await supabase.storage
                .from('product-images')
                .upload(fileName, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            updateField('productImageUrl', publicUrl);
            toast.success('Gambar produk berjaya dimuat naik!');
        } catch (error) {
            console.error('Error uploading image:', error);
            toast.error('Gagal memuat naik gambar');
        } finally {
            setUploading(false);
        }
    };

    // Handle Auto-Prompt Enhancement using Gemini 2.5 Flash-Lite
    const handleEnhancePrompt = async () => {
        if (!formData.productName || !formData.productDescription) {
            toast.error('Sila isi nama dan deskripsi produk terlebih dahulu');
            return;
        }

        setIsEnhancing(true);
        setShowPromptPreview(false);

        try {
            const { data, error } = await supabase.functions.invoke('generate-prompt', {
                body: {
                    productName: formData.productName,
                    productDescription: formData.productDescription,
                    targetAudience: formData.targetAudience,
                    contentStyle: formData.contentStyle,
                    promptMode: formData.promptMode,
                    videoType: formData.videoType,
                    videoStyle: formData.videoStyle,
                    aspectRatio: formData.aspectRatio,
                    duration: formData.duration,
                    manualPrompt: formData.manualPrompt,
                    ctaType: formData.ctaType,
                    characterGender: formData.characterGender,
                }
            });

            if (error) throw error;

            if (data.success) {
                setEnhancedPrompt(data.prompt);
                setEnhancedCaption(data.caption);
                setShowPromptPreview(true);
                toast.success('✨ Prompt berjaya dijana dengan Gemini AI!');
            } else {
                throw new Error(data.error || 'Failed to generate prompt');
            }
        } catch (error) {
            console.error('Error generating prompt:', error);
            toast.error(error instanceof Error ? error.message : 'Gagal generate prompt');
        } finally {
            setIsEnhancing(false);
        }
    };

    // Generate prompt template from product details
    const generatePromptTemplate = () => {
        // For Manual mode, use manually entered prompt
        if (formData.promptMode === 'manual' && formData.manualPrompt) {
            return formData.manualPrompt;
        }

        // Use enhanced prompt if available (from Gemini AI)
        if (enhancedPrompt) {
            return enhancedPrompt;
        }

        const style = formData.contentStyle === 'professional'
            ? 'professional, clean, corporate style'
            : formData.contentStyle === 'creative'
                ? 'creative, artistic, eye-catching'
                : formData.contentStyle === 'minimal'
                    ? 'minimal, simple, elegant'
                    : 'dynamic, engaging, modern';

        return `Create a ${formData.contentType === 'video' ? 'video' : 'image'} advertisement for "${formData.productName}".

Product: ${formData.productName}
Description: ${formData.productDescription}
Target Audience: ${formData.targetAudience}
Style: ${style}

Make it visually appealing and suitable for social media marketing. The content should be ${formData.aspectRatio === 'portrait' ? 'vertical (9:16)' : 'horizontal (16:9)'} format.`;
    };

    // Generate caption template
    const generateCaptionTemplate = () => {
        // Use enhanced caption if available
        if (enhancedCaption) {
            return enhancedCaption;
        }

        return `🔥 ${formData.productName}

${formData.productDescription}

✨ Perfect for ${formData.targetAudience}

👉 Get yours now!
#${formData.productName.replace(/\s+/g, '')} #promo #viral`;
    };

    const handleSave = async () => {
        // Different validation based on prompt mode
        if (!formData.name) {
            toast.error('Sila isi nama workflow');
            return;
        }

        if (formData.promptMode === 'manual' && !formData.manualPrompt) {
            toast.error('Sila tulis prompt manual');
            return;
        }

        if (formData.promptMode === 'auto' && (!formData.productName || !formData.productDescription)) {
            toast.error('Sila isi maklumat produk untuk Auto Prompt');
            return;
        }

        if (formData.platforms.length === 0) {
            toast.error('Sila pilih sekurang-kurangnya satu platform');
            return;
        }

        setSaving(true);

        try {
            const workflowData = {
                name: formData.name,
                description: formData.description,
                content_type: formData.contentType,
                prompt_template: generatePromptTemplate(),
                caption_template: generateCaptionTemplate(),
                aspect_ratio: formData.aspectRatio,
                duration: formData.duration,
                product_image_url: formData.productImageUrl || null,
                cta_type: formData.ctaType,
                product_name: formData.productName || null,
                product_description: formData.productDescription || null,
                target_audience: formData.targetAudience || null,
                content_style: formData.contentStyle,
                prompt_mode: formData.promptMode,
                video_type: formData.videoType,
                video_style: formData.videoStyle,
                character_gender: formData.characterGender,
            };

            console.log('Saving workflow data:', workflowData);
            console.log('Form data state:', {
                aspectRatio: formData.aspectRatio,
                duration: formData.duration,
                productImageUrl: formData.productImageUrl,
            });

            let workflowId: string;

            if (editWorkflow) {
                console.log('Updating existing workflow:', editWorkflow.id);
                // UPDATE existing workflow
                const { data: updateResult, error: workflowError } = await supabase
                    .from('automation_workflows')
                    .update(workflowData)
                    .eq('id', editWorkflow.id)
                    .select();

                console.log('Update result:', updateResult);
                if (workflowError) {
                    console.error('Update error:', workflowError);
                    throw workflowError;
                }
                workflowId = editWorkflow.id;

                // Update schedule
                await supabase
                    .from('automation_schedules')
                    .update({
                        schedule_type: formData.scheduleType,
                        hour_of_day: formData.hourOfDay,
                        minute_of_hour: formData.minuteOfHour,
                        platforms: formData.platforms,
                    })
                    .eq('workflow_id', editWorkflow.id);

                toast.success('Workflow berjaya dikemaskini!');
            } else {
                // CREATE new workflow
                const { data: workflow, error: workflowError } = await supabase
                    .from('automation_workflows')
                    .insert({
                        user_id: userProfile.id,
                        ...workflowData,
                        is_active: true,
                    })
                    .select()
                    .single();

                if (workflowError) throw workflowError;
                workflowId = workflow.id;

                // Create schedule
                // Calculate next run time based on scheduled hour/minute
                // User enters time in Malaysia timezone (UTC+8), convert to UTC for database
                const calculateNextRunAt = () => {
                    // Get current time in Malaysia (UTC+8)
                    const nowUtc = new Date();

                    // Get current Malaysia time components
                    const nowMytHour = (nowUtc.getUTCHours() + 8) % 24;
                    const nowMytMinute = nowUtc.getUTCMinutes();

                    // User selected time in MYT
                    const selectedMytHour = formData.hourOfDay;
                    const selectedMytMinute = formData.minuteOfHour;

                    // Compare in MYT context: has this time already passed TODAY in Malaysia?
                    const selectedMytTimeInMinutes = selectedMytHour * 60 + selectedMytMinute;
                    const nowMytTimeInMinutes = nowMytHour * 60 + nowMytMinute;
                    const hasPassed = selectedMytTimeInMinutes <= nowMytTimeInMinutes;

                    // Calculate the UTC hour for the Malaysia time user selected
                    let utcHour = selectedMytHour - 8; // Convert MYT to UTC
                    let crossesMidnight = false;

                    if (utcHour < 0) {
                        utcHour += 24;
                        crossesMidnight = true; // MYT morning times are previous day in UTC
                    }

                    // Start with today's date
                    const scheduledUtc = new Date(nowUtc);
                    scheduledUtc.setUTCHours(utcHour, selectedMytMinute, 0, 0);

                    // Adjust for midnight crossing (MYT morning = UTC previous day)
                    if (crossesMidnight) {
                        // Don't subtract a day - the time in UTC is correct
                        // We just need to handle the "already passed" logic correctly
                    }

                    // If scheduled time already passed TODAY in MYT, set for tomorrow
                    if (hasPassed) {
                        scheduledUtc.setUTCDate(scheduledUtc.getUTCDate() + 1);
                    }

                    console.log('Schedule calculation:', {
                        now_myt: `${nowMytHour}:${nowMytMinute}`,
                        selected_myt: `${selectedMytHour}:${selectedMytMinute}`,
                        has_passed_in_myt: hasPassed,
                        calculated_utc_hour: utcHour,
                        next_run_at_utc: scheduledUtc.toISOString(),
                    });

                    return scheduledUtc.toISOString();
                };


                console.log('Creating schedule for workflow:', workflowId);
                console.log('Schedule data:', {
                    workflow_id: workflowId,
                    schedule_type: formData.scheduleType,
                    hour_of_day: formData.hourOfDay,
                    minute_of_hour: formData.minuteOfHour,
                    next_run_at: calculateNextRunAt(),
                });

                const { data: scheduleResult, error: scheduleError } = await supabase
                    .from('automation_schedules')
                    .insert({
                        workflow_id: workflowId,
                        schedule_type: formData.scheduleType,
                        hour_of_day: formData.hourOfDay,
                        minute_of_hour: formData.minuteOfHour,
                        timezone: 'Asia/Kuala_Lumpur',
                        is_active: true,
                        next_run_at: calculateNextRunAt(),
                        platforms: formData.platforms,
                    })
                    .select();

                console.log('Schedule insert result:', scheduleResult);
                if (scheduleError) {
                    console.error('Schedule insert error:', scheduleError);
                    throw scheduleError;
                }

                toast.success('Workflow berjaya dicipta!');
            }

            onSuccess();
        } catch (error: any) {
            console.error('Error saving workflow:', error);
            const errorMsg = error?.message || error?.details || 'Unknown error';
            toast.error(`Gagal menyimpan workflow: ${errorMsg}`);
        } finally {
            setSaving(false);
        }
    };

    const contentStyles = [
        { id: 'professional', label: 'Professional', desc: 'Clean & Corporate' },
        { id: 'creative', label: 'Creative', desc: 'Artistic & Eye-catching' },
        { id: 'minimal', label: 'Minimal', desc: 'Simple & Elegant' },
        { id: 'dynamic', label: 'Dynamic', desc: 'Energetic & Modern' },
    ];

    return (
        <div className="fixed inset-0 z-50 bg-black/80 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="min-h-full flex items-start justify-center p-4 pt-10 pb-20">
                <Card className="w-full max-w-2xl bg-slate-900 border-slate-700">
                    <CardHeader className="border-b border-slate-700/50">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-xl font-bold text-foreground">
                                    {editWorkflow ? 'Edit Workflow' : 'Buat Workflow Baru'}
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Step {step} / 2
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={onClose}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        {/* Progress bar */}
                        <div className="flex gap-1 mt-4">
                            {[1, 2].map(s => (
                                <div
                                    key={s}
                                    className={`flex-1 h-1 rounded-full transition-all ${s <= step ? 'bg-primary' : 'bg-slate-700'
                                        }`}
                                />
                            ))}
                        </div>
                    </CardHeader>

                    <CardContent className="p-6">
                        {/* Step 1: Basic Info & Prompt Setup */}
                        {step === 1 && (
                            <div className="space-y-5 animate-fade-in">
                                {/* Workflow Name - always required */}
                                <div>
                                    <Label htmlFor="workflowName" className="text-sm font-medium">
                                        Nama Workflow <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="workflowName"
                                        placeholder="cth: Video Produk Skincare"
                                        value={formData.name}
                                        onChange={(e) => updateField('name', e.target.value)}
                                        className="mt-1 bg-slate-800/50"
                                    />
                                </div>

                                {/* Prompt Mode Selection - FIRST CHOICE */}
                                <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-pink-500/10 border border-violet-500/30">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Sparkles className="w-5 h-5 text-violet-400" />
                                        <Label className="text-sm font-bold text-violet-400">
                                            Pilih Jenis Prompt
                                        </Label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => updateField('promptMode', 'auto')}
                                            className={`p-4 rounded-xl border-2 text-center transition-all ${formData.promptMode === 'auto'
                                                ? 'bg-violet-500/20 border-violet-500'
                                                : 'bg-slate-800/50 border-slate-700 hover:border-violet-500/50'
                                                }`}
                                        >
                                            <Wand2 className={`w-8 h-8 mx-auto mb-2 ${formData.promptMode === 'auto' ? 'text-violet-400' : 'text-muted-foreground'}`} />
                                            <p className="font-bold text-sm">Auto Prompt</p>
                                            <p className="text-xs text-muted-foreground">AI jana dari produk</p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateField('promptMode', 'manual')}
                                            className={`p-4 rounded-xl border-2 text-center transition-all ${formData.promptMode === 'manual'
                                                ? 'bg-blue-500/20 border-blue-500'
                                                : 'bg-slate-800/50 border-slate-700 hover:border-blue-500/50'
                                                }`}
                                        >
                                            <Edit3 className={`w-8 h-8 mx-auto mb-2 ${formData.promptMode === 'manual' ? 'text-blue-400' : 'text-muted-foreground'}`} />
                                            <p className="font-bold text-sm">Manual Prompt</p>
                                            <p className="text-xs text-muted-foreground">Tulis bebas</p>
                                        </button>
                                    </div>
                                </div>

                                {/* MANUAL PROMPT MODE - Free form with video settings */}
                                {formData.promptMode === 'manual' && (
                                    <div className="space-y-4">
                                        {/* Manual Prompt Textarea */}
                                        <div>
                                            <Label className="text-sm font-medium mb-2 block">
                                                Prompt Video <span className="text-destructive">*</span>
                                            </Label>
                                            <Textarea
                                                placeholder="Tulis prompt video anda di sini. Contoh: A beautiful Malaysian woman in hijab showcasing skincare product, camera slowly zooms in..."
                                                value={formData.manualPrompt}
                                                onChange={(e) => updateField('manualPrompt', e.target.value)}
                                                className="min-h-[150px] bg-slate-800/50 text-sm"
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">Tulis dalam English untuk hasil terbaik dengan Sora 2</p>
                                        </div>

                                        {/* Video Type (T2V / I2V) */}
                                        <div>
                                            <Label className="text-sm font-medium mb-2 block">Jenis Video</Label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('videoType', 't2v')}
                                                    className={`p-3 rounded-lg border text-center transition-all ${formData.videoType === 't2v'
                                                        ? 'bg-violet-500/20 border-violet-500 text-violet-400'
                                                        : 'bg-slate-800/50 border-slate-700 hover:border-violet-500/50'
                                                        }`}
                                                >
                                                    <Video className="w-5 h-5 mx-auto mb-1" />
                                                    <p className="text-xs font-medium">Text-to-Video</p>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('videoType', 'i2v')}
                                                    className={`p-3 rounded-lg border text-center transition-all ${formData.videoType === 'i2v'
                                                        ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                                        : 'bg-slate-800/50 border-slate-700 hover:border-purple-500/50'
                                                        }`}
                                                >
                                                    <Image className="w-5 h-5 mx-auto mb-1" />
                                                    <p className="text-xs font-medium">Image-to-Video</p>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Image Upload for I2V */}
                                        {formData.videoType === 'i2v' && (
                                            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                                                <Label className="text-sm font-medium mb-2 block">Upload Gambar</Label>
                                                {formData.productImageUrl ? (
                                                    <div className="relative">
                                                        <img src={formData.productImageUrl} alt="Reference" className="w-full h-32 object-cover rounded-lg" />
                                                        <button onClick={() => updateField('productImageUrl', '')} className="absolute top-2 right-2 p-1 bg-red-500 rounded-full">
                                                            <X className="w-4 h-4 text-white" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-purple-500/30 rounded-lg cursor-pointer hover:border-purple-500/50">
                                                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                                                        {uploading ? <Loader2 className="w-6 h-6 animate-spin text-purple-400" /> : <Upload className="w-6 h-6 text-purple-400" />}
                                                    </label>
                                                )}
                                            </div>
                                        )}

                                        {/* Duration */}
                                        <div>
                                            <Label className="text-sm font-medium mb-2 block">Durasi</Label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button type="button" onClick={() => updateField('duration', 10 as 10 | 15)}
                                                    className={`p-3 rounded-lg border transition-all ${formData.duration === 10 ? 'bg-primary/20 border-primary' : 'bg-slate-800/50 border-slate-700'}`}>
                                                    <p className="font-bold">10 saat</p>
                                                </button>
                                                <button type="button" onClick={() => updateField('duration', 15 as 10 | 15)}
                                                    className={`p-3 rounded-lg border transition-all ${formData.duration === 15 ? 'bg-primary/20 border-primary' : 'bg-slate-800/50 border-slate-700'}`}>
                                                    <p className="font-bold">15 saat</p>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Aspect Ratio */}
                                        <div>
                                            <Label className="text-sm font-medium mb-2 block">Ratio Video</Label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button type="button" onClick={() => updateField('aspectRatio', 'portrait' as 'portrait' | 'landscape')}
                                                    className={`p-3 rounded-lg border transition-all ${formData.aspectRatio === 'portrait' ? 'bg-primary/20 border-primary' : 'bg-slate-800/50 border-slate-700'}`}>
                                                    <p className="font-bold">9:16</p>
                                                    <p className="text-xs text-muted-foreground">Portrait</p>
                                                </button>
                                                <button type="button" onClick={() => updateField('aspectRatio', 'landscape' as 'portrait' | 'landscape')}
                                                    className={`p-3 rounded-lg border transition-all ${formData.aspectRatio === 'landscape' ? 'bg-primary/20 border-primary' : 'bg-slate-800/50 border-slate-700'}`}>
                                                    <p className="font-bold">16:9</p>
                                                    <p className="text-xs text-muted-foreground">Landscape</p>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* AUTO PROMPT MODE - Product Details */}
                                {formData.promptMode === 'auto' && (
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                                <Sparkles className="w-5 h-5 text-primary" />
                                                Maklumat Produk
                                            </h3>
                                        </div>

                                        <div>
                                            <Label htmlFor="productName" className="text-sm font-medium">
                                                Nama Produk <span className="text-destructive">*</span>
                                            </Label>
                                            <Input
                                                id="productName"
                                                placeholder="cth: Serum Vitamin C"
                                                value={formData.productName}
                                                onChange={(e) => updateField('productName', e.target.value)}
                                                className="mt-1 bg-slate-800/50"
                                            />
                                        </div>

                                        <div>
                                            <Label htmlFor="productDesc" className="text-sm font-medium">
                                                Deskripsi Produk <span className="text-destructive">*</span>
                                            </Label>
                                            <Textarea
                                                id="productDesc"
                                                placeholder="Terangkan produk anda dengan detail - kelebihan, manfaat, bahan-bahan..."
                                                value={formData.productDescription}
                                                onChange={(e) => updateField('productDescription', e.target.value)}
                                                className="mt-1 bg-slate-800/50 min-h-[100px]"
                                            />
                                        </div>

                                        <div>
                                            <Label htmlFor="targetAudience" className="text-sm font-medium">
                                                Target Audience
                                            </Label>
                                            <Input
                                                id="targetAudience"
                                                placeholder="cth: wanita umur 25-45, peminat skincare"
                                                value={formData.targetAudience}
                                                onChange={(e) => updateField('targetAudience', e.target.value)}
                                                className="mt-1 bg-slate-800/50"
                                            />
                                        </div>

                                        {/* Product Image Upload */}
                                        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Upload className="w-5 h-5 text-purple-400" />
                                                <Label className="text-sm font-bold text-purple-400">
                                                    Gambar Produk (untuk I2V)
                                                </Label>
                                            </div>

                                            {formData.productImageUrl ? (
                                                <div className="relative">
                                                    <img
                                                        src={formData.productImageUrl}
                                                        alt="Product"
                                                        className="w-full h-40 object-cover rounded-lg"
                                                    />
                                                    <button
                                                        onClick={() => updateField('productImageUrl', '')}
                                                        className="absolute top-2 right-2 p-1 bg-red-500 rounded-full"
                                                    >
                                                        <X className="w-4 h-4 text-white" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-purple-500/30 rounded-xl cursor-pointer hover:border-purple-500/50 transition-all">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleImageUpload}
                                                        className="hidden"
                                                        disabled={uploading}
                                                    />
                                                    {uploading ? (
                                                        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                                                    ) : (
                                                        <>
                                                            <Upload className="w-8 h-8 text-purple-400 mb-2" />
                                                            <p className="text-xs text-muted-foreground">Klik untuk upload gambar produk</p>
                                                        </>
                                                    )}
                                                </label>
                                            )}

                                            {/* Video Type Toggle (T2V/I2V) */}
                                            <div className="mt-3">
                                                <Label className="text-sm font-medium mb-2 block">Jenis Video</Label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('videoType', 't2v')}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.videoType === 't2v'
                                                            ? 'bg-violet-500/20 border-violet-500 text-violet-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-violet-500/50'
                                                            }`}
                                                    >
                                                        <Video className="w-5 h-5 mx-auto mb-1" />
                                                        <p className="text-xs font-medium">Text-to-Video</p>
                                                        <p className="text-xs text-muted-foreground">Jana dari teks</p>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('videoType', 'i2v')}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.videoType === 'i2v'
                                                            ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-purple-500/50'
                                                            }`}
                                                    >
                                                        <Image className="w-5 h-5 mx-auto mb-1" />
                                                        <p className="text-xs font-medium">Image-to-Video</p>
                                                        <p className="text-xs text-muted-foreground">Jana dari gambar</p>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Gemini Auto-Prompt Section */}
                                        <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-pink-500/10 border border-violet-500/30">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Sparkles className="w-5 h-5 text-violet-400" />
                                                <Label className="text-sm font-bold text-violet-400">
                                                    ✨ Gemini AI Prompt Generator
                                                </Label>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-4">
                                                Gemini 2.5 Flash-Lite akan menjana prompt video yang optimum untuk Sora 2
                                            </p>

                                            {/* Video Style Selection */}
                                            <div className="mb-4">
                                                <Label className="text-sm font-medium mb-2 block">Gaya Video</Label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            updateField('videoStyle', 'ugc');
                                                            updateField('aspectRatio', 'portrait');
                                                        }}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.videoStyle === 'ugc'
                                                            ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-pink-500/50'
                                                            }`}
                                                    >
                                                        <p className="text-xs font-bold">📱 UGC Style</p>
                                                        <p className="text-xs text-muted-foreground">TikTok/Reels (9:16)</p>
                                                        <p className="text-xs text-muted-foreground">Casual, influencer</p>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            updateField('videoStyle', 'storyboard');
                                                            updateField('aspectRatio', 'landscape');
                                                        }}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.videoStyle === 'storyboard'
                                                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50'
                                                            }`}
                                                    >
                                                        <p className="text-xs font-bold">🎬 Storyboard</p>
                                                        <p className="text-xs text-muted-foreground">Cinematic (16:9)</p>
                                                        <p className="text-xs text-muted-foreground">Formal, dramatic</p>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Character Gender Selection */}
                                            <div className="mb-4">
                                                <Label className="text-sm font-medium mb-2 block">Watak / Model</Label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('characterGender', 'female')}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.characterGender === 'female'
                                                            ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-pink-500/50'
                                                            }`}
                                                    >
                                                        <p className="text-lg mb-1">👩</p>
                                                        <p className="text-xs font-bold">Perempuan</p>
                                                        <p className="text-xs text-muted-foreground">Melayu bertudung 30-an</p>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('characterGender', 'male')}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.characterGender === 'male'
                                                            ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-blue-500/50'
                                                            }`}
                                                    >
                                                        <p className="text-lg mb-1">👨</p>
                                                        <p className="text-xs font-bold">Lelaki</p>
                                                        <p className="text-xs text-muted-foreground">Melayu influencer 30-an</p>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Duration Selection */}
                                            <div className="mb-4">
                                                <Label className="text-sm font-medium mb-2 block">Durasi Video</Label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('duration', 10 as 10 | 15)}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.duration === 10
                                                            ? 'bg-green-500/20 border-green-500 text-green-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-green-500/50'
                                                            }`}
                                                    >
                                                        <p className="text-lg font-bold">10s</p>
                                                        <p className="text-xs text-muted-foreground">Standard</p>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('duration', 15 as 10 | 15)}
                                                        className={`p-3 rounded-lg border text-center transition-all ${formData.duration === 15
                                                            ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-blue-500/50'
                                                            }`}
                                                    >
                                                        <p className="text-lg font-bold">15s</p>
                                                        <p className="text-xs text-muted-foreground">Extended</p>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* CTA Type Selection */}
                                            <div className="mb-4">
                                                <Label className="text-sm font-medium mb-2 block">Jenis CTA (Call-to-Action)</Label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('ctaType', 'fb')}
                                                        className={`p-3 rounded-lg border text-center text-xs transition-all ${formData.ctaType === 'fb'
                                                            ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-blue-500/50'
                                                            }`}
                                                    >
                                                        <Facebook className="w-4 h-4 mx-auto mb-1" />
                                                        Facebook
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('ctaType', 'tiktok')}
                                                        className={`p-3 rounded-lg border text-center text-xs transition-all ${formData.ctaType === 'tiktok'
                                                            ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-pink-500/50'
                                                            }`}
                                                    >
                                                        <Video className="w-4 h-4 mx-auto mb-1" />
                                                        TikTok
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('ctaType', 'general')}
                                                        className={`p-3 rounded-lg border text-center text-xs transition-all ${formData.ctaType === 'general'
                                                            ? 'bg-green-500/20 border-green-500 text-green-400'
                                                            : 'bg-slate-800/50 border-slate-700 hover:border-green-500/50'
                                                            }`}
                                                    >
                                                        <Send className="w-4 h-4 mx-auto mb-1" />
                                                        Umum
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Generate Button */}
                                            <Button
                                                onClick={handleEnhancePrompt}
                                                disabled={isEnhancing || !formData.productName || !formData.productDescription}
                                                className="w-full gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                                            >
                                                {isEnhancing ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Gemini AI sedang menjana prompt...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Wand2 className="w-4 h-4" />
                                                        ✨ Generate dengan Gemini AI
                                                    </>
                                                )}
                                            </Button>

                                            {/* Enhanced Prompt Preview */}
                                            {showPromptPreview && enhancedPrompt && (
                                                <div className="mt-4 space-y-3 animate-fade-in">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-sm font-medium text-violet-300">
                                                            📝 Video Prompt Preview
                                                        </Label>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                                                                className="h-7 px-2 text-xs"
                                                            >
                                                                <Edit3 className="w-3 h-3 mr-1" />
                                                                {isEditingPrompt ? 'Done' : 'Edit'}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={handleEnhancePrompt}
                                                                disabled={isEnhancing}
                                                                className="h-7 px-2 text-xs"
                                                            >
                                                                <RefreshCw className={`w-3 h-3 mr-1 ${isEnhancing ? 'animate-spin' : ''}`} />
                                                                Regenerate
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {isEditingPrompt ? (
                                                        <Textarea
                                                            value={enhancedPrompt}
                                                            onChange={(e) => setEnhancedPrompt(e.target.value)}
                                                            className="min-h-[150px] bg-slate-800/50 text-sm"
                                                        />
                                                    ) : (
                                                        <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 max-h-[200px] overflow-y-auto">
                                                            <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                                                                {enhancedPrompt}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Caption Preview */}
                                                    {enhancedCaption && (
                                                        <div>
                                                            <Label className="text-sm font-medium text-violet-300 mb-2 block">
                                                                💬 Caption Preview
                                                            </Label>
                                                            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                                                <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                                                                    {enhancedCaption}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                                                        <Check className="w-4 h-4 text-green-400" />
                                                        <p className="text-xs text-green-400">
                                                            Prompt ini akan digunakan untuk workflow anda
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 2: Schedule */}
                        {step === 2 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-primary" />
                                        Tetapan Jadual
                                    </h3>
                                </div>

                                {/* Schedule Type */}
                                <div>
                                    <Label className="text-sm font-medium mb-3 block">Kekerapan</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => updateField('scheduleType', 'daily')}
                                            className={`p-4 rounded-xl border-2 transition-all ${formData.scheduleType === 'daily'
                                                ? 'border-primary bg-primary/10'
                                                : 'border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            <Calendar className={`w-6 h-6 mx-auto mb-2 ${formData.scheduleType === 'daily' ? 'text-primary' : 'text-muted-foreground'}`} />
                                            <p className="font-bold text-sm">Setiap Hari</p>
                                            <p className="text-xs text-muted-foreground">1x sehari</p>
                                        </button>
                                        <button
                                            onClick={() => updateField('scheduleType', 'hourly')}
                                            className={`p-4 rounded-xl border-2 transition-all ${formData.scheduleType === 'hourly'
                                                ? 'border-primary bg-primary/10'
                                                : 'border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            <Clock className={`w-6 h-6 mx-auto mb-2 ${formData.scheduleType === 'hourly' ? 'text-primary' : 'text-muted-foreground'}`} />
                                            <p className="font-bold text-sm">Setiap Jam</p>
                                            <p className="text-xs text-muted-foreground">24x sehari</p>
                                        </button>
                                    </div>
                                </div>

                                {/* Time Selection */}
                                {formData.scheduleType === 'daily' && (
                                    <div>
                                        <Label className="text-sm font-medium mb-3 block">Masa Post</Label>
                                        <div className="flex items-center gap-3">
                                            <select
                                                value={formData.hourOfDay}
                                                onChange={(e) => updateField('hourOfDay', parseInt(e.target.value))}
                                                className="flex-1 p-3 rounded-xl bg-slate-800 border border-slate-700 text-foreground"
                                            >
                                                {Array.from({ length: 24 }, (_, i) => (
                                                    <option key={i} value={i}>
                                                        {i.toString().padStart(2, '0')}:00
                                                    </option>
                                                ))}
                                            </select>
                                            <span className="text-muted-foreground">:</span>
                                            <select
                                                value={formData.minuteOfHour}
                                                onChange={(e) => updateField('minuteOfHour', parseInt(e.target.value))}
                                                className="flex-1 p-3 rounded-xl bg-slate-800 border border-slate-700 text-foreground"
                                            >
                                                {Array.from({ length: 60 }, (_, i) => (
                                                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-2">Timezone: Malaysia (GMT+8)</p>
                                    </div>
                                )}

                                {formData.scheduleType === 'hourly' && (
                                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                                        <p className="text-sm text-amber-400">
                                            ⚡ Konten akan dijana dan dipost setiap jam. Pastikan anda ada kredit yang mencukupi.
                                        </p>
                                    </div>
                                )}

                                {/* Platform Selection */}
                                <div className="pt-4 border-t border-slate-700/50">
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                        <Send className="w-5 h-5 text-primary" />
                                        Platform Posting
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Pilih platform untuk auto-post konten anda
                                    </p>

                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Telegram */}
                                        <button
                                            type="button"
                                            onClick={() => togglePlatform('telegram')}
                                            className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${formData.platforms.includes('telegram')
                                                ? 'border-blue-500 bg-blue-500/10'
                                                : 'border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            <Send className={`w-6 h-6 ${formData.platforms.includes('telegram') ? 'text-blue-400' : 'text-muted-foreground'}`} />
                                            <span className="text-xs font-medium">Telegram</span>
                                            {formData.platforms.includes('telegram') && (
                                                <Check className="w-4 h-4 text-blue-400" />
                                            )}
                                        </button>

                                        {/* Facebook */}
                                        <button
                                            type="button"
                                            onClick={() => togglePlatform('facebook')}
                                            className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${formData.platforms.includes('facebook')
                                                ? 'border-blue-600 bg-blue-600/10'
                                                : 'border-slate-700 hover:border-slate-600 opacity-50'
                                                }`}
                                            disabled
                                        >
                                            <Facebook className={`w-6 h-6 ${formData.platforms.includes('facebook') ? 'text-blue-500' : 'text-muted-foreground'}`} />
                                            <span className="text-xs font-medium">Facebook</span>
                                            <span className="text-xs text-muted-foreground">Akan Datang</span>
                                        </button>

                                        {/* Instagram */}
                                        <button
                                            type="button"
                                            onClick={() => togglePlatform('instagram')}
                                            className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${formData.platforms.includes('instagram')
                                                ? 'border-pink-500 bg-pink-500/10'
                                                : 'border-slate-700 hover:border-slate-600 opacity-50'
                                                }`}
                                            disabled
                                        >
                                            <Instagram className={`w-6 h-6 ${formData.platforms.includes('instagram') ? 'text-pink-400' : 'text-muted-foreground'}`} />
                                            <span className="text-xs font-medium">Instagram</span>
                                            <span className="text-xs text-muted-foreground">Akan Datang</span>
                                        </button>

                                        {/* YouTube */}
                                        <button
                                            type="button"
                                            onClick={() => togglePlatform('youtube')}
                                            className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${formData.platforms.includes('youtube')
                                                ? 'border-red-500 bg-red-500/10'
                                                : 'border-slate-700 hover:border-slate-600 opacity-50'
                                                }`}
                                            disabled
                                        >
                                            <Youtube className={`w-6 h-6 ${formData.platforms.includes('youtube') ? 'text-red-400' : 'text-muted-foreground'}`} />
                                            <span className="text-xs font-medium">YouTube</span>
                                            <span className="text-xs text-muted-foreground">Akan Datang</span>
                                        </button>
                                    </div>

                                    {formData.platforms.length === 0 && (
                                        <p className="text-xs text-amber-400 mt-3">
                                            ⚠️ Sila pilih sekurang-kurangnya satu platform
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 4: Platforms */}
                        {step === 4 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                        <Send className="w-5 h-5 text-primary" />
                                        Platform Posting
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Pilih platform untuk auto-post konten anda
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    {/* Telegram */}
                                    <button
                                        onClick={() => togglePlatform('telegram')}
                                        className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${formData.platforms.includes('telegram')
                                            ? 'border-blue-500 bg-blue-500/10'
                                            : 'border-slate-700 hover:border-slate-600'
                                            }`}
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                            <Send className="w-6 h-6 text-blue-400" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-bold">Telegram</p>
                                            <p className="text-xs text-muted-foreground">Post ke channel/group</p>
                                        </div>
                                        <Badge className={formData.platforms.includes('telegram') ? 'bg-blue-500' : 'bg-slate-700'}>
                                            {formData.platforms.includes('telegram') ? '✓ Dipilih' : 'Pilih'}
                                        </Badge>
                                    </button>

                                    {/* Facebook */}
                                    <button
                                        onClick={() => togglePlatform('facebook')}
                                        className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${formData.platforms.includes('facebook')
                                            ? 'border-blue-600 bg-blue-600/10'
                                            : 'border-slate-700 hover:border-slate-600'
                                            }`}
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center">
                                            <Facebook className="w-6 h-6 text-blue-500" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-bold">Facebook</p>
                                            <p className="text-xs text-muted-foreground">Post ke Page</p>
                                        </div>
                                        <Badge className={formData.platforms.includes('facebook') ? 'bg-blue-600' : 'bg-slate-700'}>
                                            {formData.platforms.includes('facebook') ? '✓ Dipilih' : 'Akan Datang'}
                                        </Badge>
                                    </button>

                                    {/* Instagram */}
                                    <button
                                        onClick={() => togglePlatform('instagram')}
                                        className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${formData.platforms.includes('instagram')
                                            ? 'border-pink-500 bg-pink-500/10'
                                            : 'border-slate-700 hover:border-slate-600'
                                            }`}
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center">
                                            <Instagram className="w-6 h-6 text-pink-400" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-bold">Instagram</p>
                                            <p className="text-xs text-muted-foreground">Post & Reels</p>
                                        </div>
                                        <Badge className={formData.platforms.includes('instagram') ? 'bg-pink-500' : 'bg-slate-700'}>
                                            {formData.platforms.includes('instagram') ? '✓ Dipilih' : 'Akan Datang'}
                                        </Badge>
                                    </button>

                                    {/* YouTube */}
                                    <button
                                        onClick={() => togglePlatform('youtube')}
                                        className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${formData.platforms.includes('youtube')
                                            ? 'border-red-500 bg-red-500/10'
                                            : 'border-slate-700 hover:border-slate-600'
                                            }`}
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                                            <Youtube className="w-6 h-6 text-red-400" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-bold">YouTube</p>
                                            <p className="text-xs text-muted-foreground">Shorts</p>
                                        </div>
                                        <Badge className={formData.platforms.includes('youtube') ? 'bg-red-500' : 'bg-slate-700'}>
                                            {formData.platforms.includes('youtube') ? '✓ Dipilih' : 'Akan Datang'}
                                        </Badge>
                                    </button>
                                </div>

                                {/* Preview */}
                                <div className="mt-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                    <h4 className="font-bold text-sm mb-3">Preview Prompt:</h4>
                                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                        {generatePromptTemplate()}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-700/50">
                            <Button
                                variant="outline"
                                onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                                className="gap-2"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                {step === 1 ? 'Batal' : 'Kembali'}
                            </Button>

                            {step < 2 ? (
                                <Button
                                    onClick={() => setStep(step + 1)}
                                    className="gap-2"
                                    disabled={
                                        (step === 1 && !formData.name) ||
                                        (step === 1 && formData.promptMode === 'manual' && !formData.manualPrompt) ||
                                        (step === 1 && formData.promptMode === 'auto' && (!formData.productName || !formData.productDescription))
                                    }
                                >
                                    Seterusnya
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleSave}
                                    disabled={saving || formData.platforms.length === 0}
                                    className="gap-2 min-w-[140px]"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Menyimpan...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Simpan Workflow
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default WorkflowBuilder;
