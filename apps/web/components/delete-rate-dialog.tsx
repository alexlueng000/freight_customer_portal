'use client';

import { Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function DeleteRateDialog({ rate, busy, error, onCancel, onConfirm }: {
  rate: { rateNo: string; polCode: string; podCode: string; carrierCode: string };
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => { dialog?.close(); };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-rate-title"
      aria-describedby="delete-rate-description"
      aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-foreground/40"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger"><Trash2 aria-hidden className="size-5" /></div>
          <button aria-label="关闭删除确认" className="grid size-8 place-items-center rounded text-muted hover:bg-sidebar disabled:opacity-40" disabled={busy} onClick={onCancel} type="button"><X aria-hidden className="size-4" /></button>
        </div>
        <h2 id="delete-rate-title" className="mt-4 text-xl font-semibold">确认删除这条运价？</h2>
        <p id="delete-rate-description" className="mt-2 text-sm leading-6 text-muted">删除后无法恢复，对应的箱型价格和附加费也会一并移除。</p>
        <div className="mt-4 rounded-lg border border-border bg-sidebar px-4 py-3 text-sm">
          <p className="break-all font-semibold">{rate.rateNo}</p>
          <p className="mt-1 text-muted">{rate.polCode} → {rate.podCode} · {rate.carrierCode}</p>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">已用于报价的运价不能删除，如不再使用，请编辑并停用。</p>
        {error ? <p role="alert" className="mt-4 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <button ref={cancelRef} className="h-10 rounded border border-border px-5 text-sm font-medium hover:bg-sidebar focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40" disabled={busy} onClick={onCancel} type="button">取消</button>
        <button className="inline-flex h-10 items-center gap-2 rounded bg-danger px-5 text-sm font-semibold text-surface hover:bg-danger/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-50" disabled={busy} onClick={onConfirm} type="button"><Trash2 aria-hidden className="size-4" />{busy ? '正在删除…' : '确认删除'}</button>
      </div>
    </dialog>
  );
}
