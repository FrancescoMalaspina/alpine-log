import type { ReactNode } from 'react';
import { useRemembered } from '../hooks/useRemembered';

/** A section that starts closed and stays open or closed, on this device, the way it was left. */
export function Collapsible({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useRemembered(`open.${id}`, false);
  return (
    <details className="collapsible" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary className="section-title">{title}</summary>
      {children}
    </details>
  );
}
