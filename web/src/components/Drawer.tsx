import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** Short facts under the signpost: area link, altitude, grade… */
  meta?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Side panel for a place or area. Its header is drawn as an Alpine trail
 * signpost: a white plate with a pointed end and the red-white-red blaze.
 * Docked right of the map on desktop, full-screen on phones.
 */
export function Drawer({ title, meta, onClose, footer, children }: Props) {
  return (
    <section className="drawer" role="dialog" aria-labelledby="drawerTitle">
      <div className="drawer-head">
        <div className="signpost">
          <span className="signpost-blaze" aria-hidden="true"><i /><i /><i /></span>
          <h2 id="drawerTitle" className="signpost-name">{title}</h2>
        </div>
        <button type="button" className="icon-btn drawer-close" aria-label="Close panel" onClick={onClose}>×</button>
      </div>
      {meta && <div className="drawer-meta">{meta}</div>}
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </section>
  );
}
