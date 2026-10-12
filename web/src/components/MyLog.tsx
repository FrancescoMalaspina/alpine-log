import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteImport, fetchImports, fetchLogbook, fetchVisits, type ImportRecord } from '../lib/api';
import { downloadLogbook, type ExportFormat } from '../lib/exportLogbook';
import { activityLabel, errorMessage, formatDate, plural } from '../lib/labels';
import { computeStats } from '../lib/logStats';
import { EMPTY_VISIT_FILTERS, type Activity, type VisitSummary } from '../lib/types';
import { ActivityBadge } from './ActivityBadge';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';
import { ImportWizard } from './import/ImportWizard';
import { VisitRow } from './Sidebar';

type Props = {
  userId: string;
  username: string;
  reloadKey: number;
  onClose: () => void;
  /** Visits were imported or an import was undone. */
  onChanged: () => void;
  onOpenVisit: (visit: VisitSummary) => void;
};

const MINE = { ...EMPTY_VISIT_FILTERS, scope: 'mine' as const };

const EXPORTS: { format: ExportFormat; name: string; use: string }[] = [
  { format: 'csv', name: 'Spreadsheet (CSV)', use: 'One row per route, for Excel, Numbers or Google Sheets' },
  { format: 'json', name: 'Full backup (JSON)', use: 'Every detail of every visit, for keeping or importing elsewhere' },
  { format: 'gpx', name: 'Spots for GPS (GPX)', use: 'The spots you visited as waypoints, for Garmin, Komoot, OsmAnd, Google Earth' },
];

/** The signed-in user's own logbook: every visit they logged, with simple totals. */
export function MyLog({ userId, username, reloadKey, onClose, onChanged, onOpenVisit }: Props) {
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<Activity | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [importing, setImporting] = useState(false);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [undoing, setUndoing] = useState<number | null>(null);

  async function undo(imp: ImportRecord) {
    const n = imp.summary.visits ?? 0;
    if (!window.confirm(`Delete the ${plural(n, 'visit')} imported from “${imp.file_name}”? Spots it created stay on the map.`)) return;
    setError(null);
    setUndoing(imp.id);
    try {
      await deleteImport(imp.id);
      onChanged();
    } catch (e) {
      setError(`Couldn't undo the import: ${errorMessage(e)}`);
    } finally {
      setUndoing(null);
    }
  }

  async function download(format: ExportFormat) {
    setError(null);
    setExporting(format);
    try {
      downloadLogbook(await fetchLogbook(userId), username, format);
    } catch (e) {
      setError(`Couldn't prepare the download: ${errorMessage(e)}`);
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchVisits(MINE, userId)
      .then(v => { if (!cancelled) setVisits(v); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    fetchImports()
      .then(i => { if (!cancelled) setImports(i); })
      .catch(() => { /* the list of imports is secondary */ });
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  const stats = useMemo(() => (visits ? computeStats(visits) : null), [visits]);
  const shown = useMemo(
    () => (visits ?? []).filter(v => !only || v.place_activity === only), [visits, only]);
  const byYear = useMemo(() => {
    const groups = new Map<string, VisitSummary[]>();
    for (const v of shown) {
      const year = v.date?.slice(0, 4) ?? 'No date';
      groups.set(year, [...(groups.get(year) ?? []), v]);
    }
    return [...groups.entries()];
  }, [shown]);

  return (
    <Drawer
      title={`${username}'s logbook`}
      meta={stats && stats.totals.first && (
        <span className="meta-item">
          Since {formatDate(stats.totals.first)}, last out {formatDate(stats.totals.last!)}
        </span>
      )}
      onClose={onClose}
    >
      <ErrorText error={error} />
      {!visits && !error && <div className="empty">Loading your visits…</div>}
      {visits && !visits.length && (
        <div className="empty">
          Nothing logged yet. Use Log a visit to start your logbook, or{' '}
          <button type="button" className="btn-link" onClick={() => setImporting(true)}>import it from a spreadsheet</button>.
        </div>
      )}

      {stats && visits!.length > 0 && <>
        <dl className="log-totals">
          <div><dt>Days out</dt><dd className="num">{stats.totals.days}</dd></div>
          <div><dt>Routes</dt><dd className="num">{stats.totals.routes}</dd></div>
          <div><dt>Spots</dt><dd className="num">{stats.totals.places}</dd></div>
          <div><dt>Areas</dt><dd className="num">{stats.totals.areas}</dd></div>
        </dl>

        <details className="downloads-panel">
          <summary className="section-title">Download your logbook</summary>
          <div className="downloads">
            {EXPORTS.map(x => (
              <button key={x.format} type="button" className="download" disabled={!!exporting} onClick={() => download(x.format)}>
                <span className="download-name">{exporting === x.format ? 'Preparing…' : x.name}</span>
                <span className="download-use">{x.use}</span>
              </button>
            ))}
          </div>
        </details>

        <details className="downloads-panel">
          <summary className="section-title">Import visits</summary>
          <div className="downloads">
            <button type="button" className="download" onClick={() => setImporting(true)}>
              <span className="download-name">From a file</span>
              <span className="download-use">Excel, CSV or JSON, in any layout: you check every column before anything is saved</span>
            </button>
            {imports.map(imp => (
              <div key={imp.id} className="import-record">
                <span>
                  <strong>{imp.file_name}</strong>
                  <span className="hint"> · {formatDate(imp.created_at.slice(0, 10))} · {plural(imp.summary.visits ?? 0, 'visit')}</span>
                </span>
                <button type="button" className="btn btn-quiet" disabled={undoing === imp.id} onClick={() => undo(imp)}>
                  {undoing === imp.id ? 'Undoing…' : 'Undo'}
                </button>
              </div>
            ))}
          </div>
        </details>

        <h3 className="section-title">By activity</h3>
        <table className="stats-table">
          <thead>
            <tr><th scope="col">Activity</th><th scope="col">Days</th><th scope="col">Routes</th><th scope="col">Hardest</th></tr>
          </thead>
          <tbody>
            {stats.byActivity.map(a => (
              <tr key={a.type}>
                <th scope="row"><span className="meta-item"><ActivityBadge activity={a.type} />{activityLabel(a.type)}</span></th>
                <td className="num">{a.days}</td>
                <td className="num">{a.routes}</td>
                <td className="num">{a.hardest ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-title">By year</h3>
        <table className="stats-table">
          <thead><tr><th scope="col">Year</th><th scope="col">Days</th><th scope="col">Routes</th></tr></thead>
          <tbody>
            {stats.byYear.map(y => (
              <tr key={y.year}>
                <th scope="row" className="num">{y.year}</th>
                <td className="num">{y.days}</td>
                <td className="num">{y.routes}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-title">All visits</h3>
        {stats.byActivity.length > 1 && (
          <div className="chip-row" role="group" aria-label="Show only one activity">
            <label className="type-option small">
              <input type="radio" name="logActivity" checked={!only} onChange={() => setOnly(null)} />All
            </label>
            {stats.byActivity.map(a => (
              <label key={a.type} className="type-option small">
                <input type="radio" name="logActivity" checked={only === a.type} onChange={() => setOnly(a.type)} />
                {activityLabel(a.type)}
              </label>
            ))}
          </div>
        )}
        {byYear.map(([year, list]) => (
          <section key={year} className="row-group log-year">
            <h4 className="group-head"><span>{year}</span><span className="group-count">{list.length}</span></h4>
            <ul className="rows">
              {list.map(v => <VisitRow key={v.id} visit={v} mine onClick={() => onOpenVisit(v)} />)}
            </ul>
          </section>
        ))}
      </>}
      {/* Portalled: inside the drawer it would sit below the map's controls. */}
      {importing && createPortal(<ImportWizard onClose={() => setImporting(false)} onImported={onChanged} />, document.body)}
    </Drawer>
  );
}
