import { readTrackFile, summarize } from './tracks';

export type TrackPoint = [lat: number, lng: number];

export type Track = {
  /** One line per track segment / route. */
  lines: TrackPoint[][];
  distanceKm: number;
  /** Total ascent, ignoring elevation jitter under 3 m. */
  gainM: number | null;
  maxEleM: number | null;
};

/** Reads track segments (or routes) from a GPX document; null if it has no usable points. */
export function parseGpx(xml: string): Track | null {
  const file = readTrackFile(xml);
  const summary = file && summarize(file.segments);
  if (!file || !summary) return null;
  return {
    lines: file.segments.map(s => s.map((p): TrackPoint => [p.lat, p.lng])),
    distanceKm: summary.distanceKm, gainM: summary.gainM, maxEleM: summary.maxEleM,
  };
}
