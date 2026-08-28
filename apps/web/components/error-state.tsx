import { AlertTriangle, Lock } from 'lucide-react';

export function ErrorState({
  title = '页面加载失败',
  description = '请稍后重试，或返回上一页继续处理其他任务。',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded border border-danger/20 bg-surface p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 text-danger" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          {onRetry ? (
            <button
              className="mt-3 h-9 rounded border border-border px-3 text-sm font-semibold"
              onClick={onRetry}
              type="button"
            >
              重试
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PermissionDeniedState() {
  return (
    <div className="rounded border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <Lock aria-hidden className="mt-0.5 size-5 text-muted" />
        <div>
          <h3 className="text-sm font-semibold">权限不足</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            当前账号没有访问该数据或执行该操作的权限，请联系租户管理员。
          </p>
        </div>
      </div>
    </div>
  );
}
