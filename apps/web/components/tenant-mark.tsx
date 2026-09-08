import { Ship } from 'lucide-react';

export function TenantMark({
  companyName,
  logoUrl,
  compact = false,
}: {
  companyName: string;
  logoUrl?: string | null;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <img
          alt={`${companyName} Logo`}
          className="size-10 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
          src={logoUrl}
        />
      ) : (
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--portal-brand,#087E8B)] text-white">
          <Ship aria-hidden className="size-5" />
        </div>
      )}
      {!compact ? <span className="truncate font-semibold">{companyName}</span> : null}
    </div>
  );
}
