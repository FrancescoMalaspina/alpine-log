import { useEffect, useState } from 'react';
import { deletePlace, savePlace } from '../lib/api';
import { currentPosition, formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { errorMessage, gradeSuggestions, isRouteLike, typeLabel } from '../lib/labels';
import { EXPOSITIONS, PLACE_TYPES, type Area, type Exposition, type Place, type PlaceType } from '../lib/types';
import { ErrorText, Modal } from './Modal';

type Props = {
  /** Existing place to edit, or the coordinates of a new one. */
  target: { place: Place } | { at: LatLng };
  rocks: string[];
  areas: Area[];
  canDelete: boolean;
  onCoordsChange: (at: LatLng | null) => void;
  onClose: () => void;
  onSaved: (placeId: number, thenAddVisit: boolean) => void;
  onDeleted: () => void;
};

type SectorRow = { key: number; id?: number; name: string };

let nextKey = 1;
const intOrNull = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));

export function PlaceModal({ target, rocks, areas, canDelete, onCoordsChange, onClose, onSaved, onDeleted }: Props) {
  const editing = 'place' in target ? target.place : null;
  const at = 'at' in target ? target.at : null;
  const [types, setTypes] = useState<PlaceType[]>(editing?.types ?? ['crag']);
  const [areaName, setAreaName] = useState(editing?.area?.name ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [coords, setCoords] = useState(formatCoords(editing?.lat ?? at!.lat, editing?.lng ?? at!.lng));
  const [parking, setParking] = useState(formatCoords(editing?.parking_lat, editing?.parking_lng));
  const [start, setStart] = useState(formatCoords(editing?.start_lat, editing?.start_lng));
  const [grade, setGrade] = useState(editing?.grade ?? '');
  const [altitude, setAltitude] = useState(editing?.max_altitude?.toString() ?? '');
  const [gain, setGain] = useState(editing?.elevation_gain?.toString() ?? '');
  const [rock, setRock] = useState(editing?.rock ?? '');
  const [exposition, setExposition] = useState<Exposition[]>(editing?.exposition ?? []);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [sectors, setSectors] = useState<SectorRow[]>(
    () => (editing?.sectors ?? []).map(s => ({ key: nextKey++, id: s.id, name: s.name })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onCoordsChange(parseCoordinates(coords));
  }, [coords, onCoordsChange]);

  const routeLike = isRouteLike(types);
  const hasRock = types.some(t => t === 'crag' || t === 'multipitch' || t === 'alpine');
  const toggleType = (t: PlaceType) => setTypes(ts => (ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]));
  const toggleExposition = (x: Exposition) =>
    setExposition(xs => (xs.includes(x) ? xs.filter(y => y !== x) : [...xs, x]));
  const isNewArea = areaName.trim() && !areas.some(a => a.name.toLowerCase() === areaName.trim().toLowerCase());

  async function fillWithMyLocation(set: (v: string) => void) {
    setError(null);
    try {
      const here = await currentPosition();
      set(formatCoords(here.lat, here.lng));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function save(thenAddVisit: boolean) {
    setError(null);
    const pin = parseCoordinates(coords);
    if (!name.trim() || !pin) return setError('Need at least a name and coordinates.');
    if (!types.length) return setError('Pick at least one activity.');
    const parkingAt = parseCoordinates(parking);
    if (parking.trim() && !parkingAt) return setError("Couldn't read the parking coordinates.");
    const startAt = parseCoordinates(start);
    if (start.trim() && !startAt) return setError("Couldn't read the start coordinates.");
    const sectorNames = sectors.map(s => s.name.trim()).filter(Boolean);
    if (new Set(sectorNames.map(s => s.toLowerCase())).size !== sectorNames.length) {
      return setError('Two sectors have the same name.');
    }

    setBusy(true);
    try {
      const id = await savePlace({
        id: editing?.id,
        area_name: areaName,
        name: name.trim(),
        types,
        lat: pin.lat,
        lng: pin.lng,
        parking_lat: parkingAt?.lat ?? null,
        parking_lng: parkingAt?.lng ?? null,
        start_lat: startAt?.lat ?? null,
        start_lng: startAt?.lng ?? null,
        rock: hasRock ? rock : '',
        exposition,
        description,
        grade,
        max_altitude: routeLike ? intOrNull(altitude) : null,
        elevation_gain: routeLike ? intOrNull(gain) : null,
        sectors: types.includes('crag')
          ? sectors.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name.trim() }))
          : [],
      });
      onSaved(id, thenAddVisit);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    const msg = editing.visit_count
      ? `Delete "${editing.name}" and all ${editing.visit_count} visit(s) logged there? This can't be undone.`
      : `Delete "${editing.name}"? This can't be undone.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await deletePlace(editing.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const removedExistingSector = editing && editing.sectors.some(s => !sectors.some(r => r.id === s.id));

  return (
    <Modal
      title={editing ? 'Edit place' : 'Log a place'}
      subtitle={editing
        ? 'Places are shared: everyone sees them, only you (and admins) can change this one.'
        : 'A crag or a single route. Places are shared; your visits stay private unless you make them public.'}
      onClose={onClose}
      footer={<>
        {editing && canDelete && (
          <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>Delete</button>
        )}
        <button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>
        {!editing && (
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => save(true)}>Save & log a visit</button>
        )}
        <button className="btn btn-add" type="button" disabled={busy} onClick={() => save(false)}>
          {editing ? 'Save changes' : 'Drop on map'}
        </button>
      </>}
    >
      <form className="place-form" onSubmit={e => { e.preventDefault(); save(false); }}>
        <div className="field full">
          <label>Activity <span className="hint">(pick all that apply)</span></label>
          <div className="type-group">
            {PLACE_TYPES.map(t => (
              <label key={t} className="type-option">
                <input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} /> {typeLabel(t)}
              </label>
            ))}
          </div>
        </div>
        <div className="field full">
          <label htmlFor="placeName">Name</label>
          <input id="placeName" required autoFocus value={name}
                 placeholder={routeLike ? 'Via Raggio di sole' : 'Muro del Butch'} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field full">
          <label htmlFor="placeArea">Macroarea <span className="hint">(optional, e.g. Albard, Grignetta)</span></label>
          <input id="placeArea" list="areaOptions" value={areaName} placeholder="Pick or type a new one"
                 onChange={e => setAreaName(e.target.value)} />
          <datalist id="areaOptions">{areas.map(a => <option key={a.id} value={a.name} />)}</datalist>
          {isNewArea && <div className="hint-block">A new area "{areaName.trim()}" will be created.</div>}
        </div>

        <CoordField id="placeCoords" label="Map pin" value={coords} onChange={setCoords} required
                    onLocate={() => fillWithMyLocation(setCoords)} />
        <CoordField id="placeParking" label="Parking" value={parking} onChange={setParking}
                    onLocate={() => fillWithMyLocation(setParking)} />
        <CoordField id="placeStart" label="Start / attacco" value={start} onChange={setStart}
                    onLocate={() => fillWithMyLocation(setStart)} />

        <div className="field">
          <label htmlFor="placeGrade">Grade <span className="hint">(optional)</span></label>
          <input id="placeGrade" className="mono" list="placeGradeOptions" value={grade}
                 placeholder={routeLike ? '6a+ (5c obbl.)' : '5b–7a'} onChange={e => setGrade(e.target.value)} />
          <datalist id="placeGradeOptions">{gradeSuggestions(types).map(g => <option key={g} value={g} />)}</datalist>
        </div>
        {hasRock ? (
          <div className="field">
            <label htmlFor="placeRock">Rock <span className="hint">(optional)</span></label>
            <input id="placeRock" list="rockOptions" value={rock} placeholder="Limestone" onChange={e => setRock(e.target.value)} />
            <datalist id="rockOptions">{rocks.map(r => <option key={r} value={r} />)}</datalist>
          </div>
        ) : <div />}
        {routeLike && <>
          <div className="field">
            <label htmlFor="placeAltitude">Max altitude <span className="hint">(m)</span></label>
            <input id="placeAltitude" type="number" inputMode="numeric" min={-500} max={9000} value={altitude}
                   onChange={e => setAltitude(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="placeGain">Elevation gain <span className="hint">(m)</span></label>
            <input id="placeGain" type="number" inputMode="numeric" min={0} max={10000} value={gain}
                   onChange={e => setGain(e.target.value)} />
          </div>
        </>}

        <div className="field full">
          <label>Exposition <span className="hint">(optional, pick all that apply)</span></label>
          <div className="exposition-group">
            {EXPOSITIONS.map(x => (
              <label key={x} className="exposition-option">
                <input type="checkbox" checked={exposition.includes(x)} onChange={() => toggleExposition(x)} /> {x}
              </label>
            ))}
          </div>
        </div>
        <div className="field full">
          <label htmlFor="placeDescription">Description <span className="hint">(optional)</span></label>
          <textarea id="placeDescription" value={description} placeholder="Approach, style, when to go…"
                    onChange={e => setDescription(e.target.value)} />
        </div>

        {types.includes('crag') && (
          <div className="field full">
            <label>Sectors <span className="hint">(optional)</span></label>
            <div className="sectors-list">
              {sectors.map(s => (
                <div key={s.key} className="sector-row">
                  <input type="text" className="sector-name" placeholder="Sector name" value={s.name}
                         onChange={e => setSectors(ss => ss.map(x => (x.key === s.key ? { ...x, name: e.target.value } : x)))} />
                  <button type="button" aria-label="Remove sector"
                          onClick={() => setSectors(ss => ss.filter(x => x.key !== s.key))}>×</button>
                </div>
              ))}
            </div>
            {removedExistingSector && (
              <div className="hint-block">Routes logged in a removed sector keep their data but lose the sector label.</div>
            )}
            <button type="button" className="btn-add-sector"
                    onClick={() => setSectors(ss => [...ss, { key: nextKey++, name: '' }])}>+ Add sector</button>
          </div>
        )}
        <div className="field full hint-block">
          Guide links, PDFs and the approach GPX are added from the place's Details panel.
        </div>
        <div className="field full"><ErrorText error={error} /></div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CoordField({ id, label, value, onChange, onLocate, required }: {
  id: string; label: string; value: string; onChange: (v: string) => void; onLocate: () => void; required?: boolean;
}) {
  const invalid = value.trim() !== '' && !parseCoordinates(value);
  return (
    <div className="field full">
      <label htmlFor={id}>{label} {!required && <span className="hint">(optional)</span>}</label>
      <div className="coord-input">
        <input id={id} className={`mono${invalid ? ' invalid' : ''}`} value={value} required={required}
               placeholder={'46.076245, 9.435389  or  46°04\'34.5"N 9°26\'07.4"E'}
               aria-invalid={invalid} onChange={e => onChange(e.target.value)} />
        <button type="button" className="locate-btn" title="Use my current location" aria-label={`Use my location for ${label}`}
                onClick={onLocate}>◎</button>
      </div>
    </div>
  );
}
