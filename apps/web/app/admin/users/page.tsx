'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { hasPermission } from '@/lib/auth';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { FilterBar } from '@/components/filter-bar';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';

type UserType = 'INTERNAL' | 'CUSTOMER';
type UserStatus = 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED';
type RoleCode =
  'TENANT_ADMIN' | 'SALES' | 'OPERATION' | 'FINANCE' | 'CUSTOMER_ADMIN' | 'CUSTOMER_USER';

interface TenantUser {
  id: string;
  email: string;
  displayName: string;
  userType: UserType;
  status: UserStatus;
  customerCompanyId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  customerCompany: { id: string; code: string; name: string } | null;
  userRoles: Array<{ role: { code: RoleCode; name: string } }>;
}

interface UserListResponse {
  items: TenantUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface CustomerListResponse {
  items: CustomerOption[];
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
}

class UsersApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const createUserSchema = z
  .object({
    displayName: z.string().trim().min(1, '显示名称为必填项').max(150),
    email: z.string().trim().email('请输入有效邮箱').max(320),
    initialPassword: z.string().min(12, '初始密码至少需要 12 个字符').max(128),
    userType: z.enum(['INTERNAL', 'CUSTOMER']),
    roleCode: z.enum([
      'TENANT_ADMIN',
      'SALES',
      'OPERATION',
      'FINANCE',
      'CUSTOMER_ADMIN',
      'CUSTOMER_USER',
    ]),
    customerCompanyId: z.string(),
    status: z.enum(['INVITED', 'ACTIVE']),
  })
  .superRefine((value, context) => {
    if (value.userType === 'CUSTOMER' && !value.customerCompanyId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerCompanyId'],
        message: '客户用户必须绑定客户公司',
      });
    }
  });

type CreateUserValues = z.infer<typeof createUserSchema>;

const updateUserSchema = z.object({
  roleCode: z.enum([
    'TENANT_ADMIN',
    'SALES',
    'OPERATION',
    'FINANCE',
    'CUSTOMER_ADMIN',
    'CUSTOMER_USER',
  ]),
  status: z.enum(['INVITED', 'ACTIVE', 'LOCKED', 'DISABLED']),
});

type UpdateUserValues = z.infer<typeof updateUserSchema>;

const roleLabels: Record<RoleCode, string> = {
  TENANT_ADMIN: '租户管理员',
  SALES: '销售',
  OPERATION: '操作',
  FINANCE: '财务',
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

export default function UsersPage() {
  const searchParams = useSearchParams();
  const scopedCustomerId = searchParams.get('customerCompanyId') ?? '';
  const openCustomerCreate = searchParams.get('createCustomer') === '1';
  const { apiFetch, user } = useAuth();
  const [items, setItems] = useState<TenantUser[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [pagination, setPagination] = useState<UserListResponse['pagination']>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [userType, setUserType] = useState<UserType | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UsersApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(openCustomerCreate);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
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
    if (userType) query.set('userType', userType);
    if (status) query.set('status', status);
    if (scopedCustomerId) query.set('customerCompanyId', scopedCustomerId);
    try {
      const [usersResult, customersResult] = await Promise.all([
        requestJson<UserListResponse>(apiFetch, `/api/v1/users?${query.toString()}`),
        requestJson<CustomerListResponse>(
          apiFetch,
          '/api/v1/customers?page=1&pageSize=100&status=ACTIVE',
        ),
      ]);
      setItems(usersResult.items);
      setPagination(usersResult.pagination);
      setCustomers(customersResult.items);
    } catch (caught) {
      setError(toUsersError(caught));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, scopedCustomerId, search, status, userType]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const canManage = hasPermission(user, 'user.manage');
  const columns = useMemo<DataTableColumn<TenantUser>[]>(
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
        key: 'userType',
        header: '类型',
        render: (item) => (item.userType === 'INTERNAL' ? '内部用户' : '客户用户'),
      },
      {
        key: 'role',
        header: '角色',
        render: (item) =>
          item.userRoles.map(({ role }) => roleLabels[role.code]).join('、') || '未分配',
      },
      {
        key: 'customerCompany',
        header: '客户公司',
        render: (item) => item.customerCompany?.name ?? '—',
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
              render: (item: TenantUser) => (
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
    setUserType('');
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
              <Plus aria-hidden className="size-4" /> 新建用户
            </button>
          ) : undefined
        }
        description="管理租户内部员工、客户账号及其角色和数据范围。"
        eyebrow="运营后台"
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
              aria-label="用户类型"
              className={filterClass}
              onChange={(event) => {
                setUserType(event.target.value as UserType | '');
                setPage(1);
              }}
              value={userType}
            >
              <option value="">全部类型</option>
              <option value="INTERNAL">内部用户</option>
              <option value="CUSTOMER">客户用户</option>
            </select>
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
              <EmptyState title="暂无用户" description="请调整筛选条件，或创建第一个用户。" />
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
        <CreateUserDialog
          apiFetch={apiFetch}
          defaultCustomerCompanyId={scopedCustomerId}
          customers={customers}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setNotice('用户创建成功。');
            setPage(1);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {editingUser ? (
        <EditUserDialog
          apiFetch={apiFetch}
          onClose={() => setEditingUser(null)}
          onUpdated={() => {
            setEditingUser(null);
            setNotice('用户角色和状态已更新。');
            setReloadKey((value) => value + 1);
          }}
          targetUser={editingUser}
        />
      ) : null}
    </div>
  );
}

function EditUserDialog({
  apiFetch,
  targetUser,
  onClose,
  onUpdated,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  targetUser: TenantUser;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const currentRole = targetUser.userRoles[0]?.role.code;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      roleCode: currentRole ?? (targetUser.userType === 'INTERNAL' ? 'SALES' : 'CUSTOMER_USER'),
      status: targetUser.status,
    },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await requestJson<TenantUser>(apiFetch, `/api/v1/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      onUpdated();
    } catch (caught) {
      setSubmitError(toUsersError(caught).message);
    }
  });

  return (
    <div
      aria-labelledby="edit-user-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30"
      role="dialog"
    >
      <button
        aria-label="关闭用户管理表单"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="edit-user-title">
              管理用户
            </h2>
            <p className="mt-1 text-sm text-muted">调整角色和账号状态，变更会记录到审计日志。</p>
          </div>
          <button
            aria-label="关闭"
            className="grid size-9 place-items-center rounded border border-border"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <form className="space-y-4 p-5" onSubmit={(event) => void submit(event)}>
          {submitError ? (
            <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
              {submitError}
            </div>
          ) : null}
          <div className="rounded border border-border bg-background px-4 py-3 text-sm">
            <div className="font-medium">{targetUser.displayName}</div>
            <div className="mt-1 text-muted">{targetUser.email}</div>
            <div className="mt-2 text-xs text-muted">
              {targetUser.userType === 'INTERNAL' ? '内部用户' : '客户用户'}
              {targetUser.customerCompany ? ` · ${targetUser.customerCompany.name}` : ''}
            </div>
          </div>
          <FormField error={errors.roleCode?.message} label="角色 *">
            <select {...register('roleCode')} className={inputClass}>
              {targetUser.userType === 'INTERNAL' ? (
                <>
                  <option value="TENANT_ADMIN">租户管理员</option>
                  <option value="SALES">销售</option>
                  <option value="OPERATION">操作</option>
                  <option value="FINANCE">财务</option>
                </>
              ) : (
                <>
                  <option value="CUSTOMER_ADMIN">客户管理员</option>
                  <option value="CUSTOMER_USER">客户用户</option>
                </>
              )}
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
              {isSubmitting ? '保存中…' : '保存变更'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateUserDialog({
  apiFetch,
  defaultCustomerCompanyId,
  customers,
  onClose,
  onCreated,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  defaultCustomerCompanyId?: string;
  customers: CustomerOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      displayName: '',
      email: '',
      initialPassword: '',
      userType: defaultCustomerCompanyId ? 'CUSTOMER' : 'INTERNAL',
      roleCode: defaultCustomerCompanyId ? 'CUSTOMER_USER' : 'SALES',
      customerCompanyId: defaultCustomerCompanyId ?? '',
      status: 'ACTIVE',
    },
  });
  const selectedType = watch('userType');
  useEffect(() => {
    setValue('roleCode', selectedType === 'INTERNAL' ? 'SALES' : 'CUSTOMER_USER');
    if (selectedType === 'INTERNAL') setValue('customerCompanyId', '');
  }, [selectedType, setValue]);
  useEffect(() => {
    if (
      selectedType === 'CUSTOMER' &&
      defaultCustomerCompanyId &&
      customers.some((customer) => customer.id === defaultCustomerCompanyId)
    ) {
      setValue('customerCompanyId', defaultCustomerCompanyId, { shouldValidate: true });
    }
  }, [customers, defaultCustomerCompanyId, selectedType, setValue]);

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await requestJson<TenantUser>(apiFetch, '/api/v1/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...values,
          email: values.email.trim().toLowerCase(),
          displayName: values.displayName.trim(),
          ...(values.userType === 'INTERNAL' ? { customerCompanyId: undefined } : {}),
        }),
      });
      onCreated();
    } catch (caught) {
      setSubmitError(toUsersError(caught).message);
    }
  });

  return (
    <div
      aria-labelledby="create-user-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30"
      role="dialog"
    >
      <button
        aria-label="关闭新建用户表单"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="create-user-title">
              新建用户
            </h2>
            <p className="mt-1 text-sm text-muted">设置账号类型、角色和初始密码。</p>
          </div>
          <button
            aria-label="关闭"
            className="grid size-9 place-items-center rounded border border-border"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <form className="space-y-4 p-5" onSubmit={(event) => void submit(event)}>
          {submitError ? (
            <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
              {submitError}
            </div>
          ) : null}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField error={errors.userType?.message} label="用户类型 *">
              <select {...register('userType')} className={inputClass}>
                <option value="INTERNAL">内部用户</option>
                <option value="CUSTOMER">客户用户</option>
              </select>
            </FormField>
            <FormField error={errors.roleCode?.message} label="角色 *">
              <select {...register('roleCode')} className={inputClass}>
                {selectedType === 'INTERNAL' ? (
                  <>
                    <option value="TENANT_ADMIN">租户管理员</option>
                    <option value="SALES">销售</option>
                    <option value="OPERATION">操作</option>
                    <option value="FINANCE">财务</option>
                  </>
                ) : (
                  <>
                    <option value="CUSTOMER_ADMIN">客户管理员</option>
                    <option value="CUSTOMER_USER">客户用户</option>
                  </>
                )}
              </select>
            </FormField>
          </div>
          {selectedType === 'CUSTOMER' ? (
            <FormField error={errors.customerCompanyId?.message} label="客户公司 *">
              <select {...register('customerCompanyId')} className={inputClass}>
                <option value="">请选择客户公司</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.code})
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
          <FormField error={errors.status?.message} label="初始状态">
            <select {...register('status')} className={inputClass}>
              <option value="ACTIVE">启用</option>
              <option value="INVITED">待激活</option>
            </select>
          </FormField>
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
              {isSubmitting ? '保存中…' : '保存用户'}
            </button>
          </div>
        </form>
      </div>
    </div>
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

async function requestJson<T>(
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(input, init);
  const payload = (await response.json().catch(() => undefined)) as T | ApiErrorPayload | undefined;
  if (!response.ok) {
    const error = payload as ApiErrorPayload | undefined;
    throw new UsersApiError(error?.message ?? '用户服务暂时不可用，请稍后重试。', error?.code);
  }
  return payload as T;
}

function toUsersError(error: unknown): UsersApiError {
  return error instanceof UsersApiError
    ? error
    : new UsersApiError(
        error instanceof Error ? error.message : '用户服务暂时不可用，请稍后重试。',
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
