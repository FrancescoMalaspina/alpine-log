import { useMemo } from 'react';
import { activityLabel, plural } from '../../lib/labels';
import type { SheetMapping } from '../../lib/import/automap';
import { FIELD_BY_ID, FIELDS, isSingle, type FieldId } from '../../lib/import/fields';
import type { Cell, RawTable } from '../../lib/import/parse';
import { applyMapping } from '../../lib/import/rows';
import { ACTIVITY_ORDER, type Activity } from '../../lib/types';

type Props = {
  tables: RawTable[];
  mappings: SheetMapping[];
  onChange: (index: number, m: SheetMapping) => void;
  assist: { busy: boolean; hidePartners: boolean; onHidePartners: (v: boolean) => void; onAsk: () => void } | null;
};

const GROUPS: { label: string; level: 'spot' | 'visit' | 'none' }[] = [
  { label: 'The spot', level: 'spot' },
  { label: 'The visit', level: 'visit' },
  { label: 'Other', level: 'none' },
];

const show = (c: Cell | undefined) => {
  if (!c || c.v == null) return '';
  const s = String(c.v);
  return s.length > 40 ? `${s.slice(0, 38)}…` : s;
};

/** Step 2: what each column of each sheet becomes. */
export function ColumnsStep({ tables, mappings, onChange, assist }: Props) {
  return (
    <div className="import-body">
      {assist && (
        <div className="form-info import-assist">
          <div>
            <strong>Unsure about some columns?</strong> The AI helper (Google Gemini, free tier) can suggest a mapping.
            It sees only the column names and five example rows per sheet; on the free tier Google may use them to improve its models.
          </div>
          <div className="import-assist-row">
            <label className="switch">
              <input type="checkbox" checked={assist.hidePartners} onChange={e => assist.onHidePartners(e.target.checked)} />
              Hide partner names in the examples
            </label>
            <button type="button" className="btn btn-ghost" disabled={assist.busy} onClick={assist.onAsk}>
              {assist.busy ? 'Asking…' : 'Suggest with AI'}
            </button>
          </div>
        </div>
      )}
      {tables.map((t, i) => (
        <SheetCard key={`${t.name}-${i}`} table={t} mapping={mappings[i]} onChange={m => onChange(i, m)} />
      ))}
    </div>
  );
}

function SheetCard({ table, mapping, onChange }: { table: RawTable; mapping: SheetMapping; onChange: (m: SheetMapping) => void }) {
  const preview = useMemo(() => (mapping.include ? applyMapping(table, mapping) : null), [table, mapping]);
  const perRowActivity = mapping.columns.some(c => c.field === 'spot.activity');
  const visits = preview?.spots.flatMap(s => s.visits) ?? [];
  const routes = visits.reduce((n, v) => n + v.ascents.length, 0);
  const examples = (col: number) =>
    table.rows.map(r => show(r[col])).filter(Boolean).slice(0, 3);

  function setColumn(col: number, field: FieldId) {
    const columns = mapping.columns.map((c, i) => {
      if (i === col) return { field, group: FIELD_BY_ID[field].level === 'visit' ? c.group : 0, confidence: 1 };
      // A field that takes one column (per visit group) moves rather than doubles up.
      if (isSingle(field) && c.field === field && c.group === mapping.columns[col].group) return { field: 'note' as const, group: 0, confidence: 1 };
      return c;
    });
    onChange({ ...mapping, columns });
  }

  const setGroup = (col: number, group: number) =>
    onChange({ ...mapping, columns: mapping.columns.map((c, i) => (i === col ? { ...c, group, confidence: 1 } : c)) });

  return (
    <section className={`import-sheet${mapping.include ? '' : ' excluded'}`}>
      <header className="import-sheet-head">
        <label className="switch">
          <input type="checkbox" checked={mapping.include} onChange={e => onChange({ ...mapping, include: e.target.checked })} />
          <span className="import-sheet-name">{table.name}</span>
        </label>
        <span className="hint">{plural(table.rows.length, 'row')}</span>
      </header>

      {mapping.include && <>
        <div className="import-sheet-settings">
          <div className="field">
            <label htmlFor={`act-${table.name}`}>Activity of these spots</label>
            <select id={`act-${table.name}`} value={mapping.activity ?? ''}
                    className={!mapping.activity && !perRowActivity ? 'invalid' : undefined}
                    onChange={e => onChange({ ...mapping, activity: (e.target.value || null) as Activity | null })}>
              <option value="">{perRowActivity ? 'From the Activity column' : 'Choose…'}</option>
              {ACTIVITY_ORDER.map(a => <option key={a} value={a}>{activityLabel(a)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`dates-${table.name}`}>Dates like 03/05/2026 are</label>
            <select id={`dates-${table.name}`} value={mapping.dateOrder}
                    onChange={e => onChange({ ...mapping, dateOrder: e.target.value as SheetMapping['dateOrder'] })}>
              <option value="dmy">3 May (day first)</option>
              <option value="mdy">5 March (month first)</option>
            </select>
          </div>
        </div>

        <div className="import-table-wrap">
          <table className="import-columns">
            <thead><tr><th scope="col">Column</th><th scope="col">Examples</th><th scope="col">Becomes</th></tr></thead>
            <tbody>
              {table.headers.map((h, col) => {
                const c = mapping.columns[col];
                const unsure = c.confidence < 0.6 && c.field !== 'note' && c.field !== 'ignore';
                const isVisit = FIELD_BY_ID[c.field].level === 'visit';
                return (
                  <tr key={col} className={c.field === 'ignore' ? 'skipped' : undefined}>
                    <th scope="row">{h}</th>
                    <td className="import-examples">{examples(col).map((x, i) => <span key={i}>{x}</span>)}</td>
                    <td>
                      <div className="import-field">
                        <select aria-label={`What "${h}" becomes`} value={c.field} className={unsure ? 'unsure' : undefined}
                                onChange={e => setColumn(col, e.target.value as FieldId)}>
                          {GROUPS.map(g => (
                            <optgroup key={g.level} label={g.label}>
                              {FIELDS.filter(f => f.level === g.level).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        {isVisit && (c.group > 0 || mapping.columns.some(x => x.group > 0)) && (
                          <select aria-label={`Which visit "${h}" belongs to`} value={c.group} className="import-group"
                                  onChange={e => setGroup(col, Number(e.target.value))}>
                            {[0, 1, 2, 3, 4].map(g => <option key={g} value={g}>Visit {g + 1}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {preview && (
          <p className="import-preview">
            {plural(preview.spots.length, 'spot')}, {plural(visits.length, 'visit')}
            {routes > 0 && <>, {plural(routes, 'route')}</>}
            {preview.skipped.length > 0 && <> · {plural(preview.skipped.length, 'row')} skipped ({preview.skipped[0].reason}…)</>}
            {preview.spots[0] && <> · e.g. <em>{preview.spots[0].name}</em>{preview.spots[0].visits[0]?.date && <> on {preview.spots[0].visits[0].date}</>}
              {preview.spots[0].visits[0]?.partners.length > 0 && <> with {preview.spots[0].visits[0].partners.join(', ')}</>}
            </>}
          </p>
        )}
      </>}
    </section>
  );
}
