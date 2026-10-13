import { useMemo } from 'react';
import { activityLabel } from '../../lib/labels';
import type { SheetMapping } from '../../lib/import/automap';
import { FIELD_BY_ID, FIELDS, fieldLabel, isSingle, type FieldId } from '../../lib/import/fields';
import { useI18n } from '../../i18n';
import type { Cell, RawTable } from '../../lib/import/parse';
import { applyMapping } from '../../lib/import/rows';
import { ACTIVITY_ORDER, type Activity } from '../../lib/types';

type Props = {
  tables: RawTable[];
  mappings: SheetMapping[];
  onChange: (index: number, m: SheetMapping) => void;
  assist: { busy: boolean; hidePartners: boolean; onHidePartners: (v: boolean) => void; onAsk: () => void } | null;
};

const GROUPS = ['spot', 'visit', 'none'] as const;

const show = (c: Cell | undefined) => {
  if (!c || c.v == null) return '';
  const s = String(c.v);
  return s.length > 40 ? `${s.slice(0, 38)}…` : s;
};

/** Step 2: what each column of each sheet becomes. */
export function ColumnsStep({ tables, mappings, onChange, assist }: Props) {
  const { t } = useI18n();
  const cx = t.import.columns;
  return (
    <div className="import-body">
      {assist && (
        <div className="form-info import-assist">
          <div>
            <strong>{cx.unsure}</strong>{cx.assistText}
          </div>
          <div className="import-assist-row">
            <label className="switch">
              <input type="checkbox" checked={assist.hidePartners} onChange={e => assist.onHidePartners(e.target.checked)} />
              {cx.hidePartners}
            </label>
            <button type="button" className="btn btn-ghost" disabled={assist.busy} onClick={assist.onAsk}>
              {assist.busy ? cx.asking : cx.suggest}
            </button>
          </div>
        </div>
      )}
      {tables.map((tbl, i) => (
        <SheetCard key={`${tbl.name}-${i}`} table={tbl} mapping={mappings[i]} onChange={m => onChange(i, m)} />
      ))}
    </div>
  );
}

function SheetCard({ table, mapping, onChange }: { table: RawTable; mapping: SheetMapping; onChange: (m: SheetMapping) => void }) {
  const { t } = useI18n();
  const cx = t.import.columns;
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
        <span className="hint">{t.import.counts.rows(table.rows.length)}</span>
      </header>

      {mapping.include && <>
        <div className="import-sheet-settings">
          <div className="field">
            <label htmlFor={`act-${table.name}`}>{cx.activityOf}</label>
            <select id={`act-${table.name}`} value={mapping.activity ?? ''}
                    className={!mapping.activity && !perRowActivity ? 'invalid' : undefined}
                    onChange={e => onChange({ ...mapping, activity: (e.target.value || null) as Activity | null })}>
              <option value="">{perRowActivity ? cx.fromActivityColumn : cx.choose}</option>
              {ACTIVITY_ORDER.map(a => <option key={a} value={a}>{activityLabel(a)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`dates-${table.name}`}>{cx.datesAre}</label>
            <select id={`dates-${table.name}`} value={mapping.dateOrder}
                    onChange={e => onChange({ ...mapping, dateOrder: e.target.value as SheetMapping['dateOrder'] })}>
              <option value="dmy">{cx.dayFirst}</option>
              <option value="mdy">{cx.monthFirst}</option>
            </select>
          </div>
        </div>

        <div className="import-table-wrap">
          <table className="import-columns">
            <thead><tr><th scope="col">{cx.column}</th><th scope="col">{cx.examples}</th><th scope="col">{cx.becomes}</th></tr></thead>
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
                        <select aria-label={cx.becomesLabel(h)} value={c.field} className={unsure ? 'unsure' : undefined}
                                onChange={e => setColumn(col, e.target.value as FieldId)}>
                          {GROUPS.map(g => (
                            <optgroup key={g} label={cx.groups[g]}>
                              {FIELDS.filter(f => f.level === g).map(f => <option key={f.id} value={f.id}>{fieldLabel(f.id)}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        {isVisit && (c.group > 0 || mapping.columns.some(x => x.group > 0)) && (
                          <select aria-label={cx.whichVisit(h)} value={c.group} className="import-group"
                                  onChange={e => setGroup(col, Number(e.target.value))}>
                            {[0, 1, 2, 3, 4].map(g => <option key={g} value={g}>{cx.visitN(g + 1)}</option>)}
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
            {t.import.counts.spots(preview.spots.length)}, {t.import.counts.visits(visits.length)}
            {routes > 0 && <>, {t.import.counts.routes(routes)}</>}
            {preview.skipped.length > 0 && cx.skippedRows(preview.skipped.length, preview.skipped[0].reason)}
            {preview.spots[0] && <>{cx.eg}<em>{preview.spots[0].name}</em>{preview.spots[0].visits[0]?.date && <>{cx.on}{preview.spots[0].visits[0].date}</>}
              {preview.spots[0].visits[0]?.partners.length > 0 && <>{cx.with}{preview.spots[0].visits[0].partners.join(', ')}</>}
            </>}
          </p>
        )}
      </>}
    </section>
  );
}
