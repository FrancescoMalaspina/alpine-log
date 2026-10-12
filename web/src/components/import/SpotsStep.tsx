import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { pinSvg } from '../../lib/activityIcons';
import { activityLabel, plural } from '../../lib/labels';
import { isReady, type ResolvedSpot } from '../../lib/import/resolve';
import type { Activity } from '../../lib/types';
import { ActivityBadge } from '../ActivityBadge';

type Props = {
  spots: ResolvedSpot[];
  progress: string | null;
  country: string;
  onCountry: (c: string) => void;
  onFindPins: () => void;
  onChange: (key: string, patch: Partial<ResolvedSpot>) => void;
};

const icon = (a: Activity, selected: boolean) => L.divIcon({
  html: `<div class="pin${selected ? ' import-selected' : ''}">${pinSvg(a)}</div>`,
  className: '', iconSize: [30, 40], iconAnchor: [15, 40],
});

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Step 3: link each spot to an existing one, or place it on the map. */
export function SpotsStep({ spots, progress, country, onCountry, onFindPins, onChange }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const created = spots.filter(s => s.choice === 'new');
  const linked = spots.filter(s => typeof s.choice === 'number');
  const missing = spots.filter(s => !isReady(s));
  const pinned = created.filter(s => s.lat != null);

  function select(key: string) {
    setSelected(key);
    rows.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return (
    <div className="import-body">
      <p className="import-summary">
        {plural(linked.length, 'spot')} already on the map, {plural(created.length, 'new spot')}
        {missing.length > 0 && <>, <strong>{missing.length} still without a pin</strong></>}.
        {' '}New pins are found from the town, area or name in the file: check them, and drag any that are off.
      </p>
      <div className="import-pin-settings">
        <div className="field">
          <label htmlFor="importCountry">Country for rows without one <span className="hint">(optional)</span></label>
          <input id="importCountry" value={country} onChange={e => onCountry(e.target.value)} placeholder="e.g. Italia" />
        </div>
        <button type="button" className="btn btn-ghost" disabled={!!progress} onClick={onFindPins}>Find pins again</button>
        {progress && <span className="hint" role="status">{progress}</span>}
      </div>

      <div className="import-spots">
        <div className="import-map-wrap">
          <MapContainer className="import-map" center={[46, 9.5]} zoom={6} scrollWheelZoom>
            <TileLayer attribution={OSM_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            <FitPins pins={pinned} selected={spots.find(s => s.key === selected) ?? null} />
            <PlaceOnClick active={!!placing} onPlace={ll => {
              onChange(placing!, { lat: ll.lat, lng: ll.lng, pinSource: 'map', pinLabel: 'placed on the map' });
              setPlacing(null);
            }} />
            {pinned.map(s => (
              <Marker key={s.key} position={[s.lat!, s.lng!]} icon={icon(s.activity, s.key === selected)} draggable
                      title={s.name}
                      eventHandlers={{
                        click: () => select(s.key),
                        dragend: e => {
                          const ll = (e.target as L.Marker).getLatLng();
                          onChange(s.key, { lat: ll.lat, lng: ll.lng, pinSource: 'map', pinLabel: 'moved on the map' });
                          select(s.key);
                        },
                      }} />
            ))}
          </MapContainer>
          {placing && <div className="import-placing" role="status">Click the map where “{spots.find(s => s.key === placing)?.name}” is. <button type="button" className="btn btn-quiet" onClick={() => setPlacing(null)}>Cancel</button></div>}
        </div>

        <ul className="import-spot-list">
          {spots.map(s => (
            <li key={s.key} ref={el => { if (el) rows.current.set(s.key, el); else rows.current.delete(s.key); }}
                className={`import-spot${s.key === selected ? ' selected' : ''}${isReady(s) ? '' : ' missing'}`}
                onClick={() => setSelected(s.key)}>
              <div className="import-spot-head">
                <ActivityBadge activity={s.activity} />
                <span className="import-spot-name">{s.name}</span>
                <span className="hint">{[s.area, plural(s.visits.length, 'visit')].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="import-spot-choice">
                <select aria-label={`Where "${s.name}" goes`} value={String(s.choice)}
                        onChange={e => {
                          const v = e.target.value;
                          onChange(s.key, { choice: v === 'new' || v === 'skip' ? v : Number(v) });
                        }}>
                  {s.matches.map(m => (
                    <option key={m.place_id} value={m.place_id}>
                      Existing: {m.name}{m.area_name ? ` (${m.area_name})` : ''} · {activityLabel(m.activity as Activity)}
                      {' '}· {Math.round(m.similarity * 100)}% alike{m.distance_km != null ? ` · ${m.distance_km.toFixed(0)} km away` : ''}
                    </option>
                  ))}
                  <option value="new">Create a new {activityLabel(s.activity).toLowerCase()} spot</option>
                  <option value="skip">Don't import this spot</option>
                </select>
                {s.choice === 'new' && (
                  <span className="import-pin-status">
                    {s.lat != null ? <>📍 {s.pinLabel}</> : <strong>No pin yet</strong>}
                    {' '}<button type="button" className="btn-link" onClick={e => { e.stopPropagation(); setPlacing(s.key); }}>
                      {s.lat != null ? 'Move' : 'Place on map'}
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Fits the map to the pins when their number changes, and pans to the
 * selected spot. The map is created while the dialog is still laying out,
 * so it re-measures (and re-fits) whenever its box changes size.
 */
function FitPins({ pins, selected }: { pins: ResolvedSpot[]; selected: ResolvedSpot | null }) {
  const map = useMap();
  const bounds = useMemo(() => pins.map(p => [p.lat!, p.lng!] as L.LatLngTuple), [pins]);
  const count = bounds.length;
  const latest = useRef(bounds);
  useEffect(() => { latest.current = bounds; }, [bounds]);

  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (latest.current.length) {
        map.fitBounds(L.latLngBounds(latest.current), { padding: [44, 44], maxZoom: 11, animate: false });
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map, count]);

  useEffect(() => {
    if (selected?.lat != null) map.panTo([selected.lat, selected.lng!]);
  }, [map, selected?.key, selected?.lat, selected?.lng]);
  return null;
}

function PlaceOnClick({ active, onPlace }: { active: boolean; onPlace: (ll: L.LatLng) => void }) {
  const map = useMapEvents({ click: e => { if (active) onPlace(e.latlng); } });
  useEffect(() => {
    map.getContainer().style.cursor = active ? 'crosshair' : '';
  }, [map, active]);
  return null;
}
