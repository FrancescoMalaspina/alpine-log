import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { addLink, deletePlace, fetchMyPlaceSuggestion, savePlace, suggestPlaceChanges } from '../lib/api';
import { formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/labels';
import type { Area, Partner, Place, Sector } from '../lib/types';
import { PlaceFields } from './forms/PlaceFields';
import { coordLabel, buildPlaceInput, guideUrlOf, placeValuesFrom, placeWithChanges, TRACK_ACTIVITIES, type CoordField, type PlaceValues } from './forms/placeForm';
import { saveTrackAt, saveVisitAt } from './forms/save';
import { VisitFields } from './forms/VisitFields';
import { topoOf, visitFromTrack, visitProblem, visitValuesFrom, type VisitValues } from './forms/visitForm';
import { ErrorText, Modal } from './Modal';

export type PickOnMap = (label: string, apply: (at: LatLng) => void) => void;

type Props = {
  /** The place to edit; omitted when adding a new one. */
  place?: Place;
  /** Where a new place starts, e.g. a location found with the search bar. */
  initialAt?: LatLng;
  rocks: string[];
  areas: Area[];
  sectors: Sector[];
  partners: Partner[];
  canDelete: boolean;
  /** Editing someone else's spot: the changes go to the admins as a suggestion. */
  suggest: boolean;
  hidden: boolean;
  onPickOnMap: PickOnMap;
  onCoordsChange: (at: LatLng | null) => void;
  onClose: () => void;
  onSaved: (placeId: number, loggedVisit: boolean, suggested?: boolean) => void;
  onDeleted: () => void;
  /** Admins, editing: merge this spot into another. */
  onMerge?: () => void;
  /** Opens an existing spot the user picked instead of adding this one. */
  onOpenExisting: (placeId: number) => void;
};

/**
 * Add or edit a place; a new place can be saved together with a visit there.
 * Someone else's spot is "edited" as a suggestion, starting from the user's pending one.
 */
export function PlaceModal({ place, initialAt, rocks, areas, sectors, partners, canDelete, suggest, hidden, onPickOnMap, onCoordsChange, onClose, onSaved, onDeleted, onMerge, onOpenExisting }: Props) {
  const { t } = useI18n();
  const s = t.spot.placeModal;
  const [values, setValues] = useState<PlaceValues>(() => ({
    ...placeValuesFrom(place),
    ...(initialAt && !place ? { coords: formatCoords(initialAt.lat, initialAt.lng) } : {}),
  }));
  const [note, setNote] = useState('');
  // A suggestion starts from the user's pending one, so the form waits for it.
  const [ready, setReady] = useState(!suggest);
  const [logVisit, setLogVisit] = useState(false);
  const [visit, setVisit] = useState<VisitValues>(() => visitValuesFrom());
  // Set once a new place is stored, so a retry after a failed visit save doesn't create it twice.
  const [savedId, setSavedId] = useState<number | undefined>(place?.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const userId = useAuth().session?.user.id;

  useEffect(() => {
    if (!suggest || !place || !userId) return;
    let cancelled = false;
    fetchMyPlaceSuggestion(place.id, userId)
      .then(pending => {
        if (cancelled || pending?.status !== 'pending') return;
        setValues(placeValuesFrom(placeWithChanges(place, pending.changes)));
        setNote(pending.note ?? '');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [suggest, place, userId]);
  // Set once the track is uploaded, so a retry doesn't upload it twice.
  const [trackSaved, setTrackSaved] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);
  // Set when the spot is saved but its track failed to upload: the form then only offers "Done".
  const [done, setDone] = useState<number | null>(null);

  const change = (patch: Partial<PlaceValues>) => {
    setValues(v => ({ ...v, ...patch }));
    setDirty(true);
    // A visit logged with the spot takes the date and duration of a newly loaded track.
    const fromTrack = patch.track && patch.track.file !== values.track?.file && TRACK_ACTIVITIES.includes(patch.activity ?? values.activity)
      ? visitFromTrack(patch.track) : null;
    if (fromTrack) setVisit(v => ({ ...v, ...fromTrack }));
  };
  const changeVisit = (patch: Partial<VisitValues>) => { setVisit(v => ({ ...v, ...patch })); setDirty(true); };
  const close = () => {
    if (!dirty || confirm(s.confirmDiscard)) onClose();
  };

  useEffect(() => {
    onCoordsChange(parseCoordinates(values.coords));
  }, [values.coords, onCoordsChange]);

  const pick = (field: CoordField) =>
    onPickOnMap(coordLabel(field), at => change({ [field]: formatCoords(at.lat, at.lng) }));

  async function save() {
    setError(null);
    const input = buildPlaceInput(values, savedId);
    if (typeof input === 'string') return setError(input);
    const problem = logVisit ? visitProblem(visit) : null;
    if (problem) return setError(s.visitProblem(problem));
    // Links and tracks are added straight away; only the spot's own fields wait for an admin.
    const fieldsChanged = !suggest || JSON.stringify(input) !== JSON.stringify(buildPlaceInput(placeValuesFrom(place), savedId));
    if (!fieldsChanged && !guideUrlOf(values) && !values.track?.save) return setError(s.nothingChanged);

    setBusy(true);
    let id = savedId;
    try {
      if (suggest && place) {
        if (fieldsChanged) await suggestPlaceChanges(input, note);
        id = place.id;
      } else {
        id = await savePlace(input);
      }
      setSavedId(id);
      const visitId = logVisit
        ? await saveVisitAt({ id, name: input.name, grade: input.grade || null, activity: input.activity }, visit)
        : undefined;
      const guideUrl = guideUrlOf(values);
      if (guideUrl && !linkSaved) {
        try {
          await addLink({ placeId: id }, '', guideUrl);
          setLinkSaved(true);
        } catch (e) {
          setError(s.savedButLinkFailed(errorMessage(e)));
          setDone(id);
          setBusy(false);
          return;
        }
      }
      if (values.track?.save && !trackSaved && userId) {
        try {
          await saveTrackAt({ placeId: id }, userId, values.track, input.name,
                            visitId != null ? { id: visitId, visibility: visit.visibility } : undefined);
          setTrackSaved(true);
        } catch (e) {
          setError(t.spot.trackLoader.savedButTrackFailed(errorMessage(e)));
          setDone(id);
          setBusy(false);
          return;
        }
      }
      onSaved(id, logVisit, suggest && fieldsChanged);
    } catch (e) {
      setError(id && logVisit && !place ? s.savedButVisitFailed(errorMessage(e)) : errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!place) return;
    const msg = place.visit_count
      ? s.confirmDeleteWithVisits(place.name, place.visit_count) + (onMerge ? ` ${s.orMerge}` : '')
      : s.confirmDelete(place.name);
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
      title={suggest ? s.suggestTitle : place ? s.editTitle : s.addTitle}
      subtitle={suggest ? s.suggestSubtitle : place ? s.editSubtitle : s.addSubtitle}
      onClose={close}
      hidden={hidden}
      footer={<>
        {place && canDelete && <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>{t.common.delete}</button>}
        {place && onMerge && <button className="btn btn-ghost" type="button" disabled={busy} onClick={onMerge}>{t.spot.merge.mergeEllipsis}</button>}
        <button className="btn btn-ghost" type="button" onClick={close}>{t.common.cancel}</button>
        {done != null ? (
          <button className="btn btn-primary" type="button" onClick={() => onSaved(done, logVisit)}>{t.common.done}</button>
        ) : (
          <button className="btn btn-primary" type="button" disabled={busy || !ready} onClick={save}>
            {suggest ? s.sendSuggestion : place ? s.saveChanges : logVisit ? s.saveSpotAndVisit : s.saveSpot}
          </button>
        )}
      </>}
    >
      {ready && <form onSubmit={e => { e.preventDefault(); save(); }}>
        <PlaceFields values={values} onChange={change} areas={areas} sectors={sectors} rocks={rocks} onPickOnMap={pick}
                     autoFocusName visitVisibility={logVisit ? visit.visibility : undefined}
                     existingSpotAction={place ? undefined : { label: t.spot.similar.open, onPick: onOpenExisting }} />

        {!place && (
          <div className="form-section">
            <label className="switch">
              <input type="checkbox" checked={logVisit} onChange={e => setLogVisit(e.target.checked)} />
              {s.logVisitToo}
            </label>
            {logVisit && (
              <VisitFields values={visit} onChange={changeVisit} partners={partners} activity={values.activity}
                           walls={[]} spotName={values.name} spotDetails={topoOf(values)} />
            )}
          </div>
        )}
        {suggest && (
          <div className="form-section">
            <div className="field full">
              <label htmlFor="suggestionNote">{s.suggestionNote} <span className="hint">{t.spot.placeFields.optional}</span></label>
              <textarea id="suggestionNote" value={note} maxLength={2000} placeholder={s.suggestionNotePlaceholder}
                        onChange={e => { setNote(e.target.value); setDirty(true); }} />
            </div>
          </div>
        )}
        {place && <p className="form-note">{s.editNote}</p>}
        <div className="form-error-row"><ErrorText error={error} /></div>
        <button type="submit" hidden />
      </form>}
    </Modal>
  );
}
