export type TrackPoint = [lat: number, lng: number];

export type Track = {
  /** One line per track segment / route. */
  lines: TrackPoint[][];
  distanceKm: number;
  /** Total ascent, ignoring elevation jitter under 3 m. */
  gainM: number | null;
  maxEleM: number | null;
};

const R = 6371;
function haversineKm(a: TrackPoint, b: TrackPoint) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Reads track segments (or routes) from a GPX document; null if it has no usable points. */
export function parseGpx(xml: string): Track | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;

  const groups = [...doc.getElementsByTagName('trkseg'), ...doc.getElementsByTagName('rte')];
  const lines: TrackPoint[][] = [];
  const elevations: number[] = [];
  for (const g of groups) {
    const line: TrackPoint[] = [];
    for (const pt of [...g.getElementsByTagName('trkpt'), ...g.getElementsByTagName('rtept')]) {
      const lat = parseFloat(pt.getAttribute('lat') ?? '');
      const lng = parseFloat(pt.getAttribute('lon') ?? '');
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      line.push([lat, lng]);
      const ele = parseFloat(pt.getElementsByTagName('ele')[0]?.textContent ?? '');
      if (Number.isFinite(ele)) elevations.push(ele);
    }
    if (line.length > 1) lines.push(line);
  }
  if (!lines.length) return null;

  let distanceKm = 0;
  for (const line of lines) for (let i = 1; i < line.length; i++) distanceKm += haversineKm(line[i - 1], line[i]);

  let gainM: number | null = null;
  if (elevations.length > 1) {
    gainM = 0;
    let base = elevations[0];
    for (const e of elevations) {
      if (e - base >= 3) { gainM += e - base; base = e; } else if (e < base) base = e;
    }
  }
  return { lines, distanceKm, gainM, maxEleM: elevations.length ? Math.max(...elevations) : null };
}
