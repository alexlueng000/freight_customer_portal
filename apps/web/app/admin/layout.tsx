import { AdminShellBoundary } from '@/components/admin-shell-boundary';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShellBoundary>{children}</AdminShellBoundary>;
}
