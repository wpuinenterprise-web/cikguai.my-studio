import React, { useState } from 'react';
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
    Wand2
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
    aspectRatio: string;
    duration: number;
    scheduleType: ScheduleType;
    hourOfDay: number;
    minuteOfHour: number;
    platforms: SocialPlatform[];
    productImageUrl: string;
    useI2V: boolean;
    openaiApiKey: string;
    autoGeneratePrompt: boolean;
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
        productName: '',
        productDescription: '',
        targetAudience: '',
        contentStyle: 'professional',
        contentType: editWorkflow?.content_type || 'video',
        aspectRatio: editWorkflow?.aspect_ratio || 'landscape',
        duration: editWorkflow?.duration || 10,
        scheduleType: 'daily',
        hourOfDay: 9,
        minuteOfHour: 0,
        platforms: ['telegram'],
        productImageUrl: '',
        useI2V: false,
        openaiApiKey: '',
        autoGeneratePrompt: false,
    });

    const [uploading, setUploading] = useState(false);

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

    // Save OpenAI API key to user profile
    const saveApiKey = async () => {
        if (!formData.openaiApiKey) return;

        try {
            await supabase
                .from('profiles')
                .update({ openai_api_key: formData.openaiApiKey })
                .eq('id', userProfile.id);
            toast.success('API Key disimpan!');
        } catch (error) {
            console.error('Error saving API key:', error);
        }
    };

    // Generate prompt template from product details
    const generatePromptTemplate = () => {
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

Make it visually appealing and suitable for social media marketing. The content should be ${formData.aspectRatio === 'portrait' ? 'vertical (9:16)' : formData.aspectRatio === 'square' ? 'square (1:1)' : 'horizontal (16:9)'} format.`;
    };

    // Generate caption template
    const generateCaptionTemplate = () => {
        return `🔥 ${formData.productName}

${formData.productDescription}

✨ Perfect for ${formData.targetAudience}

👉 Get yours now!
#${formData.productName.replace(/\s+/g, '')} #promo #viral`;
    };

    const handleSave = async () => {
        if (!formData.name || !formData.productName || !formData.productDescription) {
            toast.error('Sila isi semua maklumat wajib');
            return;
        }

        if (formData.platforms.length === 0) {
            toast.error('Sila pilih sekurang-kurangnya satu platform');
            return;
        }

        setSaving(true);

        try {
            // Create workflow
            const { data: workflow, error: workflowError } = await supabase
                .from('automation_workflows')
                .insert({
                    user_id: userProfile.id,
                    name: formData.name,
                    description: formData.description,
                    content_type: formData.contentType,
                    prompt_template: generatePromptTemplate(),
                    caption_template: generateCaptionTemplate(),
                    aspect_ratio: formData.aspectRatio,
                    duration: formData.duration,
                    is_active: true,
                })
                .select()
                .single();

            if (workflowError) throw workflowError;

            // Create schedule
            const { error: scheduleError } = await supabase
                .from('automation_schedules')
                .insert({
                    workflow_id: workflow.id,
                    schedule_type: formData.scheduleType,
                    hour_of_day: formData.hourOfDay,
                    minute_of_hour: formData.minuteOfHour,
                    timezone: 'Asia/Kuala_Lumpur',
                    is_active: true,
                });

            if (scheduleError) throw scheduleError;

            toast.success('Workflow berjaya dicipta!');
            onSuccess();
        } catch (error) {
            console.error('Error saving workflow:', error);
            toast.error('Gagal menyimpan workflow');
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
                                    Step {step} / 4
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={onClose}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        {/* Progress bar */}
                        <div className="flex gap-1 mt-4">
                            {[1, 2, 3, 4].map(s => (
                                <div
                                    key={s}
                                    className={`flex-1 h-1 rounded-full transition-all ${s <= step ? 'bg-primary' : 'bg-slate-700'
                                        }`}
                                />
                            ))}
                        </div>
                    </CardHeader>

                    <CardContent className="p-6">
                        {/* Step 1: Basic Info & Product Details */}
                        {step === 1 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-primary" />
                                        Maklumat Produk
                                    </h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="workflowName" className="text-sm font-medium">
                                            Nama Workflow <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="workflowName"
                                            placeholder="cth: Promo Produk Kecantikan"
                                            value={formData.name}
                                            onChange={(e) => updateField('name', e.target.value)}
                                            className="mt-1 bg-slate-800/50"
                                        />
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

                                        {/* I2V Toggle */}
                                        <div className="mt-3 flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium">Guna Image-to-Video (I2V)</p>
                                                <p className="text-xs text-muted-foreground">Generate video dari gambar produk</p>
                                            </div>
                                            <button
                                                onClick={() => updateField('useI2V', !formData.useI2V)}
                                                className={`w-12 h-6 rounded-full transition-all ${formData.useI2V ? 'bg-purple-500' : 'bg-slate-700'}`}
                                            >
                                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${formData.useI2V ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* OpenAI API Key Section */}
                                    <div className="p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Key className="w-5 h-5 text-green-400" />
                                            <Label className="text-sm font-bold text-green-400">
                                                OpenAI API Key (Optional)
                                            </Label>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-3">
                                            Masukkan API key anda untuk auto-generate prompt yang lebih baik dengan AI
                                        </p>
                                        <div className="flex gap-2">
                                            <Input
                                                type="password"
                                                placeholder="sk-..."
                                                value={formData.openaiApiKey}
                                                onChange={(e) => updateField('openaiApiKey', e.target.value)}
                                                className="flex-1 bg-slate-800/50"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={saveApiKey}
                                                disabled={!formData.openaiApiKey}
                                                className="border-green-500/30 text-green-400"
                                            >
                                                Simpan
                                            </Button>
                                        </div>

                                        {/* Auto Generate Toggle */}
                                        <div className="mt-3 flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium flex items-center gap-1">
                                                    <Wand2 className="w-4 h-4" />
                                                    Auto-Generate Prompt
                                                </p>
                                                <p className="text-xs text-muted-foreground">AI akan buat prompt automatik</p>
                                            </div>
                                            <button
                                                onClick={() => updateField('autoGeneratePrompt', !formData.autoGeneratePrompt)}
                                                className={`w-12 h-6 rounded-full transition-all ${formData.autoGeneratePrompt ? 'bg-green-500' : 'bg-slate-700'}`}
                                                disabled={!formData.openaiApiKey}
                                            >
                                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${formData.autoGeneratePrompt ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Content Settings */}
                        {step === 2 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                        <Video className="w-5 h-5 text-primary" />
                                        Tetapan Konten
                                    </h3>
                                </div>

                                {/* Content Type */}
                                <div>
                                    <Label className="text-sm font-medium mb-3 block">Jenis Konten</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => updateField('contentType', 'video')}
                                            className={`p-4 rounded-xl border-2 transition-all ${formData.contentType === 'video'
                                                ? 'border-primary bg-primary/10'
                                                : 'border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            <Video className={`w-8 h-8 mx-auto mb-2 ${formData.contentType === 'video' ? 'text-primary' : 'text-muted-foreground'}`} />
                                            <p className="font-bold text-sm">Video</p>
                                            <p className="text-xs text-muted-foreground">AI-generated video</p>
                                        </button>
                                        <button
                                            onClick={() => updateField('contentType', 'image')}
                                            className={`p-4 rounded-xl border-2 transition-all ${formData.contentType === 'image'
                                                ? 'border-primary bg-primary/10'
                                                : 'border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            <Image className={`w-8 h-8 mx-auto mb-2 ${formData.contentType === 'image' ? 'text-primary' : 'text-muted-foreground'}`} />
                                            <p className="font-bold text-sm">Image</p>
                                            <p className="text-xs text-muted-foreground">AI-generated image</p>
                                        </button>
                                    </div>
                                </div>

                                {/* Aspect Ratio */}
                                <div>
                                    <Label className="text-sm font-medium mb-3 block">Format / Ratio</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'landscape', label: '16:9', desc: 'Landscape' },
                                            { id: 'portrait', label: '9:16', desc: 'Portrait/Reels' },
                                            { id: 'square', label: '1:1', desc: 'Square' },
                                        ].map(ratio => (
                                            <button
                                                key={ratio.id}
                                                onClick={() => updateField('aspectRatio', ratio.id)}
                                                className={`p-3 rounded-xl border-2 transition-all text-center ${formData.aspectRatio === ratio.id
                                                    ? 'border-primary bg-primary/10'
                                                    : 'border-slate-700 hover:border-slate-600'
                                                    }`}
                                            >
                                                <p className="font-bold text-sm">{ratio.label}</p>
                                                <p className="text-xs text-muted-foreground">{ratio.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Duration (for video) */}
                                {formData.contentType === 'video' && (
                                    <div>
                                        <Label className="text-sm font-medium mb-3 block">Durasi Video</Label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[5, 10, 15].map(dur => (
                                                <button
                                                    key={dur}
                                                    onClick={() => updateField('duration', dur)}
                                                    className={`p-3 rounded-xl border-2 transition-all ${formData.duration === dur
                                                        ? 'border-primary bg-primary/10'
                                                        : 'border-slate-700 hover:border-slate-600'
                                                        }`}
                                                >
                                                    <p className="font-bold text-lg">{dur}s</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Content Style */}
                                <div>
                                    <Label className="text-sm font-medium mb-3 block">Gaya Visual</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {contentStyles.map(style => (
                                            <button
                                                key={style.id}
                                                onClick={() => updateField('contentStyle', style.id)}
                                                className={`p-3 rounded-xl border-2 transition-all text-left ${formData.contentStyle === style.id
                                                    ? 'border-primary bg-primary/10'
                                                    : 'border-slate-700 hover:border-slate-600'
                                                    }`}
                                            >
                                                <p className="font-bold text-sm">{style.label}</p>
                                                <p className="text-xs text-muted-foreground">{style.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Schedule */}
                        {step === 3 && (
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
                                                {[0, 15, 30, 45].map(m => (
                                                    <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
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

                            {step < 4 ? (
                                <Button
                                    onClick={() => setStep(step + 1)}
                                    className="gap-2"
                                    disabled={
                                        (step === 1 && (!formData.name || !formData.productName || !formData.productDescription))
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
