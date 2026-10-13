import { saveVisit, uploadAttachment } from '../../lib/api';
import { toGpx, trimTrack, usefulTrackName } from '../../lib/tracks';
import type { TrackDraft } from './placeForm';
import { buildVisitInput, type VisitSpot, type VisitValues } from './visitForm';

/** Saves a visit at a spot. */
export const saveVisitAt = (spot: VisitSpot, values: VisitValues, visitId?: number) =>
  saveVisit(buildVisitInput(values, spot, visitId));

/** Saves a loaded track on a spot as a GPX approach track, trimmed, without times. */
export async function saveTrackAt(placeId: number, userId: string, draft: TrackDraft, spotName: string) {
  const gpx = toGpx(usefulTrackName(draft.file.name) ?? spotName, trimTrack(draft.file.segments, draft.trimStartM, draft.trimEndM));
  const base = draft.fileName.replace(/\.[^.]+$/, '') || spotName;
  await uploadAttachment({ placeId }, userId, new File([gpx], `${base}.gpx`, { type: 'application/gpx+xml' }), base);
}
