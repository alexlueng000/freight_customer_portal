import { Check } from 'lucide-react';
import type { BusinessFlowStage } from '@/lib/business-flow';

const stages: Array<{ key: BusinessFlowStage; label: string; description: string }> = [
  { key: 'rate', label: '运价', description: '查询可用 Rate' },
  { key: 'quoteRequest', label: '报价申请', description: '客户提交需求' },
  { key: 'formalQuote', label: '正式报价', description: '销售核价发布' },
  { key: 'booking', label: '订舱', description: '客户提交 Booking' },
  { key: 'shipment', label: '出运', description: '创建 Shipment' },
  { key: 'tracking', label: '跟踪', description: '更新运输节点' },
  { key: 'document', label: '单证', description: '交付业务文件' },
  { key: 'invoice', label: '发票', description: '查看应收账款' },
];

export function BusinessFlow({
  currentStage,
  currentStageComplete = false,
  currentStatus,
}: {
  currentStage: BusinessFlowStage;
  currentStageComplete?: boolean;
  currentStatus?: string;
}) {
  const currentIndex = stages.findIndex((stage) => stage.key === currentStage);
  const current = stages[currentIndex];
  const next = currentStageComplete ? stages[currentIndex + 1] : undefined;

  return (
    <section
      aria-label="业务全流程"
      className="overflow-hidden rounded border border-border bg-surface"
    >
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-sm font-semibold">业务全流程</h2>
          <p className="mt-1 text-xs text-muted">Rate 到 Invoice 的完整业务链路</p>
        </div>
        <div className="text-xs text-muted">
          {currentStageComplete ? '已完成：' : '当前：'}
          <span className="font-semibold text-primary">{current?.label ?? '业务流程'}</span>
          {currentStatus ? ` · ${currentStatus}` : ''}
          {next ? (
            <>
              <span className="px-1.5 text-border">|</span>
              下一步：<span className="font-semibold text-foreground">{next.label}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto px-3 py-4">
        <ol className="grid min-w-[920px] grid-cols-8" aria-label="业务阶段">
          {stages.map((stage, index) => {
            const completed =
              index < currentIndex || (index === currentIndex && currentStageComplete);
            const active = index === currentIndex && !currentStageComplete;
            return (
              <li
                aria-current={active ? 'step' : undefined}
                className="min-w-0 text-center"
                key={stage.key}
              >
                <div className="flex items-center">
                  <span
                    aria-hidden
                    className={`h-px flex-1 ${index > 0 && index <= currentIndex ? 'bg-primary' : 'bg-border'}`}
                  />
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      completed
                        ? 'bg-primary text-surface'
                        : active
                          ? 'border-2 border-primary bg-surface text-primary ring-4 ring-primary/10'
                          : 'border border-border bg-sidebar text-muted'
                    }`}
                  >
                    {completed ? <Check aria-label="已完成" className="size-4" /> : index + 1}
                  </span>
                  <span
                    aria-hidden
                    className={`h-px flex-1 ${index < currentIndex || (index === currentIndex && currentStageComplete) ? 'bg-primary' : 'bg-border'}`}
                  />
                </div>
                <div
                  className={`mt-2 text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}
                >
                  {stage.label}
                </div>
                <div className="mt-1 px-1 text-xs text-muted">{stage.description}</div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
