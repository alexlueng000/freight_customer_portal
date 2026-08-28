'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail, Phone, Plus, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';

type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
type MarkupType = 'NONE' | 'FIXED' | 'PERCENT';

interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  countryCode: string | null;
  taxId: string | null;
  creditLimit: string | null;
  paymentTermDays: number | null;
  defaultMarkupType: MarkupType;
  defaultMarkupValue: string | null;
  salesOwner: { id: string; displayName: string; email: string } | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  _count: { contacts: number; customerUsers: number };
}

interface CustomerContact {
  id: string;
  customerCompanyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  isPrimary: boolean;
  isBookingContact: boolean;
  isDocumentContact: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: { errors?: string[] };
}

class CustomerDetailApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const contactSchema = z.object({
  name: z.string().trim().min(1, '联系人姓名为必填项').max(150),
  email: z
    .string()
    .trim()
    .refine((value) => !value || z.string().email().safeParse(value).success, '请输入有效邮箱'),
  phone: z.string().trim().max(50, '电话不能超过 50 个字符'),
  roleTitle: z.string().trim().max(100, '职位不能超过 100 个字符'),
  isPrimary: z.boolean(),
  isBookingContact: z.boolean(),
  isDocumentContact: z.boolean(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

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

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const { apiFetch, user } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CustomerDetailApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [customerResult, contactsResult] = await Promise.all([
        requestJson<CustomerDetail>(apiFetch, `/api/v1/customers/${customerId}`),
        requestJson<CustomerContact[]>(apiFetch, `/api/v1/customers/${customerId}/contacts`),
      ]);
      setCustomer(customerResult);
      setContacts(contactsResult);
    } catch (caught) {
      setError(toDetailError(caught));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, customerId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const canCreate = user?.roles.some((role) =>
    ['SUPER_ADMIN', 'TENANT_ADMIN', 'SALES'].includes(role),
  );

  const handleCreated = (contact: CustomerContact) => {
    setContacts((current) => sortContacts([...current, contact]));
    setCustomer((current) =>
      current
        ? { ...current, _count: { ...current._count, contacts: current._count.contacts + 1 } }
        : current,
    );
    setCreateOpen(false);
    setNotice('联系人创建成功。');
  };

  if (loading) {
    return <LoadingState rows={8} />;
  }

  if (error?.code === 'PERMISSION_DENIED') {
    return <PermissionDeniedState />;
  }

  if (error || !customer) {
    return (
      <ErrorState
        description={error?.message ?? '客户详情不存在或暂时无法访问。'}
        onRetry={() => setReloadKey((value) => value + 1)}
        title={error?.code === 'CUSTOMER_NOT_FOUND' ? '找不到客户' : '客户详情加载失败'}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-primary"
        href="/admin/customers"
      >
        <ArrowLeft aria-hidden className="size-4" />
        返回客户列表
      </Link>

      <PageHeader
        actions={
          canCreate ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-surface hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/25"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Plus aria-hidden className="size-4" />
              新建联系人
            </button>
          ) : undefined
        }
        description={`${customer.code}${customer.shortName ? ` · ${customer.shortName}` : ''}`}
        eyebrow="客户详情"
        title={customer.name}
      />

      {notice ? (
        <div className="flex items-center justify-between rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}

      <section className="rounded border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">公司信息</h2>
          <StatusBadge tone={statusTones[customer.status]}>
            {statusLabels[customer.status]}
          </StatusBadge>
        </div>
        <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          <InfoItem label="国家/地区" value={customer.countryCode ?? '未设置'} />
          <InfoItem label="税号" value={customer.taxId ?? '未设置'} />
          <InfoItem label="销售负责人" value={customer.salesOwner?.displayName ?? '未分配'} />
          <InfoItem label="客户用户" value={`${customer._count.customerUsers} 个`} />
          <InfoItem
            label="账期"
            value={customer.paymentTermDays === null ? '未设置' : `${customer.paymentTermDays} 天`}
          />
          <InfoItem
            label="信用额度"
            value={customer.creditLimit === null ? '未设置' : formatAmount(customer.creditLimit)}
          />
          <InfoItem label="默认加价" value={formatMarkup(customer)} />
          <InfoItem label="联系人" value={`${contacts.length} 个`} />
        </dl>
      </section>

      <section className="rounded border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">联系人</h2>
          <p className="mt-1 text-sm text-muted">维护报价、订舱和单证沟通所需的客户联系人。</p>
        </div>
        {contacts.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="暂无联系人"
              description="新建联系人后，联系方式和业务标记会显示在这里。"
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {contacts.map((contact) => (
              <ContactRow contact={contact} key={contact.id} />
            ))}
          </div>
        )}
      </section>

      {createOpen ? (
        <CreateContactDialog
          apiFetch={apiFetch}
          customerId={customerId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}

function ContactRow({ contact }: { contact: CustomerContact }) {
  const labels = useMemo(
    () => [
      ...(contact.isPrimary ? ['主要联系人'] : []),
      ...(contact.isBookingContact ? ['订舱联系人'] : []),
      ...(contact.isDocumentContact ? ['单证联系人'] : []),
    ],
    [contact.isBookingContact, contact.isDocumentContact, contact.isPrimary],
  );

  return (
    <article className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(180px,1fr)_minmax(240px,1fr)_minmax(220px,1fr)] md:items-center">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded bg-sidebar text-muted">
          <UserRound aria-hidden className="size-4" />
        </div>
        <div>
          <div className="font-medium">{contact.name}</div>
          <div className="mt-0.5 text-xs text-muted">{contact.roleTitle ?? '未设置职位'}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-sm text-muted">
        <div className="flex items-center gap-2">
          <Mail aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{contact.email ?? '未设置邮箱'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone aria-hidden className="size-4 shrink-0" />
          <span>{contact.phone ?? '未设置电话'}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {labels.length ? (
          labels.map((label) => <StatusBadge key={label}>{label}</StatusBadge>)
        ) : (
          <span className="text-sm text-muted">普通联系人</span>
        )}
      </div>
    </article>
  );
}

function CreateContactDialog({
  apiFetch,
  customerId,
  onClose,
  onCreated,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  customerId: string;
  onClose: () => void;
  onCreated: (contact: CustomerContact) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      roleTitle: '',
      isPrimary: false,
      isBookingContact: false,
      isDocumentContact: false,
    },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const contact = await requestJson<CustomerContact>(
        apiFetch,
        `/api/v1/customers/${customerId}/contacts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: values.name.trim(),
            ...(values.email ? { email: values.email.trim().toLowerCase() } : {}),
            ...(values.phone ? { phone: values.phone.trim() } : {}),
            ...(values.roleTitle ? { roleTitle: values.roleTitle.trim() } : {}),
            isPrimary: values.isPrimary,
            isBookingContact: values.isBookingContact,
            isDocumentContact: values.isDocumentContact,
          }),
        },
      );
      onCreated(contact);
    } catch (caught) {
      setSubmitError(toDetailError(caught).message);
    }
  });

  return (
    <div
      aria-labelledby="create-contact-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30"
      role="dialog"
    >
      <button
        aria-label="关闭新建联系人表单"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="create-contact-title">
              新建联系人
            </h2>
            <p className="mt-1 text-sm text-muted">联系人姓名为必填项，联系方式按实际情况填写。</p>
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

        <form className="space-y-5 p-5" onSubmit={(event) => void submit(event)}>
          {submitError ? (
            <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
              {submitError}
            </div>
          ) : null}
          <FormField error={errors.name?.message} label="联系人姓名 *">
            <input {...register('name')} className={inputClass} placeholder="请输入姓名" />
          </FormField>
          <FormField error={errors.roleTitle?.message} label="职位">
            <input {...register('roleTitle')} className={inputClass} placeholder="例如物流经理" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField error={errors.email?.message} label="邮箱">
              <input
                {...register('email')}
                className={inputClass}
                inputMode="email"
                placeholder="name@example.com"
              />
            </FormField>
            <FormField error={errors.phone?.message} label="电话">
              <input {...register('phone')} className={inputClass} inputMode="tel" />
            </FormField>
          </div>

          <fieldset className="space-y-3 border-t border-border pt-5">
            <legend className="text-sm font-semibold">业务标记</legend>
            <CheckboxField
              label="主要联系人"
              description="作为该客户公司默认的主要沟通联系人"
              register={register('isPrimary')}
            />
            <CheckboxField
              label="订舱联系人"
              description="创建 Booking 时优先选择"
              register={register('isBookingContact')}
            />
            <CheckboxField
              label="单证联系人"
              description="单证发送和确认时优先选择"
              register={register('isDocumentContact')}
            />
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
              {isSubmitting ? '保存中…' : '保存联系人'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CheckboxField({
  label,
  description,
  register,
}: {
  label: string;
  description: string;
  register: ReturnType<ReturnType<typeof useForm<ContactFormValues>>['register']>;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded border border-border p-3 hover:bg-sidebar">
      <input {...register} className="mt-1 size-4 accent-primary" type="checkbox" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
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
      <span className="font-medium">{label}</span>
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
    throw new CustomerDetailApiError(
      error?.message ?? '客户服务暂时不可用，请稍后重试。',
      error?.code,
    );
  }
  return payload as T;
}

function toDetailError(error: unknown): CustomerDetailApiError {
  return error instanceof CustomerDetailApiError
    ? error
    : new CustomerDetailApiError(
        error instanceof Error ? error.message : '客户服务暂时不可用，请稍后重试。',
      );
}

function sortContacts(contacts: CustomerContact[]): CustomerContact[] {
  return [...contacts].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
}

function formatAmount(value: string): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatMarkup(customer: CustomerDetail): string {
  if (customer.defaultMarkupType === 'NONE' || customer.defaultMarkupValue === null)
    return '无加价';
  return customer.defaultMarkupType === 'PERCENT'
    ? `${Number(customer.defaultMarkupValue).toFixed(2)}%`
    : `固定金额 ${formatAmount(customer.defaultMarkupValue)}`;
}

const inputClass =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
