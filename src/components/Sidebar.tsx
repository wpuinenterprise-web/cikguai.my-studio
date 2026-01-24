import React from 'react';
import { AppView, UserProfile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  userProfile: UserProfile;
  onSignOut: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, userProfile, onSignOut }) => {
  const { language, setLanguage, t } = useLanguage();

  const navItems = [
    { view: AppView.SORA_STUDIO, label: 'SORA 2.0', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { view: AppView.SORA_PRO_STUDIO, label: 'SORA PRO ✨', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    { view: AppView.VEO_STUDIO, label: 'VEO 3 🎬', icon: 'M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-4 12v4m-4-4h8a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { view: AppView.HISTORY, label: t.vault.toUpperCase(), icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { view: AppView.IMAGE_STUDIO, label: 'IMAGE STUDIO', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { view: AppView.IMAGE_HISTORY, label: 'GALERI IMEJ', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    // AUTO POST available for all approved users
    { view: AppView.AUTOMATION, label: 'AUTO POST', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ];

  // Tambah Admin Control jika user adalah admin
  if (userProfile?.is_admin) {
    navItems.push({
      view: AppView.ADMIN_DASHBOARD,
      label: t.admin.toUpperCase(),
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
    <aside className="hidden md:flex w-64 lg:w-72 bg-background border-r border-border/40 flex-col h-full shrink-0">
      <div className="p-6 lg:p-8 flex-1 overflow-y-auto custom-scrollbar">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 relative flex items-center justify-center">
            <div className="absolute inset-0 bg-primary/15 blur-xl rounded-full animate-pulse-glow"></div>
            <img
              src={logoUrl}
              alt="Azmeer AI Logo"
              className="w-full h-full object-contain relative z-10 logo-glow-animate"
            />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight text-foreground uppercase leading-none">azmeer</h1>
            <p className="text-[10px] font-semibold text-primary tracking-[0.15em] uppercase opacity-80">{t.aiStudio.toLowerCase()}</p>
          </div>
        </div>

        {/* Language Toggle */}
        <div className="mb-6">
          <button
            onClick={() => setLanguage(language === 'ms' ? 'en' : 'ms')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 hover:border-primary/30 transition-all duration-300"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {language === 'ms' ? 'Bahasa Melayu' : 'English'}
              </span>
            </div>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg">
              {language === 'ms' ? 'EN' : 'BM'}
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
                activeView === item.view
                  ? "bg-primary/10 text-primary ring-1 ring-primary/20 shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              <span className="text-[11px] font-semibold tracking-wide uppercase">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Footer Card */}
      <div className="p-6 lg:p-8 space-y-3">
        <div className="p-4 rounded-2xl glass-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t.accessId}</span>
            <span className="text-[10px] font-bold text-foreground uppercase">{userProfile?.username}</span>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">{t.remaining}</span>
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">{bakiVideo}</span>
          </div>

          <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary to-accent h-full transition-all duration-700 rounded-full"
              style={{ width: userProfile?.is_admin ? '100%' : `${Math.min(100, (Math.max(0, (userProfile?.video_limit || 1) - (userProfile?.videos_used || 0)) / (userProfile?.video_limit || 1)) * 100)}%` }}
            />
          </div>

          <p className="mt-2 text-[9px] text-muted-foreground font-medium text-center">
            {userProfile?.videos_used} {t.used} / {userProfile?.is_admin ? '∞' : userProfile?.video_limit} {t.total}
          </p>
        </div>

        {/* Share Referral Link */}
        <button
          onClick={() => {
            const refCode = userProfile?.referral_code || userProfile?.id?.slice(0, 8) || 'NOCODE';
            const link = `${window.location.origin}/?ref=${refCode}`;
            navigator.clipboard.writeText(link);
            // Show a brief visual feedback
            const btn = document.getElementById('share-link-btn');
            if (btn) {
              btn.textContent = '✓ Link Disalin!';
              setTimeout(() => { btn.textContent = '🔗 KONGSI LINK AFFILIATE'; }, 2000);
            }
          }}
          id="share-link-btn"
          className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-[10px] font-bold text-green-400 uppercase tracking-wider hover:from-green-500/30 hover:to-emerald-500/30 transition-all duration-300 flex items-center justify-center gap-2 group"
        >
          🔗 KONGSI LINK AFFILIATE
        </button>

        <button
          onClick={handleSignOut}
          className="w-full py-3 rounded-xl bg-secondary/50 border border-border/50 text-[10px] font-bold text-destructive uppercase tracking-wider hover:bg-destructive/10 hover:border-destructive/30 transition-all duration-300 flex items-center justify-center gap-2 group"
        >
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t.signOut}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
