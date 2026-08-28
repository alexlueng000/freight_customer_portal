'use client';

import { LoaderCircle, LockKeyhole, Ship } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AuthApiError } from '@/lib/auth';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-background">
      <LoaderCircle className="size-5 animate-spin text-primary" aria-label="正在加载登录页" />
    </main>
  );
}

function LoginContent() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantCode, setTenantCode] = useState('DEMO');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (auth.initialized && auth.user) {
      router.replace(auth.user.userType === 'CUSTOMER' ? '/portal' : '/admin');
    }
  }, [auth.initialized, auth.user, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const authenticatedUser = await auth.login({ tenantCode, email, password });
      const requestedPath = searchParams.get('next');
      const defaultPath = authenticatedUser.userType === 'CUSTOMER' ? '/portal' : '/admin';
      const nextPath = requestedPath?.startsWith(defaultPath) ? requestedPath : defaultPath;
      router.replace(nextPath);
    } catch (caught) {
      setError(caught instanceof AuthApiError ? caught.message : '登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.72fr)]">
      <section className="hidden bg-primary p-12 text-surface lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-surface/15"><Ship className="size-6" /></div>
          <div><div className="font-semibold">Freight Customer Portal</div><div className="text-sm text-surface/70">货代客户在线门户</div></div>
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-medium text-surface/70">一站式业务协同</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">从运价、报价到出运、单证与账单，全程清晰可见。</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-surface/75">为货代企业及其客户提供安全、独立、可追踪的在线协作空间。</p>
        </div>
        <p className="text-xs text-surface/60">多租户隔离 · 角色权限 · 操作审计</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><div className="grid size-11 place-items-center rounded-lg bg-primary text-surface"><Ship className="size-6" /></div></div>
          <p className="text-sm font-semibold text-primary">账户登录</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">欢迎回来</h2>
          <p className="mt-2 text-sm text-muted">使用所属租户代码和企业邮箱登录。</p>

          <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block text-sm font-medium">租户代码<input className="mt-2 h-11 w-full rounded border border-border bg-surface px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" autoComplete="organization" value={tenantCode} onChange={(event) => setTenantCode(event.target.value)} required /></label>
            <label className="block text-sm font-medium">邮箱<input className="mt-2 h-11 w-full rounded border border-border bg-surface px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="block text-sm font-medium">密码<input className="mt-2 h-11 w-full rounded border border-border bg-surface px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" autoComplete="current-password" minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {error ? <div className="rounded border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">{error}</div> : null}
            <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-surface transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} type="submit">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
              {submitting ? '正在登录…' : '登录'}
            </button>
          </form>
          <div className="mt-6 rounded border border-border bg-sidebar px-4 py-3 text-xs leading-5 text-muted">本地演示租户：<span className="font-semibold text-foreground">DEMO</span><br />运营账号：admin@demo.freight.local<br />客户账号：customer@demo.freight.local</div>
        </div>
      </section>
    </main>
  );
}
