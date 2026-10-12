import { useEffect, useState } from 'react';
import { addRoute, deleteRoute, deleteVisit, fetchPlaceVisits, fetchPlaceWishers, fetchRoutes } from '../lib/api';
import { formatCoords } from '../lib/coords';
import type { Track } from '../lib/gpx';
import { ACTIVITIES, activityLabel, directionsUrl, errorMessage, formatDate, formatHours, formatKm, gradeSuggestions, plural } from '../lib/labels';
import { ActivityBadge } from './ActivityBadge';
import type { Place, Route, VisitDetail, Wish } from '../lib/types';
import { Attachments } from './Attachments';
import { PhotoGallery } from './Photos';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';
import { VisibilityPill } from './Sidebar';

export type PlaceTab = 'info' | 'visits';

type Props = {
  place: Place;
  tab: PlaceTab;
  initialVisitId?: number;
  userId: string | null;
  isAdmin: boolean;
  canEdit: boolean;
  reloadKey: number;
  tracks: Map<number, Track>;
  isMobile: boolean;
  onTab: (tab: PlaceTab) => void;
  onClose: () => void;
  onShowOnMap: () => void;
  onOpenArea: (areaId: number) => void;
  onEdit: () => void;
  onAddVisit: () => void;
  /** Your open wish for this place, if any. */
  wish?: Wish;
  onWish: () => void;
  onEditVisit: (visit: VisitDetail) => void;
  onChanged: () => void;
};

export function PlaceView(props: Props) {
  const { place: p, tab } = props;
  return (
    <Drawer
      title={p.name}
      meta={<>
        <span className="meta-item"><ActivityBadge activity={p.activity} />{activityLabel(p.activity)}</span>
        {p.area && (
          <button type="button" className="meta-item link-btn" onClick={() => props.onOpenArea(p.area!.id)}>
            in {p.area.name}
          </button>
        )}
        {p.distance_km != null && <span className="meta-item num">{formatKm(p.distance_km)}</span>}
        {p.max_altitude != null && <span className="meta-item num">{p.max_altitude} m</span>}
        {p.grade && <span className="meta-item num">{p.grade}</span>}
      </>}
      onClose={props.onClose}
      footer={<>
        {props.isMobile && <button className="btn btn-ghost" type="button" onClick={props.onShowOnMap}>Show on map</button>}
        {props.canEdit && <button className="btn btn-ghost" type="button" onClick={props.onEdit}>Edit spot</button>}
        {props.userId && (
          <button className={`btn btn-ghost wish-btn${props.wish ? ' on' : ''}`} type="button" onClick={props.onWish}
                  aria-pressed={!!props.wish}>
            {props.wish ? '★ On your wishlist' : '☆ Add to wishlist'}
          </button>
        )}
        {props.userId && <button className="btn btn-add" type="button" onClick={props.onAddVisit}>Add visit</button>}
      </>}
    >
      <div className="list-mode-tabs drawer-tabs" role="tablist" aria-label="Spot sections">
        <button type="button" role="tab" aria-selected={tab === 'info'}
                className={`list-mode-tab${tab === 'info' ? ' active' : ''}`} onClick={() => props.onTab('info')}>
          Info
        </button>
        <button type="button" role="tab" aria-selected={tab === 'visits'}
                className={`list-mode-tab${tab === 'visits' ? ' active' : ''}`} onClick={() => props.onTab('visits')}>
          Visits<span className="tab-count">{p.visit_count}</span>
        </button>
      </div>
      {tab === 'info' ? <PlaceInfo {...props} /> : <PlaceVisits {...props} />}
    </Drawer>
  );
}

function PlaceInfo({ place: p, userId, isAdmin, canEdit, reloadKey, tracks, wish, onChanged }: Props) {
  const [wishers, setWishers] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchPlaceWishers(p.id).then(w => { if (!cancelled) setWishers(w); }).catch(() => {});
    return () => { cancelled = true; };
  }, [p.id, reloadKey, wish]);

  const rows: [string, React.ReactNode][] = [];
  rows.push(['Activity', activityLabel(p.activity)]);
  if (p.grade) rows.push(['Grade', p.grade]);
  if (p.distance_km != null) rows.push(['Distance', formatKm(p.distance_km)]);
  if (p.max_altitude != null) rows.push(['Altitude', `${p.max_altitude} m`]);
  if (p.elevation_gain != null) rows.push(['Elevation gain', `${p.elevation_gain} m`]);
  if (p.rock) rows.push(['Rock', p.rock]);
  if (p.exposition.length) rows.push(['Faces', p.exposition.join(', ')]);
  if (p.sectors.length) rows.push([p.activity === 'indoor' ? 'Walls' : 'Sectors', p.sectors.map(s => s.name).join(', ')]);

  return (
    <div className="place-info">
      <dl className="facts">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {p.description && <p className="place-description">{p.description}</p>}
      {wishers.length > 0 && <p className="hint-block">On the wishlist of {wishers.join(', ')}.</p>}

      <h3 className="section-title">Getting there</h3>
      <div className="waypoints">
        <Waypoint label="Pin" lat={p.lat} lng={p.lng} />
        <Waypoint label="Parking" icon="P" lat={p.parking_lat} lng={p.parking_lng} />
        <Waypoint label="Start (attacco)" icon="⚑" lat={p.start_lat} lng={p.start_lng} />
      </div>

      {ACTIVITIES[p.activity].sectors && (
        <RouteList spot={p} userId={userId} isAdmin={isAdmin} canEditSpot={canEdit} reloadKey={reloadKey} />
      )}

      <h3 className="section-title">Photos</h3>
      <PhotoGallery owner={{ placeId: p.id }} userId={userId} isAdmin={isAdmin} canAdd={!!userId}
                    emptyText="No photos of this spot yet." />

      <Attachments owner={{ placeId: p.id }} userId={userId} isAdmin={isAdmin} tracks={tracks} onChange={onChanged} />
    </div>
  );
}

function Waypoint({ label, icon, lat, lng }: { label: string; icon?: string; lat: number | null; lng: number | null }) {
  if (lat == null || lng == null) return null;
  return (
    <div className="waypoint">
      <span className={`map-badge small ${icon === 'P' ? 'parking' : icon ? 'start' : 'pin'}`} aria-hidden="true">{icon ?? ''}</span>
      <span className="waypoint-label">{label}</span>
      <span className="waypoint-coords num">{formatCoords(lat, lng, 5)}</span>
      <a href={directionsUrl(lat, lng)} target="_blank" rel="noopener noreferrer">Directions</a>
    </div>
  );
}

function PlaceVisits({ place, initialVisitId, userId, isAdmin, reloadKey, onEditVisit, onChanged }: Props) {
  const [visits, setVisits] = useState<VisitDetail[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | undefined>(initialVisitId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaceVisits(place.id)
      .then(v => { if (!cancelled) setVisits(v); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [place.id, reloadKey]);

  const selected = visits?.find(v => v.id === selectedId) ?? visits?.[0];
  const mine = !!selected && selected.user_id === userId;

  async function remove() {
    if (!selected || !confirm("Delete this visit? This can't be undone.")) return;
    try {
      await deleteVisit(selected.id);
      setSelectedId(undefined);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="visits-view-body">
      <ErrorText error={error} />
      {visits && <div className="hint-block">{plural(visits.length, 'visit')} you can see</div>}
      {visits && visits.length > 0 && (
        <div className="visits-tabs">
          {visits.map((v, i) => (
            <button key={v.id} type="button" className={`visit-tab${v.id === selected?.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(v.id)}>
              {v.date ? formatDate(v.date) : `Visit ${i + 1}`}{v.user_id !== userId && v.username ? `, ${v.username}` : ''}
            </button>
          ))}
        </div>
      )}
      <div className="visit-detail">
        {!visits && !error && <div className="empty">Loading…</div>}
        {visits && !selected && <div className="empty">No visits you can see yet.</div>}
        {selected && <VisitDetailBody visit={selected} mine={mine} />}
        {selected && (
          <PhotoGallery key={selected.id} owner={{ visitId: selected.id }} userId={userId} isAdmin={isAdmin} canAdd={mine}
                        emptyText={mine ? 'No photos from this day yet.' : 'No photos from this day.'} />
        )}
      </div>
      {selected && (mine || isAdmin) && (
        <div className="visit-detail-actions">
          {mine && <button type="button" onClick={() => onEditVisit(selected)}>Edit visit</button>}
          <button type="button" className="danger" onClick={remove}>Delete visit</button>
        </div>
      )}
    </div>
  );
}

function VisitDetailBody({ visit: v, mine }: { visit: VisitDetail; mine: boolean }) {
  const meta = [
    v.date ? formatDate(v.date) : null,
    v.duration_hours != null ? formatHours(v.duration_hours) : null,
    v.partners.length ? `with ${v.partners.join(', ')}` : null,
    !mine && v.username ? `by ${v.username}` : null,
  ].filter(Boolean).join(', ');
  return <>
    <div className="visit-meta">
      {meta && <span>{meta}</span>}
      <VisibilityPill visibility={v.visibility} />
    </div>
    {v.summary && <div className="description">{v.summary}</div>}
    {v.conditions && <div className="description"><b>Conditions:</b> {v.conditions}</div>}
    {v.approach && <div className="description"><b>Avvicinamento:</b> {v.approach}</div>}
    {v.descent && <div className="description"><b>Discesa:</b> {v.descent}</div>}
    {v.ascents.length ? (
      <ul>
        {v.ascents.map(a => (
          <li key={a.id}>
            {[
              <span key="h" className="ascent-head">
                {a.name ? <b>{a.name}</b> : <b className="unnamed">Unnamed route</b>}
                {a.grade && <span className="ascent-grade num">{a.grade}</span>}
                {a.sector && <span className="ascent-sector">{a.sector.name}</span>}
              </span>,
              a.comment && <span key="c" className="ascent-comment">{a.comment}</span>,
            ]}
          </li>
        ))}
      </ul>
    ) : <div className="empty">No routes logged for this visit.</div>}
  </>;
}

/**
 * The spot's shared route list, by sector. Optional: visits can always log
 * routes as free text; a listed route links them, so repeats add up.
 */
function RouteList({ spot, userId, isAdmin, canEditSpot, reloadKey }: {
  spot: Place; userId: string | null; isAdmin: boolean; canEditSpot: boolean; reloadKey: number;
}) {
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [mine, setMine] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRoutes(spot.id)
      .then(r => { if (!cancelled) setRoutes(r); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [spot.id, reloadKey, mine]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addRoute(spot.id, { name, grade, sectorId: sectorId ? +sectorId : null });
      setName('');
      setGrade('');
      setMine(n => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(r: Route) {
    if (!confirm(`Remove "${r.name}" from the list? Logged ascents keep their name.`)) return;
    try {
      await deleteRoute(r.id);
      setMine(n => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const bySector = new Map<number | null, Route[]>();
  for (const r of routes ?? []) bySector.set(r.sector_id, [...(bySector.get(r.sector_id) ?? []), r]);
  const sectorName = (id: number | null) => spot.sectors.find(s => s.id === id)?.name ?? 'Other';
  const order = [...spot.sectors.map(s => s.id as number | null), null].filter(id => bySector.has(id));

  return (
    <section className="route-list">
      <h3 className="section-title">Routes</h3>
      {routes && !routes.length && (
        <div className="empty">No shared route list yet. Visits can still log any route by name; add routes here so repeats are counted.</div>
      )}
      {order.map(id => (
        <div key={id ?? 'other'} className="route-group">
          {(spot.sectors.length > 0) && <h4>{sectorName(id)}</h4>}
          <ul>
            {bySector.get(id)!.map(r => (
              <li key={r.id}>
                <span className="route-line-name">{r.name}</span>
                {r.grade && <span className="num route-line-grade">{r.grade}</span>}
                <span className="route-line-count">{r.ascent_count ? `logged ${r.ascent_count}×` : ''}</span>
                {(r.created_by === userId || canEditSpot || isAdmin) && (
                  <button type="button" className="icon-btn small" aria-label={`Remove ${r.name}`} onClick={() => remove(r)}>×</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ErrorText error={error} />
      {userId && (adding ? (
        <form className="route-add" onSubmit={add}>
          <input required placeholder="Route name" aria-label="Route name" value={name} onChange={e => setName(e.target.value)} />
          <input className="num" placeholder="Grade" aria-label="Grade" list="routeGradeOptions" value={grade}
                 onChange={e => setGrade(e.target.value)} />
          <datalist id="routeGradeOptions">{gradeSuggestions(spot.activity).map(g => <option key={g} value={g} />)}</datalist>
          {spot.sectors.length > 0 && (
            <select aria-label="Sector" value={sectorId} onChange={e => setSectorId(e.target.value)}>
              <option value="">No sector</option>
              {spot.sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button type="submit" className="btn btn-ghost">Add</button>
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>Done</button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost add-places-btn" onClick={() => setAdding(true)}>Add routes to the list</button>
      ))}
    </section>
  );
}
