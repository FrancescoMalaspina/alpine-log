import type { TrackFile } from './tracks';

export type TrackPoint = [lat: number, lng: number];

/** A track as the map draws it: one line per track segment / route. Its numbers are stored with the attachment. */
export type Track = { lines: TrackPoint[][] };

export const trackLines = (file: TrackFile): Track => ({ lines: file.segments.map(s => s.map((p): TrackPoint => [p.lat, p.lng])) });

/** Line colours for a spot's tracks, in order: CAI trail red first, then colours that stand out on both base maps. */
export const TRACK_COLORS = ['#D7261E', '#1F5FBF', '#E07B00', '#7A3FB0', '#00897B', '#C2185B'];

/** A spot's track as drawn on the map: its attachment id, colour, and whether it's switched on. */
export type TrackLayer = { id: number; track: Track; color: string; shown: boolean };
