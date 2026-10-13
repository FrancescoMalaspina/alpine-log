import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

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
 * signpost: a white plate with a pointed end and a red edge.
 * Docked right of the map on desktop, full-screen on phones.
 */
export function Drawer({ title, meta, onClose, footer, children }: Props) {
  const { t } = useI18n();
  return (
    <section className="drawer" role="dialog" aria-labelledby="drawerTitle">
      <div className="drawer-head">
        <div className="signpost">
          <span className="signpost-edge" aria-hidden="true" />
          <h2 id="drawerTitle" className="signpost-name">{title}</h2>
        </div>
        <button type="button" className="icon-btn drawer-close" aria-label={t.app.drawer.closePanel} onClick={onClose}>×</button>
      </div>
      {meta && <div className="drawer-meta">{meta}</div>}
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </section>
  );
}
