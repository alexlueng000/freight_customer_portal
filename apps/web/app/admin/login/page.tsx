'use client';

import { LoaderCircle, LockKeyhole, Ship } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AuthApiError } from '@/lib/auth';
import { canAccessPath } from '@/lib/navigation-permissions';

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center">
          <LoaderCircle className="size-5 animate-spin text-primary" />
        </main>
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}

function AdminLoginContent() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantCode = (
    searchParams.get('tenantCode') ?? (process.env.NODE_ENV === 'development' ? 'DEMO' : '')
  )
    .trim()
    .toUpperCase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!auth.initialized || !auth.user) return;
    if (auth.user.userType !== 'INTERNAL') {
      router.replace('/portal');
      return;
    }
    const next = searchParams.get('next');
    const pathname = next?.split(/[?#]/)[0] ?? '';
    const allowed = (pathname === '/admin' || pathname.startsWith('/admin/'))
      && !pathname.startsWith('/admin/login')
      && !next?.includes('\\')
      && !pathname.includes('%')
      && !pathname.split('/').includes('..')
      && canAccessPath(pathname, auth.user.permissions);
    router.replace(allowed && next ? next : '/admin');
  }, [auth.initialized, auth.user, router, searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantCode) {
      setError('请通过公司提供的专属登录链接访问，或联系管理员。');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await auth.login({ tenantCode, email, password }, 'INTERNAL');
    } catch (caught) {
      setError(caught instanceof AuthApiError ? caught.message : '登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.72fr)]">
      <section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-white/10">
            <Ship className="size-6" />
          </div>
          <div>
            <div className="font-semibold">Freight SaaS Backend</div>
            <div className="text-sm text-white/60">货代运营工作台</div>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-medium text-white/60">内部员工入口</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">
            管理客户、运价、报价、订舱与出运。
          </h1>
          <p className="mt-5 text-base leading-7 text-white/65">该入口仅供货代公司内部员工使用。</p>
        </div>
        <p className="text-xs text-white/45">多租户隔离 · 角色权限 · 操作审计</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <p className="text-sm font-semibold text-primary">运营后台</p>
          <h2 className="mt-2 text-3xl font-semibold">员工登录</h2>
          <p className="mt-2 text-sm text-muted">使用企业邮箱和密码登录。</p>
          <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
            <label className="block text-sm font-medium">
              租户代码
              <input
                aria-label="租户代码"
                className="mt-2 h-11 w-full rounded border border-border bg-sidebar px-3 text-muted"
                value={tenantCode}
                readOnly
              />
              <span className="mt-1.5 block text-xs text-muted">
                {tenantCode
                  ? '已由公司登录入口确定，无需填写。'
                  : '请通过公司提供的专属登录链接访问，或联系管理员。'}
              </span>
            </label>
            <Field
              label="邮箱"
              value={email}
              onChange={setEmail}
              autoComplete="username"
              type="email"
            />
            <Field
              label="密码"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              type="password"
              minLength={8}
            />
            {error ? (
              <div
                className="rounded border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
                role="alert"
              >
                {error}
              </div>
            ) : null}
            <button
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={submitting || !tenantCode}
              type="submit"
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <LockKeyhole className="size-4" />
              )}
              {submitting ? '正在登录…' : '登录运营后台'}
            </button>
          </form>
          {process.env.NODE_ENV === 'development' ? (
            <div className="mt-6 rounded border border-border bg-sidebar px-4 py-3 text-xs leading-5 text-muted">
              开发环境 Demo 租户：<span className="font-semibold text-foreground">DEMO</span>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-2 h-11 w-full rounded border border-border bg-surface px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        autoComplete={autoComplete}
        minLength={minLength}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  );
}
