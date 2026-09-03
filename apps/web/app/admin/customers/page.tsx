'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { FilterBar } from '@/components/filter-bar';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel, RequiredLegend } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';
import { useAuth } from '@/components/auth-provider';
import { hasPermission } from '@/lib/auth';

type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
type MarkupType = 'NONE' | 'FIXED' | 'PERCENT';
type RoleCode =
  | 'TENANT_ADMIN'
  | 'SALES'
  | 'OPERATION'
  | 'FINANCE'
  | 'CUSTOMER_ADMIN'
  | 'CUSTOMER_USER';

interface Customer {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  countryCode: string | null;
  creditLimit: string | null;
  paymentTermDays: number | null;
  defaultMarkupType: MarkupType;
  defaultMarkupValue: string | null;
  salesOwner: { id: string; displayName: string; email: string } | null;
  status: CustomerStatus;
  createdAt: string;
  _count: { contacts: number; customerUsers: number };
}

interface CustomerListResponse {
  items: Customer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface SalesUserOption {
  id: string;
  displayName: string;
  email: string;
  userRoles: Array<{ role: { code: RoleCode } }>;
}

interface UserListResponse {
  items: SalesUserOption[];
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: { errors?: string[] };
}

class CustomerApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: ApiErrorPayload['details'],
  ) {
    super(message);
  }
}

const optionalDecimal = z
  .string()
  .trim()
  .refine(
    (value) => !value || /^\d{1,14}(?:\.\d{1,4})?$/.test(value),
    '请输入有效数字，最多 4 位小数',
  );

const customerSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, '客户代码为必填项')
      .max(50, '客户代码不能超过 50 个字符')
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, '仅支持字母、数字、下划线和连字符'),
    name: z.string().trim().min(1, '公司名称为必填项').max(200),
    shortName: z.string().trim().max(100),
    countryCode: z
      .string()
      .trim()
      .refine((value) => !value || /^[A-Za-z]{2}$/.test(value), '请输入两位国家/地区代码'),
    creditLimit: optionalDecimal,
    paymentTermDays: z
      .string()
      .trim()
      .refine(
        (value) => !value || (/^\d+$/.test(value) && Number(value) <= 3650),
        '账期必须是 0–3650 的整数',
      ),
    defaultMarkupType: z.enum(['NONE', 'FIXED', 'PERCENT']),
    defaultMarkupValue: optionalDecimal,
    salesOwnerId: z.string(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']),
  })
  .superRefine((value, context) => {
    if (value.defaultMarkupType !== 'NONE' && !value.defaultMarkupValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultMarkupValue'],
        message: '固定或百分比加价必须填写数值',
      });
    }
    if (value.defaultMarkupType === 'NONE' && value.defaultMarkupValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultMarkupValue'],
        message: '无加价时请清空加价值',
      });
    }
  });

type CustomerFormValues = z.infer<typeof customerSchema>;

const statusLabels: Record<CustomerStatus, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  BLOCKED: '冻结',
};

const statusTones = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  BLOCKED: 'danger',
} as const;

const markupLabels: Record<MarkupType, string> = {
  NONE: '无加价',
  FIXED: '固定金额',
  PERCENT: '百分比',
};

export default function CustomersPage() {
  const router = useRouter();
  const { apiFetch, user } = useAuth();
  const [items, setItems] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<CustomerListResponse['pagination']>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CustomerApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [salesUsers, setSalesUsers] = useState<SalesUserOption[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    try {
      const result = await requestJson<CustomerListResponse>(
        apiFetch,
        `/api/v1/customers?${query.toString()}`,
      );
      setItems(result.items);
      setPagination(result.pagination);
    } catch (caught) {
      setError(toCustomerError(caught));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, search, status]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers, reloadKey]);

  useEffect(() => {
    if (!hasPermission(user, 'user.read')) return;
    requestJson<UserListResponse>(
      apiFetch,
      '/api/v1/users?page=1&pageSize=100&userType=INTERNAL&status=ACTIVE',
    )
      .then((result) =>
        setSalesUsers(
          result.items.filter((item) =>
            item.userRoles.some(({ role }) => role.code === 'SALES'),
          ),
        ),
      )
      .catch(() => setSalesUsers([]));
  }, [apiFetch, user]);

  const canCreate = hasPermission(user, 'customer.manage');

  const columns = useMemo<DataTableColumn<Customer>[]>(
    () => [
      {
        key: 'name',
        header: '客户公司',
        render: (customer) => (
          <div>
            <Link
              className="font-medium text-foreground hover:text-primary hover:underline"
              href={`/admin/customers/${customer.id}`}
              onClick={(event) => event.stopPropagation()}
            >
              {customer.name}
            </Link>
            <div className="mt-0.5 text-xs text-muted">{customer.code}</div>
          </div>
        ),
      },
      {
        key: 'countryCode',
        header: '国家/地区',
        render: (customer) => customer.countryCode ?? '—',
      },
      {
        key: 'salesOwner',
        header: '销售负责人',
        render: (customer) => customer.salesOwner?.displayName ?? '未分配',
      },
      {
        key: 'terms',
        header: '账期 / 信用额度',
        render: (customer) => (
          <div>
            <div>
              {customer.paymentTermDays === null ? '未设置账期' : `${customer.paymentTermDays} 天`}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {customer.creditLimit === null ? '未设额度' : formatAmount(customer.creditLimit)}
            </div>
          </div>
        ),
      },
      {
        key: 'markup',
        header: '默认加价',
        render: (customer) => formatMarkup(customer),
      },
      {
        key: 'contacts',
        header: '联系人 / 用户',
        render: (customer) => `${customer._count.contacts} / ${customer._count.customerUsers}`,
      },
      {
        key: 'status',
        header: '状态',
        render: (customer) => (
          <StatusBadge tone={statusTones[customer.status]}>
            {statusLabels[customer.status]}
          </StatusBadge>
        ),
      },
      {
        key: 'detail',
        header: '操作',
        className: 'w-24 text-right',
        render: (customer) => (
          <Link
            aria-label={`查看 ${customer.name} 详情`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            href={`/admin/customers/${customer.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            详情
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        ),
      },
    ],
    [],
  );

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPage(1);
  };

  const handleCreated = () => {
    setCreateOpen(false);
    setNotice('客户创建成功，列表已刷新。');
    setPage(1);
    setReloadKey((value) => value + 1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          canCreate ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-surface hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/25"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Plus aria-hidden className="size-4" />
              新建客户
            </button>
          ) : undefined
        }
        description="维护客户公司、账期、信用额度和基础加价规则。"
        eyebrow="运营后台"
        title="客户"
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
            placeholder="搜索客户名称、简称或代码"
            searchValue={searchInput}
          >
            <select
              aria-label="客户状态"
              className="h-9 rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              onChange={(event) => {
                setStatus(event.target.value as CustomerStatus | '');
                setPage(1);
              }}
              value={status}
            >
              <option value="">全部状态</option>
              <option value="ACTIVE">启用</option>
              <option value="INACTIVE">停用</option>
              <option value="BLOCKED">冻结</option>
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
              <EmptyState
                description={
                  search || status ? '请调整筛选条件后重试。' : '新建客户后，记录会显示在这里。'
                }
                title={search || status ? '没有匹配的客户' : '暂无客户公司'}
              />
            </div>
          ) : (
            <>
              <DataTable
                columns={columns}
                data={items}
                getRowKey={(customer) => customer.id}
                onRowClick={(customer) => router.push(`/admin/customers/${customer.id}`)}
              />
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
                <span>共 {pagination.total} 家客户</span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="上一页"
                    className="grid size-9 place-items-center rounded border border-border disabled:cursor-not-allowed disabled:opacity-40"
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
                    className="grid size-9 place-items-center rounded border border-border disabled:cursor-not-allowed disabled:opacity-40"
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
        <CreateCustomerDialog
          apiFetch={apiFetch}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          salesUsers={salesUsers}
        />
      ) : null}
    </div>
  );
}

function CreateCustomerDialog({
  apiFetch,
  onClose,
  onCreated,
  salesUsers,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onCreated: () => void;
  salesUsers: SalesUserOption[];
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      code: '',
      name: '',
      shortName: '',
      countryCode: '',
      creditLimit: '',
      paymentTermDays: '',
      defaultMarkupType: 'NONE',
      defaultMarkupValue: '',
      salesOwnerId: '',
      status: 'ACTIVE',
    },
  });
  const markupType = watch('defaultMarkupType');

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    const payload = {
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      ...(values.shortName ? { shortName: values.shortName.trim() } : {}),
      ...(values.countryCode ? { countryCode: values.countryCode.trim().toUpperCase() } : {}),
      ...(values.creditLimit ? { creditLimit: values.creditLimit } : {}),
      ...(values.paymentTermDays ? { paymentTermDays: Number(values.paymentTermDays) } : {}),
      defaultMarkupType: values.defaultMarkupType,
      ...(values.defaultMarkupValue ? { defaultMarkupValue: values.defaultMarkupValue } : {}),
      ...(values.salesOwnerId ? { salesOwnerId: values.salesOwnerId } : {}),
      status: values.status,
    };
    try {
      await requestJson<Customer>(apiFetch, '/api/v1/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      onCreated();
    } catch (caught) {
      setSubmitError(toCustomerError(caught).message);
    }
  });

  return (
    <div
      aria-labelledby="create-customer-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30"
      role="dialog"
    >
      <button
        aria-label="关闭新建客户表单"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-surface shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="create-customer-title">
              新建客户
            </h2>
            <p className="mt-1 text-sm text-muted">
              <RequiredLegend>字段为保存客户前必须填写，保存后可继续添加联系人。</RequiredLegend>
            </p>
          </div>
          <button
            aria-label="关闭"
            className="grid size-9 place-items-center rounded border border-border text-muted hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <form className="space-y-6 p-5" onSubmit={(event) => void submit(event)}>
          {submitError ? (
            <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
              {submitError}
            </div>
          ) : null}

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="col-span-full mb-1 text-sm font-semibold">基本信息</legend>
            <FormField error={errors.code?.message} label="客户代码 *">
              <input {...register('code')} className={inputClass} placeholder="例如 NORTHSTAR" />
            </FormField>
            <FormField error={errors.name?.message} label="公司名称 *">
              <input
                {...register('name')}
                className={inputClass}
                placeholder="请输入完整公司名称"
              />
            </FormField>
            <FormField error={errors.shortName?.message} label="简称">
              <input {...register('shortName')} className={inputClass} />
            </FormField>
            <FormField error={errors.countryCode?.message} label="国家/地区代码">
              <input
                {...register('countryCode')}
                className={inputClass}
                maxLength={2}
                placeholder="CN"
              />
            </FormField>
            <FormField error={errors.status?.message} label="状态">
              <select {...register('status')} className={inputClass}>
                <option value="ACTIVE">启用</option>
                <option value="INACTIVE">停用</option>
                <option value="BLOCKED">冻结</option>
              </select>
            </FormField>
            <FormField error={errors.salesOwnerId?.message} label="销售负责人">
              <select {...register('salesOwnerId')} className={inputClass}>
                <option value="">暂不分配</option>
                {salesUsers.map((sales) => (
                  <option key={sales.id} value={sales.id}>
                    {sales.displayName} ({sales.email})
                  </option>
                ))}
              </select>
            </FormField>
          </fieldset>

          <fieldset className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <legend className="col-span-full mb-1 text-sm font-semibold">信用与账期</legend>
            <FormField error={errors.creditLimit?.message} label="信用额度">
              <input
                {...register('creditLimit')}
                className={inputClass}
                inputMode="decimal"
                placeholder="0.0000"
              />
            </FormField>
            <FormField error={errors.paymentTermDays?.message} label="账期（天）">
              <input
                {...register('paymentTermDays')}
                className={inputClass}
                inputMode="numeric"
                placeholder="30"
              />
            </FormField>
          </fieldset>

          <fieldset className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <legend className="col-span-full mb-1 text-sm font-semibold">基础加价规则</legend>
            <FormField error={errors.defaultMarkupType?.message} label="加价类型">
              <select {...register('defaultMarkupType')} className={inputClass}>
                <option value="NONE">无加价</option>
                <option value="FIXED">固定金额</option>
                <option value="PERCENT">百分比</option>
              </select>
            </FormField>
            <FormField error={errors.defaultMarkupValue?.message} label="加价值">
              <input
                {...register('defaultMarkupValue')}
                className={inputClass}
                disabled={markupType === 'NONE'}
                inputMode="decimal"
                placeholder={markupType === 'PERCENT' ? '例如 5.0000' : '0.0000'}
              />
            </FormField>
          </fieldset>

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
              {isSubmitting ? '保存中…' : '保存客户'}
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
    throw new CustomerApiError(
      error?.message ?? '客户服务暂时不可用，请稍后重试。',
      error?.code,
      error?.details,
    );
  }
  return payload as T;
}

function toCustomerError(error: unknown): CustomerApiError {
  return error instanceof CustomerApiError
    ? error
    : new CustomerApiError(
        error instanceof Error ? error.message : '客户服务暂时不可用，请稍后重试。',
      );
}

function formatAmount(value: string): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatMarkup(customer: Customer): string {
  if (customer.defaultMarkupType === 'NONE' || customer.defaultMarkupValue === null) {
    return markupLabels.NONE;
  }
  const value = Number(customer.defaultMarkupValue);
  return customer.defaultMarkupType === 'PERCENT'
    ? `${value.toFixed(2)}%`
    : `${markupLabels.FIXED} ${formatAmount(customer.defaultMarkupValue)}`;
}

const inputClass =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-sidebar disabled:text-muted';
