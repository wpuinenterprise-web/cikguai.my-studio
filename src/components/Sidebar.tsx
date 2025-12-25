import React from 'react';
import { AppView, UserProfile } from '@/types';
import { supabase } from '@/integrations/supabase/client';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  userProfile: UserProfile;
  onSignOut: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, userProfile, onSignOut }) => {
  const navItems = [
    { view: AppView.SORA_STUDIO, label: 'SORA 2.0', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { view: AppView.HISTORY, label: 'HISTORY', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  // Tambah Admin Control jika user adalah admin
  if (userProfile?.is_admin) {
    navItems.push({ 
      view: AppView.ADMIN_DASHBOARD, 
      label: 'ADMIN CONTROL', 
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' 
    });
  }

  const logoUrl = "https://i.ibb.co/xqgH2MQ4/Untitled-design-18.png";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onSignOut();
  };

  const bakiVideo = userProfile?.is_admin ? 'UNLIMITED' : ((userProfile?.video_limit || 0) - (userProfile?.videos_used || 0));

  return (
    <aside className="hidden md:flex w-72 bg-[#020617] border-r border-slate-800/50 flex-col h-full shrink-0">
      <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 relative flex items-center justify-center">
            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse"></div>
            <img 
              src={logoUrl} 
              alt="Azmeer AI Logo" 
              className="w-full h-full object-contain relative z-10 logo-glow-animate"
            />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter text-white uppercase leading-none mb-1">azmeer</h1>
            <p className="text-[10px] font-bold text-cyan-500 tracking-[0.2em] uppercase opacity-80 leading-none">ai studio</p>
          </div>
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 group ${
                activeView === item.view 
                  ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]' 
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
              }`}
            >
              <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className="text-[11px] font-bold tracking-[0.1em] uppercase">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="p-8 space-y-4">
        <div className="p-5 rounded-3xl bg-slate-900/40 border border-slate-800/60 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Akses ID</span>
            <span className="text-[9px] font-black text-white uppercase">{userProfile?.username}</span>
          </div>
          <div className="text-[10px] text-cyan-400 font-black uppercase tracking-widest mb-3 flex items-center justify-between">
            <span>Baki Video</span>
            <span className="bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">{bakiVideo}</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-cyan-500 h-full transition-all duration-1000 shadow-[0_0_10px_rgba(34,211,238,0.5)]" 
              style={{ width: userProfile?.is_admin ? '100%' : `${Math.min(100, (Math.max(0, (userProfile?.video_limit || 1) - (userProfile?.videos_used || 0)) / (userProfile?.video_limit || 1)) * 100)}%` }}
            ></div>
          </div>
          <div className="mt-2 text-[8px] text-slate-600 font-bold uppercase tracking-widest text-center">
            {userProfile?.videos_used} Guna / {userProfile?.is_admin ? '∞' : userProfile?.video_limit} Total
          </div>
        </div>

        <button 
          onClick={handleSignOut}
          className="w-full py-4 rounded-2xl bg-slate-900 border border-slate-800 text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-500/10 transition-all flex items-center justify-center gap-2 group"
        >
          <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
