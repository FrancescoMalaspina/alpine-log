import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng } from '../lib/coords';
import type { Track } from '../lib/gpx';
import { ACTIVITIES, primaryType, typesLabel } from '../lib/labels';
import type { Place, PlaceType } from '../lib/types';

export type MapCommand =
  | { kind: 'focus'; place: Place; nonce: number }
  | { kind: 'fly'; at: LatLng; nonce: number }
  | { kind: 'fit'; points: LatLng[]; nonce: number };

type Props = {
  pins: Place[];
  focusedPlace: Place | null;
  tracks: Track[];
  tempPin: LatLng | null;
  armed: boolean;
  command: MapCommand | null;
  /** Changes whenever the map becomes visible again (mobile tabs). */
  visibleKey: string;
  /** Pixels on the right covered by a side panel; framing keeps clear of them. */
  insetRight: number;
  signedIn: boolean;
  onMapClick: (at: LatLng) => void;
  onPinClick: (place: Place) => void;
  onDetails: (place: Place) => void;
  onViewVisits: (place: Place) => void;
  onAddVisit: (place: Place) => void;
  onCenterChange: (center: LatLng) => void;
};

function pinIcon(color: string, extraClass = '') {
  const html = `<div class="pin${extraClass ? ` ${extraClass}` : ''}">
    <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
      <circle cx="15" cy="15" r="6" fill="#F6F3EB"/>
    </svg></div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -38] });
}
const badgeIcon = (label: string, cls: string) => L.divIcon({
  html: `<div class="map-badge ${cls}">${label}</div>`, className: '', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12],
});

const PLACE_ICONS = Object.fromEntries(
  (Object.keys(ACTIVITIES) as PlaceType[]).map(t => [t, pinIcon(ACTIVITIES[t].color)]),
) as Record<PlaceType, L.DivIcon>;
const TEMP_ICON = pinIcon('#23433C', 'temp');
const PARKING_ICON = badgeIcon('P', 'parking');
const START_ICON = badgeIcon('⚑', 'start');

/** Every point that belongs to a place: the pin, parking, start, GPX tracks. */
function placePoints(place: Place, tracks: Track[]): L.LatLngTuple[] {
  const pts: L.LatLngTuple[] = [[place.lat, place.lng]];
  if (place.parking_lat != null && place.parking_lng != null) pts.push([place.parking_lat, place.parking_lng]);
  if (place.start_lat != null && place.start_lng != null) pts.push([place.start_lat, place.start_lng]);
  for (const t of tracks) for (const line of t.lines) pts.push(...line);
  return pts;
}

function fit(map: L.Map, pts: L.LatLngTuple[], insetRight: number) {
  if (!pts.length) return;
  // The container may have just been shown (mobile tabs): measure it first.
  // A hidden map has no size, and flying it would compute NaN coordinates.
  map.invalidateSize();
  const size = map.getSize();
  if (!size.x || !size.y) return;
  map.flyToBounds(L.latLngBounds(pts), {
    paddingTopLeft: [50, 50],
    paddingBottomRight: [50 + insetRight, 50],
    maxZoom: pts.length > 1 ? 15 : Math.max(map.getZoom(), 13),
    duration: 0.8,
  });
}

function Controller({ command, markers, armed, tempPin, focusedPlace, tracks, visibleKey, insetRight, onMapClick, onCenterChange }: {
  command: MapCommand | null;
  markers: React.RefObject<Map<number, L.Marker>>;
  armed: boolean;
  tempPin: LatLng | null;
  focusedPlace: Place | null;
  tracks: Track[];
  visibleKey: string;
  insetRight: number;
  onMapClick: (at: LatLng) => void;
  onCenterChange: (center: LatLng) => void;
}) {
  // Read inside effects without re-running them when only these change.
  const inset = useRef(insetRight);
  const latestTracks = useRef({ placeId: focusedPlace?.id, tracks });
  useEffect(() => {
    inset.current = insetRight;
    latestTracks.current = { placeId: focusedPlace?.id, tracks };
  }, [insetRight, focusedPlace, tracks]);
  const map = useMap();
  useMapEvents({
    click: e => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }),
    moveend: () => {
      const { lat, lng } = map.getCenter();
      onCenterChange({ lat, lng });
    },
  });

  useEffect(() => {
    if (!command) return;
    if (command.kind === 'fly') {
      map.flyTo([command.at.lat, command.at.lng], Math.max(map.getZoom(), 11), { duration: 0.6 });
      return;
    }
    if (command.kind === 'fit') {
      fit(map, command.points.map(p => [p.lat, p.lng] as L.LatLngTuple), inset.current);
      return;
    }
    const known = latestTracks.current;
    fit(map, placePoints(command.place, known.placeId === command.place.id ? known.tracks : []), inset.current);
    // The marker may only mount on this render (e.g. after switching tabs).
    const t = setTimeout(() => markers.current.get(command.place.id)?.openPopup(), 60);
    return () => clearTimeout(t);
  }, [command, map, markers]);

  // When a focused place's GPX tracks arrive, widen the view to include them.
  useEffect(() => {
    if (focusedPlace && tracks.length) fit(map, placePoints(focusedPlace, tracks), inset.current);
  }, [tracks, focusedPlace, map]);

  useEffect(() => {
    if (tempPin) map.panTo([tempPin.lat, tempPin.lng]);
  }, [tempPin, map]);

  useEffect(() => {
    map.getContainer().style.cursor = armed ? 'crosshair' : '';
  }, [armed, map]);

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(t);
  }, [visibleKey, map]);

  return null;
}

export function MapView(props: Props) {
  const { pins, focusedPlace, tracks, tempPin, signedIn } = props;
  const markers = useRef(new Map<number, L.Marker>());
  // react-leaflet compares positions by reference and calls setLatLng on any
  // new array, which re-pans an open popup — keep them stable across renders.
  const positions = useMemo(
    () => new Map(pins.map(p => [p.id, [p.lat, p.lng] as L.LatLngTuple])), [pins]);
  const tempPosition = useMemo(
    () => (tempPin ? [tempPin.lat, tempPin.lng] as L.LatLngTuple : null), [tempPin]);
  const focusExtras = useMemo(() => {
    if (!focusedPlace) return null;
    const p = focusedPlace;
    return {
      parking: p.parking_lat != null && p.parking_lng != null ? [p.parking_lat, p.parking_lng] as L.LatLngTuple : null,
      start: p.start_lat != null && p.start_lng != null ? [p.start_lat, p.start_lng] as L.LatLngTuple : null,
    };
  }, [focusedPlace]);

  return (
    <MapContainer id="map" center={[42.5, 12.5]} zoom={5} zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Controller
        command={props.command}
        markers={markers}
        armed={props.armed}
        tempPin={tempPin}
        focusedPlace={focusedPlace}
        tracks={tracks}
        visibleKey={props.visibleKey}
        insetRight={props.insetRight}
        onMapClick={props.onMapClick}
        onCenterChange={props.onCenterChange}
      />

      {tracks.flatMap((t, i) => t.lines.map((line, j) => (
        <Polyline key={`${i}-${j}`} positions={line} pathOptions={{ className: 'gpx-line' }} />
      )))}

      {pins.map(p => (
        <Marker
          key={p.id}
          position={positions.get(p.id)!}
          icon={PLACE_ICONS[primaryType(p.types)]}
          ref={m => {
            if (m) markers.current.set(p.id, m);
            else markers.current.delete(p.id);
          }}
          eventHandlers={{
            click: e => {
              L.DomEvent.stopPropagation(e);
              props.onPinClick(p);
            },
          }}
        >
          <Popup>
            <div className="pop">
              <h3>{p.name}</h3>
              {p.area && <div className="pop-area">in {p.area.name}</div>}
              <Row k="type" v={typesLabel(p.types)} />
              {p.grade && <Row k="grade" v={p.grade} />}
              {p.max_altitude != null && <Row k="altitude" v={`${p.max_altitude} m`} />}
              {p.elevation_gain != null && <Row k="gain" v={`${p.elevation_gain} m`} />}
              {p.rock && <Row k="rock" v={p.rock} />}
              {p.exposition.length > 0 && <Row k="exposition" v={p.exposition.join(', ')} />}
              <div className="pop-actions">
                <button type="button" className="primary" onClick={() => props.onDetails(p)}>Details</button>
                {p.visit_count > 0 && (
                  <button type="button" onClick={() => props.onViewVisits(p)}>Visits ({p.visit_count})</button>
                )}
                {signedIn && <button type="button" onClick={() => props.onAddVisit(p)}>+ Visit</button>}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {focusExtras?.parking && (
        <Marker position={focusExtras.parking} icon={PARKING_ICON}>
          <Popup><div className="pop"><h3>Parking</h3><Row k="for" v={focusedPlace!.name} /></div></Popup>
        </Marker>
      )}
      {focusExtras?.start && (
        <Marker position={focusExtras.start} icon={START_ICON}>
          <Popup><div className="pop"><h3>Start (attacco)</h3><Row k="of" v={focusedPlace!.name} /></div></Popup>
        </Marker>
      )}

      {tempPosition && <Marker position={tempPosition} icon={TEMP_ICON} interactive={false} />}
    </MapContainer>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="row"><span>{k}</span><span>{v}</span></div>;
}
