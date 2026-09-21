'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';

const tabs = [{ href: '/admin/settings/ports', label: '基础港口映射表' }, { href: '/admin/settings/quotes', label: '报价审核' }];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="运营后台" title="设置" />
      <nav aria-label="设置分类" className="flex gap-6 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-1 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-primary'}`}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
