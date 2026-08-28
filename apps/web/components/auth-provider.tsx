'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { refreshAuth, requestAuth, type AuthenticatedUser, type LoginInput } from '@/lib/auth';

interface AuthContextValue {
  initialized: boolean;
  user: AuthenticatedUser | null;
  accessToken: string | null;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  login(input: LoginInput): Promise<AuthenticatedUser>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void refreshAuth()
      .then((session) => {
        if (!active || !session) return;
        setUser(session.user);
        setAccessToken(session.accessToken);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setInitialized(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const send = (token: string) => {
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${token}`);
        return fetch(input, { ...init, headers, credentials: 'include' });
      };

      if (!accessToken) throw new Error('登录会话尚未就绪');
      const response = await send(accessToken);
      if (response.status !== 401) return response;

      try {
        const session = await refreshAuth();
        if (!session) throw new Error('登录会话已过期');
        setUser(session.user);
        setAccessToken(session.accessToken);
        return send(session.accessToken);
      } catch (error) {
        setUser(null);
        setAccessToken(null);
        setInitialized(true);
        router.replace('/login');
        throw error;
      }
    },
    [accessToken, router],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      user,
      accessToken,
      apiFetch,
      async login(input) {
        const session = await requestAuth('login', input);
        if (!session) throw new Error('登录响应为空');
        setUser(session.user);
        setAccessToken(session.accessToken);
        setInitialized(true);
        return session.user;
      },
      async logout() {
        try {
          await requestAuth('logout');
        } finally {
          setUser(null);
          setAccessToken(null);
          setInitialized(true);
          router.replace('/login');
        }
      },
    }),
    [accessToken, apiFetch, initialized, router, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
