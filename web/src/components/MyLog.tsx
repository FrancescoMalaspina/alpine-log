import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { locale, useI18n } from '../i18n';
import { fetchImports, fetchVisits, type ImportRecord } from '../lib/api';
import { activityLabel, errorMessage, formatDate } from '../lib/labels';
import { computeStats, type ActivityTally, type Tally } from '../lib/logStats';
import { EMPTY_VISIT_FILTERS, type Activity, type Invitation, type Place, type VisitSummary, type Wish } from '../lib/types';
import { ActivityBadge } from './ActivityBadge';
import { Drawer } from './Drawer';
import { DownloadModal, ImportsModal } from './LogbookModals';
import { TRACK_ACTIVITIES } from './forms/placeForm';
import { ErrorText } from './Modal';
import { ImportWizard } from './import/ImportWizard';
import { InvitationsSection } from './InvitationsSection';
import { VisitRow } from './Sidebar';
import { WishlistSection, type WishlistActions } from './WishlistSection';

/** What only your own logbook has: invitations, imports, downloads and your wishlist. */
type OwnLogbook = WishlistActions & {
  /** Visits were imported or an import was undone, or an invitation answered. */
  onChanged: () => void;
  wishes: Wish[];
  placeById: Map<number, Place>;
  invitations: Invitation[];
  onAddInvitation: (invitation: Invitation) => void;
};

type Props = {
  /** Whose logbook. */
  userId: string;
  username: string;
  reloadKey: number;
  onClose: () => void;
  onOpenLoggedVisit: (visit: VisitSummary) => void;
  /** Set for your own logbook; without it, someone else's, read-only. */
  own?: OwnLogbook;
};

// logStats groups undated visits under this key; it is translated for display.
const NO_DATE = 'No date';
const MINE = { ...EMPTY_VISIT_FILTERS, scope: 'mine' as const };

/**
 * A logbook: every visit of one user you may read (all of your own; someone else's public ones),
 * with simple totals.
 */
export function MyLog({ userId, username, reloadKey, onClose, onOpenLoggedVisit, own }: Props) {
  const { t } = useI18n();
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<Activity | null>(null);
  const [dialog, setDialog] = useState<'download' | 'imports' | 'wizard' | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const isOwn = !!own;

  useEffect(() => {
    let cancelled = false;
    // "mine" filters by the logbook's user; the database leaves out what you may not read.
    fetchVisits(MINE, userId)
      .then(v => { if (!cancelled) setVisits(v); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    if (isOwn) {
      fetchImports()
        .then(i => { if (!cancelled) setImports(i); })
        .catch(() => { /* the list of imports is secondary */ });
    }
    return () => { cancelled = true; };
  }, [userId, reloadKey, isOwn]);

  const stats = useMemo(() => (visits ? computeStats(visits) : null), [visits]);
  // Climbing (routes, pitches, grades) and tours (distance, height) count different things: a table each.
  const climbing = stats?.byActivity.filter(a => !TRACK_ACTIVITIES.includes(a.type)) ?? [];
  const tours = stats?.byActivity.filter(a => TRACK_ACTIVITIES.includes(a.type)) ?? [];
  const activityHead = (a: ActivityTally) =>
    <span className="meta-item"><ActivityBadge activity={a.type} />{activityLabel(a.type)}</span>;
  const days: Column<Tally> = { head: t.account.myLog.days, cell: r => r.days };
  const routes: Column<Tally> = { head: t.account.myLog.routesTotal, cell: r => r.routes };
  const pitches: Column<Tally> = { head: t.account.myLog.pitches, cell: r => r.pitches };
  const km: Column<Tally> = { head: t.account.myLog.distance, cell: r => Math.round(r.km) };
  const climbed: Column<Tally> = { head: t.account.myLog.climbed, cell: r => r.gain && r.gain.toLocaleString(locale()) };
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
      {own && <InvitationsSection invitations={own.invitations} placeById={own.placeById}
                                  onAdd={own.onAddInvitation} onChanged={own.onChanged} />}
      {own && <div className="log-actions">
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
      </div>}

      {!visits && !error && <div className="empty">{t.account.myLog.loading}</div>}
      {visits && !visits.length && (
        <div className="empty">{own ? t.account.myLog.empty : t.account.myLog.emptyOther(username)}</div>
      )}

      {stats && visits!.length > 0 && (
        <dl className="log-totals">
          <div><dt>{t.account.myLog.daysOut}</dt><dd className="num">{stats.totals.days}</dd></div>
          <div><dt>{t.account.myLog.spots}</dt><dd className="num">{stats.totals.places}</dd></div>
          <div><dt>{t.account.myLog.areas}</dt><dd className="num">{stats.totals.areas}</dd></div>
        </dl>
      )}

      {own && <WishlistSection {...own} />}

      {stats && visits!.length > 0 && <>
        <details className="collapsible">
          <summary className="section-title">{t.account.myLog.statistics}</summary>
          {climbing.length > 0 && <>
            <h4 className="stats-heading">{t.account.myLog.climbing}</h4>
            <StatsTable head={t.account.myLog.activity} rows={climbing} rowKey={a => a.type} rowHead={activityHead} columns={[
              days, routes, pitches,
              { head: t.account.myLog.hardest, cell: a => a.hardest },
              { head: t.account.myLog.hardestSent, cell: a => a.hardestSent },
            ]} />
          </>}
          {tours.length > 0 && <>
            <h4 className="stats-heading">{t.account.myLog.tours}</h4>
            <StatsTable head={t.account.myLog.activity} rows={tours} rowKey={a => a.type} rowHead={activityHead} columns={[
              days, km, climbed,
              { head: t.account.myLog.hardest, cell: a => a.hardest },
            ]} />
          </>}

          <h4 className="stats-heading">{t.account.myLog.byYear}</h4>
          <StatsTable head={t.account.myLog.year} rows={stats.byYear} rowKey={y => y.year} columns={[days, routes, pitches, km, climbed]}
                      rowHead={y => <span className="num">{y.year === NO_DATE ? t.account.myLog.noDate : y.year}</span>} />
        </details>

        <details className="collapsible" open>
          <summary className="section-title">{t.account.myLog.allVisits}</summary>
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
            <details key={year} className="row-group log-year" open>
              <summary className="group-head"><span>{year === NO_DATE ? t.account.myLog.noDate : year}</span><span className="group-count">{list.length}</span></summary>
              <ul className="rows">
                {list.map(v => <VisitRow key={v.id} visit={v} mine onClick={() => onOpenLoggedVisit(v)} />)}
              </ul>
            </details>
          ))}
        </details>
      </>}

      {/* Portalled: inside the drawer they would sit below the map's controls. */}
      {dialog && createPortal(
        dialog === 'download' ? <DownloadModal userId={userId} username={username || 'logbook'} onClose={() => setDialog(null)} />
          : dialog === 'imports' ? <ImportsModal imports={imports} onStart={() => setDialog('wizard')}
                                                  onClose={() => setDialog(null)} onChanged={own!.onChanged} />
          : <ImportWizard onClose={() => setDialog(null)} onImported={own!.onChanged} />,
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

type Column<R> = { head: string; cell: (row: R) => string | number | null };

/** A statistics table, leaving out the columns with nothing in any row (0 and none show as a dash). */
function StatsTable<R>({ head, rows, rowKey, rowHead, columns }: {
  head: string; rows: R[]; rowKey: (row: R) => string; rowHead: (row: R) => ReactNode; columns: Column<R>[];
}) {
  const shown = columns.filter(c => rows.some(r => c.cell(r)));
  return (
    <table className="stats-table">
      <thead>
        <tr><th scope="col">{head}</th>{shown.map(c => <th key={c.head} scope="col">{c.head}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={rowKey(r)}>
            <th scope="row">{rowHead(r)}</th>
            {shown.map(c => <td key={c.head} className="num">{c.cell(r) || '–'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
