import { useEffect, useState } from 'react';
import { addRoute, deleteRoute, deleteVisit, fetchPlaceVisits, fetchPlaceWishers, fetchRoutes, fetchTips } from '../lib/api';
import { formatCoords } from '../lib/coords';
import type { TrackLayer } from '../lib/gpx';
import { useI18n } from '../i18n';
import { ACTIVITIES, activityLabel, protectionLabel, styleLabel, directionsUrl, errorMessage, formatDate, formatHours, formatKm, gradeSuggestions } from '../lib/labels';
import { ActivityBadge } from './ActivityBadge';
import type { Place, Route, Tip, VisitDetail, Wish } from '../lib/types';
import { Attachments } from './Attachments';
import { PhotoGallery } from './Photos';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';
import { VisibilityPill } from './Sidebar';
import { Tips } from './Tips';

export type PlaceTab = 'info' | 'visits' | 'tips';

type Props = {
  place: Place;
  tab: PlaceTab;
  initialVisitId?: number;
  userId: string | null;
  isAdmin: boolean;
  canEdit: boolean;
  reloadKey: number;
  /** The spot's GPX tracks, with their colours and whether each is drawn on the map. */
  tracks: TrackLayer[];
  onToggleTrack: (id: number) => void;
  isMobile: boolean;
  onTab: (tab: PlaceTab) => void;
  onClose: () => void;
  onShowOnMap: () => void;
  onOpenArea: (areaId: number) => void;
  onOpenSector: (sectorId: number) => void;
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
  const { t } = useI18n();
  // The spot's tips and its sector's: a count on the tab and the newest one on Info.
  const [tips, setTips] = useState<Tip[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTips({ placeId: p.id, sectorId: p.sector_id }).then(r => { if (!cancelled) setTips(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [p.id, p.sector_id, props.reloadKey]);
  return (
    <Drawer
      title={p.name}
      meta={<>
        <span className="meta-item"><ActivityBadge activity={p.activity} />{activityLabel(p.activity)}</span>
        {p.area && (
          <button type="button" className="meta-item link-btn" onClick={() => props.onOpenArea(p.area!.id)}>
            {t.spot.placeView.inArea(p.area.name)}
          </button>
        )}
        {p.sector && (
          <button type="button" className="meta-item link-btn" onClick={() => props.onOpenSector(p.sector!.id)}>
            {t.spot.placeView.inSector(p.sector.name)}
          </button>
        )}
        {p.distance_km != null && <span className="meta-item num">{formatKm(p.distance_km)}</span>}
        {p.max_altitude != null && <span className="meta-item num">{p.max_altitude} m</span>}
        {p.grade && <span className="meta-item num">{p.grade}</span>}
      </>}
      onClose={props.onClose}
      footer={<>
        {props.isMobile && <button className="btn btn-ghost" type="button" onClick={props.onShowOnMap}>{t.spot.placeView.showOnMap}</button>}
        {props.canEdit && <button className="btn btn-ghost" type="button" onClick={props.onEdit}>{t.spot.placeView.editSpot}</button>}
        {props.userId && (
          <button className={`btn btn-ghost wish-btn${props.wish ? ' on' : ''}`} type="button" onClick={props.onWish}
                  aria-pressed={!!props.wish}>
            {props.wish ? t.spot.placeView.onWishlist : t.spot.placeView.addToWishlist}
          </button>
        )}
        {props.userId && <button className="btn btn-add" type="button" onClick={props.onAddVisit}>{t.spot.placeView.addVisit}</button>}
      </>}
    >
      <div className="list-mode-tabs drawer-tabs" role="tablist" aria-label={t.spot.placeView.sections}>
        <button type="button" role="tab" aria-selected={tab === 'info'}
                className={`list-mode-tab${tab === 'info' ? ' active' : ''}`} onClick={() => props.onTab('info')}>
          {t.spot.placeView.info}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'visits'}
                className={`list-mode-tab${tab === 'visits' ? ' active' : ''}`} onClick={() => props.onTab('visits')}>
          {t.spot.placeView.visits}<span className="tab-count">{p.visit_count}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'tips'}
                className={`list-mode-tab${tab === 'tips' ? ' active' : ''}`} onClick={() => props.onTab('tips')}>
          {t.spot.tips.tab}{tips && <span className="tab-count">{tips.length}</span>}
        </button>
      </div>
      {tab === 'info' && <PlaceInfo {...props} latestTip={tips?.[0]} />}
      {tab === 'visits' && <PlaceVisits {...props} />}
      {tab === 'tips' && (
        <Tips placeId={p.id} sector={p.sector} userId={props.userId} isAdmin={props.isAdmin}
              reloadKey={props.reloadKey} onLoaded={setTips} />
      )}
    </Drawer>
  );
}

function PlaceInfo({ place: p, userId, isAdmin, canEdit, reloadKey, tracks, onToggleTrack, wish, onChanged, onTab, latestTip }: Props & { latestTip?: Tip }) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const [wishers, setWishers] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchPlaceWishers(p.id).then(w => { if (!cancelled) setWishers(w); }).catch(() => {});
    return () => { cancelled = true; };
  }, [p.id, reloadKey, wish]);

  const rows: [string, React.ReactNode][] = [];
  rows.push([s.activity, activityLabel(p.activity)]);
  if (p.grade) rows.push([s.grade, p.grade]);
  if (p.distance_km != null) rows.push([s.distance, formatKm(p.distance_km)]);
  if (p.max_altitude != null) rows.push([s.altitude, `${p.max_altitude} m`]);
  if (p.elevation_gain != null) rows.push([s.elevationGain, `${p.elevation_gain} m`]);
  if (p.rock) rows.push([s.rock, p.rock]);
  if (p.exposition.length) rows.push([s.faces, p.exposition.join(', ')]);
  if (p.grade_obligatory) rows.push([s.gradeObligatory, p.grade_obligatory]);
  if (p.aid) rows.push([s.aid, p.aid]);
  if (p.alpine_grade) rows.push([s.alpineGrade, p.alpine_grade]);
  if (p.pitches != null || p.length_m != null) {
    rows.push([s.pitchesLength, [p.pitches != null ? s.pitches(p.pitches) : null, p.length_m != null ? `${p.length_m} m` : null]
      .filter(Boolean).join(', ')]);
  }
  if (p.protection) rows.push([s.protection, protectionLabel(p.protection)]);
  if (p.start_locality) rows.push([s.startLocality, p.start_locality]);
  if (p.country || p.province) rows.push([s.location, [p.province, p.country].filter(Boolean).join(', ')]);

  return (
    <div className="place-info">
      <dl className="facts">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {p.description && <p className="place-description">{p.description}</p>}
      {wishers.length > 0 && <p className="hint-block">{s.wishlistOf(wishers.join(', '))}</p>}
      {latestTip && (
        <button type="button" className="latest-tip" onClick={() => onTab('tips')}>
          <span className="latest-tip-label">{t.spot.tips.latest} · {formatDate(latestTip.created_at.slice(0, 10))}</span>
          <span className="latest-tip-body">{latestTip.body.split('\n')[0]}</span>
        </button>
      )}

      <h3 className="section-title">{s.gettingThere}</h3>
      <div className="waypoints">
        <Waypoint label={s.pin} lat={p.lat} lng={p.lng} />
        <Waypoint label={s.parking} icon="P" lat={p.parking_lat} lng={p.parking_lng} />
        <Waypoint label={s.start} icon="⚑" lat={p.start_lat} lng={p.start_lng} />
      </div>

      {ACTIVITIES[p.activity].routeList && (
        <RouteList spot={p} userId={userId} isAdmin={isAdmin} canEditSpot={canEdit} reloadKey={reloadKey} />
      )}

      <h3 className="section-title">{s.photos}</h3>
      <PhotoGallery owner={{ placeId: p.id }} userId={userId} isAdmin={isAdmin} canAdd={!!userId}
                    emptyText={s.noPhotos} />

      <Attachments owner={{ placeId: p.id }} userId={userId} isAdmin={isAdmin} activity={p.activity}
                   tracks={tracks} onToggleTrack={onToggleTrack} onChange={onChanged} />
    </div>
  );
}

function Waypoint({ label, icon, lat, lng }: { label: string; icon?: string; lat: number | null; lng: number | null }) {
  const { t } = useI18n();
  if (lat == null || lng == null) return null;
  return (
    <div className="waypoint">
      <span className={`map-badge small ${icon === 'P' ? 'parking' : icon ? 'start' : 'pin'}`} aria-hidden="true">{icon ?? ''}</span>
      <span className="waypoint-label">{label}</span>
      <span className="waypoint-coords num">{formatCoords(lat, lng, 5)}</span>
      <a href={directionsUrl(lat, lng)} target="_blank" rel="noopener noreferrer">{t.spot.placeView.directions}</a>
    </div>
  );
}

function PlaceVisits({ place, initialVisitId, userId, isAdmin, reloadKey, onEditVisit, onChanged }: Props) {
  const { t } = useI18n();
  const s = t.spot.placeView;
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
    if (!selected || !confirm(s.confirmDeleteVisit)) return;
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
      {visits && <div className="hint-block">{s.visitsYouCanSee(visits.length)}</div>}
      {visits && visits.length > 0 && (
        <div className="visits-tabs">
          {visits.map((v, i) => (
            <button key={v.id} type="button" className={`visit-tab${v.id === selected?.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(v.id)}>
              {v.date ? formatDate(v.date) : s.visitN(i + 1)}{v.user_id !== userId && v.username ? `, ${v.username}` : ''}
            </button>
          ))}
        </div>
      )}
      <div className="visit-detail">
        {!visits && !error && <div className="empty">{t.common.loading}</div>}
        {visits && !selected && <div className="empty">{s.noVisits}</div>}
        {selected && <VisitDetailBody visit={selected} mine={mine} spot={place} />}
        {selected && (
          <PhotoGallery key={selected.id} owner={{ visitId: selected.id }} userId={userId} isAdmin={isAdmin} canAdd={mine}
                        emptyText={mine ? s.noPhotosMine : s.noPhotosOther} />
        )}
      </div>
      {selected && (mine || isAdmin) && (
        <div className="visit-detail-actions">
          {mine && <button type="button" onClick={() => onEditVisit(selected)}>{s.editVisit}</button>}
          <button type="button" className="danger" onClick={remove}>{s.deleteVisit}</button>
        </div>
      )}
    </div>
  );
}

function VisitDetailBody({ visit: v, mine, spot }: { visit: VisitDetail; mine: boolean; spot: Place }) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const meta = [
    v.date ? formatDate(v.date) : null,
    v.duration_hours != null ? formatHours(v.duration_hours) : null,
    v.partners.length ? s.with(v.partners.join(', ')) : null,
    v.other_partners.length ? s.otherRopes(v.other_partners.join(', ')) : null,
    !mine && v.username ? s.by(v.username) : null,
  ].filter(Boolean).join(', ');
  return <>
    <div className="visit-meta">
      {meta && <span>{meta}</span>}
      {v.rating != null && <Stars rating={v.rating} />}
      <VisibilityPill visibility={v.visibility} />
    </div>
    {v.summary && <div className="description">{v.summary}</div>}
    {v.conditions && <div className="description"><b>{s.conditions}</b> {v.conditions}</div>}
    {v.approach && <div className="description"><b>{s.approach}</b> {v.approach}</div>}
    {v.descent && <div className="description"><b>{s.descent}</b> {v.descent}</div>}
    {v.ascents.length ? (
      <ul>
        {v.ascents.map(a => (
          <li key={a.id}>
            {[
              <span key="h" className="ascent-head">
                {a.name ? <b>{a.name}</b> : <b className="unnamed">{s.unnamedRoute}</b>}
                {a.grade && <span className="ascent-grade num">{a.grade}</span>}
                {a.place && <span className="ascent-sector">{a.place.name}</span>}
                {a.style && <span className={`ascent-style ${a.style}`}>{styleLabel(a.style)}</span>}
                {a.pitches != null && (
                  <span className="ascent-override">
                    {spot.pitches != null && spot.pitches !== a.pitches && !a.place
                      ? s.pitchesOf(a.pitches, spot.pitches) : s.pitches(a.pitches)}
                  </span>
                )}
                {a.aid && <span className="ascent-override">{a.aid}</span>}
              </span>,
              a.comment && <span key="c" className="ascent-comment">{a.comment}</span>,
            ]}
          </li>
        ))}
      </ul>
    ) : <div className="empty">{s.noRoutesLogged}</div>}
  </>;
}

/** A 1–5 rating as stars. */
export function Stars({ rating }: { rating: number }) {
  const { t } = useI18n();
  return (
    <span className="stars" role="img" aria-label={t.spot.visitFields.stars(rating)}>
      {'★'.repeat(rating)}<span className="stars-off">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * The spot's shared route list. Optional: visits can always log
 * routes as free text; a listed route links them, so repeats add up.
 */
function RouteList({ spot, userId, isAdmin, canEditSpot, reloadKey }: {
  spot: Place; userId: string | null; isAdmin: boolean; canEditSpot: boolean; reloadKey: number;
}) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [mine, setMine] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
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
      await addRoute(spot.id, { name, grade });
      setName('');
      setGrade('');
      setMine(n => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(r: Route) {
    if (!confirm(s.confirmRemoveRoute(r.name))) return;
    try {
      await deleteRoute(r.id);
      setMine(n => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }


  return (
    <section className="route-list">
      <h3 className="section-title">{s.routes}</h3>
      {routes && !routes.length && (
        <div className="empty">{s.noRouteList}</div>
      )}
      {routes && routes.length > 0 && (
        <div className="route-group">
          <ul>
            {routes.map(r => (
              <li key={r.id}>
                <span className="route-line-name">{r.name}</span>
                {r.grade && <span className="num route-line-grade">{r.grade}</span>}
                <span className="route-line-count">{r.ascent_count ? s.logged(r.ascent_count) : ''}</span>
                {(r.created_by === userId || canEditSpot || isAdmin) && (
                  <button type="button" className="icon-btn small" aria-label={s.removeRoute(r.name)} onClick={() => remove(r)}>×</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorText error={error} />
      {userId && (adding ? (
        <form className="route-add" onSubmit={add}>
          <input required placeholder={s.routeName} aria-label={s.routeName} value={name} onChange={e => setName(e.target.value)} />
          <input className="num" placeholder={s.grade2} aria-label={s.grade2} list="routeGradeOptions" value={grade}
                 onChange={e => setGrade(e.target.value)} />
          <datalist id="routeGradeOptions">{gradeSuggestions(spot.activity).map(g => <option key={g} value={g} />)}</datalist>
          <button type="submit" className="btn btn-ghost">{s.add}</button>
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>{s.done}</button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost add-places-btn" onClick={() => setAdding(true)}>{s.addRoutes}</button>
      ))}
    </section>
  );
}
