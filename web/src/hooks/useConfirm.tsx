import { useCallback, useState, type ReactNode } from 'react';
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog';

/**
 * Promise-based ConfirmDialog, a drop-in for window.confirm:
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!await confirm({ title: 'Remove?', confirmLabel: 'Remove', danger: true })) return;
 *   …
 *   return <>{…}{confirmDialog}</>;
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const confirm = useCallback((options: ConfirmOptions) =>
    new Promise<boolean>(resolve => setPending({ options, resolve })), []);

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const dialog = pending
    ? <ConfirmDialog {...pending.options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    : null;
  return [confirm, dialog];
}
