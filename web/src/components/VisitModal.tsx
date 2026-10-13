import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { uploadPhoto } from '../lib/photos';
import { completeWish, fetchRoutes, savePlace } from '../lib/api';
import { formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { ACTIVITIES, activityLabel, errorMessage } from '../lib/labels';
import type { Area, Partner, Place, Route, Sector, VisitDetail, Wish } from '../lib/types';
import { PlaceFields } from './forms/PlaceFields';
import { coordLabel, buildPlaceInput, placeValuesFrom, TRACK_ACTIVITIES, type CoordField, type PlaceValues } from './forms/placeForm';
import { saveTrackAt, saveVisitAt } from './forms/save';
import { VisitFields } from './forms/VisitFields';
import { topoOf, visitFromTrack, visitProblem, visitValuesFrom, type VisitValues } from './forms/visitForm';
import { ErrorText, Modal } from './Modal';
import type { PickOnMap } from './PlaceModal';

type Props = {
  /** Place to preselect (e.g. "Add visit" from a place); omitted from the header button. */
  placeId?: number;
  /** The visit to edit; its place can't be changed. */
  visit?: VisitDetail;
  places: Place[];
  areas: Area[];
  sectors: Sector[];
  userId: string;
  rocks: string[];
  partners: Partner[];
  /** Your open wishes: a new visit at one of these places can tick it off. */
  openWishByPlace: Map<number, Wish>;
  /** People to preselect, e.g. from the wish the visit was started from. */
  initialWithPeople?: string[];
  hidden: boolean;
  onPickOnMap: PickOnMap;
  onCoordsChange: (at: LatLng | null) => void;
  onClose: () => void;
  onSaved: (placeId: number, wishResolved: boolean) => void;
};

const NEW = 'new';

/** Log a visit at an existing place, or at a new place created in the same save. */
export function VisitModal({
  placeId, visit, places, areas, sectors, userId, rocks, partners, openWishByPlace, initialWithPeople, hidden, onPickOnMap, onCoordsChange, onClose, onSaved,
}: Props) {
  const { t } = useI18n();
  const s = t.spot.visitModal;
  const [choice, setChoice] = useState<string>(visit ? String(visit.place_id) : placeId ? String(placeId) : '');
  const [newPlace, setNewPlace] = useState<PlaceValues>(() => placeValuesFrom());
  // Set once a new place is stored, so a retry after a failed visit save doesn't create it twice.
  const [savedPlaceId, setSavedPlaceId] = useState<number | undefined>();
  const [values, setValues] = useState<VisitValues>(() => {
    const v = visitValuesFrom(visit, places.find(p => p.id === (visit?.place_id ?? placeId)));
    return initialWithPeople?.length ? { ...v, withPeople: initialWithPeople } : v;
  });
  const [tickOff, setTickOff] = useState(true);
  const [routeList, setRouteList] = useState<{ placeId: number; routes: Route[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  // Set when the visit is saved but some photos failed: the form then only offers "Done".
  const [savedVisit, setSavedVisit] = useState<{ placeId: number; wishResolved: boolean } | null>(null);
  const previews = useMemo(() => photos.map(f => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  const isNew = choice === NEW;
  const place = isNew ? undefined : places.find(p => String(p.id) === choice);
  const activity = isNew ? newPlace.activity : place?.activity ?? 'crag';
  const routes = place && routeList?.placeId === place.id ? routeList.routes : [];
  const wish = !visit && place ? openWishByPlace.get(place.id) : undefined;

  // The chosen spot's shared route list, for suggestions and linking.
  useEffect(() => {
    if (!place || !ACTIVITIES[place.activity].routeList) return;
    let cancelled = false;
    fetchRoutes(place.id).then(r => { if (!cancelled) setRouteList({ placeId: place.id, routes: r }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [place]);

  // Picking another spot for a new visit resets the untouched route rows to that spot's.
  const choose = (next: string) => {
    setChoice(next);
    setDirty(true);
    const untouched = values.ascents.every(a => !a.name.trim() && !a.grade.trim() && !a.comment.trim());
    if (!visit && untouched) {
      const spot = places.find(p => String(p.id) === next);
      setValues(v => ({ ...v, ascents: visitValuesFrom(undefined, spot).ascents }));
    }
  };
  // The other spots of the chosen spot's sector: routes can be logged on them too.
  const walls = place?.sector_id
    ? places.filter(p => p.sector_id === place.sector_id && p.id !== place.id).map(p => ({ id: p.id, name: p.name }))
    : [];

  const change = (patch: Partial<VisitValues>) => { setValues(v => ({ ...v, ...patch })); setDirty(true); };
  const changePlace = (patch: Partial<PlaceValues>) => {
    setNewPlace(v => ({ ...v, ...patch }));
    setDirty(true);
    // The visit takes the date and duration of a newly loaded track.
    const fromTrack = patch.track && patch.track.file !== newPlace.track?.file ? visitFromTrack(patch.track) : null;
    if (fromTrack) setValues(v => ({ ...v, ...fromTrack }));
  };
  const close = () => {
    if (!dirty || confirm(s.confirmDiscard)) onClose();
  };

  useEffect(() => {
    onCoordsChange(isNew ? parseCoordinates(newPlace.coords) : null);
  }, [isNew, newPlace.coords, onCoordsChange]);

  const pick = (field: CoordField) =>
    onPickOnMap(coordLabel(field), at => changePlace({ [field]: formatCoords(at.lat, at.lng) }));

  // Places grouped by area for the picker, by sector within it; places without an area last.
  const groups = useMemo(() => {
    const byArea = new Map<string, Place[]>();
    const label = (p: Place) => `${p.sector?.name ?? ''}\u0000${p.name}`;
    for (const p of [...places].sort((a, b) => label(a).localeCompare(label(b)))) {
      const key = p.area?.name ?? '';
      byArea.set(key, [...(byArea.get(key) ?? []), p]);
    }
    return [...byArea.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  }, [places]);

  async function save() {
    setError(null);
    if (!choice) return setError(s.chooseWhere);
    const placeInput = isNew ? buildPlaceInput(newPlace, savedPlaceId) : null;
    if (typeof placeInput === 'string') return setError(s.newSpotProblem(placeInput));
    const problem = visitProblem(values);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      let id = place?.id;
      if (placeInput) {
        id = await savePlace(placeInput);
        setSavedPlaceId(id);
      }
      const spot = placeInput
        ? { id: id!, name: placeInput.name, grade: placeInput.grade || null, activity: placeInput.activity }
        : { id: id!, name: place!.name, grade: place!.grade, activity: place!.activity };
      const visitId = await saveVisitAt(spot, values, visit?.id);
      const failed: string[] = [];
      if (placeInput && newPlace.track?.save && TRACK_ACTIVITIES.includes(placeInput.activity)) {
        try {
          await saveTrackAt(id!, userId, newPlace.track, placeInput.name);
        } catch (e) {
          failed.push(t.spot.trackLoader.savedButTrackFailed(errorMessage(e)));
        }
      }
      let wishResolved = false;
      if (wish && tickOff) {
        try {
          await completeWish(wish.id, visitId);
          wishResolved = true;
        } catch (e) {
          failed.push(s.wishTickFailed(errorMessage(e)));
        }
      }
      for (const [i, f] of photos.entries()) {
        setProgress(s.uploadingPhoto(i + 1, photos.length));
        try {
          await uploadPhoto({ visitId }, userId, f);
        } catch (e) {
          failed.push(errorMessage(e));
        }
      }
      setProgress(null);
      if (failed.length) {
        setSavedVisit({ placeId: id!, wishResolved });
        setError(s.savedWithProblems(failed.length, failed[0]));
        setBusy(false);
        return;
      }
      onSaved(id!, wishResolved);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={visit ? s.editTitle : s.logTitle}
      subtitle={visit && place ? s.atPlace(place.name) : s.subtitle}
      onClose={close}
      hidden={hidden}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={close}>{t.common.cancel}</button>
        {savedVisit ? (
          <button className="btn btn-primary" type="button" onClick={() => onSaved(savedVisit.placeId, savedVisit.wishResolved)}>{t.common.done}</button>
        ) : (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
            {progress ?? (isNew ? s.saveSpotAndVisit : s.saveVisit)}
          </button>
        )}
      </>}
    >
      <div className="visit-modal-body">
        {!visit && (
          <div className="field">
            <label htmlFor="visitPlace">{s.where}</label>
            <select id="visitPlace" value={choice} onChange={e => choose(e.target.value)}>
              <option value="" disabled>{s.chooseSpot}</option>
              <option value={NEW}>{s.newSpotOption}</option>
              {groups.map(([area, list]) => (
                <optgroup key={area || 'none'} label={area || s.noArea}>
                  {list.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.sector ? `${p.sector.name} › ` : ''}{p.name} ({activityLabel(p.activity)})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
      </div>

      {isNew && (
        <div className="form-section nested">
          <h3 className="section-title">{s.newSpot}</h3>
          <PlaceFields values={newPlace} onChange={changePlace} areas={areas} sectors={sectors} rocks={rocks} onPickOnMap={pick} withVisit />
        </div>
      )}

      {(place || isNew) && (
        <div className="visit-modal-body">
          {isNew && <h3 className="section-title">{s.theVisit}</h3>}
          <VisitFields values={values} onChange={change} partners={partners} activity={activity}
                       walls={walls} spotName={place?.name ?? newPlace.name} routes={routes}
                       spotDetails={place
                         ? { grade: place.grade, pitches: place.pitches, aid: place.aid }
                         : topoOf(newPlace)} />
          {wish && (
            <label className="field-inline wish-tick">
              <input type="checkbox" checked={tickOff} onChange={e => setTickOff(e.target.checked)} />
              {s.tickOff}
            </label>
          )}
          {!visit && (
            <div className="field">
              <span className="field-label">{s.photos} <span className="hint">{s.photosHint}</span></span>
              {photos.length > 0 && (
                <ul className="photo-grid staged">
                  {photos.map((f, i) => (
                    <li key={previews[i]}>
                      <img src={previews[i]} alt={f.name} width={160} height={120} />
                      <button type="button" className="unstage" aria-label={s.removePhoto(f.name)}
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
                {photos.length ? s.addMorePhotos : s.addPhotos}
              </label>
            </div>
          )}
        </div>
      )}
      <div className="form-error-row"><ErrorText error={error} /></div>
    </Modal>
  );
}
