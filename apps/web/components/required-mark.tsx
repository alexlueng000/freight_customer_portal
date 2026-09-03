export function RequiredMark() {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center rounded border border-danger/30 bg-danger/10 px-1.5 text-[11px] font-bold leading-none text-danger"
      title="必填"
    >
      <span aria-hidden className="mr-0.5">
        *
      </span>
      <span>必填</span>
    </span>
  );
}

export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  const trimmed = label.trim();
  const hasRequiredSuffix = trimmed.endsWith('*');
  const displayLabel = hasRequiredSuffix ? trimmed.slice(0, -1).trimEnd() : label;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-medium">
      <span>{displayLabel}</span>
      {required || hasRequiredSuffix ? <RequiredMark /> : null}
    </span>
  );
}

export function RequiredLegend({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <RequiredMark />
      <span>{children}</span>
    </span>
  );
}
