import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthViewProps {
  onAuthSuccess: () => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const logoUrl = "https://i.ibb.co/xqgH2MQ4/Untitled-design-18.png";

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setError('Email atau kata laluan tidak sah. Jika akaun anda telah dipadam, sila hubungi admin.');
          } else if (error.message.includes('Email not confirmed')) {
            setError('Email belum disahkan. Sila semak email anda.');
          } else if (error.message.includes('User not found')) {
            setError('Akaun tidak dijumpai. Akaun anda mungkin telah dipadam oleh admin. Sila hubungi admin untuk mendaftar semula.');
          } else {
            setError(error.message);
          }
          return;
        }

        if (data.session) {
          // Check if profile exists (user might be deleted but auth still exists briefly)
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, is_approved')
            .eq('id', data.session.user.id)
            .maybeSingle();

          if (profileError || !profileData) {
            // Profile doesn't exist - user was deleted by admin
            await supabase.auth.signOut();
            setError('Akaun anda telah dipadam oleh admin. Sila hubungi admin untuk mendaftar semula.');
            return;
          }

          toast({
            title: 'Log masuk berjaya!',
            description: 'Selamat kembali.',
          });
          onAuthSuccess();
        }
      } else {
        const redirectUrl = `${window.location.origin}/`;
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              username: username || email.split('@')[0],
            },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            setError('Email sudah didaftar. Sila guna email lain atau log masuk.');
          } else {
            setError(error.message);
          }
          return;
        }

        if (data.user && !data.session) {
          toast({
            title: 'Pendaftaran berjaya!',
            description: 'Sila semak email anda untuk pengesahan.',
          });
          setIsLogin(true);
          setEmail('');
          setPassword('');
          setUsername('');
        } else if (data.session) {
          toast({
            title: 'Pendaftaran berjaya!',
            description: 'Selamat datang ke Azmeer AI Studio.',
          });
          onAuthSuccess();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Sesuatu telah berlaku. Sila cuba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] p-6 relative overflow-hidden">
      {/* Background animated effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-cyan-500/5 rounded-full animate-spin" style={{ animationDuration: '30s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-purple-500/5 rounded-full animate-spin" style={{ animationDuration: '20s', animationDirection: 'reverse' }}></div>
      </div>

      <div className="max-w-md w-full bg-[#0f172a]/80 backdrop-blur-2xl border border-slate-700/50 rounded-[2.5rem] p-10 shadow-2xl animate-fade-in relative z-10">
        {/* Glow effect behind card */}
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-purple-500/10 to-cyan-500/20 rounded-[2.5rem] blur-xl opacity-50 -z-10"></div>
        
        <div className="flex flex-col items-center mb-10">
          {/* Larger logo with enhanced glow */}
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-cyan-500/30 blur-2xl rounded-full animate-pulse scale-150"></div>
            <img src={logoUrl} alt="Azmeer AI Studio Logo" className="w-24 h-24 relative z-10 logo-glow-animate drop-shadow-[0_0_25px_rgba(34,211,238,0.5)]" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none animate-fade-in" style={{ animationDelay: '0.1s' }}>
            {isLogin ? 'Selamat Kembali!' : 'Jom Daftar!'}
          </h2>
          <p className="text-slate-400 text-xs font-medium mt-3 text-center animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {isLogin ? 'Masuk ke studio AI anda' : 'Cipta akaun baru dalam masa 30 saat'}
          </p>
          <div className="flex items-center gap-2 mt-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
            <p className="text-cyan-500 text-[10px] font-bold uppercase tracking-[0.2em]">
              Azmeer AI Studio
            </p>
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
          </div>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-rose-400 text-xs font-medium text-center animate-fade-in">
              ⚠️ {error}
            </div>
          )}

          {!isLogin && (
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <label className="text-xs font-semibold text-slate-400 ml-1 flex items-center gap-2">
                <span>👤</span> Nama Pengguna
              </label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl py-4 px-5 text-sm text-white outline-none focus:border-cyan-500/50 focus:bg-slate-900/50 focus:shadow-[0_0_20px_rgba(34,211,238,0.1)] transition-all duration-300 placeholder:text-slate-600"
                placeholder="Contoh: Ali"
              />
            </div>
          )}

          <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <label className="text-xs font-semibold text-slate-400 ml-1 flex items-center gap-2">
              <span>📧</span> Alamat Email
            </label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl py-4 px-5 text-sm text-white outline-none focus:border-cyan-500/50 focus:bg-slate-900/50 focus:shadow-[0_0_20px_rgba(34,211,238,0.1)] transition-all duration-300 placeholder:text-slate-600"
              placeholder="contoh@email.com"
              required
            />
          </div>

          <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <label className="text-xs font-semibold text-slate-400 ml-1 flex items-center gap-2">
              <span>🔒</span> Kata Laluan
            </label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl py-4 px-5 text-sm text-white outline-none focus:border-cyan-500/50 focus:bg-slate-900/50 focus:shadow-[0_0_20px_rgba(34,211,238,0.1)] transition-all duration-300 placeholder:text-slate-600"
              placeholder="Minimum 6 aksara"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 py-5 rounded-2xl font-black text-sm uppercase tracking-wide transition-all duration-300 shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed animate-fade-in group"
            style={{ animationDelay: '0.4s' }}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                {isLogin ? '🚀 Masuk Sekarang' : '✨ Daftar Percuma'}
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-sm font-medium text-slate-400 hover:text-cyan-400 transition-colors duration-300"
          >
            {isLogin ? (
              <>Belum ada akaun? <span className="text-cyan-400 font-bold">Daftar sini!</span></>
            ) : (
              <>Dah ada akaun? <span className="text-cyan-400 font-bold">Log masuk!</span></>
            )}
          </button>
        </div>

        {/* Footer text */}
        <div className="mt-8 pt-6 border-t border-slate-800/50 text-center animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <p className="text-slate-600 text-[10px]">
            Dengan mendaftar, anda bersetuju dengan terma penggunaan kami
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthView;
