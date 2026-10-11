import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  footer: ReactNode;
  children: ReactNode;
};

export function Modal({ title, subtitle, onClose, closeOnBackdrop, footer, children }: Props) {
  return (
    <div className="overlay show" onClick={e => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <div className="form-error" role="alert">{error}</div> : null;
}
