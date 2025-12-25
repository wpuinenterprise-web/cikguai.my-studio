import React from 'react';
import { cn } from '@/lib/utils';

interface HistoryItem {
  id: string;
  prompt: string;
  status: 'processing' | 'completed' | 'failed';
  type: 'video';
  thumbnail: string | null;
  duration: number;
  created_at: string;
}

const mockHistory: HistoryItem[] = [
  {
    id: '1',
    prompt: 'A cinematic drone shot flying over misty mountains at sunrise',
    status: 'completed',
    type: 'video',
    thumbnail: null,
    duration: 10,
    created_at: '2024-12-25T10:30:00Z',
  },
  {
    id: '2',
    prompt: 'Abstract geometric shapes morphing and flowing in neon colors',
    status: 'completed',
    type: 'video',
    thumbnail: null,
    duration: 15,
    created_at: '2024-12-24T15:20:00Z',
  },
  {
    id: '3',
    prompt: 'A futuristic city at night with flying cars and holographic billboards',
    status: 'processing',
    type: 'video',
    thumbnail: null,
    duration: 10,
    created_at: '2024-12-25T12:00:00Z',
  },
];

const HistoryVault: React.FC = () => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
            ARCHIVE <span className="text-primary neon-text">VAULT</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl">
            Your generated masterpieces, preserved and ready for download.
          </p>
        </div>

        {/* History Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockHistory.map((item, index) => (
            <div
              key={item.id}
              className="glass-panel-elevated overflow-hidden group animate-fade-in hover:border-primary/30 transition-all duration-300"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-background/50 relative overflow-hidden">
                {item.status === 'processing' ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-neon-blue/10">
                    <svg className="w-12 h-12 text-primary/40" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
                
                {/* Status Badge */}
                <div className={cn(
                  "absolute top-3 right-3 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                  item.status === 'completed' && "bg-primary/20 text-primary border border-primary/30",
                  item.status === 'processing' && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                  item.status === 'failed' && "bg-destructive/20 text-destructive border border-destructive/30"
                )}>
                  {item.status}
                </div>

                {/* Duration */}
                <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-background/80 backdrop-blur-sm text-xs font-mono text-foreground">
                  {item.duration}s
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              {/* Content */}
              <div className="p-4">
                <p className="text-sm text-foreground line-clamp-2 mb-2">{item.prompt}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
                  {item.status === 'completed' && (
                    <button className="text-xs text-primary hover:text-primary/80 font-semibold uppercase tracking-wider transition-colors">
                      Download
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {mockHistory.length === 0 && (
          <div className="glass-panel-elevated p-12 text-center animate-fade-in">
            <svg className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-bold text-foreground mb-2">Vault is Empty</h3>
            <p className="text-muted-foreground text-sm">Your generated videos will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryVault;
