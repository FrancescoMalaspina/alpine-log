import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { locale, useI18n } from '../i18n';
import { fetchImports, fetchUserVisits, type ImportRecord } from '../lib/api';
import { activityLabel, errorMessage, formatDate } from '../lib/labels';
import { computeStats, type ActivityTally, type Tally } from '../lib/logStats';
import {
  ACTIVITY_ORDER, EMPTY_VISIT_FILTERS, type Area, type Invitation, type Partner, type Place, type VisitSummary, type Wish,
} from '../lib/types';
import { countVisitFilters, filterVisits } from '../lib/visitFilters';
import { ActivityBadge } from './ActivityBadge';
import { Collapsible } from './Collapsible';
import { Drawer } from './Drawer';
import { DownloadModal, ImportsModal } from './LogbookModals';
import { TRACK_ACTIVITIES } from './forms/placeForm';
import { ErrorText } from './Modal';
import { ImportWizard } from './import/ImportWizard';
import { InvitationsSection } from './InvitationsSection';
import { PeopleResults } from './PeopleResults';
import { VisitFiltersPanel } from './VisitFilters';
import { VisitRow } from './VisitRow';
import { WishlistSection, type WishlistActions } from './WishlistSection';

/** What only your own logbook has: invitations, imports, downloads and your wishlist. */
type OwnLogbook = WishlistActions & {
  /** Visits were imported or an import was undone, or an invitation answered. */
  onChanged: () => void;
  wishes: Wish[];
  placeById: Map<number, Place>;
  invitations: Invitation[];
  onAddInvitation: (invitation: Invitation) => void;
  /** Your partners, to filter your visits by. */
  partners: Partner[];
};

type Props = {
  /** Whose logbook. */
  userId: string;
  username: string;
  reloadKey: number;
  onClose: () => void;
  onOpenLoggedVisit: (visit: VisitSummary) => void;
  /** Signed in: find a climber and open their logbook (your own id opens yours). */
  onOpenLogbook?: (userId: string) => void;
  /** Signed in and on someone else's logbook: back to yours. */
  onOpenMine?: () => void;
  /** The spots of the visits shown, for the map; first is true the first time they're known. */
  onShownPlaces: (placeIds: number[], first: boolean) => void;
  /** On a phone: hides the logbook and shows its spots on the map. */
  onShowOnMap?: () => void;
  hidden?: boolean;
  /** Set for your own logbook; without it, someone else's, read-only. */
  own?: OwnLogbook;
};

// logStats groups undated visits under this key; it is translated for display.
const NO_DATE = 'No date';

/**
 * A logbook: every visit of one user you may read (all of your own; someone else's public ones),
 * with totals. Its filters narrow the totals, statistics, list and the spots on the map alike.
 */
export function MyLog({ userId, username, reloadKey, onClose, onOpenLoggedVisit, own, ...props }: Props) {
  const { t } = useI18n();
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(EMPTY_VISIT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [climber, setClimber] = useState('');
  const [dialog, setDialog] = useState<'download' | 'imports' | 'wizard' | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const isOwn = !!own;

  useEffect(() => {
    let cancelled = false;
    fetchUserVisits(userId)
      .then(v => { if (!cancelled) setVisits(v); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    if (isOwn) {
      fetchImports()
        .then(i => { if (!cancelled) setImports(i); })
        .catch(() => { /* the list of imports is secondary */ });
    }
    return () => { cancelled = true; };
  }, [userId, reloadKey, isOwn]);

  const shown = useMemo(() => (visits ? filterVisits(visits, filters) : null), [visits, filters]);
  const stats = useMemo(() => (shown ? computeStats(shown) : null), [shown]);
  // The choices come from every visit, so picking one doesn't hide the others.
  const activities = useMemo(
    () => ACTIVITY_ORDER.filter(a => visits?.some(v => v.place_activity === a)), [visits]);
  const areas = useMemo(() => {
    const byId = new Map<number, string>();
    for (const v of visits ?? []) if (v.area_id && v.area_name) byId.set(v.area_id, v.area_name);
    return [...byId].map(([id, name]) => ({ id, name }) as Area).sort((a, b) => a.name.localeCompare(b.name));
  }, [visits]);

  const { onShownPlaces } = props;
  const reported = useRef(false);
  useEffect(() => {
    if (!shown) return;
    onShownPlaces([...new Set(shown.map(v => v.place_id))], !reported.current);
    reported.current = true;
  }, [shown, onShownPlaces]);

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
  const byYear = useMemo(() => {
    const groups = new Map<string, VisitSummary[]>();
    for (const v of shown ?? []) {
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
      hidden={props.hidden}
    >
      {(props.onOpenLogbook || props.onShowOnMap) && (
        <div className="log-people">
          {props.onOpenMine && <button type="button" className="link-btn" onClick={props.onOpenMine}>{t.account.myLog.backToMine}</button>}
          {props.onShowOnMap && (
            <button type="button" className="btn btn-ghost log-on-map" disabled={!shown?.length} onClick={props.onShowOnMap}>
              {t.account.myLog.showOnMap}
            </button>
          )}
          {props.onOpenLogbook && <>
            <input type="search" className="log-find" value={climber} placeholder={t.account.myLog.findClimber}
                   aria-label={t.account.myLog.findClimber} spellCheck={false} onChange={e => setClimber(e.target.value)} />
            <PeopleResults query={climber} onOpenLogbook={props.onOpenLogbook} />
          </>}
        </div>
      )}

      <ErrorText error={error} />
      {own && <InvitationsSection invitations={own.invitations} placeById={own.placeById}
                                  onAdd={own.onAddInvitation} onChanged={own.onChanged} />}

      {!visits && !error && <div className="empty">{t.account.myLog.loading}</div>}
      {visits && !visits.length && (
        <div className="empty">{own ? t.account.myLog.empty : t.account.myLog.emptyOther(username)}</div>
      )}

      {own && <WishlistSection {...own} />}

      {visits && visits.length > 0 && <>
        <div className="log-filters">
          <div className="search">
            <input type="search" value={filters.search} placeholder={t.account.myLog.searchVisits} aria-label={t.account.myLog.searchVisits}
                   spellCheck={false} onChange={e => setFilters({ ...filters, search: e.target.value })} />
            <button type="button" className={`btn btn-quiet filter-toggle${filtersOpen ? ' active' : ''}`}
                    aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
              {t.app.sidebar.filters}
              {countVisitFilters(filters) > 0 && <span className="filter-count">{countVisitFilters(filters)}</span>}
            </button>
          </div>
          {filtersOpen && <VisitFiltersPanel f={filters} onChange={setFilters} partners={own?.partners ?? []} areas={areas} />}
          {activities.length > 1 && (
            <div className="chip-row" role="group" aria-label={t.account.myLog.onlyOne}>
              <label className="type-option small">
                <input type="radio" name="logActivity" checked={!filters.activity}
                       onChange={() => setFilters({ ...filters, activity: '' })} />{t.account.myLog.all}
              </label>
              {activities.map(a => (
                <label key={a} className="type-option small">
                  <input type="radio" name="logActivity" checked={filters.activity === a}
                         onChange={() => setFilters({ ...filters, activity: a })} />
                  {activityLabel(a)}
                </label>
              ))}
            </div>
          )}
        </div>
        {!shown!.length && <div className="empty">{t.app.sidebar.emptyNothing}</div>}
      </>}

      {stats && shown!.length > 0 && (
        <dl className="log-totals">
          <div><dt>{t.account.myLog.daysOut}</dt><dd className="num">{stats.totals.days}</dd></div>
          <div><dt>{t.account.myLog.spots}</dt><dd className="num">{stats.totals.places}</dd></div>
          <div><dt>{t.account.myLog.areas}</dt><dd className="num">{stats.totals.areas}</dd></div>
        </dl>
      )}

      {stats && shown!.length > 0 && <>
        <Collapsible id="log.statistics" title={t.account.myLog.statistics}>
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
        </Collapsible>

        <Collapsible id="log.visits" title={t.account.myLog.allVisits}>
          {byYear.map(([year, list]) => (
            <details key={year} className="row-group log-year" open>
              <summary className="group-head"><span>{year === NO_DATE ? t.account.myLog.noDate : year}</span><span className="group-count">{list.length}</span></summary>
              <ul className="rows">
                {list.map(v => <VisitRow key={v.id} visit={v} mine onClick={() => onOpenLoggedVisit(v)} />)}
              </ul>
            </details>
          ))}
        </Collapsible>
      </>}

      {own && <div className="log-actions">
        <button type="button" className="log-action" disabled={!visits?.length} title={t.account.myLog.downloadUse}
                onClick={() => setDialog('download')}>
          <ActionIcon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" />
          <span className="log-action-name">{t.account.myLog.download}</span>
        </button>
        <button type="button" className="log-action"
                title={imports.length ? t.account.myLog.importPast(imports.length) : t.account.myLog.importNew}
                onClick={() => setDialog(imports.length ? 'imports' : 'wizard')}>
          <ActionIcon d="M12 15V4 M7 9l5-5 5 5 M5 20h14" />
          <span className="log-action-name">{t.account.myLog.import}</span>
        </button>
      </div>}
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
