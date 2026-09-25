import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiClient, getToken, setToken, clearToken } from '@/lib/apiClient';
import type { Profile } from '@/types/types';
import { getProfile, updateProfile } from '@/services/api';

// The rest of the app only ever reads `.id` and `.email` off this object (it
// used to be a full Supabase `User`). We synthesize it from the backend's
// Profile response so every other component keeps working unchanged.
export interface SessionUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: SessionUser | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; profile: Profile | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyProfile = (p: Profile | null) => {
    setProfile(p);
    setUser(p ? { id: p.id, email: p.email } : null);
  };

  const refreshProfile = async () => {
    if (!user) { setProfile(null); return; }
    const data = await getProfile(user.id);
    setProfile(data);
  };

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    apiClient
      .get<{ user: Profile }>('/auth/me')
      .then(({ user: p }) => applyProfile(p))
      .catch(() => { clearToken(); applyProfile(null); })
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { token, user: p } = await apiClient.post<{ token: string; user: Profile }>('/auth/login', { email, password });
      setToken(token);
      applyProfile(p);
      return { error: null, profile: p };
    } catch (error) {
      return { error: error as Error, profile: null };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { token, user: p } = await apiClient.post<{ token: string; user: Profile }>('/auth/register', {
        email, password, full_name: fullName || null,
      });
      setToken(token);
      applyProfile(p);
      // Some callers pass a full name that the register call already stores,
      // but keep this as a defensive follow-up in case it was left blank above.
      if (fullName) {
        updateProfile(p.id, { full_name: fullName }).then(() => refreshProfile()).catch(() => {});
      }
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    clearToken();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
