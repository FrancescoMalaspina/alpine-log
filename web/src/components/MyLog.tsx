import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { locale, useI18n } from '../i18n';
import { fetchImports, fetchVisits, type ImportRecord } from '../lib/api';
import { activityLabel, errorMessage, formatDate } from '../lib/labels';
import { computeStats, type Tally } from '../lib/logStats';
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

// logStats groups undated visits under this key; it is translated for display.
const NO_DATE = 'No date';
const MINE = { ...EMPTY_VISIT_FILTERS, scope: 'mine' as const };

/** The signed-in user's own logbook: every visit they logged, with simple totals. */
export function MyLog({ userId, username, reloadKey, onClose, onChanged, onOpenLoggedVisit, wishes, placeById, ...wishActions }: Props) {
  const { t } = useI18n();
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
  const hasTracks = !!stats?.totals.km;
  const shown = useMemo(
    () => (visits ?? []).filter(v => !only || v.place_activity === only), [visits, only]);
  const byYear = useMemo(() => {
    const groups = new Map<string, VisitSummary[]>();
    for (const v of shown) {
      const year = v.date?.slice(0, 4) ?? NO_DATE;
      groups.set(year, [...(groups.get(year) ?? []), v]);
    }
    return [...groups.entries()];
  }, [shown]);

  return (
    <Drawer
      title={username ? t.account.myLog.title(username) : t.account.myLog.titleNoName}
      meta={stats && stats.totals.first && (
        <span className="meta-item">
          {t.account.myLog.since(formatDate(stats.totals.first), formatDate(stats.totals.last!))}
        </span>
      )}
      onClose={onClose}
    >
      <ErrorText error={error} />
      <div className="log-actions">
        <button type="button" className="log-action" disabled={!visits?.length} onClick={() => setDialog('download')}>
          <ActionIcon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" />
          <span className="log-action-name">{t.account.myLog.download}</span>
          <span className="log-action-use">{t.account.myLog.downloadUse}</span>
        </button>
        <button type="button" className="log-action" onClick={() => setDialog(imports.length ? 'imports' : 'wizard')}>
          <ActionIcon d="M12 15V4 M7 9l5-5 5 5 M5 20h14" />
          <span className="log-action-name">{t.account.myLog.import}</span>
          <span className="log-action-use">
            {imports.length ? t.account.myLog.importPast(imports.length) : t.account.myLog.importNew}
          </span>
        </button>
      </div>

      {!visits && !error && <div className="empty">{t.account.myLog.loading}</div>}
      {visits && !visits.length && (
        <div className="empty">{t.account.myLog.empty}</div>
      )}

      {stats && visits!.length > 0 && (
        <dl className="log-totals">
          <div><dt>{t.account.myLog.daysOut}</dt><dd className="num">{stats.totals.days}</dd></div>
          <div><dt>{t.account.myLog.routesTotal}</dt><dd className="num">{stats.totals.routes}</dd></div>
          <div><dt>{t.account.myLog.pitches}</dt><dd className="num">{stats.totals.pitches}</dd></div>
          <div><dt>{t.account.myLog.spots}</dt><dd className="num">{stats.totals.places}</dd></div>
          <div><dt>{t.account.myLog.areas}</dt><dd className="num">{stats.totals.areas}</dd></div>
        </dl>
      )}

      <WishlistSection wishes={wishes} placeById={placeById} {...wishActions} />

      {stats && visits!.length > 0 && <>
        <details className="downloads-panel">
          <summary className="section-title">{t.account.myLog.statistics}</summary>
          <h4 className="stats-heading">{t.account.myLog.byActivity}</h4>
          <table className="stats-table">
            <thead>
              <tr><th scope="col">{t.account.myLog.activity}</th><th scope="col">{t.account.myLog.days}</th>
                <th scope="col">{t.account.myLog.routesTotal}</th><th scope="col">{t.account.myLog.pitches}</th>
                {hasTracks && <TrackHeads />}
                <th scope="col">{t.account.myLog.hardest}</th>
                <th scope="col">{t.account.myLog.hardestSent}</th></tr>
            </thead>
            <tbody>
              {stats.byActivity.map(a => (
                <tr key={a.type}>
                  <th scope="row"><span className="meta-item"><ActivityBadge activity={a.type} />{activityLabel(a.type)}</span></th>
                  <td className="num">{a.days}</td>
                  <td className="num">{a.routes}</td>
                  <td className="num">{a.pitches || '–'}</td>
                  {hasTracks && <TrackCells tally={a} />}
                  <td className="num">{a.hardest ?? '–'}</td>
                  <td className="num">{a.hardestSent ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className="stats-heading">{t.account.myLog.byYear}</h4>
          <table className="stats-table">
            <thead><tr><th scope="col">{t.account.myLog.year}</th><th scope="col">{t.account.myLog.days}</th><th scope="col">{t.account.myLog.routesTotal}</th>
              <th scope="col">{t.account.myLog.pitches}</th>{hasTracks && <TrackHeads />}</tr></thead>
            <tbody>
              {stats.byYear.map(y => (
                <tr key={y.year}>
                  <th scope="row" className="num">{y.year === NO_DATE ? t.account.myLog.noDate : y.year}</th>
                  <td className="num">{y.days}</td>
                  <td className="num">{y.routes}</td>
                  <td className="num">{y.pitches || '–'}</td>
                  {hasTracks && <TrackCells tally={y} />}
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <h3 className="section-title">{t.account.myLog.allVisits}</h3>
        {stats.byActivity.length > 1 && (
          <div className="chip-row" role="group" aria-label={t.account.myLog.onlyOne}>
            <label className="type-option small">
              <input type="radio" name="logActivity" checked={!only} onChange={() => setOnly(null)} />{t.account.myLog.all}
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
            <h4 className="group-head"><span>{year === NO_DATE ? t.account.myLog.noDate : year}</span><span className="group-count">{list.length}</span></h4>
            <ul className="rows">
              {list.map(v => <VisitRow key={v.id} visit={v} mine onClick={() => onOpenLoggedVisit(v)} />)}
            </ul>
          </section>
        ))}
      </>}
      {/* Portalled: inside the drawer they would sit below the map's controls. */}
      {dialog && createPortal(
        dialog === 'download' ? <DownloadModal userId={userId} username={username || 'logbook'} onClose={() => setDialog(null)} />
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

/** The distance and height the tracks of a row's visits add up to. */
function TrackHeads() {
  const { t } = useI18n();
  return <><th scope="col">{t.account.myLog.distance}</th><th scope="col">{t.account.myLog.climbed}</th></>;
}
function TrackCells({ tally }: { tally: Tally }) {
  return <>
    <td className="num">{Math.round(tally.km) || '–'}</td>
    <td className="num">{tally.gain ? tally.gain.toLocaleString(locale()) : '–'}</td>
  </>;
}
