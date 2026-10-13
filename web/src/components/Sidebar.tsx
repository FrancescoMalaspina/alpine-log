import { useState } from 'react';
import { useI18n } from '../i18n';
import { GRADE_OPTIONS } from '../lib/grades';
import { activityLabel, formatDate, formatHours } from '../lib/labels';
import { ActivityBadge } from './ActivityBadge';
import { LocationResults } from './LocationResults';
import type { Location } from '../lib/geocode';
import type { LatLng } from '../lib/coords';
import {
  ACTIVITY_ORDER, EMPTY_PLACE_FILTERS, EMPTY_VISIT_FILTERS, EXPOSITIONS,
  type Area, type Partner, type Place, type PlaceFilters, type VisitFilters, type VisitScope, type VisitSummary,
} from '../lib/types';

export type ListMode = 'places' | 'areas' | 'visits';

type Props = {
  mode: ListMode;
  onModeChange: (mode: ListMode) => void;
  placeFilters: PlaceFilters;
  onPlaceFilters: (f: PlaceFilters) => void;
  visitFilters: VisitFilters;
  onVisitFilters: (f: VisitFilters) => void;
  areaSearch: string;
  onAreaSearch: (s: string) => void;
  places: Place[];
  areas: Area[];
  visits: VisitSummary[];
  loading: boolean;
  error: string | null;
  rocks: string[];
  partners: Partner[];
  getMapCenter: () => LatLng;
  userId: string | null;
  isAdmin: boolean;
  onPlaceClick: (place: Place) => void;
  onPlaceDetails: (place: Place) => void;
  onAddVisit: (place: Place) => void;
  onAreaClick: (areaId: number) => void;
  onSectorClick: (sectorId: number) => void;
  onVisitClick: (visit: VisitSummary) => void;
  onLocationPick: (location: Location) => void;
  onNewArea: () => void;
};

function countPlaceFilters(f: PlaceFilters) {
  return f.activities.length + (f.areaId ? 1 : 0) + (f.rock ? 1 : 0) + f.exposition.length + (f.near ? 1 : 0) + (f.wishlist ? 1 : 0);
}
function countVisitFilters(f: VisitFilters) {
  return (f.scope !== 'all' ? 1 : 0) + (f.partnerId ? 1 : 0) + (f.areaId ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0)
    + (f.minGradeRank != null ? 1 : 0) + (f.activity ? 1 : 0);
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

export function Sidebar(props: Props) {
  const { mode, placeFilters: pf, visitFilters: vf } = props;
  const { t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const active = mode === 'places' ? countPlaceFilters(pf) : mode === 'visits' ? countVisitFilters(vf) : 0;
  const search = mode === 'places' ? pf.search : mode === 'visits' ? vf.search : props.areaSearch;
  const counts = { places: props.places.length, areas: props.areas.length, visits: props.visits.length };
  const count = counts[mode];
  const visitsLoading = props.loading && mode === 'visits';
  const setSearch = (s: string) => {
    if (mode === 'places') props.onPlaceFilters({ ...pf, search: s });
    else if (mode === 'visits') props.onVisitFilters({ ...vf, search: s });
    else props.onAreaSearch(s);
  };

  return (
    <aside>
      <div className="list-mode-tabs" role="tablist" aria-label={t.app.sidebar.whatToList}>
        {(['places', 'areas', 'visits'] as const).map(m => (
          <button key={m} type="button" role="tab" aria-selected={mode === m}
                  className={`list-mode-tab${mode === m ? ' active' : ''}`} onClick={() => props.onModeChange(m)}>
            {t.app.sidebar.tabs[m]}
            <span className="tab-count">{m === 'visits' && props.loading ? '' : counts[m]}</span>
          </button>
        ))}
      </div>

      <div className="search">
        <input type="search" value={search} placeholder={t.app.sidebar.searchPlaceholder[mode]} aria-label={t.app.sidebar.searchPlaceholder[mode]}
               spellCheck={false} onChange={e => setSearch(e.target.value)} />
        {mode !== 'areas' && (
          <button type="button" className={`btn btn-quiet filter-toggle${filtersOpen ? ' active' : ''}`}
                  aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
            {t.app.sidebar.filters}{active > 0 && <span className="filter-count">{active}</span>}
          </button>
        )}
      </div>

      {filtersOpen && mode === 'places' && (
        <PlaceFiltersPanel f={pf} onChange={props.onPlaceFilters} rocks={props.rocks} areas={props.areas}
                           getMapCenter={props.getMapCenter} signedIn={!!props.userId} />
      )}
      {filtersOpen && mode === 'visits' && (
        <VisitFiltersPanel f={vf} onChange={props.onVisitFilters} partners={props.partners} areas={props.areas}
                           signedIn={!!props.userId} isAdmin={props.isAdmin} />
      )}

      <div className="list" aria-busy={visitsLoading}>
        <p className="visually-hidden" aria-live="polite">
          {visitsLoading ? '' : t.app.sidebar.shown[mode](count)}
        </p>
        {props.error && <div className="list-empty form-error">{props.error}</div>}
        {!props.error && !visitsLoading && count === 0 && !(mode === 'places' && search.trim().length >= 3) && (
          <div className="list-empty">
            {mode === 'visits' && !props.userId
              ? t.app.sidebar.emptyPublicVisits
              : mode === 'areas' && !props.areaSearch
                ? t.app.sidebar.emptyAreas
                : t.app.sidebar.emptyNothing}
          </div>
        )}
        {mode === 'places' && <PlaceGroups {...props} />}
        {mode === 'places' && (
          <LocationResults query={pf.search} getMapCenter={props.getMapCenter} onPick={props.onLocationPick} />
        )}
        {mode === 'areas' && props.userId && (
          <div className="list-action">
            <button type="button" className="btn btn-ghost" onClick={props.onNewArea}>{t.app.sidebar.newArea}</button>
          </div>
        )}
        {mode === 'areas' && (
          <ul className="rows">
            {props.areas.map(a => (
              <li key={a.id} className="row-item">
                <button type="button" className="row-main" onClick={() => props.onAreaClick(a.id)}>
                  <span className="row-title">{a.name}</span>
                  <span className="row-meta">{t.app.sidebar.spots(a.place_count)}</span>
                  {a.description && <span className="row-summary">{a.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {mode === 'visits' && (
          <ul className="rows">
            {props.visits.map(v => (
              <VisitRow key={v.id} visit={v} mine={v.user_id === props.userId} onClick={() => props.onVisitClick(v)} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/**
 * Spots grouped under their area, and within it under their sector (spots
 * without one first). The headings open the area or sector.
 */
function PlaceGroups(props: Props) {
  const { t } = useI18n();
  const groups = new Map<string, { areaId: number | null; places: Place[] }>();
  for (const p of props.places) {
    const key = p.area?.name ?? '';
    if (!groups.has(key)) groups.set(key, { areaId: p.area?.id ?? null, places: [] });
    groups.get(key)!.places.push(p);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  const grouped = ordered.length > 1 || ordered[0]?.[0] !== '';

  return <>
    {ordered.map(([name, g]) => (
      <section key={name || 'none'} className="row-group">
        {grouped && (
          <h2 className="group-head">
            {g.areaId
              ? <button type="button" onClick={() => props.onAreaClick(g.areaId!)}>{name}</button>
              : <span>{t.app.sidebar.notInArea}</span>}
            <span className="group-count">{g.places.length}</span>
          </h2>
        )}
        {bySector(g.places).map(([sector, list]) => (
          <div key={sector?.id ?? 'none'}>
            {sector && (
              <h3 className="sector-head">
                <button type="button" onClick={() => props.onSectorClick(sector.id)}>{sector.name}</button>
                <span className="group-count">{list.length}</span>
              </h3>
            )}
            <ul className="rows">
              {list.map(p => <PlaceRow key={p.id} place={p} {...props} />)}
            </ul>
          </div>
        ))}
      </section>
    ))}
  </>;
}

/** Spots without a sector first, then each sector's spots, sectors by name. */
function bySector(places: Place[]): [Place['sector'], Place[]][] {
  const groups = new Map<number | null, [Place['sector'], Place[]]>();
  for (const p of places) {
    const key = p.sector?.id ?? null;
    if (!groups.has(key)) groups.set(key, [p.sector, []]);
    groups.get(key)![1].push(p);
  }
  return [...groups.values()].sort(([a], [b]) => (!a ? -1 : !b ? 1 : a.name.localeCompare(b.name)));
}

function PlaceRow({ place: p, userId, onPlaceClick, onPlaceDetails, onAddVisit }: { place: Place } & Props) {
  const { t } = useI18n();
  const facts = [
    activityLabel(p.activity),
    p.distance_km != null ? `${p.distance_km} km` : null,
    p.grade,
    p.rock,
    p.exposition.length ? t.app.sidebar.faces(p.exposition.join('/')) : null,
    p.visit_count ? t.app.sidebar.visits(p.visit_count) : null,
  ].filter(Boolean);
  return (
    <li className="row-item">
      <button type="button" className="row-main" onClick={() => onPlaceClick(p)}>
        <span className="row-title"><ActivityBadge activity={p.activity} />{p.name}</span>
        <span className="row-meta">{facts.join(', ')}</span>
      </button>
      <div className="row-actions">
        <button type="button" onClick={() => onPlaceDetails(p)}>{t.app.sidebar.details}</button>
        {userId && <button type="button" onClick={() => onAddVisit(p)}>{t.app.sidebar.addVisit}</button>}
      </div>
    </li>
  );
}

export function VisitRow({ visit: v, mine, onClick }: { visit: VisitSummary; mine: boolean; onClick: () => void }) {
  const { t } = useI18n();
  const facts = [
    v.partner_names.length ? t.app.sidebar.withPeople(v.partner_names.join(', ')) : null,
    v.duration_hours != null ? formatHours(v.duration_hours) : null,
    v.grades.length ? v.grades.join(', ') : null,
    v.wall_names.length ? v.wall_names.join(', ') : null,
  ].filter(Boolean);
  return (
    <li className="row-item">
      <button type="button" className="row-main" onClick={onClick}>
        <span className="row-kicker">
          {v.date ? <time dateTime={v.date}>{formatDate(v.date)}</time> : t.app.sidebar.noDate}
          {!mine && v.username && <span>{t.app.sidebar.by(v.username)}</span>}
          <VisibilityPill visibility={v.visibility} />
        </span>
        <span className="row-title">
          <ActivityBadge activity={v.place_activity} />{v.sector_name ? `${v.sector_name} › ` : ''}{v.place_name}
        </span>
        {v.area_name && <span className="row-meta">{v.area_name}</span>}
        {facts.length > 0 && <span className="row-meta">{facts.join('; ')}</span>}
        {v.summary && <span className="row-summary">{v.summary}</span>}
      </button>
    </li>
  );
}

export function VisibilityPill({ visibility }: { visibility: 'private' | 'public' }) {
  const { t } = useI18n();
  return visibility === 'public'
    ? <span className="vis-pill public" title={t.app.sidebar.publicTitle}>{t.common.public}</span>
    : <span className="vis-pill private" title={t.app.sidebar.privateTitle}>{t.common.private}</span>;
}

function AreaSelect({ id, value, areas, onChange }:
  { id: string; value: number | null; areas: Area[]; onChange: (id: number | null) => void }) {
  const { t } = useI18n();
  return (
    <select id={id} value={value ?? ''} onChange={e => onChange(e.target.value ? +e.target.value : null)}>
      <option value="">{t.app.sidebar.anyArea}</option>
      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

function PlaceFiltersPanel({ f, onChange, rocks, areas, getMapCenter, signedIn }: {
  f: PlaceFilters; onChange: (f: PlaceFilters) => void; rocks: string[]; areas: Area[]; getMapCenter: () => LatLng; signedIn: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="filters">
      {signedIn && (
        <label className="type-option small wishlist-filter">
          <input type="checkbox" checked={f.wishlist} onChange={() => onChange({ ...f, wishlist: !f.wishlist })} />
          {t.app.sidebar.onlyWishlist}
        </label>
      )}
      <div className="filter-group">
        <span className="filter-label">{t.app.sidebar.activity}</span>
        <div className="chip-row">
          {ACTIVITY_ORDER.map(t => (
            <label key={t} className="type-option small">
              <input type="checkbox" checked={f.activities.includes(t)}
                     onChange={() => onChange({ ...f, activities: toggle(f.activities, t) })} />
              {activityLabel(t)}
            </label>
          ))}
        </div>
      </div>
      <div className="filter-row-2">
        <div className="filter-group">
          <label className="filter-label" htmlFor="areaFilter">{t.app.sidebar.area}</label>
          <AreaSelect id="areaFilter" value={f.areaId} areas={areas} onChange={areaId => onChange({ ...f, areaId })} />
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="rockFilter">{t.app.sidebar.rock}</label>
          <select id="rockFilter" value={f.rock} onChange={e => onChange({ ...f, rock: e.target.value })}>
            <option value="">{t.app.sidebar.anyRock}</option>
            {rocks.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">{t.app.sidebar.exposition}</span>
        <div className="chip-row">
          {EXPOSITIONS.map(x => (
            <label key={x} className="type-option small">
              <input type="checkbox" checked={f.exposition.includes(x)}
                     onChange={() => onChange({ ...f, exposition: toggle(f.exposition, x) })} />
              {x}
            </label>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">{t.app.sidebar.distance}</span>
        {f.near ? (
          <div className="near-row">
            <span>{t.app.sidebar.within}</span>
            <input type="number" min={1} max={1000} value={f.near.km} className="mono" aria-label={t.app.sidebar.radiusKm}
                   onChange={e => onChange({ ...f, near: { ...f.near!, km: Math.max(1, +e.target.value || 1) } })} />
            <span>{t.app.sidebar.kmOfCentre}</span>
            <button type="button" className="link-btn"
                    onClick={() => onChange({ ...f, near: { ...getMapCenter(), km: f.near!.km } })}>{t.app.sidebar.useMapCentre}</button>
            <button type="button" className="link-btn" onClick={() => onChange({ ...f, near: null })}>{t.app.sidebar.clear}</button>
          </div>
        ) : (
          <button type="button" className="btn-add-sector"
                  onClick={() => onChange({ ...f, near: { ...getMapCenter(), km: 30 } })}>{t.app.sidebar.nearMapCentre}</button>
        )}
      </div>
      <button type="button" className="link-btn clear-all"
              onClick={() => onChange({ ...EMPTY_PLACE_FILTERS, search: f.search })}>{t.app.sidebar.clearFilters}</button>
    </div>
  );
}

function VisitFiltersPanel({ f, onChange, partners, areas, signedIn, isAdmin }: {
  f: VisitFilters; onChange: (f: VisitFilters) => void; partners: Partner[]; areas: Area[]; signedIn: boolean; isAdmin: boolean;
}) {
  const { t } = useI18n();
  const scopes: { value: VisitScope; label: string }[] = [
    { value: 'all', label: isAdmin ? t.app.sidebar.scopeEverything : signedIn ? t.app.sidebar.scopeMinePublic : t.app.sidebar.scopePublic },
    ...(signedIn ? [{ value: 'mine' as const, label: t.app.sidebar.scopeOnlyMine }] : []),
    ...(signedIn ? [{ value: 'public' as const, label: t.app.sidebar.scopeOnlyPublic }] : []),
  ];
  return (
    <div className="filters">
      {scopes.length > 1 && (
        <div className="filter-group">
          <span className="filter-label">{t.app.sidebar.show}</span>
          <div className="segmented">
            {scopes.map(s => (
              <button key={s.value} type="button" className={f.scope === s.value ? 'active' : ''}
                      onClick={() => onChange({ ...f, scope: s.value })}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="filter-row-2">
        <div className="filter-group">
          <label className="filter-label" htmlFor="activityFilter">{t.app.sidebar.activity}</label>
          <select id="activityFilter" value={f.activity}
                  onChange={e => onChange({ ...f, activity: e.target.value as VisitFilters['activity'] })}>
            <option value="">{t.app.sidebar.any}</option>
            {ACTIVITY_ORDER.map(t => <option key={t} value={t}>{activityLabel(t)}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="visitAreaFilter">{t.app.sidebar.area}</label>
          <AreaSelect id="visitAreaFilter" value={f.areaId} areas={areas} onChange={areaId => onChange({ ...f, areaId })} />
        </div>
      </div>
      {signedIn && partners.length > 0 && (
        <div className="filter-group">
          <label className="filter-label" htmlFor="partnerFilter">{t.app.sidebar.climbedWith}</label>
          <select id="partnerFilter" value={f.partnerId ?? ''}
                  onChange={e => onChange({ ...f, partnerId: e.target.value ? +e.target.value : null })}>
            <option value="">{t.app.sidebar.anyone}</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div className="filter-group">
        <span className="filter-label">{t.app.sidebar.date}</span>
        <div className="date-row">
          <input type="date" value={f.from} aria-label={t.app.sidebar.fromDate} onChange={e => onChange({ ...f, from: e.target.value })} />
          <span>{t.app.sidebar.to}</span>
          <input type="date" value={f.to} aria-label={t.app.sidebar.toDate} onChange={e => onChange({ ...f, to: e.target.value })} />
        </div>
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="gradeFilter">{t.app.sidebar.hardestGrade}</label>
        <select id="gradeFilter" value={f.minGradeRank ?? ''}
                onChange={e => onChange({ ...f, minGradeRank: e.target.value ? +e.target.value : null })}>
          <option value="">{t.app.sidebar.anyGrade}</option>
          {GRADE_OPTIONS.map(g => <option key={g.label} value={g.rank}>{g.label}</option>)}
        </select>
      </div>
      <button type="button" className="link-btn clear-all"
              onClick={() => onChange({ ...EMPTY_VISIT_FILTERS, search: f.search })}>{t.app.sidebar.clearFilters}</button>
    </div>
  );
}
