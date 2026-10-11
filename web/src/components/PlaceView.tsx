import { useEffect, useState } from 'react';
import { deleteVisit, fetchPlaceVisits } from '../lib/api';
import { formatCoords } from '../lib/coords';
import type { Track } from '../lib/gpx';
import { directionsUrl, errorMessage, formatHours, plural, typeLabel } from '../lib/labels';
import type { Place, VisitDetail } from '../lib/types';
import { Attachments } from './Attachments';
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
  onEditVisit: (visit: VisitDetail) => void;
  onChanged: () => void;
};

export function PlaceView(props: Props) {
  const { place: p, tab } = props;
  return (
    <Drawer
      kicker={p.area
        ? <button type="button" className="link-btn" onClick={() => props.onOpenArea(p.area!.id)}>{p.area.name} ›</button>
        : p.types.map(typeLabel).join(' · ')}
      title={p.name}
      onClose={props.onClose}
      footer={<>
        {props.isMobile && <button className="btn btn-ghost" type="button" onClick={props.onShowOnMap}>Show on map</button>}
        {props.canEdit && <button className="btn btn-ghost" type="button" onClick={props.onEdit}>Edit place</button>}
        {props.userId && <button className="btn btn-add" type="button" onClick={props.onAddVisit}>+ Add visit</button>}
      </>}
    >
      <div className="list-mode-tabs drawer-tabs">
        <button type="button" className={`list-mode-tab${tab === 'info' ? ' active' : ''}`} onClick={() => props.onTab('info')}>
          Info
        </button>
        <button type="button" className={`list-mode-tab${tab === 'visits' ? ' active' : ''}`} onClick={() => props.onTab('visits')}>
          Visits{p.visit_count ? ` (${p.visit_count})` : ''}
        </button>
      </div>
      {tab === 'info' ? <PlaceInfo {...props} /> : <PlaceVisits {...props} />}
    </Drawer>
  );
}

function PlaceInfo({ place: p, userId, isAdmin, tracks, onChanged }: Props) {
  const rows: [string, React.ReactNode][] = [];
  rows.push(['type', p.types.map(typeLabel).join(', ')]);
  if (p.grade) rows.push(['grade', p.grade]);
  if (p.max_altitude != null) rows.push(['altitude', `${p.max_altitude} m`]);
  if (p.elevation_gain != null) rows.push(['elevation gain', `${p.elevation_gain} m`]);
  if (p.rock) rows.push(['rock', p.rock]);
  if (p.exposition.length) rows.push(['exposition', p.exposition.join(', ')]);
  if (p.sectors.length) rows.push(['sectors', p.sectors.map(s => s.name).join(', ')]);

  return (
    <div className="place-info">
      <div className="pop">
        {rows.map(([k, v]) => <div key={k} className="row"><span>{k}</span><span>{v}</span></div>)}
      </div>
      {p.description && <p className="place-description">{p.description}</p>}

      <div className="waypoints">
        <Waypoint label="Pin" lat={p.lat} lng={p.lng} />
        <Waypoint label="Parking" icon="P" lat={p.parking_lat} lng={p.parking_lng} />
        <Waypoint label="Start (attacco)" icon="⚑" lat={p.start_lat} lng={p.start_lng} />
      </div>

      <Attachments owner={{ placeId: p.id }} userId={userId} isAdmin={isAdmin} tracks={tracks} onChange={onChanged} />
    </div>
  );
}

function Waypoint({ label, icon, lat, lng }: { label: string; icon?: string; lat: number | null; lng: number | null }) {
  if (lat == null || lng == null) return null;
  return (
    <div className="waypoint">
      <span className={`map-badge small ${icon === 'P' ? 'parking' : icon ? 'start' : 'pin'}`}>{icon ?? '●'}</span>
      <span className="waypoint-label">{label}</span>
      <span className="mono waypoint-coords">{formatCoords(lat, lng, 5)}</span>
      <a href={directionsUrl(lat, lng)} target="_blank" rel="noopener noreferrer">Directions ↗</a>
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
              {v.date ?? `Visit ${i + 1}`}{v.user_id !== userId && v.username ? ` · ${v.username}` : ''}
            </button>
          ))}
        </div>
      )}
      <div className="visit-detail">
        {!visits && !error && <div className="empty">Loading…</div>}
        {visits && !selected && <div className="empty">No visits you can see yet.</div>}
        {selected && <VisitDetailBody visit={selected} mine={mine} />}
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
    v.date,
    v.duration_hours != null ? formatHours(v.duration_hours) : null,
    v.partners.length ? `with ${v.partners.join(', ')}` : null,
    !mine && v.username ? `by ${v.username}` : null,
  ].filter(Boolean).join(' · ');
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
              a.sector && <span key="s" className="mono">[{a.sector.name}]</span>,
              a.name && <b key="n">{a.name}</b>,
              a.grade && <span key="g">{a.grade}</span>,
              a.comment && <span key="c">{a.comment}</span>,
            ].filter(Boolean).flatMap((el, i) => (i ? [' — ', el] : [el]))}
          </li>
        ))}
      </ul>
    ) : <div className="empty">No routes logged for this visit.</div>}
  </>;
}
