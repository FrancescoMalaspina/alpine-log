import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchImports, fetchVisits, type ImportRecord } from '../lib/api';
import { activityLabel, errorMessage, formatDate } from '../lib/labels';
import { computeStats } from '../lib/logStats';
import { EMPTY_VISIT_FILTERS, type Activity, type Place, type VisitSummary, type Wish } from '../lib/types';
import { ActivityBadge } from './ActivityBadge';
import { Drawer } from './Drawer';
import { DownloadModal, ImportsModal } from './LogbookModals';
import { ErrorText } from './Modal';
import { ImportWizard } from './import/ImportWizard';
import { VisitRow } from './Sidebar';
import { WishlistSection, type WishlistActions } from './WishlistSection';

type Props = WishlistActions & {
  userId: string;
  username: string;
  reloadKey: number;
  onClose: () => void;
  /** Visits were imported or an import was undone. */
  onChanged: () => void;
  onOpenLoggedVisit: (visit: VisitSummary) => void;
  wishes: Wish[];
  placeById: Map<number, Place>;
};

const MINE = { ...EMPTY_VISIT_FILTERS, scope: 'mine' as const };

/** The signed-in user's own logbook: every visit they logged, with simple totals. */
export function MyLog({ userId, username, reloadKey, onClose, onChanged, onOpenLoggedVisit, wishes, placeById, ...wishActions }: Props) {
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<Activity | null>(null);
  const [dialog, setDialog] = useState<'download' | 'imports' | 'wizard' | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);

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
      <div className="log-actions">
        <button type="button" className="log-action" disabled={!visits?.length} onClick={() => setDialog('download')}>
          <ActionIcon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" />
          <span className="log-action-name">Download logbook</span>
          <span className="log-action-use">CSV, JSON or GPX</span>
        </button>
        <button type="button" className="log-action" onClick={() => setDialog(imports.length ? 'imports' : 'wizard')}>
          <ActionIcon d="M12 15V4 M7 9l5-5 5 5 M5 20h14" />
          <span className="log-action-name">Import visits</span>
          <span className="log-action-use">
            {imports.length ? `From a file, or undo one of ${imports.length} past imports` : 'From Excel, CSV or JSON'}
          </span>
        </button>
      </div>

      {!visits && !error && <div className="empty">Loading your visits…</div>}
      {visits && !visits.length && (
        <div className="empty">Nothing logged yet. Use Log a visit to start your logbook, or import it from a spreadsheet.</div>
      )}

      {stats && visits!.length > 0 && (
        <dl className="log-totals">
          <div><dt>Days out</dt><dd className="num">{stats.totals.days}</dd></div>
          <div><dt>Routes</dt><dd className="num">{stats.totals.routes}</dd></div>
          <div><dt>Spots</dt><dd className="num">{stats.totals.places}</dd></div>
          <div><dt>Areas</dt><dd className="num">{stats.totals.areas}</dd></div>
        </dl>
      )}

      <WishlistSection wishes={wishes} placeById={placeById} {...wishActions} />

      {stats && visits!.length > 0 && <>
        <details className="downloads-panel">
          <summary className="section-title">Statistics</summary>
          <h4 className="stats-heading">By activity</h4>
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

          <h4 className="stats-heading">By year</h4>
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
        </details>

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
              {list.map(v => <VisitRow key={v.id} visit={v} mine onClick={() => onOpenLoggedVisit(v)} />)}
            </ul>
          </section>
        ))}
      </>}
      {/* Portalled: inside the drawer they would sit below the map's controls. */}
      {dialog && createPortal(
        dialog === 'download' ? <DownloadModal userId={userId} username={username} onClose={() => setDialog(null)} />
          : dialog === 'imports' ? <ImportsModal imports={imports} onStart={() => setDialog('wizard')}
                                                  onClose={() => setDialog(null)} onChanged={onChanged} />
          : <ImportWizard onClose={() => setDialog(null)} onImported={onChanged} />,
        document.body)}
    </Drawer>
  );
}

function ActionIcon({ d }: { d: string }) {
  return (
    <svg className="log-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
