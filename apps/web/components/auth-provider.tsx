'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  refreshAuth,
  requestAuth,
  AuthApiError,
  type UserType,
  type AuthenticatedUser,
  type LoginInput,
  type PortalLoginInput,
} from '@/lib/auth';

interface AuthContextValue {
  initialized: boolean;
  user: AuthenticatedUser | null;
  accessToken: string | null;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  login(input: LoginInput, expectedUserType?: UserType): Promise<AuthenticatedUser>;
  portalLogin(input: PortalLoginInput): Promise<AuthenticatedUser>;
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
        const loginPath =
          user?.userType === 'CUSTOMER' && user.portalSlug
            ? `/t/${user.portalSlug}/login`
            : user?.tenantCode ? `/admin/login?tenantCode=${encodeURIComponent(user.tenantCode)}` : '/admin/login';
        setUser(null);
        setAccessToken(null);
        setInitialized(true);
        router.replace(loginPath);
        throw error;
      }
    },
    [accessToken, router, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      user,
      accessToken,
      apiFetch,
      async login(input, expectedUserType) {
        const session = await requestAuth('login', input);
        if (!session) throw new Error('登录响应为空');
        // Check the entry point before publishing a session that could trigger navigation.
        if (expectedUserType && session.user.userType !== expectedUserType) {
          await requestAuth('logout');
          throw new AuthApiError(
            '这是客户账号，请从客户门户登录；进入运营后台请使用销售或其他员工账号。',
            'LOGIN_ACCOUNT_TYPE_MISMATCH',
          );
        }
        setUser(session.user);
        setAccessToken(session.accessToken);
        setInitialized(true);
        return session.user;
      },
      async portalLogin(input) {
        const session = await requestAuth('portal-login', input);
        if (!session) throw new Error('登录响应为空');
        setUser(session.user);
        setAccessToken(session.accessToken);
        setInitialized(true);
        return session.user;
      },
      async logout() {
        const loginPath =
          user?.userType === 'CUSTOMER' && user.portalSlug
            ? `/t/${user.portalSlug}/login`
            : user?.tenantCode ? `/admin/login?tenantCode=${encodeURIComponent(user.tenantCode)}` : '/admin/login';
        try {
          await requestAuth('logout');
        } finally {
          setUser(null);
          setAccessToken(null);
          setInitialized(true);
          router.replace(loginPath);
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
