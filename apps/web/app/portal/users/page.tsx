'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { FilterBar } from '@/components/filter-bar';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';
import { useAuth } from '@/components/auth-provider';
import { hasPermission } from '@/lib/auth';

type UserStatus = 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED';
type RoleCode = 'CUSTOMER_ADMIN' | 'CUSTOMER_USER';

interface CustomerUser {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  userRoles: Array<{ role: { code: RoleCode; name: string } }>;
}

interface UserListResponse {
  items: CustomerUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
}

class PortalUsersApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const createUserSchema = z.object({
  displayName: z.string().trim().min(1, '显示名称为必填项').max(150),
  email: z.string().trim().email('请输入有效邮箱').max(320),
  initialPassword: z.string().min(12, '初始密码至少需要 12 个字符').max(128),
  roleCode: z.enum(['CUSTOMER_ADMIN', 'CUSTOMER_USER']),
  status: z.enum(['INVITED', 'ACTIVE']),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const updateUserSchema = z.object({
  roleCode: z.enum(['CUSTOMER_ADMIN', 'CUSTOMER_USER']),
  status: z.enum(['INVITED', 'ACTIVE', 'LOCKED', 'DISABLED']),
});

type UpdateUserValues = z.infer<typeof updateUserSchema>;

const roleLabels: Record<RoleCode, string> = {
  CUSTOMER_ADMIN: '客户管理员',
  CUSTOMER_USER: '客户用户',
};

const statusLabels: Record<UserStatus, string> = {
  INVITED: '待激活',
  ACTIVE: '启用',
  LOCKED: '锁定',
  DISABLED: '停用',
};

const statusTones = {
  INVITED: 'info',
  ACTIVE: 'success',
  LOCKED: 'warning',
  DISABLED: 'neutral',
} as const;

export default function PortalUsersPage() {
  const { apiFetch, user } = useAuth();
  const [items, setItems] = useState<CustomerUser[]>([]);
  const [pagination, setPagination] = useState<UserListResponse['pagination']>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PortalUsersApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<CustomerUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    try {
      const result = await requestJson<UserListResponse>(
        apiFetch,
        `/api/v1/portal/users?${query.toString()}`,
      );
      setItems(result.items);
      setPagination(result.pagination);
    } catch (caught) {
      setError(toPortalUsersError(caught));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, search, status]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const canManage = hasPermission(user, 'customer_user.manage');
  const columns = useMemo<DataTableColumn<CustomerUser>[]>(
    () => [
      {
        key: 'displayName',
        header: '用户',
        render: (item) => (
          <div>
            <div className="font-medium">{item.displayName}</div>
            <div className="mt-0.5 text-xs text-muted">{item.email}</div>
          </div>
        ),
      },
      {
        key: 'role',
        header: '角色',
        render: (item) =>
          item.userRoles.map(({ role }) => roleLabels[role.code]).join('、') || '未分配',
      },
      {
        key: 'lastLoginAt',
        header: '最近登录',
        render: (item) => (item.lastLoginAt ? formatDateTime(item.lastLoginAt) : '从未登录'),
      },
      {
        key: 'status',
        header: '状态',
        render: (item) => (
          <StatusBadge tone={statusTones[item.status]}>{statusLabels[item.status]}</StatusBadge>
        ),
      },
      ...(canManage
        ? [
            {
              key: 'actions',
              header: '操作',
              align: 'right' as const,
              render: (item: CustomerUser) => (
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-sm font-medium hover:border-primary hover:text-primary"
                  onClick={() => setEditingUser(item)}
                  type="button"
                >
                  <Pencil aria-hidden className="size-3.5" /> 管理
                </button>
              ),
            },
          ]
        : []),
    ],
    [canManage],
  );

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          canManage ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-surface"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Plus aria-hidden className="size-4" /> 新建成员
            </button>
          ) : undefined
        }
        description="管理本公司成员账号、角色和账号状态。"
        eyebrow="客户门户"
        title="用户"
      />
      {notice ? (
        <div className="flex items-center justify-between rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
      {error?.code === 'PERMISSION_DENIED' ? (
        <PermissionDeniedState />
      ) : (
        <section className="overflow-hidden rounded border border-border bg-surface">
          <FilterBar
            onClear={clearFilters}
            onSearchChange={setSearchInput}
            placeholder="搜索姓名或邮箱"
            searchValue={searchInput}
          >
            <select
              aria-label="用户状态"
              className={filterClass}
              onChange={(event) => {
                setStatus(event.target.value as UserStatus | '');
                setPage(1);
              }}
              value={status}
            >
              <option value="">全部状态</option>
              <option value="ACTIVE">启用</option>
              <option value="INVITED">待激活</option>
              <option value="LOCKED">锁定</option>
              <option value="DISABLED">停用</option>
            </select>
          </FilterBar>
          {loading ? (
            <LoadingState rows={6} />
          ) : error ? (
            <div className="p-4">
              <ErrorState
                description={error.message}
                onRetry={() => setReloadKey((value) => value + 1)}
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-4">
              <EmptyState title="暂无用户" description="本公司成员账号会显示在这里。" />
            </div>
          ) : (
            <>
              <DataTable columns={columns} data={items} getRowKey={(item) => item.id} />
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
                <span>共 {pagination.total} 个用户</span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="上一页"
                    className={pageButtonClass}
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    type="button"
                  >
                    <ChevronLeft aria-hidden className="size-4" />
                  </button>
                  <span>
                    第 {pagination.page} / {Math.max(1, pagination.totalPages)} 页
                  </span>
                  <button
                    aria-label="下一页"
                    className={pageButtonClass}
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    type="button"
                  >
                    <ChevronRight aria-hidden className="size-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
      {createOpen ? (
        <CreateCustomerUserDialog
          apiFetch={apiFetch}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setNotice('成员账号创建成功。');
            setPage(1);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {editingUser ? (
        <EditCustomerUserDialog
          apiFetch={apiFetch}
          onClose={() => setEditingUser(null)}
          onUpdated={() => {
            setEditingUser(null);
            setNotice('成员账号已更新。');
            setReloadKey((value) => value + 1);
          }}
          targetUser={editingUser}
        />
      ) : null}
    </div>
  );
}

function CreateCustomerUserDialog({
  apiFetch,
  onClose,
  onCreated,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      displayName: '',
      email: '',
      initialPassword: '',
      roleCode: 'CUSTOMER_USER',
      status: 'ACTIVE',
    },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await requestJson<CustomerUser>(apiFetch, '/api/v1/portal/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...values,
          email: values.email.trim().toLowerCase(),
          displayName: values.displayName.trim(),
          userType: 'CUSTOMER',
        }),
      });
      onCreated();
    } catch (caught) {
      setSubmitError(toPortalUsersError(caught).message);
    }
  });

  return (
    <DialogFrame labelledBy="create-customer-user-title" onClose={onClose}>
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold" id="create-customer-user-title">
            新建成员
          </h2>
          <p className="mt-1 text-sm text-muted">成员会自动绑定到当前客户公司。</p>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <form className="space-y-4 p-5" onSubmit={(event) => void submit(event)}>
        {submitError ? <FormError message={submitError} /> : null}
        <FormField error={errors.displayName?.message} label="显示名称 *">
          <input {...register('displayName')} className={inputClass} />
        </FormField>
        <FormField error={errors.email?.message} label="邮箱 *">
          <input {...register('email')} className={inputClass} inputMode="email" />
        </FormField>
        <FormField error={errors.initialPassword?.message} label="初始密码 *">
          <input
            {...register('initialPassword')}
            autoComplete="new-password"
            className={inputClass}
            type="password"
          />
          <span className="mt-1 block text-xs text-muted">
            至少 12 个字符；不会显示在列表或审计日志中。
          </span>
        </FormField>
        <FormField error={errors.roleCode?.message} label="角色 *">
          <select {...register('roleCode')} className={inputClass}>
            <option value="CUSTOMER_USER">客户用户</option>
            <option value="CUSTOMER_ADMIN">客户管理员</option>
          </select>
        </FormField>
        <FormField error={errors.status?.message} label="初始状态">
          <select {...register('status')} className={inputClass}>
            <option value="ACTIVE">启用</option>
            <option value="INVITED">待激活</option>
          </select>
        </FormField>
        <FormActions isSubmitting={isSubmitting} onClose={onClose} submitLabel="保存成员" />
      </form>
    </DialogFrame>
  );
}

function EditCustomerUserDialog({
  apiFetch,
  targetUser,
  onClose,
  onUpdated,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  targetUser: CustomerUser;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const currentRole = targetUser.userRoles[0]?.role.code ?? 'CUSTOMER_USER';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { roleCode: currentRole, status: targetUser.status },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await requestJson<CustomerUser>(apiFetch, `/api/v1/portal/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      onUpdated();
    } catch (caught) {
      setSubmitError(toPortalUsersError(caught).message);
    }
  });

  return (
    <DialogFrame labelledBy="edit-customer-user-title" onClose={onClose}>
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold" id="edit-customer-user-title">
            管理成员
          </h2>
          <p className="mt-1 text-sm text-muted">调整角色和账号状态，变更会记录审计。</p>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <form className="space-y-4 p-5" onSubmit={(event) => void submit(event)}>
        {submitError ? <FormError message={submitError} /> : null}
        <div className="rounded border border-border bg-background px-4 py-3 text-sm">
          <div className="font-medium">{targetUser.displayName}</div>
          <div className="mt-1 text-muted">{targetUser.email}</div>
        </div>
        <FormField error={errors.roleCode?.message} label="角色 *">
          <select {...register('roleCode')} className={inputClass}>
            <option value="CUSTOMER_ADMIN">客户管理员</option>
            <option value="CUSTOMER_USER">客户用户</option>
          </select>
        </FormField>
        <FormField error={errors.status?.message} label="账号状态 *">
          <select {...register('status')} className={inputClass}>
            <option value="ACTIVE">启用</option>
            <option value="INVITED">待激活</option>
            <option value="LOCKED">锁定</option>
            <option value="DISABLED">停用</option>
          </select>
        </FormField>
        <FormActions isSubmitting={isSubmitting} onClose={onClose} submitLabel="保存变更" />
      </form>
    </DialogFrame>
  );
}

function DialogFrame({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30"
      role="dialog"
    >
      <button aria-label="关闭弹窗" className="absolute inset-0" onClick={onClose} type="button" />
      <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-xl">
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      aria-label="关闭"
      className="grid size-9 place-items-center rounded border border-border"
      onClick={onClose}
      type="button"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <FieldLabel label={label} />
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

function FormActions({
  isSubmitting,
  onClose,
  submitLabel,
}: {
  isSubmitting: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface py-4">
      <button
        className="h-9 rounded border border-border px-4 text-sm font-semibold"
        disabled={isSubmitting}
        onClick={onClose}
        type="button"
      >
        取消
      </button>
      <button
        className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? '保存中…' : submitLabel}
      </button>
    </div>
  );
}

async function requestJson<T>(
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(input, init);
  const payload = (await response.json().catch(() => undefined)) as T | ApiErrorPayload | undefined;
  if (!response.ok) {
    const error = payload as ApiErrorPayload | undefined;
    throw new PortalUsersApiError(
      error?.message ?? '客户用户服务暂时不可用，请稍后重试。',
      error?.code,
    );
  }
  return payload as T;
}

function toPortalUsersError(error: unknown): PortalUsersApiError {
  return error instanceof PortalUsersApiError
    ? error
    : new PortalUsersApiError(
        error instanceof Error ? error.message : '客户用户服务暂时不可用，请稍后重试。',
      );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

const inputClass =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
const filterClass =
  'h-9 rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary';
const pageButtonClass =
  'grid size-9 place-items-center rounded border border-border disabled:cursor-not-allowed disabled:opacity-40';
