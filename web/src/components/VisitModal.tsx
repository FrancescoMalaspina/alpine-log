import { useEffect, useMemo, useState } from 'react';
import { savePlace } from '../lib/api';
import { formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { errorMessage, typesLabel } from '../lib/labels';
import type { Area, Partner, Place, VisitDetail } from '../lib/types';
import { PlaceFields } from './forms/PlaceFields';
import { COORD_LABELS, buildPlaceInput, placeValuesFrom, type CoordField, type PlaceValues } from './forms/placeForm';
import { newSectorOptions, saveVisitAt } from './forms/save';
import { VisitFields } from './forms/VisitFields';
import { visitProblem, visitValuesFrom, type VisitValues } from './forms/visitForm';
import { ErrorText, Modal } from './Modal';
import type { PickOnMap } from './PlaceModal';

type Props = {
  /** Place to preselect (e.g. "Add visit" from a place); omitted from the header button. */
  placeId?: number;
  /** The visit to edit; its place can't be changed. */
  visit?: VisitDetail;
  places: Place[];
  areas: Area[];
  rocks: string[];
  partners: Partner[];
  hidden: boolean;
  onPickOnMap: PickOnMap;
  onCoordsChange: (at: LatLng | null) => void;
  onClose: () => void;
  onSaved: (placeId: number, visitId: number) => void;
};

const NEW = 'new';

/** Log a visit at an existing place, or at a new place created in the same save. */
export function VisitModal({ placeId, visit, places, areas, rocks, partners, hidden, onPickOnMap, onCoordsChange, onClose, onSaved }: Props) {
  const [choice, setChoice] = useState<string>(visit ? String(visit.place_id) : placeId ? String(placeId) : '');
  const [newPlace, setNewPlace] = useState<PlaceValues>(() => placeValuesFrom());
  // Set once a new place is stored, so a retry after a failed visit save doesn't create it twice.
  const [savedPlaceId, setSavedPlaceId] = useState<number | undefined>();
  const [values, setValues] = useState<VisitValues>(() => visitValuesFrom(visit));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isNew = choice === NEW;
  const place = isNew ? undefined : places.find(p => String(p.id) === choice);
  const types = isNew ? newPlace.types : place?.types ?? [];
  const sectors = isNew
    ? newSectorOptions(newPlace.sectors.map(s => s.name))
    : (place?.sectors ?? []).map(s => ({ key: String(s.id), label: s.name }));

  const change = (patch: Partial<VisitValues>) => { setValues(v => ({ ...v, ...patch })); setDirty(true); };
  const changePlace = (patch: Partial<PlaceValues>) => { setNewPlace(v => ({ ...v, ...patch })); setDirty(true); };
  const close = () => {
    if (!dirty || confirm('Discard this visit? What you typed will be lost.')) onClose();
  };

  useEffect(() => {
    onCoordsChange(isNew ? parseCoordinates(newPlace.coords) : null);
  }, [isNew, newPlace.coords, onCoordsChange]);

  const pick = (field: CoordField) =>
    onPickOnMap(COORD_LABELS[field], at => changePlace({ [field]: formatCoords(at.lat, at.lng) }));

  // Places grouped by area for the picker; places without an area last.
  const groups = useMemo(() => {
    const byArea = new Map<string, Place[]>();
    for (const p of places) {
      const key = p.area?.name ?? '';
      byArea.set(key, [...(byArea.get(key) ?? []), p]);
    }
    return [...byArea.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  }, [places]);

  async function save() {
    setError(null);
    if (!choice) return setError('Choose where you went, or pick "New place".');
    const placeInput = isNew ? buildPlaceInput(newPlace, savedPlaceId) : null;
    if (typeof placeInput === 'string') return setError(`The new place: ${placeInput}`);
    const problem = visitProblem(values);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      let id = place?.id;
      if (placeInput) {
        id = await savePlace(placeInput);
        setSavedPlaceId(id);
      }
      const visitId = await saveVisitAt(id!, values, types, visit?.id);
      onSaved(id!, visitId);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={visit ? 'Edit visit' : 'Log a visit'}
      subtitle={visit && place ? <>At <b>{place.name}</b>.</> : 'Where you went, who with, and what you climbed or skied.'}
      onClose={close}
      hidden={hidden}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={close}>Cancel</button>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
          {isNew ? 'Save place and visit' : 'Save visit'}
        </button>
      </>}
    >
      <div className="visit-modal-body">
        {!visit && (
          <div className="field">
            <label htmlFor="visitPlace">Where</label>
            <select id="visitPlace" value={choice} onChange={e => { setChoice(e.target.value); setDirty(true); }}>
              <option value="" disabled>Choose a place…</option>
              <option value={NEW}>New place…</option>
              {groups.map(([area, list]) => (
                <optgroup key={area || 'none'} label={area || 'Not in an area'}>
                  {list.map(p => <option key={p.id} value={p.id}>{p.name} ({typesLabel(p.types)})</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
      </div>

      {isNew && (
        <div className="form-section nested">
          <h3 className="section-title">The new place</h3>
          <PlaceFields values={newPlace} onChange={changePlace} areas={areas} rocks={rocks} onPickOnMap={pick} />
        </div>
      )}

      {(place || isNew) && (
        <div className="visit-modal-body">
          {isNew && <h3 className="section-title">The visit</h3>}
          <VisitFields values={values} onChange={change} partners={partners} types={types} sectors={sectors} />
        </div>
      )}
      <div className="form-error-row"><ErrorText error={error} /></div>
    </Modal>
  );
}
