import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { LayersControl, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { badgeSvg, pinSvg, plainPinSvg } from '../lib/activityIcons';
import type { LatLng } from '../lib/coords';
import type { Track } from '../lib/gpx';
import { ACTIVITIES, activityLabel } from '../lib/labels';
import type { Activity, Place } from '../lib/types';

export type MapCommand =
  | { kind: 'focus'; place: Place; nonce: number }
  | { kind: 'fly'; at: LatLng; zoom?: number; nonce: number }
  | { kind: 'fit'; points: LatLng[]; nonce: number };

type Props = {
  pins: Place[];
  focusedPlace: Place | null;
  tracks: Track[];
  tempPin: LatLng | null;
  /** A location found with the search bar. */
  searchPin: (LatLng & { name: string }) | null;
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
  onAddPlaceAt: (at: LatLng) => void;
  onCenterChange: (center: LatLng) => void;
};

const pinIcon = (svg: string, extraClass = '') => L.divIcon({
  html: `<div class="pin${extraClass ? ` ${extraClass}` : ''}">${svg}</div>`,
  className: '', iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -38],
});
const badgeIcon = (label: string, cls: string) => L.divIcon({
  html: `<div class="map-badge ${cls}">${label}</div>`, className: '', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12],
});

const PLACE_ICONS = Object.fromEntries(
  (Object.keys(ACTIVITIES) as Activity[]).map(t => [t, pinIcon(pinSvg(t))]),
) as Record<Activity, L.DivIcon>;
const TEMP_ICON = pinIcon(plainPinSvg('#D7261E'), 'temp');

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TOPO_ATTRIBUTION = 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM &middot; '
  + 'style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const PARKING_ICON = badgeIcon('P', 'parking');
const SEARCH_ICON = L.divIcon({ html: '<div class="search-pin"></div>', className: '', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] });
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
    animate: !reducedMotion(),
  });
}

function Controller({ pins, command, markers, armed, tempPin, focusedPlace, tracks, visibleKey, insetRight, onMapClick, onCenterChange }: {
  pins: Place[];
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

  // Open framed on the places themselves rather than on half of Europe.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !pins.length) return;
    framed.current = true;
    if (!command) map.fitBounds(L.latLngBounds(pins.map(p => [p.lat, p.lng] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 12, animate: false });
  }, [pins, command, map]);

  useEffect(() => {
    if (!command) return;
    if (command.kind === 'fly') {
      map.invalidateSize();
      map.flyTo([command.at.lat, command.at.lng], command.zoom ?? Math.max(map.getZoom(), 11), { duration: 0.8, animate: !reducedMotion() });
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
    if (tempPin) map.panTo([tempPin.lat, tempPin.lng], { animate: !reducedMotion() });
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
  const searchMarker = useRef<L.Marker>(null);
  // Open the found location's popup once its marker is on the map.
  useEffect(() => {
    if (!props.searchPin) return;
    const t = setTimeout(() => searchMarker.current?.openPopup(), 150);
    return () => clearTimeout(t);
  }, [props.searchPin]);
  const searchPosition = useMemo(
    () => (props.searchPin ? [props.searchPin.lat, props.searchPin.lng] as L.LatLngTuple : null), [props.searchPin]);
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
      <LayersControl position="topleft">
        <LayersControl.BaseLayer checked name="Topographic">
          <TileLayer attribution={TOPO_ATTRIBUTION} url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" maxZoom={17} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer attribution={OSM_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        </LayersControl.BaseLayer>
      </LayersControl>
      <Legend />
      <Controller
        pins={pins}
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
          icon={PLACE_ICONS[p.activity]}
          ref={m => {
            if (m) markers.current.set(p.id, m);
            else markers.current.delete(p.id);
          }}
          eventHandlers={{
            click: e => {
              L.DomEvent.stopPropagation(e);
              // While a form is picking a point, a pin is just a spot on the map.
              if (props.armed) {
                e.target.closePopup();
                props.onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
                return;
              }
              props.onPinClick(p);
            },
          }}
        >
          <Popup>
            <div className="pop">
              <h3>{p.name}</h3>
              {p.area && <div className="pop-area">in {p.area.name}</div>}
              <Row k="activity" v={activityLabel(p.activity)} />
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
                {signedIn && <button type="button" onClick={() => props.onAddVisit(p)}>Add visit</button>}
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

      {searchPosition && props.searchPin && (
        <Marker position={searchPosition} icon={SEARCH_ICON} ref={searchMarker}>
          <Popup>
            <div className="pop">
              <h3>{props.searchPin.name}</h3>
              <div className="pop-area num">{props.searchPin.lat.toFixed(5)}, {props.searchPin.lng.toFixed(5)}</div>
              {signedIn && (
                <div className="pop-actions">
                  <button type="button" className="primary" onClick={() => props.onAddPlaceAt(props.searchPin!)}>Add a spot here</button>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      )}

      {tempPosition && <Marker position={tempPosition} icon={TEMP_ICON} interactive={false} />}
    </MapContainer>
  );
}

/** Which pin is which activity: colour and shape, folded away on small screens. */
function Legend() {
  const el = useRef<HTMLDetailsElement>(null);
  // Clicks and scrolls on the legend must not reach the map underneath.
  useEffect(() => {
    L.DomEvent.disableClickPropagation(el.current!);
    L.DomEvent.disableScrollPropagation(el.current!);
  }, []);
  return (
    <details ref={el} className="map-legend" open={!window.matchMedia('(max-width: 820px)').matches}>
      <summary>Legend</summary>
      <ul>
        {(Object.keys(ACTIVITIES) as Activity[]).map(t => (
          <li key={t}>
            <span className="activity-badge" dangerouslySetInnerHTML={{ __html: badgeSvg(t) }} />
            {activityLabel(t)}
          </li>
        ))}
        <li><span className="map-badge small parking" aria-hidden="true">P</span>Parking</li>
        <li><span className="map-badge small start" aria-hidden="true">⚑</span>Start</li>
        <li><span className="legend-track" aria-hidden="true" />Approach (GPX)</li>
      </ul>
    </details>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="row"><span>{k}</span><span>{v}</span></div>;
}
