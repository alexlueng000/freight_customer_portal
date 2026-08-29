export type UserType = 'INTERNAL' | 'CUSTOMER';

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  customerCompanyId?: string;
  email: string;
  displayName: string;
  userType: UserType;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: AuthenticatedUser;
}

export interface LoginInput {
  tenantCode: string;
  email: string;
  password: string;
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

let refreshRequest: Promise<AuthResponse | undefined> | undefined;

export function refreshAuth(): Promise<AuthResponse | undefined> {
  if (!refreshRequest) {
    refreshRequest = requestAuth('refresh').finally(() => {
      refreshRequest = undefined;
    });
  }
  return refreshRequest;
}

export async function requestAuth(
  path: 'login' | 'refresh' | 'logout',
  body?: LoginInput,
): Promise<AuthResponse | undefined> {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined;
  const payload = (await response.json().catch(() => undefined)) as
    | (AuthResponse & { code?: string; message?: string })
    | undefined;
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new AuthApiError(
        retryAfter
          ? `登录尝试过于频繁，请等待 ${retryAfter} 秒后重试。`
          : '登录尝试过于频繁，请稍后重试。',
        payload?.code,
      );
    }
    throw new AuthApiError(payload?.message ?? '认证服务暂时不可用，请稍后重试。', payload?.code);
  }
  return payload;
}
