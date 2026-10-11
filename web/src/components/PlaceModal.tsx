import { useEffect, useState } from 'react';
import { deletePlace, savePlace } from '../lib/api';
import { formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { errorMessage } from '../lib/labels';
import type { Area, Partner, Place } from '../lib/types';
import { PlaceFields } from './forms/PlaceFields';
import { COORD_LABELS, buildPlaceInput, placeValuesFrom, type CoordField, type PlaceValues } from './forms/placeForm';
import { newSectorOptions, saveVisitAt } from './forms/save';
import { VisitFields } from './forms/VisitFields';
import { visitProblem, visitValuesFrom, type VisitValues } from './forms/visitForm';
import { ErrorText, Modal } from './Modal';

export type PickOnMap = (label: string, apply: (at: LatLng) => void) => void;

type Props = {
  /** The place to edit; omitted when adding a new one. */
  place?: Place;
  rocks: string[];
  areas: Area[];
  partners: Partner[];
  canDelete: boolean;
  hidden: boolean;
  onPickOnMap: PickOnMap;
  onCoordsChange: (at: LatLng | null) => void;
  onClose: () => void;
  onSaved: (placeId: number, loggedVisit: boolean) => void;
  onDeleted: () => void;
};

/** Add or edit a place; a new place can be saved together with a visit there. */
export function PlaceModal({ place, rocks, areas, partners, canDelete, hidden, onPickOnMap, onCoordsChange, onClose, onSaved, onDeleted }: Props) {
  const [values, setValues] = useState<PlaceValues>(() => placeValuesFrom(place));
  const [logVisit, setLogVisit] = useState(false);
  const [visit, setVisit] = useState<VisitValues>(() => visitValuesFrom());
  // Set once a new place is stored, so a retry after a failed visit save doesn't create it twice.
  const [savedId, setSavedId] = useState<number | undefined>(place?.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const change = (patch: Partial<PlaceValues>) => { setValues(v => ({ ...v, ...patch })); setDirty(true); };
  const changeVisit = (patch: Partial<VisitValues>) => { setVisit(v => ({ ...v, ...patch })); setDirty(true); };
  const close = () => {
    if (!dirty || confirm('Discard what you typed?')) onClose();
  };

  useEffect(() => {
    onCoordsChange(parseCoordinates(values.coords));
  }, [values.coords, onCoordsChange]);

  const pick = (field: CoordField) =>
    onPickOnMap(COORD_LABELS[field], at => change({ [field]: formatCoords(at.lat, at.lng) }));

  async function save() {
    setError(null);
    const input = buildPlaceInput(values, savedId);
    if (typeof input === 'string') return setError(input);
    const problem = logVisit ? visitProblem(visit) : null;
    if (problem) return setError(`The visit: ${problem}`);

    setBusy(true);
    let id = savedId;
    try {
      id = await savePlace(input);
      setSavedId(id);
      if (logVisit) await saveVisitAt(id, visit, values.types);
      onSaved(id, logVisit);
    } catch (e) {
      setError(id && logVisit && !place ? `The place is saved, but the visit isn't: ${errorMessage(e)}` : errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!place) return;
    const msg = place.visit_count
      ? `Delete "${place.name}" and all ${place.visit_count} visit(s) logged there? This can't be undone.`
      : `Delete "${place.name}"? This can't be undone.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await deletePlace(place.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={place ? 'Edit place' : 'Add a place'}
      subtitle={place
        ? 'Places are shared: everyone sees them, only you (and admins) can change this one.'
        : 'A crag or a single route. Everyone sees places; your visits stay private unless you make them public.'}
      onClose={close}
      hidden={hidden}
      footer={<>
        {place && canDelete && <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>Delete</button>}
        <button className="btn btn-ghost" type="button" onClick={close}>Cancel</button>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
          {place ? 'Save changes' : logVisit ? 'Save place and visit' : 'Save place'}
        </button>
      </>}
    >
      <form onSubmit={e => { e.preventDefault(); save(); }}>
        <PlaceFields values={values} onChange={change} areas={areas} rocks={rocks} onPickOnMap={pick}
                     originalSectors={place?.sectors} autoFocusName />

        {!place && (
          <div className="form-section">
            <label className="switch">
              <input type="checkbox" checked={logVisit} onChange={e => setLogVisit(e.target.checked)} />
              Log a visit here too
            </label>
            {logVisit && (
              <VisitFields values={visit} onChange={changeVisit} partners={partners} types={values.types}
                           sectors={newSectorOptions(values.sectors.map(s => s.name))} />
            )}
          </div>
        )}
        {place && <p className="form-note">Guide links, PDFs and the approach GPX are added from the place's Details panel.</p>}
        <div className="form-error-row"><ErrorText error={error} /></div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
