import { useEffect, useState } from 'react';
import { deletePlace, savePlace } from '../lib/api';
import { formatCoords, parseCoordinates, type LatLng } from '../lib/coords';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/labels';
import type { Area, Partner, Place } from '../lib/types';
import { PlaceFields } from './forms/PlaceFields';
import { coordLabel, buildPlaceInput, placeValuesFrom, type CoordField, type PlaceValues } from './forms/placeForm';
import { newSectorOptions, saveVisitAt } from './forms/save';
import { VisitFields } from './forms/VisitFields';
import { visitProblem, visitValuesFrom, type VisitValues } from './forms/visitForm';
import { ErrorText, Modal } from './Modal';

export type PickOnMap = (label: string, apply: (at: LatLng) => void) => void;

type Props = {
  /** The place to edit; omitted when adding a new one. */
  place?: Place;
  /** Where a new place starts, e.g. a location found with the search bar. */
  initialAt?: LatLng;
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
export function PlaceModal({ place, initialAt, rocks, areas, partners, canDelete, hidden, onPickOnMap, onCoordsChange, onClose, onSaved, onDeleted }: Props) {
  const { t } = useI18n();
  const s = t.spot.placeModal;
  const [values, setValues] = useState<PlaceValues>(() => ({
    ...placeValuesFrom(place),
    ...(initialAt && !place ? { coords: formatCoords(initialAt.lat, initialAt.lng) } : {}),
  }));
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

    setBusy(true);
    let id = savedId;
    try {
      id = await savePlace(input);
      setSavedId(id);
      if (logVisit) {
        await saveVisitAt({ id, name: input.name, grade: input.grade || null, activity: input.activity }, visit);
      }
      onSaved(id, logVisit);
    } catch (e) {
      setError(id && logVisit && !place ? s.savedButVisitFailed(errorMessage(e)) : errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!place) return;
    const msg = place.visit_count
      ? s.confirmDeleteWithVisits(place.name, place.visit_count)
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
      title={place ? s.editTitle : s.addTitle}
      subtitle={place
        ? s.editSubtitle
        : s.addSubtitle}
      onClose={close}
      hidden={hidden}
      footer={<>
        {place && canDelete && <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>{t.common.delete}</button>}
        <button className="btn btn-ghost" type="button" onClick={close}>{t.common.cancel}</button>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
          {place ? s.saveChanges : logVisit ? s.saveSpotAndVisit : s.saveSpot}
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
              {s.logVisitToo}
            </label>
            {logVisit && (
              <VisitFields values={visit} onChange={changeVisit} partners={partners} activity={values.activity}
                           sectors={newSectorOptions(values.sectors.map(s => s.name))} />
            )}
          </div>
        )}
        {place && <p className="form-note">{s.editNote}</p>}
        <div className="form-error-row"><ErrorText error={error} /></div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
