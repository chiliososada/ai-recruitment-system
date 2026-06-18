import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  Session,
  UpdateAccountInput,
} from '@ars/shared';
import { api, getToken, setToken } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(input: LoginInput): Promise<AuthUser>;
  register(input: RegisterInput): Promise<Session>;
  verifyEmail(token: string): Promise<void>;
  updateAccount(input: UpdateAccountInput): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(input) {
        const session = await api.post<Session>('/auth/login', input);
        setToken(session.accessToken);
        setUser(session.user);
        return session.user;
      },
      async register(input) {
        const session = await api.post<Session>('/auth/register', input);
        setToken(session.accessToken);
        setUser(session.user);
        return session;
      },
      async verifyEmail(token) {
        const session = await api.post<Session>('/auth/verify-email', { token });
        setToken(session.accessToken);
        setUser(session.user);
      },
      async updateAccount(input) {
        const updated = await api.patch<AuthUser>('/auth/account', input);
        setUser(updated);
      },
      logout() {
        setToken(null);
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
