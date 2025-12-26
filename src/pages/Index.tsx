import React, { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { AppView, UserProfile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import Sidebar from '@/components/Sidebar';
import SoraStudio from '@/components/SoraStudio';
import HistoryVault from '@/components/HistoryVault';
import AdminDashboard from '@/components/AdminDashboard';
import AuthView from '@/components/AuthView';
import AnimatedBackground from '@/components/AnimatedBackground';
const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<AppView>(AppView.SORA_STUDIO);

  const logoUrl = "https://i.ibb.co/xqgH2MQ4/Untitled-design-18.png";

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

  const fetchProfile = async (userId: string, skipLoading = false) => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        if (!skipLoading) setLoading(false);
        return;
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      const isAdmin = !!roleData;

      if (profileData) {
        setProfile({
          id: profileData.id,
          username: profileData.username || '',
          email: profileData.email || '',
          is_approved: profileData.is_approved,
          is_admin: isAdmin,
          videos_used: profileData.videos_used,
          images_used: profileData.images_used,
          video_limit: profileData.video_limit,
          image_limit: profileData.image_limit,
        });
        
        // Set default view based on role - admin goes to dashboard
        if (isAdmin && !skipLoading) {
          setActiveView(AppView.ADMIN_DASHBOARD);
        }
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    } finally {
      if (!skipLoading) setLoading(false);
    }
  };

  // Refresh profile after video generation
  const handleProfileRefresh = async () => {
    if (user?.id) {
      await fetchProfile(user.id, true);
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

  const renderView = () => {
    switch (activeView) {
      case AppView.SORA_STUDIO:
        return <SoraStudio userProfile={profile!} onProfileRefresh={handleProfileRefresh} />;
      case AppView.HISTORY:
        return <HistoryVault userProfile={profile!} />;
      case AppView.ADMIN_DASHBOARD:
        return profile?.is_admin ? <AdminDashboard /> : <SoraStudio userProfile={profile!} onProfileRefresh={handleProfileRefresh} />;
      default:
        return <SoraStudio userProfile={profile!} onProfileRefresh={handleProfileRefresh} />;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="h-screen w-full bg-[#020617] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Memuatkan...</p>
        </div>
      </div>
    );
  }

  // Show auth view if not logged in
  if (!session || !profile) {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  const bakiCount = profile.is_admin ? 'UNLIMITED' : (profile.video_limit - profile.videos_used);
  const percentage = profile.is_admin ? 100 : Math.min(100, (Math.max(0, bakiCount as number) / (profile.video_limit || 1)) * 100);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
      <AnimatedBackground />
      <Sidebar
        activeView={activeView} 
        onViewChange={setActiveView} 
        userProfile={profile}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
        {/* Mobile & Tablet Header (< 768px) */}
        <header className="md:hidden flex flex-col bg-[#020617] border-b border-slate-800/50 z-20 shadow-2xl">
          <div className="flex items-center justify-between p-4 px-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 relative flex items-center justify-center">
                <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full animate-pulse"></div>
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain relative z-10 logo-glow-animate" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tighter text-white uppercase leading-none">azmeer</h1>
                <p className="text-[8px] font-bold text-cyan-500 tracking-[0.2em] uppercase opacity-80 leading-none">ai studio</p>
                <div className="mt-1 flex flex-col gap-1">
                  <div className="inline-flex items-center bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded-md shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                    <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest whitespace-nowrap">
                      BAKI: {bakiCount} VIDEO
                    </span>
                  </div>
                  {/* Progress bar for mobile visibility */}
                  {!profile.is_admin && (
                    <div className="w-20 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cyan-500 shadow-[0_0_5px_rgba(34,211,238,0.5)] transition-all duration-1000" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button 
              onClick={handleSignOut} 
              className="text-[9px] font-black text-rose-500 uppercase tracking-widest border border-rose-500/20 px-4 py-2 rounded-xl bg-rose-500/5 active:scale-95"
            >
              Exit
            </button>
          </div>

          <nav className="flex px-4 pb-3 gap-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveView(AppView.SORA_STUDIO)}
              className={`flex-1 min-w-[80px] py-3 rounded-xl transition-all border font-black text-[10px] uppercase tracking-widest ${
                activeView === AppView.SORA_STUDIO ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'bg-slate-900/50 border-slate-800 text-slate-500'
              }`}
            >
              Studio
            </button>
            <button 
              onClick={() => setActiveView(AppView.HISTORY)}
              className={`flex-1 min-w-[80px] py-3 rounded-xl transition-all border font-black text-[10px] uppercase tracking-widest ${
                activeView === AppView.HISTORY ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'bg-slate-900/50 border-slate-800 text-slate-500'
              }`}
            >
              Vault
            </button>
            {profile.is_admin && (
              <button 
                onClick={() => setActiveView(AppView.ADMIN_DASHBOARD)}
                className={`flex-1 min-w-[80px] py-3 rounded-xl transition-all border font-black text-[10px] uppercase tracking-widest ${
                  activeView === AppView.ADMIN_DASHBOARD ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'bg-slate-900/50 border-slate-800 text-slate-500'
                }`}
              >
                Admin
              </button>
            )}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default Index;
