import { useEffect, useMemo, useState } from 'react';
import { uploadPhoto } from '../lib/photos';
import { fetchRoutes, savePlace } from '../lib/api';
import { formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { ACTIVITIES, activityLabel, errorMessage } from '../lib/labels';
import type { Area, Partner, Place, Route, VisitDetail } from '../lib/types';
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
  userId: string;
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
export function VisitModal({ placeId, visit, places, areas, userId, rocks, partners, hidden, onPickOnMap, onCoordsChange, onClose, onSaved }: Props) {
  const [choice, setChoice] = useState<string>(visit ? String(visit.place_id) : placeId ? String(placeId) : '');
  const [newPlace, setNewPlace] = useState<PlaceValues>(() => placeValuesFrom());
  // Set once a new place is stored, so a retry after a failed visit save doesn't create it twice.
  const [savedPlaceId, setSavedPlaceId] = useState<number | undefined>();
  const [values, setValues] = useState<VisitValues>(
    () => visitValuesFrom(visit, places.find(p => p.id === (visit?.place_id ?? placeId))));
  const [routeList, setRouteList] = useState<{ placeId: number; routes: Route[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  // Set when the visit is saved but some photos failed: the form then only offers "Done".
  const [savedVisit, setSavedVisit] = useState<{ placeId: number; visitId: number } | null>(null);
  const previews = useMemo(() => photos.map(f => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  const isNew = choice === NEW;
  const place = isNew ? undefined : places.find(p => String(p.id) === choice);
  const activity = isNew ? newPlace.activity : place?.activity ?? 'crag';
  const routes = place && routeList?.placeId === place.id ? routeList.routes : [];

  // The chosen spot's shared route list, for suggestions and linking.
  useEffect(() => {
    if (!place || !ACTIVITIES[place.activity].sectors) return;
    let cancelled = false;
    fetchRoutes(place.id).then(r => { if (!cancelled) setRouteList({ placeId: place.id, routes: r }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [place]);

  // A new visit at a route-type spot starts with that route filled in.
  const choose = (next: string) => {
    setChoice(next);
    setDirty(true);
    const untouched = values.ascents.every(a => !a.name.trim() && !a.grade.trim() && !a.comment.trim());
    if (!visit && untouched) {
      const spot = places.find(p => String(p.id) === next);
      setValues(v => ({ ...v, ascents: visitValuesFrom(undefined, spot).ascents }));
    }
  };
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
    if (!choice) return setError('Choose where you went, or pick "New spot".');
    const placeInput = isNew ? buildPlaceInput(newPlace, savedPlaceId) : null;
    if (typeof placeInput === 'string') return setError(`The new spot: ${placeInput}`);
    const problem = visitProblem(values);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      let id = place?.id;
      if (placeInput) {
        id = await savePlace(placeInput);
        setSavedPlaceId(id);
      }
      const visitId = await saveVisitAt(id!, values, activity, visit?.id);
      const failed: string[] = [];
      for (const [i, f] of photos.entries()) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        try {
          await uploadPhoto({ visitId }, userId, f);
        } catch (e) {
          failed.push(errorMessage(e));
        }
      }
      setProgress(null);
      if (failed.length) {
        setSavedVisit({ placeId: id!, visitId });
        setError(`The visit is saved, but ${failed.length} photo(s) didn't upload: ${failed[0]} `
          + 'You can add them later from the visit.');
        setBusy(false);
        return;
      }
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
        {savedVisit ? (
          <button className="btn btn-primary" type="button" onClick={() => onSaved(savedVisit.placeId, savedVisit.visitId)}>Done</button>
        ) : (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
            {progress ?? (isNew ? 'Save spot and visit' : 'Save visit')}
          </button>
        )}
      </>}
    >
      <div className="visit-modal-body">
        {!visit && (
          <div className="field">
            <label htmlFor="visitPlace">Where</label>
            <select id="visitPlace" value={choice} onChange={e => choose(e.target.value)}>
              <option value="" disabled>Choose a spot…</option>
              <option value={NEW}>New spot…</option>
              {groups.map(([area, list]) => (
                <optgroup key={area || 'none'} label={area || 'Not in an area'}>
                  {list.map(p => <option key={p.id} value={p.id}>{p.name} ({activityLabel(p.activity)})</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
      </div>

      {isNew && (
        <div className="form-section nested">
          <h3 className="section-title">The new spot</h3>
          <PlaceFields values={newPlace} onChange={changePlace} areas={areas} rocks={rocks} onPickOnMap={pick} />
        </div>
      )}

      {(place || isNew) && (
        <div className="visit-modal-body">
          {isNew && <h3 className="section-title">The visit</h3>}
          <VisitFields values={values} onChange={change} partners={partners} activity={activity} sectors={sectors} routes={routes} />
          {!visit && (
            <div className="field">
              <span className="field-label">Photos <span className="hint">(optional, shrunk before upload)</span></span>
              {photos.length > 0 && (
                <ul className="photo-grid staged">
                  {photos.map((f, i) => (
                    <li key={previews[i]}>
                      <img src={previews[i]} alt={f.name} width={160} height={120} />
                      <button type="button" className="unstage" aria-label={`Remove ${f.name}`}
                              onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="btn btn-ghost add-photos">
                <input type="file" accept="image/*" multiple
                       onChange={e => {
                         // Copy before clearing the input: clearing empties its live FileList.
                         const picked = [...(e.target.files ?? [])];
                         e.target.value = '';
                         setPhotos(ps => [...ps, ...picked]);
                         setDirty(true);
                       }} />
                {photos.length ? 'Add more photos' : 'Add photos'}
              </label>
            </div>
          )}
        </div>
      )}
      <div className="form-error-row"><ErrorText error={error} /></div>
    </Modal>
  );
}
