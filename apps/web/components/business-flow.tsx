import { Check } from 'lucide-react';
import type { BusinessFlowStage } from '@/lib/business-flow';

const stages = [
  { key: 'formalQuote', label: '报价确认', description: '销售报价，客户确认' },
  { key: 'booking', label: '订舱办理', description: '提交资料，获取 SO' },
  { key: 'shipment', label: '运输进展', description: '查看开船与到港信息' },
];

export function BusinessFlow({
  currentStage,
  currentStageComplete = false,
  currentStatus,
  stopped = false,
}: {
  currentStage: BusinessFlowStage;
  currentStageComplete?: boolean;
  currentStatus?: string;
  stopped?: boolean;
}) {
  // Legacy modules are preserved outside the pilot journey.
  if (currentStage === 'document' || currentStage === 'invoice') return null;
  const stageKey = currentStage === 'quoteRequest' ? 'formalQuote'
    : currentStage === 'tracking' ? 'shipment' : currentStage;
  const currentIndex = stages.findIndex((stage) => stage.key === stageKey);
  const current = stages[currentIndex];
  const next = !stopped && currentStageComplete ? stages[currentIndex + 1] : undefined;

  return (
    <section aria-label="业务进度" className="rounded border border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">业务进度</h2>
        <p className="text-sm text-muted" aria-live="polite">
          {stopped ? '已终止：' : currentStageComplete ? '已完成：' : '当前：'}
          <span className="font-semibold text-foreground">{current?.label ?? '查运价'}</span>
          {currentStatus ? ` · ${currentStatus}` : ''}
          {next ? ` · 下一步：${next.label}` : ''}
        </p>
      </div>
      <ol className="grid gap-4 p-4 sm:grid-cols-3" aria-label="业务阶段">
        {stages.map((stage, index) => {
          const completed = index < currentIndex || (index === currentIndex && currentStageComplete && !stopped);
          const active = index === currentIndex && !currentStageComplete && !stopped;
          return (
            <li aria-current={active ? 'step' : undefined} className="flex min-w-0 items-center gap-3" key={stage.key}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                completed ? 'bg-primary text-surface' : active
                  ? 'border-2 border-primary text-primary' : 'border border-border text-muted'
              }`}>
                {completed ? <Check aria-label="已完成" className="size-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{stage.label}</div>
                <div className="mt-1 text-xs text-muted">{stage.description}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
