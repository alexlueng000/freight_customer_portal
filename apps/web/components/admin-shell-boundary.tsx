'use client';

import { usePathname } from 'next/navigation';
import { AuthGate } from '@/components/auth-gate';
import { adminNavGroups, AppShell } from '@/components/app-shell';

export function AdminShellBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin/login') return children;
  return (
    <AuthGate area="admin">
      <AppShell appName="运营后台" navGroups={adminNavGroups}>
        {children}
      </AppShell>
    </AuthGate>
  );
}
