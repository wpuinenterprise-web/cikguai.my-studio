import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Download, Trash2, Loader2, Image as ImageIcon, Filter } from 'lucide-react';

interface ImageGeneration {
    id: string;
    prompt: string;
    mode: 't2i' | 'i2i' | 'merge';
    aspect_ratio: string;
    image_url: string | null;
    status: string;
    created_at: string;
}

interface ImageHistoryProps {
    userId: string;
}

const ImageHistory: React.FC<ImageHistoryProps> = ({ userId }) => {
    const [images, setImages] = useState<ImageGeneration[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 't2i' | 'i2i' | 'merge'>('all');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchImages = async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('image_generations')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (filter !== 'all') {
                query = query.eq('mode', filter);
            }

            const { data, error } = await query;

            if (error) throw error;
            setImages((data as ImageGeneration[]) || []);
        } catch (error) {
            console.error('Error fetching images:', error);
            toast.error('Gagal memuatkan sejarah imej');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (userId) {
            fetchImages();
        }
    }, [userId, filter]);

    const handleDownload = async (imageUrl: string, prompt: string) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `azmeer-${prompt.slice(0, 20).replace(/\s+/g, '-')}-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Imej dimuat turun!');
        } catch (error) {
            toast.error('Gagal memuat turun imej');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            setDeletingId(id);
            const { error } = await supabase
                .from('image_generations')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setImages(images.filter(img => img.id !== id));
            toast.success('Imej berjaya dipadam');
        } catch (error) {
            toast.error('Gagal memadam imej');
        } finally {
            setDeletingId(null);
        }
    };

    const getModeLabel = (mode: string) => {
        switch (mode) {
            case 't2i': return 'Teks ke Imej';
            case 'i2i': return 'Imej ke Imej';
            case 'merge': return 'Gabung';
            default: return mode;
        }
    };

    const getModeColor = (mode: string) => {
        switch (mode) {
            case 't2i': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            case 'i2i': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'merge': return 'bg-green-500/20 text-green-400 border-green-500/30';
            default: return '';
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ImageIcon className="w-6 h-6 text-purple-500" />
                        Sejarah Imej
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {images.length} imej telah dijana
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    {(['all', 't2i', 'i2i', 'merge'] as const).map((f) => (
                        <Button
                            key={f}
                            variant={filter === f ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter(f)}
                            className={filter === f ? 'bg-purple-600 hover:bg-purple-700' : ''}
                        >
                            {f === 'all' ? 'Semua' : f === 't2i' ? 'T2I' : f === 'i2i' ? 'I2I' : 'Gabung'}
                        </Button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                </div>
            ) : images.length === 0 ? (
                <Card className="glass-card">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <ImageIcon className="w-16 h-16 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground text-center">
                            {filter === 'all'
                                ? 'Tiada imej telah dijana lagi'
                                : `Tiada imej ${getModeLabel(filter)} dijumpai`}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {images.map((image) => (
                        <Card key={image.id} className="glass-card overflow-hidden group">
                            <div className="aspect-square relative bg-secondary/50">
                                {image.status === 'completed' && image.image_url ? (
                                    <img
                                        src={image.image_url}
                                        alt={image.prompt}
                                        className="w-full h-full object-cover"
                                    />
                                ) : image.status === 'processing' ? (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <span className="text-destructive text-sm">Gagal</span>
                                    </div>
                                )}

                                {/* Overlay buttons */}
                                {image.status === 'completed' && image.image_url && (
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleDownload(image.image_url!, image.prompt)}
                                        >
                                            <Download className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => handleDelete(image.id)}
                                            disabled={deletingId === image.id}
                                        >
                                            {deletingId === image.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <CardContent className="p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className={getModeColor(image.mode)}>
                                        {getModeLabel(image.mode)}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                        {image.aspect_ratio}
                                    </Badge>
                                </div>
                                <p className="text-sm text-foreground line-clamp-2" title={image.prompt}>
                                    {image.prompt}
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                    {new Date(image.created_at).toLocaleString('ms-MY')}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ImageHistory;
