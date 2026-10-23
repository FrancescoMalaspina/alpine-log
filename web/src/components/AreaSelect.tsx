import { useI18n } from '../i18n';
import type { Area } from '../lib/types';

/** A filter's area: any, or one of them. */
export function AreaSelect({ id, value, areas, onChange }:
  { id: string; value: number | null; areas: Area[]; onChange: (id: number | null) => void }) {
  const { t } = useI18n();
  return (
    <select id={id} value={value ?? ''} onChange={e => onChange(e.target.value ? +e.target.value : null)}>
      <option value="">{t.app.sidebar.anyArea}</option>
      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
