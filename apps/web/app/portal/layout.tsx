import { AppShell, portalNavGroups } from '@/components/app-shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      appName="客户门户"
      navGroups={portalNavGroups}
      tenantName="北辰国际物流"
      userLabel="陈佳"
    >
      {children}
    </AppShell>
  );
}
