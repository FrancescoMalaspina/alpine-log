import { useEffect, useMemo, useState } from 'react';
import { useLookup } from '../hooks/useLookup';
import { useConfirm } from '../hooks/useConfirm';
import { useI18n } from '../i18n';
import { uploadPhoto } from '../lib/photos';
import { acceptInvitation, addLink, completeWish, fetchRoutes, fetchSameDayVisits, publishTrack, requestToJoin, savePlace } from '../lib/api';
import { formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { ACTIVITIES, activityLabel, errorMessage } from '../lib/labels';
import type { Area, Invitation, Partner, Place, Route, Sector, VisitDetail, VisitSummary, Wish } from '../lib/types';
import { Combobox } from './forms/Combobox';
import { PlaceFields } from './forms/PlaceFields';
import { coordLabel, buildPlaceInput, guideUrlOf, placeValuesFrom, TRACK_ACTIVITIES, type CoordField, type PlaceValues, type TrackDraft } from './forms/placeForm';
import { saveTrackAt, saveVisitAt } from './forms/save';
import { TrackLoader } from './forms/TrackLoader';
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
  /** Values to start from: the people of the wish it was started from, or an invitation's day. */
  prefill?: Partial<VisitValues>;
  /** The invitation this visit accepts: it joins the inviter's day, at their spot and date. */
  invite?: Invitation;
  /** Your invitations: a new visit at the spot and on the day of one offers to join it. */
  invitations: Invitation[];
  hidden: boolean;
  onPickOnMap: PickOnMap;
  onCoordsChange: (at: LatLng | null) => void;
  onClose: () => void;
  onSaved: (placeId: number, wishResolved: boolean) => void;
};

const NEW = 'new';

/** Log a visit at an existing place, or at a new place created in the same save. */
export function VisitModal({
  placeId, visit, places, areas, sectors, userId, rocks, partners, openWishByPlace, prefill, invite, invitations, hidden, onPickOnMap, onCoordsChange, onClose, onSaved,
}: Props) {
  const { t } = useI18n();
  const s = t.spot.visitModal;
  const [choice, setChoice] = useState<string>(visit ? String(visit.place_id) : placeId ? String(placeId) : '');
  // What the spot field shows; a spot is chosen only by picking it from the list.
  const [query, setQuery] = useState(() => {
    const initial = places.find(p => String(p.id) === choice);
    return initial ? spotLabel(initial) : '';
  });
  const [newPlace, setNewPlace] = useState<PlaceValues>(() => placeValuesFrom());
  // Set once a new place is stored, so a retry after a failed visit save doesn't create it twice.
  const [savedPlaceId, setSavedPlaceId] = useState<number | undefined>();
  const [values, setValues] = useState<VisitValues>(() => ({
    ...visitValuesFrom(visit, places.find(p => p.id === (visit?.place_id ?? placeId))),
    ...prefill,
  }));
  const [tickOff, setTickOff] = useState(true);
  // A track loaded for a visit at an existing spot; a new spot keeps its own in newPlace.
  const [track, setTrack] = useState<TrackDraft | null>(null);
  const [routeList, setRouteList] = useState<{ placeId: number; routes: Route[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  // Captions typed under the photos, by photo (kept apart so typing doesn't redo the previews).
  const [captions, setCaptions] = useState<Map<File, string>>(new Map());
  const [progress, setProgress] = useState<string | null>(null);
  // Set when the visit is saved but some photos failed: the form then only offers "Done".
  const [savedVisit, setSavedVisit] = useState<{ placeId: number; wishResolved: boolean } | null>(null);
  const [ask, askDialog] = useConfirm();
  const previews = useMemo(() => photos.map(f => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  const isNew = choice === NEW;
  const place = isNew ? undefined : places.find(p => String(p.id) === choice);
  const activity = isNew ? newPlace.activity : place?.activity ?? 'crag';
  const routes = place && routeList?.placeId === place.id ? routeList.routes : [];
  const wish = !visit && place ? openWishByPlace.get(place.id) : undefined;

  // Others who logged the spot that day: you may have been together.
  const sameDay = useLookup(!visit && !invite && place && values.date ? `${place.id}|${values.date}` : null,
                            () => fetchSameDayVisits(place!.id, values.date, userId));
  const dayOptions = useMemo(() => sameDayOptions(sameDay ?? [], invitations.filter(i =>
    i.kind === 'invite' && i.place_id === place?.id && i.date === values.date)), [sameDay, invitations, place, values.date]);
  // Ticked or not, by option key; untouched, an option you were invited to is ticked.
  const [together, setTogether] = useState<Map<string, boolean>>(new Map());
  const isTogether = (o: DayOption) => together.get(o.key) ?? !!o.invitation;

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
    const picked = places.find(p => String(p.id) === next);
    setQuery(picked ? spotLabel(picked) : '');
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
    const fromTrack = patch.track && patch.track.file !== newPlace.track?.file && TRACK_ACTIVITIES.includes(patch.activity ?? newPlace.activity)
      ? visitFromTrack(patch.track) : null;
    if (fromTrack) setValues(v => ({ ...v, ...fromTrack }));
  };
  const changeTrack = (next: TrackDraft | null) => {
    setTrack(next);
    setDirty(true);
    const fromTrack = next && next.file !== track?.file && TRACK_ACTIVITIES.includes(activity) ? visitFromTrack(next) : null;
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

  // Spots for the picker, by area, then sector, then name; spots without an area last.
  const spotOptions = useMemo(() => {
    const key = (p: Place) => `${p.area ? 0 : 1}${p.area?.name ?? ''}\u0000${p.sector?.name ?? ''}\u0000${p.name}`;
    return [...places].sort((a, b) => key(a).localeCompare(key(b))).map(p => ({
      key: p.id,
      label: spotLabel(p),
      hint: `${activityLabel(p.activity)} · ${p.area?.name ?? s.noArea}`,
      also: p.area?.name,
    }));
  }, [places, s.noArea]);

  async function save() {
    setError(null);
    if (!choice) return setError(s.chooseWhere);
    const placeInput = isNew ? buildPlaceInput(newPlace, savedPlaceId) : null;
    if (typeof placeInput === 'string') return setError(s.newSpotProblem(placeInput));
    const problem = visitProblem(values);
    if (problem) return setError(problem);
    // A private visit's tracks become public with it, for good.
    const toPublish = values.visibility === 'public' ? visit?.tracks.filter(tr => tr.private) ?? [] : [];
    if (toPublish.length && !await ask({ title: s.publishTrackTitle, message: s.publishTrackMessage, confirmLabel: s.publishTrack })) return;

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
      const guideUrl = placeInput && guideUrlOf(newPlace);
      if (guideUrl) {
        try {
          await addLink({ placeId: id! }, '', guideUrl);
        } catch (e) {
          failed.push(t.spot.placeModal.savedButLinkFailed(errorMessage(e)));
        }
      }
      const spotTrack = placeInput ? newPlace.track : track;
      if (spotTrack?.save) {
        try {
          await saveTrackAt({ placeId: id! }, userId, spotTrack, spot.name, { id: visitId, visibility: values.visibility });
        } catch (e) {
          failed.push(t.spot.trackLoader.savedButTrackFailed(errorMessage(e)));
        }
      }
      for (const tr of toPublish) {
        try {
          await publishTrack(tr);
        } catch (e) {
          failed.push(s.publishTrackFailed(errorMessage(e)));
        }
      }
      const joins = invite ? [() => acceptInvitation(invite.id, visitId)]
        : dayOptions.filter(isTogether).map(o => o.invitation
          ? () => acceptInvitation(o.invitation!.id, visitId)
          : async () => { await requestToJoin(visitId, o.visitIds[0]); });
      for (const join of joins) {
        try {
          await join();
        } catch (e) {
          failed.push(s.joinFailed(errorMessage(e)));
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
          await uploadPhoto({ visitId }, userId, f, captions.get(f));
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
      subtitle={(visit || invite) && place ? s.atPlace(place.name) : s.subtitle}
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
        {!visit && !invite && (
          <div className="field">
            <label htmlFor="visitPlace">{s.where}</label>
            <Combobox id="visitPlace" value={query} placeholder={s.chooseSpot} options={spotOptions}
                      // Typing over a chosen spot unchooses it.
                      onChange={text => { if (choice) choose(''); setQuery(text); }}
                      onPick={o => choose(String(o.key))} />
            {!isNew && (
              <button type="button" className="btn-link new-spot-link" onClick={() => choose(NEW)}>{s.newSpotOption}</button>
            )}
          </div>
        )}
      </div>

      {isNew && (
        <div className="form-section nested">
          <h3 className="section-title">{s.newSpot}</h3>
          <PlaceFields values={newPlace} onChange={changePlace} areas={areas} sectors={sectors} rocks={rocks} onPickOnMap={pick}
                       visitVisibility={values.visibility}
                       existingSpotAction={{ label: t.spot.similar.useIt, onPick: id => choose(String(id)) }} />
        </div>
      )}

      {(place || isNew) && (
        <div className="visit-modal-body">
          {isNew && <h3 className="section-title">{s.theVisit}</h3>}
          {place && <TrackLoader activity={place.activity} draft={track} onDraft={changeTrack} visitVisibility={values.visibility} />}
          <VisitFields values={values} onChange={change} partners={partners} activity={activity}
                       walls={walls} spotName={place?.name ?? newPlace.name} routes={routes}
                       spotDetails={place
                         ? { grade: place.grade, pitches: place.pitches, aid: place.aid }
                         : topoOf(newPlace)}
                       dateLocked={!!invite}
                       dateNote={invite ? t.spot.visitFields.dateOfInvite(invite.from_username)
                         : visit?.outing_id ? t.spot.visitFields.dateShared : undefined}
                       sameDay={dayOptions.map(o => (
                         <label key={o.key} className="field-inline same-day">
                           <input type="checkbox" checked={isTogether(o)}
                                  onChange={e => { const on = e.target.checked; setTogether(m => new Map(m).set(o.key, on)); }} />
                           {o.invitation ? s.invitedSameDay(o.invitation.from_username) : s.sameDay(o.names.join(', '), o.names.length)}
                         </label>
                       ))} />
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
                      <input className="photo-caption-input" value={captions.get(f) ?? ''} maxLength={500}
                             placeholder={s.captionPlaceholder} aria-label={s.captionFor(f.name)}
                             onChange={e => { const text = e.target.value; setCaptions(m => new Map(m).set(f, text)); }} />
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
      {askDialog}
    </Modal>
  );
}

/** Someone else's day at the spot: one shared day, or one visit, and your invitation to it if any. */
type DayOption = { key: string; names: string[]; visitIds: number[]; invitation?: Invitation };

/**
 * The days others logged at a spot on a date (the visits you can see, a shared day
 * once), and the days you were invited to there, even when their visits are private.
 */
function sameDayOptions(visits: VisitSummary[], invitations: Invitation[]): DayOption[] {
  const days = new Map<string, DayOption>();
  for (const v of visits) {
    const key = v.outing_id ? `day-${v.outing_id}` : `visit-${v.id}`;
    const day = days.get(key) ?? { key, names: [], visitIds: [] };
    day.visitIds.push(v.id);
    if (v.username) day.names.push(v.username);
    days.set(key, day);
  }
  for (const i of invitations) {
    const day = [...days.values()].find(d => d.visitIds.includes(i.from_visit_id));
    if (day) day.invitation = i;
    else days.set(`invite-${i.id}`, { key: `invite-${i.id}`, names: [i.from_username], visitIds: [i.from_visit_id], invitation: i });
  }
  return [...days.values()];
}

/** How a spot reads in the picker: its sector, when it has one, before its name. */
function spotLabel(p: Place): string {
  return p.sector ? `${p.sector.name} › ${p.name}` : p.name;
}
