import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Lang } from '../i18n';
import type { Profile } from '../lib/types';

export type AuthValue = {
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** True after following a password-reset link, until a new password is set. */
  recovering: boolean;
  /** Reloads the profile, e.g. after a rename. */
  refreshProfile: () => void;
  /** Switches the interface language, and remembers it on the account when signed in. */
  setLanguage: (lang: Lang) => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves to true when the user must confirm their email before signing in. */
  signUp: (email: string, password: string, username: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
