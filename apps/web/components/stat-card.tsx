import type { StatItem } from '@/lib/mock-data';
import Link from 'next/link';
import { StatusBadge } from './status-badge';

const showMockBadge = process.env.NODE_ENV !== 'production';

export function StatCard({ stat }: { stat: StatItem }) {
  return (
    <Link
      className="block min-h-28 rounded border border-border bg-surface p-4 transition hover:border-primary/30 hover:bg-sidebar focus:outline-none focus:ring-2 focus:ring-primary/20"
      href={stat.href}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-normal text-muted">{stat.label}</p>
        {showMockBadge && stat.tone ? <StatusBadge tone={stat.tone}>模拟</StatusBadge> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-normal">{stat.value}</div>
      <p className="mt-2 text-xs leading-5 text-muted">{stat.detail}</p>
    </Link>
  );
}
