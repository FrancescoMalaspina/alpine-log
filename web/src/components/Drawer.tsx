import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  kicker?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

/** A panel docked to the right of the map on desktop, full-screen on phones. */
export function Drawer({ title, kicker, onClose, footer, children }: Props) {
  return (
    <section className="drawer" role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="drawer-head">
        <div>
          {kicker && <div className="drawer-kicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </section>
  );
}
