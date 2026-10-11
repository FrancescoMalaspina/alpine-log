import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  /** Kept mounted but out of sight, e.g. while the user picks a point on the map. */
  hidden?: boolean;
  footer: ReactNode;
  children: ReactNode;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, subtitle, onClose, closeOnBackdrop, hidden, footer, children }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  const isHidden = useRef(hidden);
  useEffect(() => {
    close.current = onClose;
    isHidden.current = hidden;
  }, [onClose, hidden]);

  // Escape closes, Tab stays inside, and focus returns to whatever opened the dialog.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = dialog.current!;
    if (!el.contains(document.activeElement)) el.focus();
    const onKey = (e: KeyboardEvent) => {
      if (isHidden.current) return;   // the page owns the keyboard while the dialog is set aside
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(n => n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="overlay" hidden={hidden} onClick={e => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialog}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
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
