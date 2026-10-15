import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { pinSvg } from '../../lib/activityIcons';
import { activityLabel, spotTitle } from '../../lib/labels';
import { useI18n } from '../../i18n';
import { isReady, type AreaChoice, type ResolvedSpot } from '../../lib/import/resolve';
import type { Activity } from '../../lib/types';
import { ActivityBadge } from '../ActivityBadge';

type Props = {
  spots: ResolvedSpot[];
  /** Areas of the file that look like existing ones. */
  areas: AreaChoice[];
  onArea: (name: string, use: string) => void;
  onKeepWhole: (s: ResolvedSpot) => void;
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
export function SpotsStep({ spots, areas, onArea, onKeepWhole, progress, country, onCountry, onFindPins, onChange }: Props) {
  const { t } = useI18n();
  const sp = t.import.spots;
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const created = spots.filter(s => s.choice === 'new');
  const linked = spots.filter(s => typeof s.choice === 'number');
  const missing = spots.filter(s => !isReady(s));
  const pinned = created.filter(s => s.lat != null);
  // Only new spots are saved under the file's area names.
  const askedAreas = areas.filter(a => created.some(s => s.area === a.name));

  function select(key: string) {
    setSelected(key);
    rows.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return (
    <div className="import-body">
      <p className="import-summary">
        {sp.alreadyOnMap(linked.length)}{sp.newSpots(created.length)}
        {missing.length > 0 && <>, <strong>{sp.stillNoPin(missing.length)}</strong></>}.
        {' '}{sp.pinsHint}
      </p>
      <div className="import-pin-settings">
        <div className="field">
          <label htmlFor="importCountry">{sp.country} <span className="hint">{sp.optional}</span></label>
          <input id="importCountry" value={country} onChange={e => onCountry(e.target.value)} placeholder={sp.countryPlaceholder} />
        </div>
        <button type="button" className="btn btn-ghost" disabled={!!progress} onClick={onFindPins}>{sp.findAgain}</button>
        {progress && <span className="hint" role="status">{progress}</span>}
      </div>

      {askedAreas.length > 0 && (
        <fieldset className="import-areas">
          <legend>{sp.areasTitle}</legend>
          <p className="hint">{sp.areasHint}</p>
          {askedAreas.map(a => (
            <label key={a.name} className="import-area">
              <span>{a.name}</span>
              <select value={a.use} onChange={e => onArea(a.name, e.target.value)}>
                {a.matches.map(m => <option key={m.area_id} value={m.name}>{sp.useArea(m.name, m.place_count)}</option>)}
                <option value={a.name}>{sp.createArea(a.name)}</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      <div className="import-spots">
        <div className="import-map-wrap">
          <MapContainer className="import-map" center={[46, 9.5]} zoom={6} scrollWheelZoom>
            <TileLayer attribution={OSM_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            <FitPins pins={pinned} selected={spots.find(s => s.key === selected) ?? null} />
            <PlaceOnClick active={!!placing} onPlace={ll => {
              onChange(placing!, { lat: ll.lat, lng: ll.lng, pinSource: 'map', pinLabel: sp.placedOnMap });
              setPlacing(null);
            }} />
            {pinned.map(s => (
              <Marker key={s.key} position={[s.lat!, s.lng!]} icon={icon(s.activity, s.key === selected)} draggable
                      title={s.name}
                      eventHandlers={{
                        click: () => select(s.key),
                        dragend: e => {
                          const ll = (e.target as L.Marker).getLatLng();
                          onChange(s.key, { lat: ll.lat, lng: ll.lng, pinSource: 'map', pinLabel: sp.movedOnMap });
                          select(s.key);
                        },
                      }} />
            ))}
          </MapContainer>
          {placing && <div className="import-placing" role="status">{sp.clickMap(spots.find(s => s.key === placing)?.name ?? '')}<button type="button" className="btn btn-quiet" onClick={() => setPlacing(null)}>{t.common.cancel}</button></div>}
        </div>

        <ul className="import-spot-list">
          {spots.map(s => (
            <li key={s.key} ref={el => { if (el) rows.current.set(s.key, el); else rows.current.delete(s.key); }}
                className={`import-spot${s.key === selected ? ' selected' : ''}${isReady(s) ? '' : ' missing'}`}
                onClick={() => setSelected(s.key)}>
              <div className="import-spot-head">
                <ActivityBadge activity={s.activity} />
                <span className="import-spot-name">{spotTitle(s.name, s.sector)}</span>
                <span className="hint">{[s.area, t.import.counts.visits(s.visits.length)].filter(Boolean).join(' · ')}</span>
              </div>
              {s.splitFrom && (
                <button type="button" className="btn-link import-unsplit"
                        onClick={e => { e.stopPropagation(); onKeepWhole(s); }}>
                  {sp.keepWhole(s.splitFrom)}
                </button>
              )}
              <div className="import-spot-choice">
                <select aria-label={sp.whereGoes(s.name)} value={String(s.choice)}
                        onChange={e => {
                          const v = e.target.value;
                          onChange(s.key, { choice: v === 'new' || v === 'skip' ? v : Number(v) });
                        }}>
                  {s.matches.map(m => (
                    <option key={m.place_id} value={m.place_id}>
                      {sp.existing(spotTitle(m.name, m.sector_name), m.area_name,
                        activityLabel(m.activity), Math.round(m.similarity * 100), m.distance_km ?? null)}
                    </option>
                  ))}
                  <option value="new">{sp.createNew(activityLabel(s.activity).toLowerCase())}</option>
                  <option value="skip">{sp.skip}</option>
                </select>
                {s.choice === 'new' && (
                  <span className="import-pin-status">
                    {s.lat != null ? <>📍 {s.pinLabel}</> : <strong>{sp.noPin}</strong>}
                    {' '}<button type="button" className="btn-link" onClick={e => { e.stopPropagation(); setPlacing(s.key); }}>
                      {s.lat != null ? sp.move : sp.place}
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
