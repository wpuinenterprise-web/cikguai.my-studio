import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AuthViewProps {
  onAuthSuccess: () => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const redirectUrl = `${window.location.origin}/`;
        
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              username: formData.username || formData.email.split('@')[0],
            },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: 'Email sudah didaftar',
              description: 'Sila gunakan email lain atau log masuk.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Ralat pendaftaran',
              description: error.message,
              variant: 'destructive',
            });
          }
          return;
        }

        if (data.user && !data.session) {
          toast({
            title: 'Semak email anda',
            description: 'Kami telah menghantar link pengesahan ke email anda.',
          });
        } else if (data.session) {
          toast({
            title: 'Pendaftaran berjaya!',
            description: 'Selamat datang ke Azmeer AI Studio.',
          });
          onAuthSuccess();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: 'Log masuk gagal',
              description: 'Email atau kata laluan tidak sah.',
              variant: 'destructive',
            });
          } else if (error.message.includes('Email not confirmed')) {
            toast({
              title: 'Email belum disahkan',
              description: 'Sila semak email anda untuk link pengesahan.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Ralat log masuk',
              description: error.message,
              variant: 'destructive',
            });
          }
          return;
        }

        if (data.session) {
          toast({
            title: 'Log masuk berjaya!',
            description: 'Selamat kembali.',
          });
          onAuthSuccess();
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      toast({
        title: 'Ralat',
        description: 'Sesuatu telah berlaku. Sila cuba lagi.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
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
                {tab === 'login' ? 'Log Masuk' : 'Daftar Akaun'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                  Nama Pengguna
                </label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Masukkan nama pengguna"
                  className="input-glow"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contoh@email.com"
                required
                className="input-glow"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                Kata Laluan
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                required
                minLength={6}
                className="input-glow"
              />
            </div>

            <Button
              type="submit"
              className="w-full mt-6 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Memproses...</span>
                </div>
              ) : (
                <span>{mode === 'login' ? 'Log Masuk' : 'Daftar Sekarang'}</span>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            {mode === 'login' ? 'Belum ada akaun? ' : 'Sudah ada akaun? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-primary hover:underline font-semibold"
            >
              {mode === 'login' ? 'Daftar sekarang' : 'Log masuk'}
            </button>
          </p>
        </div>

        {/* Info */}
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          Powered by Supabase Auth
        </p>
      </div>
    </div>
  );
};

export default AuthView;
