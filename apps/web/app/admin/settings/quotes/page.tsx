'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';

export default function QuoteSettingsPage() {
  const { apiFetch, user } = useAuth();
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const administrator = user?.roles.some((role) => role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN');
  useEffect(() => { void (async () => {
    try { const response = await apiFetch('/api/v1/admin/quote-settings'); const body = await response.json() as { message?: string; quoteApprovalRequired: boolean };
      if (!response.ok) throw new Error(body.message ?? '设置加载失败'); setRequired(body.quoteApprovalRequired);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '设置加载失败'); } finally { setLoading(false); }
  })(); }, [apiFetch]);
  const save = async () => { setSaving(true); setError(''); setNotice('');
    try { const response = await apiFetch('/api/v1/admin/quote-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteApprovalRequired: required }) });
      const body = await response.json() as { message?: string }; if (!response.ok) throw new Error(body.message ?? '保存失败'); setNotice('报价审核设置已保存。');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '保存失败'); } finally { setSaving(false); }
  };
  if (loading) return <LoadingState />;
  return <section className="space-y-4 rounded border border-border bg-surface p-5">
    <h2 className="font-semibold">正式报价发布审核</h2>
    <p className="text-sm text-muted">开启后，销售保存报价并提交审核，租户管理员审核通过后直接发布给客户。驳回后可修改重提；审核中禁止修改。已发布报价保持只读。</p>
    {error ? <ErrorState description={error} /> : null}
    {notice ? <p role="status" className="text-sm text-success">{notice}</p> : null}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={required} disabled={!administrator || saving} onChange={(event) => setRequired(event.target.checked)} />启用租户管理员审核</label>
    <button className="rounded bg-primary px-4 py-2 text-sm font-semibold text-surface disabled:opacity-40" type="button" disabled={!administrator || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button>
  </section>;
}
