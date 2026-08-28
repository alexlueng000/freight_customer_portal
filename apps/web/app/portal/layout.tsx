import { AuthGate } from '@/components/auth-gate';
import { AppShell, portalNavGroups } from '@/components/app-shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate area="portal">
      <AppShell appName="客户门户" navGroups={portalNavGroups}>
        {children}
      </AppShell>
    </AuthGate>
  );
}
