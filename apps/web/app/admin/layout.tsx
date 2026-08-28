import { AuthGate } from '@/components/auth-gate';
import { adminNavGroups, AppShell } from '@/components/app-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate area="admin">
      <AppShell appName="运营后台" navGroups={adminNavGroups}>
        {children}
      </AppShell>
    </AuthGate>
  );
}
