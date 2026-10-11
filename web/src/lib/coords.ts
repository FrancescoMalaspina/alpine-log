export type LatLng = { lat: number; lng: number };

/**
 * Reads one coordinate pair, either decimal ("46.076245, 9.435389",
 * "46.07N 9.43E") or degrees/minutes/seconds ("46°04'34.5"N 9°26'07.4"E").
 */
export function parseCoordinates(input: string): LatLng | null {
  const str = (input || '').trim();
  if (!str) return null;

  const m = str.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])?$/);
  if (m) {
    let lat = parseFloat(m[1]);
    let lng = parseFloat(m[3]);
    if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat);
    if (m[4] && /w/i.test(m[4])) lng = -Math.abs(lng);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  // DMS (minutes/seconds optional, order-independent). Degrees must be a whole
  // number when minutes/seconds are present — "46.07°12'" is ambiguous and
  // gets rejected rather than silently double-counted into the wrong spot.
  const dmsRe = /(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?\s*([NSEWnsew])/g;
  const matches = [...str.matchAll(dmsRe)];
  if (matches.length >= 2) {
    let lat: number | null = null;
    let lng: number | null = null;
    for (const mm of matches) {
      const hasMinSec = mm[2] !== undefined || mm[3] !== undefined;
      if (mm[1].includes('.') && hasMinSec) return null;
      let val = (parseFloat(mm[1]) || 0) + (parseFloat(mm[2]) || 0) / 60 + (parseFloat(mm[3]) || 0) / 3600;
      const hemi = mm[4].toUpperCase();
      if (hemi === 'S' || hemi === 'W') val = -val;
      if (hemi === 'N' || hemi === 'S') lat = val;
      else lng = val;
    }
    if (lat !== null && lng !== null) return { lat, lng };
  }
  return null;
}

export const formatCoords = (lat: number | null | undefined, lng: number | null | undefined, digits = 6) =>
  lat == null || lng == null ? '' : `${+lat.toFixed(digits)}, ${+lng.toFixed(digits)}`;

/** The device's current position (asks for permission the first time). */
export function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser has no location access.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      e => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not get your location.')),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}
