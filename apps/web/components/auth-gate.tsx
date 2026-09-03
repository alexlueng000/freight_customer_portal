'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { canAccessPath } from '@/lib/navigation-permissions';

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
  const correctArea = user
    ? area === 'portal'
      ? user.userType === 'CUSTOMER'
      : user.userType === 'INTERNAL'
    : false;
  const hasRoutePermission = user ? canAccessPath(pathname, user.permissions) : false;
  const allowed = correctArea && hasRoutePermission;

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!correctArea || !hasRoutePermission) {
      router.replace(user.userType === 'CUSTOMER' ? '/portal' : '/admin');
    }
  }, [correctArea, hasRoutePermission, initialized, pathname, router, user]);

  if (!initialized || !allowed) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="text-sm text-muted">正在验证登录状态…</div>
      </div>
    );
  }
  return children;
}
