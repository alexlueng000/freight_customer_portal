'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FieldLabel } from '@/components/required-mark';

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

interface CustomerOption {
  id: string;
  code: string;
  name: string;
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
    displayName: z.string().trim().min(1, '用户名为必填项').max(150),
    email: z.string().trim().email('请输入有效邮箱').max(320),
    initialPassword: z.string().min(6, '初始密码至少需要 6 个字符').max(128),
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
    if (value.userType === 'INTERNAL' && value.initialPassword.length < 12) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['initialPassword'], message: '员工初始密码至少需要 12 个字符' });
    }
    if (value.userType === 'CUSTOMER' && !value.customerCompanyId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerCompanyId'],
        message: '客户用户必须绑定客户公司',
      });
    }
  });

type CreateUserValues = z.infer<typeof createUserSchema>;

export function CreateUserDialog({
  apiFetch,
  defaultCustomerCompanyId,
  lockedCustomer,
  customers,
  onClose,
  onCreated,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  defaultCustomerCompanyId?: string;
  lockedCustomer?: CustomerOption;
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
      userType: lockedCustomer || defaultCustomerCompanyId ? 'CUSTOMER' : 'INTERNAL',
      roleCode: lockedCustomer || defaultCustomerCompanyId ? 'CUSTOMER_USER' : 'SALES',
      customerCompanyId: lockedCustomer?.id ?? defaultCustomerCompanyId ?? '',
      status: 'ACTIVE',
    },
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    dialog?.querySelector<HTMLInputElement>('input')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isSubmitting) onClose();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    dialog?.addEventListener('keydown', handleKey);
    return () => {
      dialog?.removeEventListener('keydown', handleKey);
      previous?.focus();
    };
  }, [onClose, isSubmitting]);
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
          ...(lockedCustomer ? { userType: 'CUSTOMER', customerCompanyId: lockedCustomer.id } : {}),
          email: values.email.trim().toLowerCase(),
          displayName: values.displayName.trim(),
          ...(!lockedCustomer && values.userType === 'INTERNAL'
            ? { customerCompanyId: undefined }
            : {}),
        }),
      });
      onCreated();
    } catch (caught) {
      setSubmitError(toUsersError(caught).message);
    }
  });

  return (
    <div
      ref={dialogRef}
      aria-labelledby="create-user-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30"
      role="dialog"
    >
      <button
        aria-label="关闭新建用户表单"
        className="absolute inset-0"
        onClick={onClose}
        disabled={isSubmitting}
        type="button"
      />
      <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="create-user-title">
              {lockedCustomer ? '开通客户账号' : '新建用户'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {lockedCustomer
                ? `为 ${lockedCustomer.name} 开通客户门户账号。`
                : '设置账号类型、角色和初始密码。'}
            </p>
          </div>
          <button
            aria-label="关闭"
            className="grid size-9 place-items-center rounded border border-border"
            onClick={onClose}
            disabled={isSubmitting}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <form className="space-y-4 p-5" onSubmit={(event) => void submit(event)}>
          {submitError ? (
            <div
              role="alert"
              className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {submitError}
            </div>
          ) : null}
          <FormField error={errors.displayName?.message} label="用户名 *">
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
              至少 {selectedType === 'CUSTOMER' ? 6 : 12} 个字符。
            </span>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            {!lockedCustomer ? (
              <FormField error={errors.userType?.message} label="用户类型 *">
                <select {...register('userType')} className={inputClass}>
                  <option value="INTERNAL">内部用户</option>
                  <option value="CUSTOMER">客户用户</option>
                </select>
              </FormField>
            ) : null}
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
          {selectedType === 'CUSTOMER' && !lockedCustomer ? (
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
              {isSubmitting ? '保存中…' : lockedCustomer ? '开通客户账号' : '保存用户'}
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

const inputClass =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
