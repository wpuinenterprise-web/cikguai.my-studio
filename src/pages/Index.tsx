import React, { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { AppView, UserProfile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import Navigation from '@/components/Navigation';
import SoraStudio from '@/components/SoraStudio';
import HistoryVault from '@/components/HistoryVault';
import AuthView from '@/components/AuthView';

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<AppView>(AppView.SORA_STUDIO);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
      } else if (data) {
        setProfile({
          id: data.id,
          username: data.username || '',
          email: data.email || '',
          is_approved: data.is_approved,
          videos_used: data.videos_used,
          images_used: data.images_used,
          video_limit: data.video_limit,
          image_limit: data.image_limit,
        });
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const handleAuthSuccess = () => {
    // Auth state change will handle the rest
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-neon-blue neon-glow mb-4 animate-pulse">
            <span className="text-3xl font-black text-primary-foreground">A</span>
          </div>
          <p className="text-muted-foreground text-sm">Memuatkan...</p>
        </div>
      </div>
    );
  }

  // Show auth view if not logged in
  if (!session || !profile) {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
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
