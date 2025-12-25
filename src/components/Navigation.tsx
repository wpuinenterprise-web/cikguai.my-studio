import React from 'react';
import { cn } from '@/lib/utils';
import { AppView } from '@/types';

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ReactNode;
}

interface NavigationProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  userProfile: { username: string } | null;
  onSignOut: () => void;
}

const VideoIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const HistoryIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const Navigation: React.FC<NavigationProps> = ({ activeView, onViewChange, userProfile, onSignOut }) => {
  const navItems: NavItem[] = [
    { view: AppView.SORA_STUDIO, label: 'Studio', icon: <VideoIcon /> },
    { view: AppView.HISTORY, label: 'Vault', icon: <HistoryIcon /> },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel-elevated border-b border-border/30 safe-top">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center neon-glow">
              <span className="text-lg sm:text-xl font-display font-bold text-primary-foreground">A</span>
            </div>
            <div className="hidden xs:block">
              <h1 className="text-base sm:text-lg font-display font-bold tracking-tight text-foreground">AZMEER</h1>
              <p className="text-[9px] sm:text-[10px] font-medium text-muted-foreground tracking-wider uppercase -mt-0.5">AI Studio</p>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.view}
                onClick={() => onViewChange(item.view)}
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-all duration-200",
                  activeView === item.view
                    ? "bg-primary/15 text-primary border border-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>

          {/* User Section */}
          <div className="flex items-center gap-2 sm:gap-3">
            {userProfile && (
              <>
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-semibold text-foreground">{userProfile.username}</span>
                  <span className="text-[9px] text-primary uppercase tracking-wider font-medium">Active</span>
                </div>
                <button
                  onClick={onSignOut}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                  title="Sign Out"
                >
                  <LogoutIcon />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
