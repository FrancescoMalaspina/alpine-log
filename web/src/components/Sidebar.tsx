import { useState } from 'react';
import { GRADE_OPTIONS } from '../lib/grades';
import { ACTIVITIES, formatHours, plural, typeLabel } from '../lib/labels';
import type { LatLng } from '../lib/coords';
import {
  EMPTY_PLACE_FILTERS, EMPTY_VISIT_FILTERS, EXPOSITIONS, PLACE_TYPES,
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
  onVisitClick: (visit: VisitSummary) => void;
};

function countPlaceFilters(f: PlaceFilters) {
  return f.types.length + (f.areaId ? 1 : 0) + (f.rock ? 1 : 0) + f.exposition.length + (f.near ? 1 : 0);
}
function countVisitFilters(f: VisitFilters) {
  return (f.scope !== 'all' ? 1 : 0) + (f.partnerId ? 1 : 0) + (f.areaId ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0)
    + (f.minGradeRank != null ? 1 : 0) + (f.placeType ? 1 : 0);
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

const SEARCH_PLACEHOLDER: Record<ListMode, string> = {
  places: 'Search name, rock, grade…',
  areas: 'Search areas…',
  visits: 'Search by place, person, or route…',
};

export function Sidebar(props: Props) {
  const { mode, placeFilters: pf, visitFilters: vf } = props;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const active = mode === 'places' ? countPlaceFilters(pf) : mode === 'visits' ? countVisitFilters(vf) : 0;
  const search = mode === 'places' ? pf.search : mode === 'visits' ? vf.search : props.areaSearch;
  const count = { places: props.places.length, areas: props.areas.length, visits: props.visits.length }[mode];
  const setSearch = (s: string) => {
    if (mode === 'places') props.onPlaceFilters({ ...pf, search: s });
    else if (mode === 'visits') props.onVisitFilters({ ...vf, search: s });
    else props.onAreaSearch(s);
  };

  return (
    <aside>
      <div className="search">
        <input type="search" value={search} placeholder={SEARCH_PLACEHOLDER[mode]} aria-label={SEARCH_PLACEHOLDER[mode]}
               onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="list-mode-tabs">
        {(['places', 'areas', 'visits'] as const).map(m => (
          <button key={m} type="button" className={`list-mode-tab${mode === m ? ' active' : ''}`}
                  onClick={() => props.onModeChange(m)}>
            {m === 'places' ? 'Places' : m === 'areas' ? 'Areas' : 'Visits'}
          </button>
        ))}
        {mode !== 'areas' && (
          <button type="button" className={`list-mode-tab filter-toggle${filtersOpen ? ' active' : ''}`}
                  aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
            Filters{active > 0 && <span className="filter-count">{active}</span>}
          </button>
        )}
      </div>

      {filtersOpen && mode === 'places' && (
        <PlaceFiltersPanel f={pf} onChange={props.onPlaceFilters} rocks={props.rocks} areas={props.areas}
                           getMapCenter={props.getMapCenter} />
      )}
      {filtersOpen && mode === 'visits' && (
        <VisitFiltersPanel f={vf} onChange={props.onVisitFilters} partners={props.partners} areas={props.areas}
                           signedIn={!!props.userId} isAdmin={props.isAdmin} />
      )}

      <div className="list-head">
        <span>{{ places: 'Logbook', areas: 'Macroareas', visits: 'Visits (newest first)' }[mode]}</span>
        <span className="mono">{props.loading && mode === 'visits' ? '…' : count}</span>
      </div>

      <div className="list">
        {props.error && <div className="list-empty form-error">{props.error}</div>}
        {!props.error && !(props.loading && mode === 'visits') && count === 0 && (
          <div className="list-empty">
            {mode === 'visits' && !props.userId
              ? 'No public visits match. Sign in to see your own.'
              : mode === 'areas' && !props.areaSearch
                ? 'No areas yet. Type one in a place\'s "Macroarea" field.'
                : 'Nothing matches.'}
          </div>
        )}
        {mode === 'places' && props.places.map(p => <PlaceCard key={p.id} place={p} {...props} />)}
        {mode === 'areas' && props.areas.map(a => (
          <div key={a.id} className="card" {...activate(() => props.onAreaClick(a.id))}>
            <h3>{a.name}</h3>
            <div className="meta"><span className="tagpill">{plural(a.place_count, 'place')}</span></div>
            {a.description && <div className="visit-card-summary">{a.description}</div>}
          </div>
        ))}
        {mode === 'visits' && props.visits.map(v => (
          <VisitCard key={v.id} visit={v} mine={v.user_id === props.userId} onClick={() => props.onVisitClick(v)} />
        ))}
      </div>
    </aside>
  );
}

function activate(fn: () => void) {
  return {
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        fn();
      }
    },
  };
}

function TypePills({ types }: { types: Place['types'] }) {
  return <>{types.map(t => (
    <span key={t} className="tagpill type-pill" style={{ '--type-color': ACTIVITIES[t].color } as React.CSSProperties}>
      {typeLabel(t)}
    </span>
  ))}</>;
}

function PlaceCard({ place: p, userId, onPlaceClick, onPlaceDetails, onAddVisit, onAreaClick }: { place: Place } & Props) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="card" {...activate(() => onPlaceClick(p))}>
      {p.area && (
        <button type="button" className="card-area" onClick={stop(() => onAreaClick(p.area!.id))}>{p.area.name} ›</button>
      )}
      <h3>{p.name}</h3>
      <div className="meta">
        <TypePills types={p.types} />
        {p.grade && <span className="tagpill">{p.grade}</span>}
        {p.rock && <span className="tagpill">{p.rock}</span>}
        {p.exposition.length > 0 && <span className="tagpill">{p.exposition.join(', ')}</span>}
        {p.sectors.length > 0 && <span className="tagpill">{plural(p.sectors.length, 'sector')}</span>}
        {p.visit_count > 0 && <span className="tagpill">{plural(p.visit_count, 'visit')}</span>}
      </div>
      <div className="card-actions">
        <button type="button" className="btn-view-visits-card" onClick={stop(() => onPlaceDetails(p))}>Details</button>
        {userId && <button type="button" onClick={stop(() => onAddVisit(p))}>+ Add visit</button>}
      </div>
    </div>
  );
}

function VisitCard({ visit: v, mine, onClick }: { visit: VisitSummary; mine: boolean; onClick: () => void }) {
  return (
    <div className="card" {...activate(onClick)}>
      {v.area_name && <div className="card-area static">{v.area_name}</div>}
      <h3>{v.place_name}</h3>
      <div className="meta">
        {v.date && <span className="tagpill mono">{v.date}</span>}
        <VisibilityPill visibility={v.visibility} />
        {!mine && v.username && <span className="tagpill by-pill">by {v.username}</span>}
        {v.partner_names.length > 0 && <span className="tagpill">with {v.partner_names.join(', ')}</span>}
        {v.duration_hours != null && <span className="tagpill mono">{formatHours(v.duration_hours)}</span>}
        {v.ascent_count > 0 && <span className="tagpill">{plural(v.ascent_count, 'route')}</span>}
        {v.grades.length > 0 && <span className="tagpill mono">{v.grades.join(' · ')}</span>}
        {v.sector_names.length > 0 && <span className="tagpill">{v.sector_names.join(', ')}</span>}
      </div>
      {v.summary && <div className="visit-card-summary">{v.summary}</div>}
    </div>
  );
}

export function VisibilityPill({ visibility }: { visibility: 'private' | 'public' }) {
  return visibility === 'public'
    ? <span className="tagpill vis-pill public" title="Anyone can see this visit">Public</span>
    : <span className="tagpill vis-pill private" title="Only you (and admins) can see this visit">Private</span>;
}

function AreaSelect({ id, value, areas, onChange }:
  { id: string; value: number | null; areas: Area[]; onChange: (id: number | null) => void }) {
  return (
    <select id={id} value={value ?? ''} onChange={e => onChange(e.target.value ? +e.target.value : null)}>
      <option value="">Any area</option>
      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

function PlaceFiltersPanel({ f, onChange, rocks, areas, getMapCenter }: {
  f: PlaceFilters; onChange: (f: PlaceFilters) => void; rocks: string[]; areas: Area[]; getMapCenter: () => LatLng;
}) {
  return (
    <div className="filters">
      <div className="filter-group">
        <span className="filter-label">Activity</span>
        <div className="chip-row">
          {PLACE_TYPES.map(t => (
            <label key={t} className="type-option small">
              <input type="checkbox" checked={f.types.includes(t)} onChange={() => onChange({ ...f, types: toggle(f.types, t) })} />
              {typeLabel(t)}
            </label>
          ))}
        </div>
      </div>
      <div className="filter-row-2">
        <div className="filter-group">
          <label className="filter-label" htmlFor="areaFilter">Area</label>
          <AreaSelect id="areaFilter" value={f.areaId} areas={areas} onChange={areaId => onChange({ ...f, areaId })} />
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="rockFilter">Rock</label>
          <select id="rockFilter" value={f.rock} onChange={e => onChange({ ...f, rock: e.target.value })}>
            <option value="">Any rock</option>
            {rocks.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Exposition</span>
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
        <span className="filter-label">Distance</span>
        {f.near ? (
          <div className="near-row">
            <span>within</span>
            <input type="number" min={1} max={1000} value={f.near.km} className="mono" aria-label="Radius in km"
                   onChange={e => onChange({ ...f, near: { ...f.near!, km: Math.max(1, +e.target.value || 1) } })} />
            <span>km of the pinned centre</span>
            <button type="button" className="link-btn"
                    onClick={() => onChange({ ...f, near: { ...getMapCenter(), km: f.near!.km } })}>use current map centre</button>
            <button type="button" className="link-btn" onClick={() => onChange({ ...f, near: null })}>clear</button>
          </div>
        ) : (
          <button type="button" className="btn-add-sector"
                  onClick={() => onChange({ ...f, near: { ...getMapCenter(), km: 30 } })}>Near the map centre…</button>
        )}
      </div>
      <button type="button" className="link-btn clear-all"
              onClick={() => onChange({ ...EMPTY_PLACE_FILTERS, search: f.search })}>Clear filters</button>
    </div>
  );
}

function VisitFiltersPanel({ f, onChange, partners, areas, signedIn, isAdmin }: {
  f: VisitFilters; onChange: (f: VisitFilters) => void; partners: Partner[]; areas: Area[]; signedIn: boolean; isAdmin: boolean;
}) {
  const scopes: { value: VisitScope; label: string }[] = [
    { value: 'all', label: isAdmin ? 'Everything' : signedIn ? 'Mine + public' : 'Public' },
    ...(signedIn ? [{ value: 'mine' as const, label: 'Only mine' }] : []),
    ...(signedIn ? [{ value: 'public' as const, label: 'Only public' }] : []),
  ];
  return (
    <div className="filters">
      {scopes.length > 1 && (
        <div className="filter-group">
          <span className="filter-label">Show</span>
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
          <label className="filter-label" htmlFor="placeTypeFilter">Activity</label>
          <select id="placeTypeFilter" value={f.placeType}
                  onChange={e => onChange({ ...f, placeType: e.target.value as VisitFilters['placeType'] })}>
            <option value="">Any</option>
            {PLACE_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="visitAreaFilter">Area</label>
          <AreaSelect id="visitAreaFilter" value={f.areaId} areas={areas} onChange={areaId => onChange({ ...f, areaId })} />
        </div>
      </div>
      {signedIn && partners.length > 0 && (
        <div className="filter-group">
          <label className="filter-label" htmlFor="partnerFilter">Climbed with</label>
          <select id="partnerFilter" value={f.partnerId ?? ''}
                  onChange={e => onChange({ ...f, partnerId: e.target.value ? +e.target.value : null })}>
            <option value="">Anyone</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div className="filter-group">
        <span className="filter-label">Date</span>
        <div className="date-row">
          <input type="date" value={f.from} aria-label="From date" onChange={e => onChange({ ...f, from: e.target.value })} />
          <span>→</span>
          <input type="date" value={f.to} aria-label="To date" onChange={e => onChange({ ...f, to: e.target.value })} />
        </div>
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="gradeFilter">Hardest climbing grade ≥</label>
        <select id="gradeFilter" value={f.minGradeRank ?? ''}
                onChange={e => onChange({ ...f, minGradeRank: e.target.value ? +e.target.value : null })}>
          <option value="">Any grade</option>
          {GRADE_OPTIONS.map(g => <option key={g.label} value={g.rank}>{g.label}</option>)}
        </select>
      </div>
      <button type="button" className="link-btn clear-all"
              onClick={() => onChange({ ...EMPTY_VISIT_FILTERS, search: f.search })}>Clear filters</button>
    </div>
  );
}
