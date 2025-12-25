import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuthViewProps {
  onAuth: (profile: { id: string; username: string; email: string; videos_used: number; video_limit: number; images_used: number; image_limit: number; is_approved: boolean }) => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onAuth }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate auth
    setTimeout(() => {
      onAuth({
        id: '1',
        username: formData.username || 'User',
        email: formData.email,
        videos_used: 0,
        video_limit: 10,
        images_used: 0,
        image_limit: 50,
        is_approved: true,
      });
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-blue/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-neon-blue neon-glow mb-4">
            <span className="text-3xl font-black text-primary-foreground">A</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">AZMEER AI STUDIO</h1>
          <p className="text-muted-foreground text-sm mt-1">State-of-the-art video synthesis</p>
        </div>

        {/* Auth Card */}
        <div className="glass-panel-elevated p-6">
          {/* Tabs */}
          <div className="flex mb-6 p-1 bg-secondary/50 rounded-xl">
            {(['login', 'signup'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${
                  mode === tab
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                  Username
                </label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter your username"
                  required={mode === 'signup'}
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                Email Address
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                Password
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>

            <Button
              type="submit"
              variant="neon"
              size="lg"
              className="w-full mt-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-primary hover:underline font-semibold"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* Demo Notice */}
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          This is a UI demo. Backend requires Lovable Cloud.
        </p>
      </div>
    </div>
  );
};

export default AuthView;
