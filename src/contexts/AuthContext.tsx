import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsProfileSetup: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any; needsMfa?: boolean; factorId?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // 2FA
  enrollMfa: () => Promise<{ qrCode: string | null; secret: string | null; factorId: string | null; error: any }>;
  verifyMfaEnrollment: (factorId: string, code: string) => Promise<{ error: any }>;
  challengeAndVerifyMfa: (factorId: string, code: string) => Promise<{ error: any }>;
  unenrollMfa: (factorId: string) => Promise<{ error: any }>;
  getMfaFactors: () => Promise<{ factors: any[]; error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const needsProfileSetup = !!(user && profile && !profile.profile_complete);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    setProfile(data as Profile | null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const displayName = `${firstName} ${lastName}`.trim();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, first_name: firstName, last_name: lastName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };

    // Check if MFA is required (AAL2 needed)
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aalError && aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      const factors = data.user?.factors ?? [];
      const totpFactor = factors.find((f: any) => f.factor_type === 'totp');
      if (totpFactor) {
        return { error: null, needsMfa: true, factorId: totpFactor.id };
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  // ── 2FA ──────────────────────────────────────────────────────────────

  const enrollMfa = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) return { qrCode: null, secret: null, factorId: null, error };
    return {
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      factorId: data.id,
      error: null,
    };
  };

  const verifyMfaEnrollment = async (factorId: string, code: string) => {
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) return { error: cErr };
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    return { error };
  };

  const challengeAndVerifyMfa = async (factorId: string, code: string) => {
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) return { error: cErr };
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    return { error };
  };

  const unenrollMfa = async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    return { error };
  };

  const getMfaFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    return { factors: data?.totp ?? [], error };
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading, needsProfileSetup,
      signUp, signIn, signOut, refreshProfile,
      enrollMfa, verifyMfaEnrollment, challengeAndVerifyMfa, unenrollMfa, getMfaFactors,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
