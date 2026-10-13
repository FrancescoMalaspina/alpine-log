import { useState } from 'react';
import { useI18n } from '../../i18n';
import { currentPosition, formatCoords, parseCoordinates } from '../../lib/coords';
import { ACTIVITIES, activityLabel, errorMessage, gradeSuggestions, isTouchLayout } from '../../lib/labels';
import { ACTIVITY_ORDER, EXPOSITIONS, type Area, type Exposition, type Sector } from '../../lib/types';
import { ActivityBadge } from '../ActivityBadge';
import { ErrorText } from '../Modal';
import type { CoordField, PlaceValues } from './placeForm';

const NAME_HINT: Record<PlaceValues['activity'], string> = {
  crag: 'Parete Sud', multipitch: 'Via Raggio di sole', alpine: 'Cresta Segantini', ice: 'Cascata di Lillaz',
  dws: 'Mallorca, Cala Barques', indoor: 'Manga Climbing Milano', ski: 'Pizzo dei Tre Signori',
  hike: 'Sentiero delle Grigne', trail: 'Giro del Resegone',
};

type Props = {
  values: PlaceValues;
  onChange: (patch: Partial<PlaceValues>) => void;
  areas: Area[];
  sectors: Sector[];
  rocks: string[];
  /** Hide the form and let the user click the map; the field is filled on return. */
  onPickOnMap: (field: CoordField) => void;
  autoFocusName?: boolean;
};

/** What a sector is for each activity: the crag, the wall, the mountain… */
const SECTOR_HINT: Record<PlaceValues['activity'], string> = {
  crag: 'Falesia di Civate', multipitch: 'Parete di Pezol', alpine: 'Breithorn', ice: 'Valle di Cogne',
  dws: 'Cala Barques', indoor: 'Manga Climbing', ski: 'Pizzo dei Tre Signori', hike: 'Grigna', trail: 'Resegone',
};

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

/** Every field of a spot. Used by "Add a spot" and by "Log a visit" at a new spot. */
export function PlaceFields({ values: v, onChange, areas, sectors, rocks, onPickOnMap, autoFocusName }: Props) {
  const { t } = useI18n();
  const s = t.spot.placeFields;
  const [locateError, setLocateError] = useState<string | null>(null);
  const f = ACTIVITIES[v.activity];
  const isNewArea = v.areaName.trim() && !areas.some(a => a.name.toLowerCase() === v.areaName.trim().toLowerCase());
  // Sectors of the area being typed (a new area has none yet).
  const area = areas.find(a => a.name.toLowerCase() === v.areaName.trim().toLowerCase());
  const areaSectors = sectors.filter(x => x.area_id === (area?.id ?? null));
  const isNewSector = v.sectorName.trim()
    && !areaSectors.some(x => x.name.toLowerCase() === v.sectorName.trim().toLowerCase());

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
        <span className="field-label" id="activityLabel">{s.activity}</span>
        <div className="type-group activity-choice" role="radiogroup" aria-labelledby="activityLabel">
          {ACTIVITY_ORDER.map(a => (
            <label key={a} className="type-option">
              <input type="radio" name="spotActivity" checked={v.activity === a} onChange={() => onChange({ activity: a })} />
              <ActivityBadge activity={a} /> {activityLabel(a)}
            </label>
          ))}
        </div>
      </div>
      <div className="field full">
        <label htmlFor="placeName">{s.name}</label>
        <input id="placeName" required autoFocus={autoFocusName && !isTouchLayout()} value={v.name}
               placeholder={NAME_HINT[v.activity]} onChange={e => onChange({ name: e.target.value })} />
      </div>
      <div className="field full">
        <label htmlFor="placeArea">{s.area} <span className="hint">{s.areaHint}</span></label>
        <input id="placeArea" list="areaOptions" value={v.areaName} placeholder={s.areaPlaceholder}
               onChange={e => onChange({ areaName: e.target.value })} />
        <datalist id="areaOptions">{areas.map(a => <option key={a.id} value={a.name} />)}</datalist>
        {isNewArea && <div className="hint-block">{s.newArea(v.areaName.trim())}</div>}
      </div>
      <div className="field full">
        <label htmlFor="placeSector">{s.sector} <span className="hint">{s.sectorHint}</span></label>
        <input id="placeSector" list="sectorOptions" value={v.sectorName} placeholder={SECTOR_HINT[v.activity]}
               onChange={e => onChange({ sectorName: e.target.value })} />
        <datalist id="sectorOptions">{areaSectors.map(x => <option key={x.id} value={x.name} />)}</datalist>
        {isNewSector && <div className="hint-block">{s.newSector(v.sectorName.trim())}</div>}
      </div>

      {coordField('coords', 'placeCoords', s.mapPin, true)}
      {coordField('parking', 'placeParking', s.parking)}
      {coordField('start', 'placeStart', s.start)}
      {locateError && <div className="field full"><ErrorText error={locateError} /></div>}

      <div className="field">
        <label htmlFor="placeGrade">{s.grade} <span className="hint">{s.optional}</span></label>
        <input id="placeGrade" className="num" list="placeGradeOptions" value={v.grade}
               placeholder={f.isRoute ? '6a+ (5c obbl.)' : f.routeList ? '5b–7a' : ''} onChange={e => onChange({ grade: e.target.value })} />
        <datalist id="placeGradeOptions">{gradeSuggestions(v.activity).map(g => <option key={g} value={g} />)}</datalist>
      </div>
      {f.rock ? (
        <div className="field">
          <label htmlFor="placeRock">{s.rock} <span className="hint">{s.optional}</span></label>
          <input id="placeRock" list="rockOptions" value={v.rock} placeholder={s.rockPlaceholder} onChange={e => onChange({ rock: e.target.value })} />
          <datalist id="rockOptions">{rocks.map(r => <option key={r} value={r} />)}</datalist>
        </div>
      ) : <div />}
      {f.distance && (
        <div className="field">
          <label htmlFor="placeDistance">{s.distance} <span className="hint">{s.km}</span></label>
          <input id="placeDistance" type="number" inputMode="decimal" min={0.1} max={999} step={0.1} value={v.distance}
                 onChange={e => onChange({ distance: e.target.value })} />
        </div>
      )}
      {f.altitude && <>
        <div className="field">
          <label htmlFor="placeAltitude">{s.maxAltitude} <span className="hint">{s.m}</span></label>
          <input id="placeAltitude" type="number" inputMode="numeric" min={-500} max={9000} value={v.altitude}
                 onChange={e => onChange({ altitude: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="placeGain">{s.elevationGain} <span className="hint">{s.m}</span></label>
          <input id="placeGain" type="number" inputMode="numeric" min={0} max={10000} value={v.gain}
                 onChange={e => onChange({ gain: e.target.value })} />
        </div>
      </>}

      <div className="field full">
        <span className="field-label">{s.faces} <span className="hint">{s.facesHint}</span></span>
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
        <label htmlFor="placeDescription">{s.description} <span className="hint">{s.optional}</span></label>
        <textarea id="placeDescription" value={v.description} placeholder={s.descriptionPlaceholder}
                  onChange={e => onChange({ description: e.target.value })} />
      </div>

    </div>
  );
}

function CoordInput({ id, label, value, onChange, onLocate, onPick, required }: {
  id: string; label: string; value: string; required: boolean;
  onChange: (v: string) => void; onLocate: () => void; onPick: () => void;
}) {
  const { t } = useI18n();
  const s = t.spot.placeFields;
  const invalid = value.trim() !== '' && !parseCoordinates(value);
  return (
    <div className="field full">
      <label htmlFor={id}>{label} {!required && <span className="hint">{s.optional}</span>}</label>
      <div className="coord-input">
        <input id={id} className={`num${invalid ? ' invalid' : ''}`} value={value} required={required} spellCheck={false}
               placeholder={'46.076245, 9.435389  or  46°04\'34.5"N 9°26\'07.4"E'}
               aria-invalid={invalid} onChange={e => onChange(e.target.value)} />
        <button type="button" className="btn btn-ghost coord-btn" onClick={onPick}>{s.pickOnMap}</button>
        <button type="button" className="locate-btn" title={s.useMyLocation} aria-label={s.useMyLocationFor(label)}
                onClick={onLocate}>◎</button>
      </div>
      {invalid && <div className="hint-block">{s.coordsHint}</div>}
    </div>
  );
}
