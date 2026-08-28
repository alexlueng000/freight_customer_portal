import { cn } from '@/lib/utils';
import type { StatusTone } from '@/lib/mock-data';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-border bg-sidebar text-muted',
  info: 'border-primary/20 bg-primary/10 text-primary',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/20 bg-danger/10 text-danger',
};

export function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: StatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded border px-2 text-xs font-medium',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
