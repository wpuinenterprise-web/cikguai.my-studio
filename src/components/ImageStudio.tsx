import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Upload, ImagePlus, Wand2, Loader2, Download, Sparkles, Layers, Square, RectangleHorizontal, RectangleVertical } from 'lucide-react';

interface ImageStudioProps {
    profile: {
        id: string;
        images_used: number;
        image_limit: number;
    } | null;
    onImageGenerated?: () => void;
}

type AspectRatio = '1:1' | '16:9' | '9:16';
type GenerationMode = 't2i' | 'i2i' | 'edit';

const ImageStudio: React.FC<ImageStudioProps> = ({ profile, onImageGenerated }) => {
    const [mode, setMode] = useState<GenerationMode>('t2i');
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const [secondImage, setSecondImage] = useState<string | null>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const secondFileInputRef = useRef<HTMLInputElement>(null);
    const lastGenerateTimeRef = useRef<number>(0); // Debounce to prevent double-clicks

    const hasReachedLimit = profile && profile.images_used >= profile.image_limit;
    const remainingImages = profile ? Math.max(0, profile.image_limit - profile.images_used) : 0;

    const handleFileUpload = async (file: File, isSecond = false) => {
        if (!profile) return;

        try {
            // Show local preview immediately
            const localPreviewUrl = URL.createObjectURL(file);
            if (isSecond) {
                setSecondImage(localPreviewUrl);
            } else {
                setReferenceImage(localPreviewUrl);
            }

            // Upload to Supabase Storage
            const fileName = `${profile.id}/${Date.now()}-${file.name}`;
            const { data, error } = await supabase.storage
                .from('reference-images')
                .upload(fileName, file);

            if (error) throw error;

            // Get public URL and update state
            const { data: publicUrl } = supabase.storage
                .from('reference-images')
                .getPublicUrl(fileName);

            if (isSecond) {
                setSecondImage(publicUrl.publicUrl);
            } else {
                setReferenceImage(publicUrl.publicUrl);
            }

            toast.success('Imej berjaya dimuat naik!');
        } catch (error: any) {
            toast.error('Gagal memuat naik imej: ' + error.message);
            console.error(error);
            // Clear the broken preview
            if (isSecond) {
                setSecondImage(null);
            } else {
                setReferenceImage(null);
            }
        }
    };

    const handleGenerate = async () => {
        if (!profile) {
            toast.error('Sila log masuk terlebih dahulu');
            return;
        }

        if (!prompt.trim()) {
            toast.error('Sila masukkan prompt');
            return;
        }

        if (hasReachedLimit) {
            toast.error('Had penjanaan imej telah dicapai');
            return;
        }

        if (mode === 'i2i' && !referenceImage) {
            toast.error('Sila muat naik imej rujukan');
            return;
        }

        if (mode === 'edit' && (!referenceImage || !secondImage)) {
            toast.error('Sila muat naik kedua-dua imej rujukan');
            return;
        }

        // Debounce: prevent double-clicks within 2 seconds
        const now = Date.now();
        if (now - lastGenerateTimeRef.current < 2000) {
            console.log('Debounce: ignoring rapid click');
            return;
        }
        lastGenerateTimeRef.current = now;

        setIsGenerating(true);
        setGeneratedImage(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Tidak dilog masuk');

            const response = await supabase.functions.invoke('generate-image', {
                body: {
                    prompt,
                    mode,
                    aspect_ratio: aspectRatio,
                    reference_image_url: referenceImage,
                    second_image_url: secondImage,
                },
            });

            if (response.error) throw response.error;

            if (response.data?.image_url) {
                setGeneratedImage(response.data.image_url);
                toast.success('Imej berjaya dijana!');
                onImageGenerated?.();
            } else {
                throw new Error(response.data?.error || 'Gagal menjana imej');
            }
        } catch (error: any) {
            console.error('Generation error:', error);
            toast.error(error.message || 'Gagal menjana imej');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = async () => {
        if (!generatedImage) return;

        try {
            // Try fetch-based download first
            const response = await fetch(generatedImage, { mode: 'cors' });
            if (!response.ok) throw new Error('Fetch failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `azmeer-image-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Imej dimuat turun!');
        } catch (error) {
            // CORS issue - open in new tab instead
            console.log('Direct download failed, opening in new tab');
            window.open(generatedImage, '_blank');
            toast.success('Imej dibuka dalam tab baru - tekan lama untuk save');
        }
    };

    const aspectRatioOptions = [
        { value: '1:1' as AspectRatio, label: '1:1', icon: Square },
        { value: '16:9' as AspectRatio, label: '16:9', icon: RectangleHorizontal },
        { value: '9:16' as AspectRatio, label: '9:16', icon: RectangleVertical },
    ];

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-purple-500" />
                        Image Studio
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Penjana imej AI menggunakan Gemini
                    </p>
                </div>
                <Badge variant="outline" className={`${remainingImages === 0 ? 'border-destructive text-destructive' : 'border-purple-500 text-purple-500'}`}>
                    {profile?.images_used || 0} / {profile?.image_limit || 0} imej digunakan
                </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Controls */}
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle className="text-lg">Tetapan Penjanaan</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Mode Tabs */}
                        <Tabs value={mode} onValueChange={(v) => setMode(v as GenerationMode)}>
                            <TabsList className="grid grid-cols-3 w-full">
                                <TabsTrigger value="t2i" className="flex items-center gap-1">
                                    <Wand2 className="w-4 h-4" />
                                    <span className="hidden sm:inline">T2I</span>
                                </TabsTrigger>
                                <TabsTrigger value="i2i" className="flex items-center gap-1">
                                    <ImagePlus className="w-4 h-4" />
                                    <span className="hidden sm:inline">I2I</span>
                                </TabsTrigger>
                                <TabsTrigger value="edit" className="flex items-center gap-1">
                                    <Layers className="w-4 h-4" />
                                    <span className="hidden sm:inline">Edit</span>
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="t2i" className="mt-4">
                                <p className="text-sm text-muted-foreground mb-2">
                                    Teks ke Imej - Jana imej dari prompt teks
                                </p>
                            </TabsContent>

                            <TabsContent value="i2i" className="mt-4 space-y-3">
                                <p className="text-sm text-muted-foreground mb-2">
                                    Imej ke Imej - Edit imej sedia ada
                                </p>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                                >
                                    {referenceImage ? (
                                        <img src={referenceImage} alt="Reference" className="max-h-32 mx-auto rounded" />
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                                            <p className="text-sm text-muted-foreground">Klik untuk muat naik imej rujukan</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                />
                            </TabsContent>

                            <TabsContent value="edit" className="mt-4 space-y-3">
                                <p className="text-sm text-muted-foreground mb-2">
                                    Edit imej dengan AI menggunakan 2 gambar rujukan
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-purple-500 transition-colors"
                                    >
                                        {referenceImage ? (
                                            <img src={referenceImage} alt="Reference 1" className="max-h-24 mx-auto rounded" />
                                        ) : (
                                            <>
                                                <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                                                <p className="text-xs text-muted-foreground">Imej Rujukan 1</p>
                                            </>
                                        )}
                                    </div>
                                    <div
                                        onClick={() => secondFileInputRef.current?.click()}
                                        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-purple-500 transition-colors"
                                    >
                                        {secondImage ? (
                                            <img src={secondImage} alt="Reference 2" className="max-h-24 mx-auto rounded" />
                                        ) : (
                                            <>
                                                <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                                                <p className="text-xs text-muted-foreground">Imej Rujukan 2</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                />
                                <input
                                    ref={secondFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], true)}
                                />
                            </TabsContent>
                        </Tabs>

                        {/* Aspect Ratio */}
                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">Nisbah Aspek</label>
                            <div className="flex gap-2">
                                {aspectRatioOptions.map((option) => (
                                    <Button
                                        key={option.value}
                                        variant={aspectRatio === option.value ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setAspectRatio(option.value)}
                                        className={aspectRatio === option.value ? 'bg-purple-600 hover:bg-purple-700' : ''}
                                    >
                                        <option.icon className="w-4 h-4 mr-1" />
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Prompt */}
                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">Prompt</label>
                            <Textarea
                                placeholder={
                                    mode === 't2i'
                                        ? "Terangkan imej yang anda ingin jana..."
                                        : mode === 'i2i'
                                            ? "Terangkan perubahan yang anda mahukan..."
                                            : "Terangkan bagaimana anda mahu gabungkan imej..."
                                }
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="min-h-[100px] bg-secondary/50 border-border"
                            />
                        </div>

                        {/* Generate Button */}
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating || hasReachedLimit || !prompt.trim()}
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Menjana...
                                </>
                            ) : hasReachedLimit ? (
                                'Had Dicapai'
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Jana Imej
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Result */}
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle className="text-lg">Hasil</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="aspect-square rounded-lg bg-secondary/50 flex items-center justify-center overflow-hidden">
                            {isGenerating ? (
                                <div className="text-center">
                                    <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-3" />
                                    <p className="text-muted-foreground">Menjana imej...</p>
                                </div>
                            ) : generatedImage ? (
                                <img
                                    src={generatedImage}
                                    alt="Generated"
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                <div className="text-center p-8">
                                    <Sparkles className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                                    <p className="text-muted-foreground">
                                        Imej yang dijana akan dipaparkan di sini
                                    </p>
                                </div>
                            )}
                        </div>

                        {generatedImage && (
                            <Button
                                onClick={handleDownload}
                                variant="outline"
                                className="w-full mt-4"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Muat Turun Imej
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ImageStudio;
