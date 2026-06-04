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
  isAdmin: boolean;
  isLocked: boolean;
  lockedError: string | null;
  theme: 'dark' | 'light';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  setLockedError: (error: string | null) => void;
  signOut: () => Promise<void>;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: Error | null; user?: any }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null; user?: any }>;
  updatePreferences: (theme: 'dark' | 'light', fontSize: 'sm' | 'base' | 'lg' | 'xl') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedError, setLockedError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');

  const checkUserProfile = async (userId: string, currentEmail?: string) => {
    try {
      if (isDemoMode) {
        // Load from demo users list in localStorage
        const list = localStorage.getItem('aurawealth_demo_users');
        const users = list ? JSON.parse(list) : [];
        
        let profile = users.find((u: any) => u.id === userId);
        if (!profile) {
          // Fallback to find by email
          profile = users.find((u: any) => u.email.toLowerCase() === currentEmail?.toLowerCase());
        }

        if (!profile) {
          // Create default demo profile
          profile = {
            id: userId,
            email: currentEmail || 'demo@aurawealth.io',
            is_admin: currentEmail?.includes('admin') || users.length === 0,
            is_locked: currentEmail?.includes('locked') || false,
            theme: 'dark',
            font_size: 'base'
          };
          users.push(profile);
          localStorage.setItem('aurawealth_demo_users', JSON.stringify(users));
        }

        if (profile.is_locked) {
          setIsLocked(true);
          setLockedError('Your account has been locked by an administrator.');
          localStorage.removeItem('aurawealth_demo_user');
          setUser(null);
          return true; // was locked
        }

        setIsLocked(false);
        setIsAdmin(profile.is_admin || false);
        setTheme(profile.theme || 'dark');
        setFontSize(profile.font_size || 'base');
        return false;
      }

      // Real Supabase Mode
      if (supabase) {
        const { data, error } = await supabase
          .from('users')
          .select('is_admin, is_locked, theme, font_size')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          return false;
        }

        if (data) {
          if (data.is_locked) {
            setIsLocked(true);
            setLockedError('Your account has been locked by an administrator.');
            await supabase.auth.signOut();
            setUser(null);
            return true; // was locked
          }

          setIsLocked(false);
          setIsAdmin(data.is_admin || false);
          setTheme((data.theme as any) || 'dark');
          setFontSize((data.font_size as any) || 'base');
        }
      }
      return false;
    } catch (err) {
      console.error('Error checking user profile:', err);
      return false;
    }
  };

  useEffect(() => {
    // Initialize demo user list if empty
    if (isDemoMode && typeof window !== 'undefined') {
      const list = localStorage.getItem('aurawealth_demo_users');
      if (!list) {
        const defaultUsers = [
          {
            id: 'demo-admin-id-123',
            email: 'admin@aurawealth.io',
            is_admin: true,
            is_locked: false,
            theme: 'dark',
            font_size: 'base'
          },
          {
            id: 'demo-user-id-12345',
            email: 'user@aurawealth.io',
            is_admin: false,
            is_locked: false,
            theme: 'dark',
            font_size: 'base'
          },
          {
            id: 'demo-locked-id-123',
            email: 'locked@aurawealth.io',
            is_admin: false,
            is_locked: true,
            theme: 'dark',
            font_size: 'base'
          }
        ];
        localStorage.setItem('aurawealth_demo_users', JSON.stringify(defaultUsers));
      }
    }

    if (isDemoMode) {
      // Demo Mode auth check
      const localUserStr = localStorage.getItem('aurawealth_demo_user');
      if (localUserStr) {
        try {
          const parsed = JSON.parse(localUserStr);
          setUser(parsed);
          checkUserProfile(parsed.id, parsed.email).then((wasLocked) => {
            if (wasLocked) {
              setLoading(false);
            }
          });
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
      return;
    }

    // Real Supabase auth check
    if (supabase) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
          await checkUserProfile(session.user.id, session.user.email);
        } else {
          setUser(null);
        }
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await checkUserProfile(session.user.id, session.user.email);
        } else {
          setUser(null);
          setIsAdmin(false);
          setIsLocked(false);
        }
        setLoading(false);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const signInWithOtp = async (email: string) => {
    if (isDemoMode) {
      // For otp in demo, direct login
      return signInWithPassword(email, 'password');
    }

    if (!supabase) return { error: new Error('Supabase client not initialized.') };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  const signInWithPassword = async (email: string, password: string) => {
    setLockedError(null);

    if (isDemoMode) {
      const list = localStorage.getItem('aurawealth_demo_users');
      const users = list ? JSON.parse(list) : [];
      
      let profile = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
      
      // Auto-create standard mock if not exists
      if (!profile) {
        const id = 'demo-user-id-' + Math.random().toString(36).substring(2, 9);
        profile = {
          id,
          email,
          is_admin: email.includes('admin'),
          is_locked: email.includes('locked'),
          theme: 'dark',
          font_size: 'base'
        };
        users.push(profile);
        localStorage.setItem('aurawealth_demo_users', JSON.stringify(users));
      }

      if (profile.is_locked) {
        setLockedError('Your account has been locked by an administrator.');
        return { error: new Error('Account is locked.') };
      }

      const mockUser = {
        id: profile.id,
        email: profile.email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        user_metadata: {},
        app_metadata: {},
      } as User;

      localStorage.setItem('aurawealth_demo_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsAdmin(profile.is_admin || false);
      setIsLocked(false);
      setTheme(profile.theme || 'dark');
      setFontSize(profile.font_size || 'base');
      return { error: null, user: mockUser };
    }

    if (!supabase) return { error: new Error('Supabase client not initialized.') };
    
    // Attempt standard sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error };

    if (data?.user) {
      const wasLocked = await checkUserProfile(data.user.id, data.user.email);
      if (wasLocked) {
        return { error: new Error('Account is locked.') };
      }
    }

    return { error, user: data?.user };
  };

  const signUpWithPassword = async (email: string, password: string) => {
    setLockedError(null);

    if (isDemoMode) {
      const list = localStorage.getItem('aurawealth_demo_users');
      const users = list ? JSON.parse(list) : [];
      const isFirst = users.length === 0;

      const id = 'demo-user-id-' + Math.random().toString(36).substring(2, 9);
      const newProfile = {
        id,
        email,
        is_admin: isFirst,
        is_locked: false,
        theme: 'dark',
        font_size: 'base'
      };

      users.push(newProfile);
      localStorage.setItem('aurawealth_demo_users', JSON.stringify(users));

      const mockUser = {
        id,
        email: email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        user_metadata: {},
        app_metadata: {},
      } as User;

      localStorage.setItem('aurawealth_demo_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsAdmin(isFirst);
      setIsLocked(false);
      setTheme('dark');
      setFontSize('base');
      return { error: null, user: mockUser };
    }

    if (!supabase) return { error: new Error('Supabase client not initialized.') };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (data?.user && !error) {
      setUser(data.user);
      setIsAdmin(false);
      setIsLocked(false);
      setTheme('dark');
      setFontSize('base');
    }
    return { error, user: data?.user };
  };

  const signOut = async () => {
    if (isDemoMode) {
      localStorage.removeItem('aurawealth_demo_user');
      setUser(null);
      setIsAdmin(false);
      setIsLocked(false);
      return;
    }

    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  const updatePreferences = async (newTheme: 'dark' | 'light', newFontSize: 'sm' | 'base' | 'lg' | 'xl') => {
    if (!user) return;

    setTheme(newTheme);
    setFontSize(newFontSize);

    if (isDemoMode) {
      const list = localStorage.getItem('aurawealth_demo_users');
      const users = list ? JSON.parse(list) : [];
      const idx = users.findIndex((u: any) => u.id === user.id);
      if (idx !== -1) {
        users[idx].theme = newTheme;
        users[idx].font_size = newFontSize;
        localStorage.setItem('aurawealth_demo_users', JSON.stringify(users));
      }
      return;
    }

    if (supabase) {
      const { error } = await supabase
        .from('users')
        .update({ theme: newTheme, font_size: newFontSize })
        .eq('id', user.id);
      if (error) throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDemo: isDemoMode,
        isAdmin,
        isLocked,
        lockedError,
        theme,
        fontSize,
        setLockedError,
        signOut,
        signInWithOtp,
        signInWithPassword,
        signUpWithPassword,
        updatePreferences,
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
