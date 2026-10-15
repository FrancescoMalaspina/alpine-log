import { saveVisit, uploadAttachment, type AttachmentOwner } from '../../lib/api';
import { toGpx, trackStats, trimTrack, usefulTrackName } from '../../lib/tracks';
import type { Visibility } from '../../lib/types';
import type { TrackDraft } from './placeForm';
import { buildVisitInput, type VisitSpot, type VisitValues } from './visitForm';

/** Saves a visit at a spot. */
export const saveVisitAt = (spot: VisitSpot, values: VisitValues, visitId?: number) =>
  saveVisit(buildVisitInput(values, spot, visitId));

/** The visit a track was logged with: the track stays private while the visit is. */
export type TrackVisit = { id: number; visibility: Visibility };

/**
 * Saves a loaded track as a GPX on a spot or area, trimmed and without times.
 * Its statistics are computed first, while the recording still has its times.
 */
export async function saveTrackAt(owner: AttachmentOwner, userId: string, draft: TrackDraft, fallbackName: string, visit?: TrackVisit) {
  const segments = trimTrack(draft.file.segments, draft.trimStartM, draft.trimEndM);
  const gpx = toGpx(usefulTrackName(draft.file.name) ?? fallbackName, segments);
  const base = draft.fileName.replace(/\.[^.]+$/, '') || fallbackName;
  await uploadAttachment(owner, userId, new File([gpx], `${base}.gpx`, { type: 'application/gpx+xml' }), base, {
    stats: trackStats(segments), visitId: visit?.id, isPrivate: visit?.visibility === 'private',
  });
}
