'use client';

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  ReceiptText,
  Search,
  Settings,
  Ship,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { NotificationMenu } from '@/components/notification-menu';
import { filterNavigationGroups, navigationPermissions } from '@/lib/navigation-permissions';
import { cn } from '@/lib/utils';

export interface ShellNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  requiredPermissions?: readonly string[];
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

export const portalNavGroups: ShellNavGroup[] = [
  { label: '总览', items: [{ label: '仪表盘', href: '/portal', icon: LayoutDashboard }] },
  {
    label: '商务',
    items: [
      {
        label: '运价',
        href: '/portal/rates',
        icon: Search,
        requiredPermissions: navigationPermissions['/portal/rates'],
      },
      {
        label: '报价',
        href: '/portal/quotes',
        icon: FileText,
        requiredPermissions: navigationPermissions['/portal/quotes'],
      },
      {
        label: '订舱',
        href: '/portal/bookings',
        icon: PackageCheck,
        requiredPermissions: navigationPermissions['/portal/bookings'],
      },
    ],
  },
  {
    label: '履约',
    items: [
      {
        label: '出运',
        href: '/portal/shipments',
        icon: Ship,
        requiredPermissions: navigationPermissions['/portal/shipments'],
      },
      {
        label: '单证',
        href: '/portal/documents',
        icon: FileArchive,
        requiredPermissions: navigationPermissions['/portal/documents'],
      },
    ],
  },
  {
    label: '财务',
    items: [
      {
        label: '账单',
        href: '/portal/billing',
        icon: ReceiptText,
        requiredPermissions: navigationPermissions['/portal/billing'],
      },
    ],
  },
  {
    label: '账户',
    items: [
      {
        label: '公司资料',
        href: '/portal/company',
        icon: Building2,
        requiredPermissions: navigationPermissions['/portal/company'],
      },
      {
        label: '用户',
        href: '/portal/users',
        icon: Users,
        requiredPermissions: navigationPermissions['/portal/users'],
      },
    ],
  },
];

export const adminNavGroups: ShellNavGroup[] = [
  { label: '总览', items: [{ label: '仪表盘', href: '/admin', icon: LayoutDashboard }] },
  {
    label: '商务',
    items: [
      {
        label: '客户',
        href: '/admin/customers',
        icon: Building2,
        requiredPermissions: navigationPermissions['/admin/customers'],
      },
      {
        label: '运价',
        href: '/admin/rates',
        icon: Search,
        requiredPermissions: navigationPermissions['/admin/rates'],
      },
      {
        label: '报价',
        href: '/admin/quotes',
        icon: FileText,
        requiredPermissions: navigationPermissions['/admin/quotes'],
      },
    ],
  },
  {
    label: '操作',
    items: [
      {
        label: '订舱',
        href: '/admin/bookings',
        icon: PackageCheck,
        requiredPermissions: navigationPermissions['/admin/bookings'],
      },
      {
        label: '出运',
        href: '/admin/shipments',
        icon: Ship,
        requiredPermissions: navigationPermissions['/admin/shipments'],
      },
      {
        label: '单证',
        href: '/admin/documents',
        icon: FileArchive,
        requiredPermissions: navigationPermissions['/admin/documents'],
      },
    ],
  },
  {
    label: '财务',
    items: [
      {
        label: '发票',
        href: '/admin/invoices',
        icon: ReceiptText,
        requiredPermissions: navigationPermissions['/admin/invoices'],
      },
    ],
  },
  {
    label: '管理',
    items: [
      {
        label: '用户',
        href: '/admin/users',
        icon: Users,
        requiredPermissions: navigationPermissions['/admin/users'],
      },
      {
        label: '审计日志',
        href: '/admin/audit-logs',
        icon: History,
        requiredPermissions: navigationPermissions['/admin/audit-logs'],
      },
      {
        label: '设置',
        href: '/admin/settings',
        icon: Settings,
        requiredPermissions: navigationPermissions['/admin/settings'],
      },
    ],
  },
];

export function AppShell({
  children,
  navGroups,
  appName,
}: {
  children: React.ReactNode;
  navGroups: ShellNavGroup[];
  appName: string;
}) {
  const auth = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const visibleNavGroups = filterNavigationGroups(navGroups, auth.user?.permissions ?? []);
  const navItems = visibleNavGroups.flatMap((group) => group.items);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await auth.logout().catch(() => undefined);
  }

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar md:flex md:flex-col',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="grid size-9 place-items-center rounded bg-primary text-sm font-semibold text-surface">
            NF
          </div>
          <div className={cn('min-w-0', collapsed && 'hidden')}>
            <div className="truncate text-sm font-semibold">{auth.user?.tenantName}</div>
            <div className="truncate text-xs text-muted">{appName}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {visibleNavGroups.map((group) => (
            <div key={group.label}>
              <div
                className={cn(
                  'px-3 pb-1 text-[11px] font-semibold text-muted',
                  collapsed && 'sr-only',
                )}
              >
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === pathname;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex h-9 items-center gap-3 rounded px-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20',
                        collapsed && 'justify-center px-0',
                        active && 'bg-surface text-primary shadow-sm',
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <button
            className="flex h-9 w-full items-center justify-center gap-2 rounded border border-border bg-surface text-sm font-medium text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            type="button"
          >
            {collapsed ? (
              <ChevronRight aria-hidden className="size-4" />
            ) : (
              <>
                <ChevronLeft aria-hidden className="size-4" />
                <span>收起</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className={cn(collapsed ? 'md:pl-20' : 'md:pl-64')}>
        <header className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="flex min-h-16 flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded bg-primary text-sm font-semibold text-surface md:hidden">
                NF
              </div>
              <div>
                <div className="text-sm font-semibold">工作台</div>
                <div className="text-xs text-muted">Dashboard</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <nav className="flex gap-1 overflow-x-auto md:hidden">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'whitespace-nowrap rounded border border-border px-3 py-1.5 text-xs font-medium text-muted',
                      item.href === pathname && 'border-primary/30 bg-primary/10 text-primary',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <NotificationMenu />
                <div className="inline-flex h-9 items-center gap-2 rounded border border-border bg-surface px-3 text-sm font-medium">
                  <Gauge aria-hidden className="size-4 text-primary" />
                  <span className="hidden sm:inline">{auth.user?.displayName}</span>
                </div>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded border border-border bg-surface px-3 text-sm font-medium text-muted hover:bg-sidebar hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  <LogOut aria-hidden className="size-4" />
                  <span>{loggingOut ? '退出中' : '退出登录'}</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
