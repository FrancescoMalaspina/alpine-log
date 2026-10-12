import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isUsernameTaken } from '../lib/api';
import { USERNAME_HINT, USERNAME_RE } from '../lib/labels';
import type { Profile } from '../lib/types';
import { AuthContext, type AuthValue } from './useAuth';

const redirectUrl = () => window.location.origin + import.meta.env.BASE_URL;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<Profile | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.from('profiles').select('id, username, role').eq('id', userId).single()
      .then(({ data }) => { if (!cancelled) setLoadedProfile(data as Profile | null); });
    return () => { cancelled = true; };
  }, [userId, profileVersion]);
  const profile = loadedProfile && loadedProfile.id === userId ? loadedProfile : null;

  const value: AuthValue = {
    session,
    profile,
    isAdmin: profile?.role === 'admin',
    recovering,
    refreshProfile: () => setProfileVersion(n => n + 1),
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password, username) {
      if (!USERNAME_RE.test(username)) {
        throw new Error(USERNAME_HINT);
      }
      if (await isUsernameTaken(username)) throw new Error(`"${username}" is already taken.`);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: redirectUrl() },
      });
      if (error) throw error;
      return !data.session;
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async sendPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setRecovering(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
