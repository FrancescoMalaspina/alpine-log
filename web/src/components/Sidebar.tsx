import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { GRADE_OPTIONS } from '../lib/grades';
import { activityLabel, protectionLabel } from '../lib/labels';
import { foldName } from '../lib/names';
import { ActivityBadge } from './ActivityBadge';
import { AreaSelect } from './AreaSelect';
import { LocationResults } from './LocationResults';
import type { Location } from '../lib/geocode';
import type { LatLng } from '../lib/coords';
import {
  ACTIVITY_ORDER, EMPTY_PLACE_FILTERS, EXPOSITIONS, PROTECTIONS, type Area, type Place, type PlaceFilters,
} from '../lib/types';

/** Open beside the map, folded to a thin rail, or across the whole width with the map hidden. */
export type SidebarView = 'open' | 'collapsed' | 'full';

type Props = {
  view: SidebarView;
  onView: (view: SidebarView) => void;
  /** On phones the bottom bar switches between list and map, so there are no fold buttons. */
  isMobile: boolean;
  placeFilters: PlaceFilters;
  onPlaceFilters: (f: PlaceFilters) => void;
  places: Place[];
  areas: Area[];
  error: string | null;
  rocks: string[];
  getMapCenter: () => LatLng;
  userId: string | null;
  /** The spot under the pointer, here or on the map: both show it. */
  hoveredId: number | null;
  onHover: (placeId: number | null) => void;
  /** Bumped to put the cursor in the search box (the "/" key). */
  focusSearch: number;
  onPlaceClick: (place: Place) => void;
  onPlaceDetails: (place: Place) => void;
  onAddVisit: (place: Place) => void;
  onAreaClick: (areaId: number) => void;
  onSectorClick: (sectorId: number) => void;
  onLocationPick: (location: Location) => void;
  onNewArea: () => void;
};

function countPlaceFilters(f: PlaceFilters) {
  return f.activities.length + (f.areaId ? 1 : 0) + (f.rock ? 1 : 0) + f.exposition.length + (f.near ? 1 : 0) + (f.wishlist ? 1 : 0)
    + f.protection.length + (f.maxObligatoryRank != null ? 1 : 0) + (f.country ? 1 : 0)
    + (f.withPublicVisits ? 1 : 0) + (f.inView ? 1 : 0);
}

/** Areas whose name holds the search, accents and case aside (from two letters on). */
function matchingAreas(areas: Area[], search: string) {
  const q = foldName(search);
  return q.length < 2 ? [] : areas.filter(a => foldName(a.name).includes(q));
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

/** The spot search: one box for spots, areas and places on the map, with filters. */
export function Sidebar(props: Props) {
  const { view, onView, isMobile, placeFilters: pf } = props;
  const { t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (props.focusSearch) searchBox.current?.focus(); }, [props.focusSearch]);

  if (view === 'collapsed') {
    return (
      <aside className="sidebar-rail">
        <button type="button" className="rail-btn" onClick={() => onView('open')}
                title={t.app.sidebar.showList} aria-label={t.app.sidebar.showList}>
          <SearchIcon /><span aria-hidden="true">»</span>
        </button>
      </aside>
    );
  }

  const active = countPlaceFilters(pf);
  const areaHits = matchingAreas(props.areas, pf.search);
  const searching = pf.search.trim().length >= 3;

  return (
    <aside className={view === 'full' ? 'sidebar-full' : undefined}>
      <div className="search">
        <input ref={searchBox} type="search" value={pf.search} placeholder={t.app.sidebar.searchPlaceholder}
               aria-label={t.app.sidebar.searchPlaceholder} spellCheck={false}
               onChange={e => props.onPlaceFilters({ ...pf, search: e.target.value })} />
        <button type="button" className={`btn btn-quiet filter-toggle${filtersOpen ? ' active' : ''}`}
                aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
          {t.app.sidebar.filters}{active > 0 && <span className="filter-count">{active}</span>}
        </button>
        {!isMobile && (view === 'full'
          ? <button type="button" className="btn btn-quiet filter-toggle" onClick={() => onView('open')}>{t.app.sidebar.showMap}</button>
          : <>
              <button type="button" className="icon-btn" onClick={() => onView('full')}
                      title={t.app.sidebar.fullWidth} aria-label={t.app.sidebar.fullWidth}>⤢</button>
              <button type="button" className="icon-btn" onClick={() => onView('collapsed')}
                      title={t.app.sidebar.hideList} aria-label={t.app.sidebar.hideList}>«</button>
            </>)}
      </div>

      {filtersOpen && (
        <PlaceFiltersPanel f={pf} onChange={props.onPlaceFilters} rocks={props.rocks} areas={props.areas}
                           countries={[...new Set(props.places.map(p => p.country).filter((c): c is string => !!c))].sort()}
                           getMapCenter={props.getMapCenter} signedIn={!!props.userId} />
      )}

      <div className="list">
        <p className="visually-hidden" aria-live="polite">{t.app.sidebar.shown(props.places.length)}</p>
        {props.error && <div className="list-empty form-error">{props.error}</div>}
        {!props.error && !props.places.length && !areaHits.length && !searching && (
          <div className="list-empty">{t.app.sidebar.emptyNothing}</div>
        )}
        {areaHits.length > 0 && (
          <section className="row-group area-results" aria-label={t.app.sidebar.areasHead}>
            <h2 className="group-head"><span>{t.app.sidebar.areasHead}</span><span className="group-count">{areaHits.length}</span></h2>
            <ul className="rows">
              {areaHits.map(a => (
                <li key={a.id} className="row-item">
                  <button type="button" className="row-main" onClick={() => props.onAreaClick(a.id)}>
                    <span className="row-title">{a.name}</span>
                    <span className="row-meta">{t.app.sidebar.spots(a.place_count)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <PlaceGroups {...props} />
        <LocationResults query={pf.search} getMapCenter={props.getMapCenter} onPick={props.onLocationPick} />
        {props.userId && (
          <div className="list-action">
            <button type="button" className="btn btn-ghost" onClick={props.onNewArea}>{t.app.sidebar.newArea}</button>
          </div>
        )}
      </div>
    </aside>
  );
}

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" strokeLinecap="round" />
  </svg>
);

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



function PlaceRow({ place: p, userId, hoveredId, onHover, onPlaceClick, onPlaceDetails, onAddVisit }: { place: Place } & Props) {
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
    <li className={`row-item${hoveredId === p.id ? ' hovered' : ''}`}
        onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)}>
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

function PlaceFiltersPanel({ f, onChange, rocks, areas, countries, getMapCenter, signedIn }: {
  f: PlaceFilters; onChange: (f: PlaceFilters) => void; rocks: string[]; areas: Area[]; countries: string[];
  getMapCenter: () => LatLng; signedIn: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="filters">
      <div className="filter-checks">
        {signedIn && (
          <label className="type-option small wishlist-filter">
            <input type="checkbox" checked={f.wishlist} onChange={() => onChange({ ...f, wishlist: !f.wishlist })} />
            {t.app.sidebar.onlyWishlist}
          </label>
        )}
        <label className="type-option small">
          <input type="checkbox" checked={f.withPublicVisits} onChange={() => onChange({ ...f, withPublicVisits: !f.withPublicVisits })} />
          {t.app.sidebar.onlyPublicVisits}
        </label>
        <label className="type-option small">
          <input type="checkbox" checked={f.inView} onChange={() => onChange({ ...f, inView: !f.inView })} />
          {t.app.sidebar.onlyInView}
        </label>
      </div>
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
        <span className="filter-label">{t.app.sidebar.protection}</span>
        <div className="chip-row">
          {PROTECTIONS.map(x => (
            <label key={x} className="type-option small">
              <input type="checkbox" checked={f.protection.includes(x)}
                     onChange={() => onChange({ ...f, protection: toggle(f.protection, x) })} />
              {protectionLabel(x)}
            </label>
          ))}
        </div>
      </div>
      <div className="filter-row-2">
        <div className="filter-group">
          <label className="filter-label" htmlFor="obligatoryFilter">{t.app.sidebar.maxObligatory}</label>
          <select id="obligatoryFilter" value={f.maxObligatoryRank ?? ''}
                  onChange={e => onChange({ ...f, maxObligatoryRank: e.target.value ? +e.target.value : null })}>
            <option value="">{t.app.sidebar.anyGrade}</option>
            {GRADE_OPTIONS.map(g => <option key={g.label} value={g.rank}>{g.label}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="countryFilter">{t.app.sidebar.country}</label>
          <select id="countryFilter" value={f.country} onChange={e => onChange({ ...f, country: e.target.value })}>
            <option value="">{t.app.sidebar.anyCountry}</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
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
