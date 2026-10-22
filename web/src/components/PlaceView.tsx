import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  addCragSector, addRoute, deleteCragSector, deleteRoute, deleteVisit, fetchCragSectors, fetchMyPlaceSuggestion, fetchOutingMembers, fetchPlaceVisits,
  fetchPlaceWishers, fetchRoutes, fetchTips, leaveOuting, updateCragSector, withdrawPlaceSuggestion, type CragSectorInput,
} from '../lib/api';
import { formatCoords, parseCoordinates } from '../lib/coords';
import type { TrackLayer } from '../lib/gpx';
import { useI18n } from '../i18n';
import { ACTIVITIES, activityLabel, protectionLabel, styleLabel, directionsUrl, errorMessage, formatDate, formatHours, formatKm, gradeSuggestions, routeKind } from '../lib/labels';
import { trackStatsParts } from '../lib/trackStats';
import { ActivityBadge } from './ActivityBadge';
import type { CragSector, OutingMember, Place, PlaceSuggestion, Route, Tip, VisitDetail, Wish } from '../lib/types';
import { Attachments } from './Attachments';
import { beyondTopo } from './forms/visitForm';
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
  onOpenLogbook: (userId: string) => void;
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
        {props.userId && (
          <button className="btn btn-ghost" type="button" onClick={props.onEdit}>
            {props.canEdit ? t.spot.placeView.editSpot : t.spot.placeView.suggestChanges}
          </button>
        )}
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

function PlaceInfo({ place: p, userId, isAdmin, canEdit, reloadKey, tracks, onToggleTrack, wish, onChanged, onTab, onEdit, latestTip }: Props & { latestTip?: Tip }) {
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
      {userId && <MySuggestion placeId={p.id} userId={userId} reloadKey={reloadKey} onEdit={onEdit} />}
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
      <p className="hint-block">{s.photosHint}</p>
      <PhotoGallery owner={{ placeId: p.id }} userId={userId} isAdmin={isAdmin} canAdd={!!userId}
                    emptyText={s.noPhotos} />

      <Attachments owner={{ placeId: p.id }} userId={userId} isAdmin={isAdmin} activity={p.activity}
                   tracks={tracks} onToggleTrack={onToggleTrack} onChange={onChanged} />
    </div>
  );
}

/** Days a reviewed suggestion stays on its author's view of the spot. */
const REVIEW_SHOWN_DAYS = 14;

/** The user's suggestion for this spot: waiting for an admin, or recently approved or rejected. */
function MySuggestion({ placeId, userId, reloadKey, onEdit }: { placeId: number; userId: string; reloadKey: number; onEdit: () => void }) {
  const { t } = useI18n();
  const s = t.spot.suggestion;
  const [suggestion, setSuggestion] = useState<PlaceSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMyPlaceSuggestion(placeId, userId).then(r => {
      const shown = r && (r.status === 'pending'
        || Date.now() - Date.parse(r.reviewed_at ?? '') < REVIEW_SHOWN_DAYS * 86_400_000);
      if (!cancelled) setSuggestion(shown ? r : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [placeId, userId, reloadKey]);

  if (!suggestion) return null;
  const date = formatDate(suggestion.created_at.slice(0, 10));

  async function withdraw() {
    if (!suggestion || !confirm(s.confirmWithdraw)) return;
    try {
      await withdrawPlaceSuggestion(suggestion.id);
      setSuggestion(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="my-suggestion">
      <span className="my-suggestion-label">
        {suggestion.status === 'pending' ? s.pending(date) : suggestion.status === 'approved' ? s.approved(date) : s.rejected(date)}
      </span>
      {suggestion.review_note && <span className="my-suggestion-note">{suggestion.review_note}</span>}
      {suggestion.status === 'pending' && (
        <span className="tip-actions">
          <button type="button" className="link-btn" onClick={onEdit}>{s.edit}</button>
          <button type="button" className="link-btn danger" onClick={withdraw}>{s.withdraw}</button>
        </span>
      )}
      <ErrorText error={error} />
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

/** A spot's visits by day: the visits of a shared day together, any other visit on its own. */
type Day = { key: string; outingId: number | null; visits: VisitDetail[] };

function groupDays(visits: VisitDetail[], userId: string | null): Day[] {
  const days = new Map<string, Day>();
  for (const v of visits) {
    const key = v.outing_id ? `day-${v.outing_id}` : `visit-${v.id}`;
    const day = days.get(key) ?? { key, outingId: v.outing_id, visits: [] };
    // Yours first.
    if (v.user_id === userId) day.visits.unshift(v); else day.visits.push(v);
    days.set(key, day);
  }
  return [...days.values()];
}

function PlaceVisits({ place, initialVisitId, userId, isAdmin, reloadKey, onEditVisit, onChanged, onOpenLogbook }: Props) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const [visits, setVisits] = useState<VisitDetail[] | null>(null);
  const [members, setMembers] = useState<OutingMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | undefined>(initialVisitId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaceVisits(place.id)
      .then(async v => {
        const outings = [...new Set(v.flatMap(x => (x.outing_id ? [x.outing_id] : [])))];
        const m = await fetchOutingMembers(outings).catch(() => []);
        if (!cancelled) { setVisits(v); setMembers(m); }
      })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [place.id, reloadKey, userId]);

  const days = useMemo(() => groupDays(visits ?? [], userId), [visits, userId]);
  const selected = days.find(d => d.visits.some(v => v.id === selectedId)) ?? days[0];
  const membersOf = (d: Day) => members.filter(m => m.outing_id === d.outingId);
  // Who else was there: everyone in a shared day, the author of a visit on its own.
  const othersIn = (d: Day) => (d.outingId ? membersOf(d).map(m => ({ id: m.user_id, name: m.username })) : d.visits.map(v => ({ id: v.user_id, name: v.username })))
    .filter(p => p.id !== userId && p.name).map(p => p.name!);
  const myVisit = selected?.visits.find(v => v.user_id === userId);
  const changer = selected?.visits[0].date_changed_by;
  const changerName = changer && changer !== userId ? selected && membersOf(selected).find(m => m.user_id === changer)?.username : null;

  async function remove(v: VisitDetail) {
    if (!confirm(s.confirmDeleteVisit)) return;
    try {
      await deleteVisit(v.id);
      setSelectedId(undefined);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function leave(v: VisitDetail) {
    if (!confirm(s.confirmLeaveDay)) return;
    try {
      await leaveOuting(v.id);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="visits-view-body">
      <ErrorText error={error} />
      {/* With one day there is nothing to choose: its date shows above it instead. */}
      {days.length > 1 && (
        <div className="visits-tabs">
          {days.map((d, i) => (
            <button key={d.key} type="button" className={`visit-tab${d === selected ? ' active' : ''}`}
                    onClick={() => setSelectedId(d.visits[0].id)}>
              {[d.visits[0].date ? formatDate(d.visits[0].date) : s.visitN(i + 1), ...othersIn(d)].join(', ')}
            </button>
          ))}
        </div>
      )}
      <div className="visit-detail">
        {!visits && !error && <div className="empty">{t.common.loading}</div>}
        {visits && !selected && <div className="empty">{s.noVisits}</div>}
        {days.length === 1 && selected?.visits[0].date && (
          <div className="visit-day-date">{formatDate(selected.visits[0].date)}</div>
        )}
        {changerName && <div className="hint-block">{s.dateChangedBy(changerName)}</div>}
        {selected?.visits.map(v => {
          const mine = v.user_id === userId;
          return (
            <section key={v.id} className="day-visit">
              <VisitDetailBody visit={v} mine={mine} spot={place} members={membersOf(selected)} onOpenLogbook={onOpenLogbook} />
              {(mine || isAdmin) && (
                <div className="visit-detail-actions">
                  {mine && <button type="button" onClick={() => onEditVisit(v)}>{s.editVisit}</button>}
                  {mine && v.outing_id && <button type="button" onClick={() => leave(v)}>{s.leaveDay}</button>}
                  <button type="button" className="danger" onClick={() => remove(v)}>{s.deleteVisit}</button>
                </div>
              )}
            </section>
          );
        })}
        {selected && <span className="field-label">{s.dayPhotos}</span>}
        {selected && (
          <PhotoGallery key={selected.key} owner={{ visitId: myVisit?.id ?? selected.visits[0].id, outingId: selected.outingId }}
                        userId={userId} isAdmin={isAdmin} canAdd={!!myVisit}
                        emptyText={myVisit ? s.noPhotosMine : s.noPhotosOther} />
        )}
      </div>
    </div>
  );
}

function VisitDetailBody({ visit: v, mine, spot, members, onOpenLogbook }: {
  visit: VisitDetail; mine: boolean; spot: Place; members: OutingMember[]; onOpenLogbook: (userId: string) => void;
}) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const words = t.spot.routeWords[routeKind(spot.activity)];
  // A name its owner linked to a registered user leads to their logbook.
  const person = (name: string, userId?: string) => userId
    ? <button key={name} type="button" className="link-btn" onClick={() => onOpenLogbook(userId)}>{name}</button>
    : name;
  const people = (names: string[]) => names.map(n => person(n, v.partner_links[n]));
  // The others in its shared day the visit doesn't name were there too, in other ropes.
  const named = new Set(Object.values(v.partner_links));
  const unnamed = members.filter(m => m.user_id !== v.user_id && !named.has(m.user_id)).map(m => person(m.username, m.user_id));
  const others = [...people(v.other_partners), ...unnamed];
  const meta = [
    v.duration_hours != null ? formatHours(v.duration_hours) : null,
    v.partners.length ? <>{(v.outing_id ? s.together : s.with)('')}{joined(people(v.partners))}</> : null,
    others.length ? <>{s.otherRopes('')}{joined(others)}</> : null,
    !mine && v.username ? <>{s.by('')}{person(v.username, v.user_id)}</> : null,
  ].filter(Boolean);
  // The spot's own route (a multipitch, an alpine route) isn't named again, nor its grade
  // when the topo's; a climb of it that adds nothing to the topo isn't listed.
  const climbs = v.ascents.map(a => ({ ascent: a, ...beyondTopo({ name: a.name ?? '', grade: a.grade ?? '' }, spot) }))
    .filter(({ ascent: a, name, grade }) => name || grade || !a.name || a.style || a.pitches != null || a.aid || a.comment);
  return <>
    <div className="visit-meta">
      {meta.length > 0 && <span>{joined(meta)}</span>}
      {v.rating != null && <Stars rating={v.rating} />}
      <VisibilityPill visibility={v.visibility} />
    </div>
    {v.tracks.map(tr => tr.stats && (
      <div key={tr.id} className="description num"><b>{s.track}</b> {trackStatsParts(tr.stats, spot.activity).join(', ')}</div>
    ))}
    {(v.summary || v.conditions || v.approach || v.descent) && (
      <div className="visit-notes">
        <span className="field-label">{s.yourNotes}</span>
        {v.summary && <div className="description">{v.summary}</div>}
        {v.conditions && <div className="description"><b>{s.conditions}</b> {v.conditions}</div>}
        {v.approach && <div className="description"><b>{s.approach}</b> {v.approach}</div>}
        {v.descent && <div className="description"><b>{s.descent}</b> {v.descent}</div>}
      </div>
    )}
    {v.ascents.length ? (
      <ul>
        {climbs.map(({ ascent: a, name, grade }) => (
          <li key={a.id}>
            {[
              <span key="h" className="ascent-head">
                {name ? <b>{name}</b> : !a.name && <b className="unnamed">{words.unnamed}</b>}
                {grade && <span className="ascent-grade num">{grade}</span>}
                {a.sector && <span className="ascent-sector">{a.sector.name}</span>}
                {a.style && <span className={`ascent-style ${a.style}`}>{styleLabel(a.style)}</span>}
                {a.pitches != null && (
                  <span className="ascent-override">
                    {spot.pitches != null && spot.pitches !== a.pitches
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
    ) : <div className="empty">{words.noneLogged}</div>}
  </>;
}

/** A 1–5 rating as stars. */
/** Nodes separated by commas. */
function joined(parts: React.ReactNode[]) {
  return parts.map((p, i) => <Fragment key={i}>{i > 0 && ', '}{p}</Fragment>);
}

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
 * At a crag the tiri are under its sectors, which are listed and managed here.
 */
function RouteList({ spot, userId, isAdmin, canEditSpot, reloadKey }: {
  spot: Place; userId: string | null; isAdmin: boolean; canEditSpot: boolean; reloadKey: number;
}) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const words = t.spot.routeWords[routeKind(spot.activity)];
  const hasSectors = ACTIVITIES[spot.activity].cragSectors;
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [sectors, setSectors] = useState<CragSector[]>([]);
  const [mine, setMine] = useState(0);
  const [adding, setAdding] = useState<'route' | 'sector' | null>(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRoutes(spot.id), hasSectors ? fetchCragSectors(spot.id) : []])
      .then(([r, cs]) => { if (!cancelled) { setRoutes(r); setSectors(cs); } })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [spot.id, hasSectors, reloadKey, mine]);

  const canChange = (createdBy: string | null) => !!userId && (createdBy === userId || canEditSpot || isAdmin);
  /** Runs a change, then reloads the list. */
  async function change(run: () => Promise<unknown>) {
    setError(null);
    try {
      await run();
      setMine(n => n + 1);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await change(() => addRoute(spot.id, { name, grade, sectorId: sectorId ? Number(sectorId) : null }))) {
      setName('');
      setGrade('');
    }
  }

  async function remove(r: Route) {
    if (confirm(s.confirmRemoveRoute(r.name))) await change(() => deleteRoute(r.id));
  }

  // Each sector with its tiri, then the tiri in none (all of them where the spot has no sectors).
  const groups = [
    ...sectors.map(cs => ({ sector: cs, routes: (routes ?? []).filter(r => r.crag_sector_id === cs.id) })),
    { sector: null, routes: (routes ?? []).filter(r => !sectors.some(cs => cs.id === r.crag_sector_id)) },
  ].filter(g => g.sector || g.routes.length);

  return (
    <section className="route-list">
      <h3 className="section-title">{hasSectors ? s.sectorsAnd(words.routes) : words.routes}</h3>
      {routes && !routes.length && !sectors.length && <div className="empty">{words.noList}</div>}
      {routes && groups.map(g => (
        <div key={g.sector?.id ?? 'none'} className="route-group">
          {g.sector ? (
            <SectorHead sector={g.sector} canChange={canChange(g.sector.created_by)} onChange={change} />
          ) : sectors.length > 0 && <h4 className="route-group-head">{s.noSector}</h4>}
          {g.routes.length > 0 && (
            <ul>
              {g.routes.map(r => (
                <li key={r.id}>
                  <span className="route-line-name">{r.name}</span>
                  {r.grade && <span className="num route-line-grade">{r.grade}</span>}
                  <span className="route-line-count">{r.ascent_count ? s.logged(r.ascent_count) : ''}</span>
                  {canChange(r.created_by) && (
                    <button type="button" className="icon-btn small" aria-label={s.removeRoute(r.name)} onClick={() => remove(r)}>×</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <ErrorText error={error} />
      {userId && adding === 'route' && (
        <form className="route-add" onSubmit={add}>
          <input required placeholder={words.name} aria-label={words.name} value={name} onChange={e => setName(e.target.value)} />
          <input className="num" placeholder={s.grade2} aria-label={s.grade2} list="routeGradeOptions" value={grade}
                 onChange={e => setGrade(e.target.value)} />
          {sectors.length > 0 && (
            <select value={sectorId} aria-label={s.inCragSector} onChange={e => setSectorId(e.target.value)}>
              <option value="">{s.noSector}</option>
              {sectors.map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
            </select>
          )}
          <datalist id="routeGradeOptions">{gradeSuggestions(spot.activity).map(g => <option key={g} value={g} />)}</datalist>
          <button type="submit" className="btn btn-ghost">{s.add}</button>
          <button type="button" className="link-btn" onClick={() => setAdding(null)}>{s.done}</button>
        </form>
      )}
      {userId && adding === 'sector' && (
        <SectorForm onCancel={() => setAdding(null)}
                    onSave={sector => change(() => addCragSector(spot.id, sector)).then(ok => { if (ok) setAdding(null); })} />
      )}
      {userId && !adding && (
        <div className="route-list-actions">
          <button type="button" className="btn btn-ghost add-places-btn" onClick={() => setAdding('route')}>{words.addToList}</button>
          {hasSectors && (
            <button type="button" className="btn btn-ghost add-places-btn" onClick={() => setAdding('sector')}>{s.addSector}</button>
          )}
        </div>
      )}
    </section>
  );
}

/** A crag sector's heading: its name, the way there, what it's like; edit and remove for who may. */
function SectorHead({ sector: cs, canChange, onChange }: {
  sector: CragSector; canChange: boolean; onChange: (run: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <SectorForm sector={cs} onCancel={() => setEditing(false)}
                       onSave={next => onChange(() => updateCragSector(cs.id, next)).then(ok => { if (ok) setEditing(false); })} />;
  }
  return (
    <div className="crag-sector-head">
      <h4 className="route-group-head">{cs.name}</h4>
      {cs.lat != null && cs.lng != null && (
        <a href={directionsUrl(cs.lat, cs.lng)} target="_blank" rel="noopener noreferrer">{s.directions}</a>
      )}
      {canChange && <>
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>{s.editSector}</button>
        <button type="button" className="link-btn danger"
                onClick={() => { if (confirm(s.confirmRemoveSector(cs.name))) onChange(() => deleteCragSector(cs.id)); }}>
          {s.removeSector}
        </button>
      </>}
      {cs.description && <p className="hint crag-sector-description">{cs.description}</p>}
    </div>
  );
}

/** Name, position and description of a crag sector, new or existing. */
function SectorForm({ sector, onSave, onCancel }: {
  sector?: CragSector; onSave: (sector: CragSectorInput) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const s = t.spot.placeView;
  const [name, setName] = useState(sector?.name ?? '');
  const [position, setPosition] = useState(sector?.lat != null ? formatCoords(sector.lat, sector.lng) : '');
  const [description, setDescription] = useState(sector?.description ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const at = position.trim() ? parseCoordinates(position) : null;
    if (position.trim() && !at) return setProblem(s.badPosition);
    onSave({ name, description, lat: at?.lat ?? null, lng: at?.lng ?? null });
  }

  return (
    <form className="crag-sector-form" onSubmit={save}>
      <input required placeholder={s.sectorName} aria-label={s.sectorName} value={name} onChange={e => setName(e.target.value)} />
      <input placeholder={s.sectorPosition} aria-label={s.sectorPosition} value={position}
             onChange={e => { setPosition(e.target.value); setProblem(null); }} />
      <input placeholder={s.sectorDescription} aria-label={s.sectorDescription} value={description}
             onChange={e => setDescription(e.target.value)} />
      <div className="crag-sector-form-actions">
        <button type="submit" className="btn btn-ghost">{t.common.save}</button>
        <button type="button" className="link-btn" onClick={onCancel}>{t.common.cancel}</button>
      </div>
      <ErrorText error={problem} />
    </form>
  );
}
