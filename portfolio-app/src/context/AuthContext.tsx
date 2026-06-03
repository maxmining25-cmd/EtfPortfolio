// AuthContext.tsx
// Core Authentication Context supporting real Supabase Auth and a LocalStorage-based Demo Mode fallback

'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient, User } from '@supabase/supabase-js';

// Setup Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isDemoMode = !supabaseUrl || !supabaseAnonKey;

export const supabase = !isDemoMode
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isDemo: boolean;
  signOut: () => Promise<void>;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: Error | null; user?: any }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null; user?: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      // Demo Mode auth check
      const localUserStr = localStorage.getItem('aurawealth_demo_user');
      if (localUserStr) {
        try {
          setUser(JSON.parse(localUserStr));
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
      return;
    }

    // Real Supabase auth check
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const signInWithOtp = async (email: string) => {
    if (isDemoMode) {
      // Mock Success in Demo Mode
      const mockUser = {
        id: 'demo-user-id-12345',
        email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        user_metadata: {},
        app_metadata: {},
      } as User;
      localStorage.setItem('aurawealth_demo_user', JSON.stringify(mockUser));
      setUser(mockUser);
      return { error: null };
    }

    if (!supabase) return { error: new Error('Supabase client not initialized.') };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (isDemoMode) {
      // Mock Success in Demo Mode
      const mockUser = {
        id: 'demo-user-id-12345',
        email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        user_metadata: {},
        app_metadata: {},
      } as User;
      localStorage.setItem('aurawealth_demo_user', JSON.stringify(mockUser));
      setUser(mockUser);
      return { error: null, user: mockUser };
    }

    if (!supabase) return { error: new Error('Supabase client not initialized.') };
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error, user: data?.user };
  };

  const signUpWithPassword = async (email: string, password: string) => {
    if (isDemoMode) {
      const mockUser = {
        id: 'demo-user-id-12345',
        email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        user_metadata: {},
        app_metadata: {},
      } as User;
      localStorage.setItem('aurawealth_demo_user', JSON.stringify(mockUser));
      setUser(mockUser);
      return { error: null, user: mockUser };
    }

    if (!supabase) return { error: new Error('Supabase client not initialized.') };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error, user: data?.user };
  };

  const signOut = async () => {
    if (isDemoMode) {
      localStorage.removeItem('aurawealth_demo_user');
      setUser(null);
      return;
    }

    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDemo: isDemoMode,
        signOut,
        signInWithOtp,
        signInWithPassword,
        signUpWithPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
