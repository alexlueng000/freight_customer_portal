'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';

export function AuthGate({
  area,
  children,
}: {
  area: 'admin' | 'portal';
  children: React.ReactNode;
}) {
  const { initialized, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = user ? (area === 'portal' ? user.userType === 'CUSTOMER' : user.userType === 'INTERNAL') : false;

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!allowed) router.replace(user.userType === 'CUSTOMER' ? '/portal' : '/admin');
  }, [allowed, initialized, pathname, router, user]);

  if (!initialized || !allowed) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="text-sm text-muted">正在验证登录状态…</div>
      </div>
    );
  }
  return children;
}
