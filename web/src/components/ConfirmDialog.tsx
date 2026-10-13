import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { errorMessage, isTouchLayout } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive action: the confirm button is drawn as a danger button. */
  danger?: boolean;
  /** The confirm button stays disabled until this exact text is typed. */
  requireText?: string;
};

type Props = ConfirmOptions & {
  /** May be async: buttons stay disabled while it runs, and a thrown error shows in the dialog. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/** In-app replacement for window.confirm. See also useConfirm. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger, requireText, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !requireText || typed.trim() === requireText;

  async function confirm(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={() => { if (!busy) onCancel(); }}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={busy}
                autoFocus={!requireText}>{cancelLabel ?? t.account.confirm.cancel}</button>
        <button className={`btn ${danger ? 'btn-danger confirm-danger' : 'btn-primary'}`} type="submit" form="confirmForm"
                disabled={!ready || busy}>{confirmLabel}</button>
      </>}
    >
      <form id="confirmForm" className="auth-form confirm-body" onSubmit={confirm}>
        {message && <div className="confirm-message">{message}</div>}
        {requireText && (
          <div className="field">
            <label htmlFor="confirmText">{t.account.confirm.typeToConfirm(requireText)}</label>
            <input id="confirmText" autoComplete="off" autoCapitalize="off" spellCheck={false}
                   autoFocus={!isTouchLayout()} value={typed} onChange={e => setTyped(e.target.value)} />
          </div>
        )}
        <ErrorText error={error} />
      </form>
    </Modal>
  );
}
