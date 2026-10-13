/*
 * Tracks exported by other apps (Strava, Garmin Connect, OruxMaps, Komoot,
 * Wikiloc…): GPX, TCX and KML are read into the same shape, summed up, trimmed
 * and written back out as GPX, the format spots keep their tracks in.
 */

export type TrackPoint3 = { lat: number; lng: number; ele: number | null; time: number | null };
export type TrackFile = { name: string | null; segments: TrackPoint3[][] };

/** File types the track loader accepts. */
export const TRACK_ACCEPT = '.gpx,.tcx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml';

const R = 6371;
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const num = (s: string | null | undefined) => {
  const n = parseFloat(s ?? '');
  return Number.isFinite(n) ? n : null;
};
const time = (s: string | null | undefined) => {
  const t = s ? Date.parse(s.trim()) : NaN;
  return Number.isFinite(t) ? t : null;
};
const point = (lat: number | null, lng: number | null, ele: number | null, t: number | null): TrackPoint3 | null =>
  lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat, lng, ele, time: t } : null;
const byTag = (el: Element | Document, tag: string) => [...el.getElementsByTagNameNS('*', tag)];
const childText = (el: Element, tag: string) => byTag(el, tag)[0]?.textContent ?? null;
/** The text of the first direct child named `tag` of any element named `parent`. */
function nameUnder(doc: Document, parents: string[]) {
  for (const parent of parents) {
    for (const el of byTag(doc, parent)) {
      const name = [...el.children].find(c => c.localName === 'name' || c.localName === 'Name')?.textContent?.trim();
      if (name) return name;
    }
  }
  return null;
}
const keep = (segments: (TrackPoint3 | null)[][]) =>
  segments.map(s => s.filter((p): p is TrackPoint3 => !!p)).filter(s => s.length > 1);

function readGpx(doc: Document): TrackFile {
  const groups = [...byTag(doc, 'trkseg'), ...byTag(doc, 'rte')];
  const segments = groups.map(g => [...byTag(g, 'trkpt'), ...byTag(g, 'rtept')].map(pt =>
    point(num(pt.getAttribute('lat')), num(pt.getAttribute('lon')), num(childText(pt, 'ele')), time(childText(pt, 'time')))));
  return { name: nameUnder(doc, ['metadata', 'trk', 'rte']), segments: keep(segments) };
}

/** Garmin's Training Center format (Garmin Connect, Strava's "original" exports). */
function readTcx(doc: Document): TrackFile {
  const segments = byTag(doc, 'Track').map(tr => byTag(tr, 'Trackpoint').map(pt =>
    point(num(childText(pt, 'LatitudeDegrees')), num(childText(pt, 'LongitudeDegrees')),
          num(childText(pt, 'AltitudeMeters')), time(childText(pt, 'Time')))));
  return { name: nameUnder(doc, ['Course']) ?? byTag(doc, 'Notes')[0]?.textContent?.trim() ?? null, segments: keep(segments) };
}

/** KML lines (OruxMaps, Google Earth) and gx:Track (timed points). */
function readKml(doc: Document): TrackFile {
  const lines = byTag(doc, 'LineString').map(ls => (childText(ls, 'coordinates') ?? '').trim().split(/\s+/).map(c => {
    const [lng, lat, ele] = c.split(',').map(x => num(x));
    return point(lat ?? null, lng ?? null, ele ?? null, null);
  }));
  const timed = byTag(doc, 'Track').map(tr => {
    const whens = byTag(tr, 'when').map(w => time(w.textContent));
    return byTag(tr, 'coord').map((c, i) => {
      const [lng, lat, ele] = (c.textContent ?? '').trim().split(/\s+/).map(x => num(x));
      return point(lat ?? null, lng ?? null, ele ?? null, whens[i] ?? null);
    });
  });
  return { name: nameUnder(doc, ['Document', 'Folder', 'Placemark']), segments: keep([...timed, ...lines]) };
}

/** Reads a GPX, TCX or KML file; null when it isn't one or has no line of points. */
export function readTrackFile(text: string): TrackFile | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const root = doc.documentElement.localName;
  const file = root === 'gpx' ? readGpx(doc)
    : root === 'TrainingCenterDatabase' ? readTcx(doc)
    : root === 'kml' ? readKml(doc)
    : null;
  return file?.segments.length ? file : null;
}

export type TrackSummary = {
  distanceKm: number;
  /** Total ascent, ignoring elevation jitter under 3 m. */
  gainM: number | null;
  maxEleM: number | null;
  start: TrackPoint3;
  end: TrackPoint3;
  /** The highest point, when the track has elevations. */
  highest: TrackPoint3 | null;
  /** First and last timestamp (ms), when the track has times. */
  startTime: number | null;
  endTime: number | null;
};

export function summarize(segments: TrackPoint3[][]): TrackSummary | null {
  const points = segments.flat();
  if (points.length < 2) return null;
  let distanceKm = 0;
  for (const s of segments) for (let i = 1; i < s.length; i++) distanceKm += haversineKm(s[i - 1], s[i]);

  const withEle = points.filter(p => p.ele != null);
  let gainM: number | null = null;
  let highest: TrackPoint3 | null = null;
  if (withEle.length > 1) {
    gainM = 0;
    let base = withEle[0].ele!;
    for (const p of withEle) {
      const e = p.ele!;
      if (e - base >= 3) { gainM += e - base; base = e; } else if (e < base) base = e;
      if (!highest || e > highest.ele!) highest = p;
    }
  }
  const times = points.map(p => p.time).filter((t): t is number => t != null);
  return {
    distanceKm, gainM, maxEleM: highest?.ele ?? null, highest,
    start: points[0], end: points[points.length - 1],
    startTime: times.length ? Math.min(...times) : null,
    endTime: times.length ? Math.max(...times) : null,
  };
}

/**
 * Drops the first `startM` and the last `endM` metres of the track, e.g. a
 * stretch from home before the parking. Distances run along the track.
 */
export function trimTrack(segments: TrackPoint3[][], startM: number, endM: number): TrackPoint3[][] {
  if (startM <= 0 && endM <= 0) return segments;
  const cum: number[][] = [];
  let total = 0;
  for (const s of segments) {
    cum.push(s.map((p, i) => (total += i ? haversineKm(s[i - 1], p) * 1000 : 0)));
  }
  const from = Math.max(0, startM);
  const to = total - Math.max(0, endM);
  return segments.map((s, i) => s.filter((_, j) => cum[i][j] >= from && cum[i][j] <= to)).filter(s => s.length > 1);
}

const esc = (s: string) => s.replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);

/**
 * The track as GPX 1.1: positions and elevations only. Times, heart rate and
 * other sensor data stay out, since a spot's tracks are public.
 */
export function toGpx(name: string | null, segments: TrackPoint3[][]): string {
  const pt = (p: TrackPoint3) =>
    `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}</trkpt>`;
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<gpx version="1.1" creator="Alpine Log" xmlns="http://www.topografix.com/GPX/1/1">\n'
    + `<trk>${name ? `<name>${esc(name)}</name>` : ''}\n`
    + segments.map(s => `<trkseg>\n${s.map(pt).join('\n')}\n</trkseg>`).join('\n')
    + '\n</trk>\n</gpx>\n';
}

/** Names apps give by default ("Morning Run", "Escursione pomeridiana", a date), not worth using as a spot name. */
const GENERIC_NAME = /^(morning|afternoon|evening|night|lunch)\b|\b(mattutin|pomeridian|serale|notturn|pranzo)|^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|^(track|traccia|activity|attivit[aà]|untitled|senza (nome|titolo))\b/i;
export const usefulTrackName = (name: string | null) => (name && !GENERIC_NAME.test(name.trim()) ? name.trim() : null);

/** The day the track was recorded (local date) and its elapsed time in hours, rounded to the half hour. */
export function trackVisit(summary: TrackSummary): { date: string; hours: number | null } | null {
  if (summary.startTime == null) return null;
  const d = new Date(summary.startTime);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const h = summary.endTime != null ? (summary.endTime - summary.startTime) / 3_600_000 : 0;
  return { date, hours: h >= 0.25 ? Math.max(0.5, Math.round(h * 2) / 2) : null };
}
