'use client';

import { LoaderCircle, LockKeyhole, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { TenantMark } from '@/components/tenant-mark';
import { AuthApiError } from '@/lib/auth';
import { isSafePortalNextPath, type PortalBranding } from '@/lib/portal-branding';

export function PortalLoginDialog({
  branding,
  nextPath,
}: {
  branding: PortalBranding;
  nextPath?: string;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const closeHref = `/t/${branding.portalSlug}`;

  useEffect(() => {
    window.localStorage.setItem('freight.portalSlug', branding.portalSlug);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [branding.portalSlug]);

  useEffect(() => {
    if (auth.initialized && auth.user)
      router.replace(auth.user.userType === 'CUSTOMER' ? '/portal' : '/admin');
  }, [auth.initialized, auth.user, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await auth.portalLogin({ portalSlug: branding.portalSlug, email, password });
      router.replace(isSafePortalNextPath(nextPath ?? null) ? nextPath! : '/portal');
    } catch (caught) {
      setError(
        caught instanceof AuthApiError
          ? '邮箱或密码不正确，请重新输入。'
          : '登录失败，请稍后重试。',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      aria-label="客户登录"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      role="dialog"
    >
      <Link aria-label="关闭登录" className="absolute inset-0" href={closeHref} />
      <section className="relative z-10 w-full max-w-md rounded-t-2xl bg-white px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6 shadow-2xl sm:rounded-2xl sm:p-8">
        <div className="flex items-start justify-between gap-5">
          <TenantMark companyName={branding.companyName} logoUrl={branding.logoUrl} />
          <Link
            aria-label="关闭登录"
            className="grid size-9 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
            href={closeHref}
          >
            <X aria-hidden className="size-5" />
          </Link>
        </div>
        <div className="mt-8">
          <p className="text-sm font-semibold text-[var(--portal-brand,#087E8B)]">客户中心</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            登录查看您的业务
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            查询专价、订舱、出运进度与业务文件。
          </p>
        </div>
        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-sm font-medium text-slate-800">
            邮箱
            <input
              autoComplete="username"
              autoFocus
              className={inputClass}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            密码
            <input
              autoComplete="current-password"
              className={inputClass}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <div
              className="rounded border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </div>
          ) : null}
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-[var(--portal-brand,#087E8B)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
            ) : (
              <LockKeyhole aria-hidden className="size-4" />
            )}
            {submitting ? '正在登录…' : '登录客户中心'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-400">账号由您的货代服务团队创建和管理</p>
      </section>
    </div>
  );
}

const inputClass =
  'mt-2 h-11 w-full rounded border border-slate-200 bg-white px-3 outline-none transition focus:border-[var(--portal-brand,#087E8B)] focus:ring-2 focus:ring-[var(--portal-brand,#087E8B)]/15';
