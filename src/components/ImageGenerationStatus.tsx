import React, { useState, useEffect } from 'react';

interface ImageGenerationStatusProps {
    isGenerating: boolean;
    onComplete?: () => void;
}

const ImageGenerationStatus: React.FC<ImageGenerationStatusProps> = ({ isGenerating, onComplete }) => {
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isGenerating) {
            setVisible(true);
            setProgress(0);

            // Simulate progress - image generation typically takes 30-60 seconds
            const progressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 95) return prev; // Cap at 95% until complete
                    // Slow down as we get higher
                    const increment = prev < 30 ? 3 : prev < 60 ? 2 : prev < 80 ? 1 : 0.5;
                    return Math.min(95, prev + increment);
                });
            }, 1000);

            return () => clearInterval(progressInterval);
        } else if (visible && progress > 0) {
            // Complete the progress bar
            setProgress(100);
            setTimeout(() => {
                setVisible(false);
                setProgress(0);
                onComplete?.();
            }, 1500);
        }
    }, [isGenerating]);

    if (!visible) return null;

    return (
        <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-fade-in">
            <div className="bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 shadow-2xl shadow-purple-500/10">
                <div className="flex items-center gap-3 mb-3">
                    {progress < 100 ? (
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    )}
                    <div className="flex-1">
                        <p className="text-sm font-bold text-white">
                            {progress < 100 ? 'Menjana Imej...' : 'Imej Siap! ✨'}
                        </p>
                        <p className="text-xs text-slate-400">
                            {progress < 100 ? 'Sila tunggu, proses sedang berjalan' : 'Lihat di galeri atau studio'}
                        </p>
                    </div>
                    <span className="text-lg font-black text-purple-400">
                        {Math.round(progress)}%
                    </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${progress < 100
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                                : 'bg-green-500'
                            }`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

export default ImageGenerationStatus;
