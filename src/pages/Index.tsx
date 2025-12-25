import React, { useState } from 'react';
import { AppView } from '@/types';
import Navigation from '@/components/Navigation';
import SoraStudio from '@/components/SoraStudio';
import HistoryVault from '@/components/HistoryVault';
import AuthView from '@/components/AuthView';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  videos_used: number;
  video_limit: number;
  images_used: number;
  image_limit: number;
  is_approved: boolean;
}

const Index = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeView, setActiveView] = useState<AppView>(AppView.SORA_STUDIO);

  const handleAuth = (userProfile: UserProfile) => {
    setProfile(userProfile);
  };

  const handleSignOut = () => {
    setProfile(null);
  };

  // Show auth view if not logged in
  if (!profile) {
    return <AuthView onAuth={handleAuth} />;
  }

  return (
    <div className="min-h-screen bg-background custom-scrollbar">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--primary) / 0.3) 1px, transparent 1px),
                              linear-gradient(90deg, hsl(var(--primary) / 0.3) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />
        
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neon-blue/5 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <Navigation 
        activeView={activeView} 
        onViewChange={setActiveView} 
        userProfile={profile}
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <main className="relative z-10">
        {activeView === AppView.SORA_STUDIO && <SoraStudio userProfile={profile} />}
        {activeView === AppView.HISTORY && <HistoryVault />}
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center border-t border-border/30">
        <p className="text-xs text-muted-foreground">
          <span className="text-primary font-semibold">Azmeer AI Studio</span> • Powered by Sora 2.0
        </p>
      </footer>
    </div>
  );
};

export default Index;
