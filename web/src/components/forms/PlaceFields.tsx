import { useState } from 'react';
import { currentPosition, formatCoords, parseCoordinates } from '../../lib/coords';
import { errorMessage, gradeSuggestions, isRouteLike, isTouchLayout, typeLabel } from '../../lib/labels';
import { EXPOSITIONS, PLACE_TYPES, type Area, type Exposition, type PlaceType, type Sector } from '../../lib/types';
import { ErrorText } from '../Modal';
import { hasRock, sectorRow, type CoordField, type PlaceValues } from './placeForm';

type Props = {
  values: PlaceValues;
  onChange: (patch: Partial<PlaceValues>) => void;
  areas: Area[];
  rocks: string[];
  /** Hide the form and let the user click the map; the field is filled on return. */
  onPickOnMap: (field: CoordField) => void;
  /** Sectors the place had before editing, to warn when one is removed. */
  originalSectors?: Sector[];
  autoFocusName?: boolean;
};

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

/** Every field of a place. Used by "Add a place" and by "Log a visit" in a new place. */
export function PlaceFields({ values: v, onChange, areas, rocks, onPickOnMap, originalSectors, autoFocusName }: Props) {
  const [locateError, setLocateError] = useState<string | null>(null);
  const routeLike = isRouteLike(v.types);
  const isNewArea = v.areaName.trim() && !areas.some(a => a.name.toLowerCase() === v.areaName.trim().toLowerCase());
  const removedSector = originalSectors?.some(s => !v.sectors.some(r => r.id === s.id));

  async function locate(field: CoordField) {
    setLocateError(null);
    try {
      const here = await currentPosition();
      onChange({ [field]: formatCoords(here.lat, here.lng) });
    } catch (e) {
      setLocateError(errorMessage(e));
    }
  }

  const coordField = (field: CoordField, id: string, label: string, required = false) => (
    <CoordInput id={id} label={label} required={required} value={v[field]}
                onChange={val => onChange({ [field]: val })}
                onLocate={() => locate(field)} onPick={() => onPickOnMap(field)} />
  );

  return (
    <div className="place-form">
      <div className="field full">
        <span className="field-label">Activity <span className="hint">(pick all that apply)</span></span>
        <div className="type-group">
          {PLACE_TYPES.map(t => (
            <label key={t} className="type-option">
              <input type="checkbox" checked={v.types.includes(t)}
                     onChange={() => onChange({ types: toggle<PlaceType>(v.types, t) })} /> {typeLabel(t)}
            </label>
          ))}
        </div>
      </div>
      <div className="field full">
        <label htmlFor="placeName">Name</label>
        <input id="placeName" required autoFocus={autoFocusName && !isTouchLayout()} value={v.name}
               placeholder={routeLike ? 'Via Raggio di sole' : 'Muro del Butch'} onChange={e => onChange({ name: e.target.value })} />
      </div>
      <div className="field full">
        <label htmlFor="placeArea">Macroarea <span className="hint">(optional, e.g. Albard, Grignetta)</span></label>
        <input id="placeArea" list="areaOptions" value={v.areaName} placeholder="Pick one or type a new one"
               onChange={e => onChange({ areaName: e.target.value })} />
        <datalist id="areaOptions">{areas.map(a => <option key={a.id} value={a.name} />)}</datalist>
        {isNewArea && <div className="hint-block">Saving creates a new area, "{v.areaName.trim()}".</div>}
      </div>

      {coordField('coords', 'placeCoords', 'Map pin', true)}
      {coordField('parking', 'placeParking', 'Parking')}
      {coordField('start', 'placeStart', 'Start / attacco')}
      {locateError && <div className="field full"><ErrorText error={locateError} /></div>}

      <div className="field">
        <label htmlFor="placeGrade">Grade <span className="hint">(optional)</span></label>
        <input id="placeGrade" className="num" list="placeGradeOptions" value={v.grade}
               placeholder={routeLike ? '6a+ (5c obbl.)' : '5b–7a'} onChange={e => onChange({ grade: e.target.value })} />
        <datalist id="placeGradeOptions">{gradeSuggestions(v.types).map(g => <option key={g} value={g} />)}</datalist>
      </div>
      {hasRock(v.types) ? (
        <div className="field">
          <label htmlFor="placeRock">Rock <span className="hint">(optional)</span></label>
          <input id="placeRock" list="rockOptions" value={v.rock} placeholder="Limestone" onChange={e => onChange({ rock: e.target.value })} />
          <datalist id="rockOptions">{rocks.map(r => <option key={r} value={r} />)}</datalist>
        </div>
      ) : <div />}
      {routeLike && <>
        <div className="field">
          <label htmlFor="placeAltitude">Max altitude <span className="hint">(m)</span></label>
          <input id="placeAltitude" type="number" inputMode="numeric" min={-500} max={9000} value={v.altitude}
                 onChange={e => onChange({ altitude: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="placeGain">Elevation gain <span className="hint">(m)</span></label>
          <input id="placeGain" type="number" inputMode="numeric" min={0} max={10000} value={v.gain}
                 onChange={e => onChange({ gain: e.target.value })} />
        </div>
      </>}

      <div className="field full">
        <span className="field-label">Faces <span className="hint">(optional, pick all that apply)</span></span>
        <div className="exposition-group">
          {EXPOSITIONS.map(x => (
            <label key={x} className="exposition-option">
              <input type="checkbox" checked={v.exposition.includes(x)}
                     onChange={() => onChange({ exposition: toggle<Exposition>(v.exposition, x) })} /> {x}
            </label>
          ))}
        </div>
      </div>
      <div className="field full">
        <label htmlFor="placeDescription">Description <span className="hint">(optional)</span></label>
        <textarea id="placeDescription" value={v.description} placeholder="Approach, style, when to go…"
                  onChange={e => onChange({ description: e.target.value })} />
      </div>

      {v.types.includes('crag') && (
        <div className="field full">
          <span className="field-label">Sectors <span className="hint">(optional)</span></span>
          <div className="sectors-list">
            {v.sectors.map(s => (
              <div key={s.key} className="sector-row">
                <input type="text" className="sector-name" placeholder="Sector name" aria-label="Sector name" value={s.name}
                       onChange={e => onChange({ sectors: v.sectors.map(x => (x.key === s.key ? { ...x, name: e.target.value } : x)) })} />
                <button type="button" aria-label="Remove sector"
                        onClick={() => onChange({ sectors: v.sectors.filter(x => x.key !== s.key) })}>×</button>
              </div>
            ))}
          </div>
          {removedSector && (
            <div className="hint-block">Routes logged in a removed sector keep their data but lose the sector label.</div>
          )}
          <button type="button" className="btn-add-sector" onClick={() => onChange({ sectors: [...v.sectors, sectorRow()] })}>
            Add a sector
          </button>
        </div>
      )}
    </div>
  );
}

function CoordInput({ id, label, value, onChange, onLocate, onPick, required }: {
  id: string; label: string; value: string; required: boolean;
  onChange: (v: string) => void; onLocate: () => void; onPick: () => void;
}) {
  const invalid = value.trim() !== '' && !parseCoordinates(value);
  return (
    <div className="field full">
      <label htmlFor={id}>{label} {!required && <span className="hint">(optional)</span>}</label>
      <div className="coord-input">
        <input id={id} className={`num${invalid ? ' invalid' : ''}`} value={value} required={required} spellCheck={false}
               placeholder={'46.076245, 9.435389  or  46°04\'34.5"N 9°26\'07.4"E'}
               aria-invalid={invalid} onChange={e => onChange(e.target.value)} />
        <button type="button" className="btn btn-ghost coord-btn" onClick={onPick}>Pick on map</button>
        <button type="button" className="locate-btn" title="Use my current location" aria-label={`Use my location for ${label}`}
                onClick={onLocate}>◎</button>
      </div>
      {invalid && <div className="hint-block">Use decimal (46.0762, 9.4353) or degrees (46°04'34"N 9°26'07"E).</div>}
    </div>
  );
}
