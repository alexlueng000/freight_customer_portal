'use client';

import {
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
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
import { cn } from '@/lib/utils';

export interface ShellNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
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
      { label: '运价', href: '/portal/rates', icon: Search },
      { label: '报价', href: '/portal/quotes', icon: FileText },
      { label: '订舱', href: '/portal/bookings', icon: PackageCheck },
    ],
  },
  {
    label: '履约',
    items: [
      { label: '出运', href: '/portal/shipments', icon: Ship },
      { label: '单证', href: '/portal/documents', icon: FileArchive },
    ],
  },
  { label: '财务', items: [{ label: '账单', href: '/portal/billing', icon: ReceiptText }] },
  {
    label: '账户',
    items: [
      { label: '公司资料', href: '/portal/company', icon: Building2 },
      { label: '用户', href: '/portal/users', icon: Users },
    ],
  },
];

export const adminNavGroups: ShellNavGroup[] = [
  { label: '总览', items: [{ label: '仪表盘', href: '/admin', icon: LayoutDashboard }] },
  {
    label: '商务',
    items: [
      { label: '客户', href: '/admin/customers', icon: Building2 },
      { label: '运价', href: '/admin/rates', icon: Search },
      { label: '报价', href: '/admin/quotes', icon: FileText },
    ],
  },
  {
    label: '操作',
    items: [
      { label: '订舱', href: '/admin/bookings', icon: PackageCheck },
      { label: '出运', href: '/admin/shipments', icon: Ship },
      { label: '单证', href: '/admin/documents', icon: FileArchive },
    ],
  },
  { label: '财务', items: [{ label: '发票', href: '/admin/invoices', icon: ReceiptText }] },
  {
    label: '管理',
    items: [
      { label: '用户', href: '/admin/users', icon: Users },
      { label: '审计日志', href: '/admin/audit-logs', icon: History },
      { label: '设置', href: '/admin/settings', icon: Settings },
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
  const navItems = navGroups.flatMap((group) => group.items);

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
          {navGroups.map((group) => (
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
                <div className="text-sm font-semibold">今日待处理 6 项</div>
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
                <button
                  className="grid size-9 place-items-center rounded border border-border bg-surface text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  type="button"
                  title="通知"
                >
                  <Bell aria-hidden className="size-4" />
                </button>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded border border-border bg-surface px-3 text-sm font-medium hover:bg-sidebar focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onClick={() => void auth.logout()}
                  type="button"
                  title="退出登录"
                >
                  <Gauge aria-hidden className="size-4 text-primary" />
                  <span className="hidden sm:inline">{auth.user?.displayName}</span>
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
