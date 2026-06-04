// Login.tsx
// Sleek premium login component with glassmorphism card and quick Demo Mode button

'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, Key, Mail, Sparkles } from 'lucide-react';

export default function Login() {
  const { signInWithPassword, signUpWithPassword, signInWithOtp, isDemo, lockedError, setLockedError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setMessage(null);
    setLockedError(null);

    try {
      if (isSignUp) {
        const { error } = await signUpWithPassword(email, password);
        if (error) throw error;
        setMessage({ text: 'Account created successfully! Logging you in...', type: 'success' });
      } else {
        const { error } = await signInWithPassword(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Authentication failed. Please check details.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setLoading(true);
    setMessage(null);
    setLockedError(null);
    try {
      const { error } = await signInWithOtp('demo@aurawealth.io');
      if (error) throw error;
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to enter Demo Mode.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glowing blurred circles */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md glass-card p-8 border border-white/10 relative z-10 glow-indigo">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-4">
            <TrendingUp size={32} />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-white mb-2">
            AURA<span className="text-indigo-400">WEALTH</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Premium Portfolio Modeling & Optimization
          </p>
        </div>

        {lockedError && (
          <div className="p-4 rounded-xl text-sm mb-6 border bg-red-500/10 border-red-500/20 text-red-400 font-semibold">
            {lockedError}
          </div>
        )}

        {message && (
          <div className={`p-4 rounded-xl text-sm mb-6 border ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2" htmlFor="email">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Mail size={18} />
              </span>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Key size={18} />
              </span>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-medium py-3 rounded-xl transition shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Processing...' : isSignUp ? 'Create Premium Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="hover:text-indigo-400 transition underline decoration-indigo-500/50 underline-offset-4"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/5"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#151b2c] px-3 text-slate-500">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleDemoSignIn}
          disabled={loading}
          className="w-full bg-slate-950/30 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-950/50 text-indigo-300 font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
        >
          <Sparkles size={16} className="animate-pulse" />
          Explore in Demo Mode
        </button>

        {isDemo && (
          <>
            <p className="mt-4 text-center text-xs text-amber-500/80">
              ⚠️ Supabase environment variables not set. Defaulting to Demo Mode.
            </p>
            <div className="mt-6 pt-4 border-t border-white/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 text-center">
                Quick-click Demo Credentials
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@aurawealth.io');
                    setPassword('password');
                    setLockedError(null);
                  }}
                  className="px-2 py-2 rounded bg-slate-900 border border-white/5 hover:border-indigo-500/35 text-[10px] font-semibold text-indigo-400 hover:text-white transition text-center truncate"
                >
                  Admin Role
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('user@aurawealth.io');
                    setPassword('password');
                    setLockedError(null);
                  }}
                  className="px-2 py-2 rounded bg-slate-900 border border-white/5 hover:border-indigo-500/35 text-[10px] font-semibold text-slate-300 hover:text-white transition text-center truncate"
                >
                  Standard User
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('locked@aurawealth.io');
                    setPassword('password');
                    setLockedError(null);
                  }}
                  className="px-2 py-2 rounded bg-slate-900 border border-white/5 hover:border-red-500/35 text-[10px] font-semibold text-red-400 hover:text-red-300 transition text-center truncate"
                >
                  Locked User
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
