import { adminNavGroups, AppShell } from '@/components/app-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      appName="运营后台"
      navGroups={adminNavGroups}
      tenantName="北辰国际物流"
      userLabel="运营管理员"
    >
      {children}
    </AppShell>
  );
}
