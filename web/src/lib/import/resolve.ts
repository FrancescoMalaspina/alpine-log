/*
 * Decides where each imported spot goes: an existing spot with a similar
 * name, or a new one whose pin comes from the file or from the geocoder.
 * Then builds the import_logbook payload.
 */
import { matchPlaces, type PlaceMatch } from '../api';
import { searchLocations } from '../geocode';
import type { PlaceInput, VisitInput, Visibility } from '../types';
import { ACTIVITIES } from '../labels';
import type { DraftSpot } from './rows';

export type PinSource = 'file' | 'geocoded' | 'map' | null;

export type ResolvedSpot = DraftSpot & {
  matches: PlaceMatch[];
  /** An existing spot id, "new", or "skip". */
  choice: number | 'new' | 'skip';
  pinSource: PinSource;
  /** What the pin was found from: "Lanzada, SO, Italia → Lanzada, Lombardia". */
  pinLabel: string;
};

const R = 6371;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Existing spots that look like each imported one; a close, same-activity match is preselected. */
export async function matchExisting(spots: DraftSpot[]): Promise<ResolvedSpot[]> {
  const names = [...new Set(spots.map(s => s.name))];
  const matches: PlaceMatch[] = [];
  for (let i = 0; i < names.length; i += 200) matches.push(...await matchPlaces(names.slice(i, i + 200)));
  return spots.map(s => {
    const mine = matches
      .filter(m => m.query === s.name)
      .map(m => ({
        ...m,
        distance_km: s.lat != null && s.lng != null ? distanceKm({ lat: s.lat, lng: s.lng }, m) : null,
      }))
      .sort((a, b) => Number(b.activity === s.activity) - Number(a.activity === s.activity) || b.similarity - a.similarity);
    const best = mine[0];
    const sure = best && best.activity === s.activity && best.similarity >= 0.75
      && (best.distance_km == null || best.distance_km < 10);
    return {
      ...s,
      matches: mine,
      choice: sure ? best.place_id : 'new',
      pinSource: s.lat != null ? 'file' : null,
      pinLabel: s.lat != null ? 'from the file' : '',
    };
  });
}

/** What to search for, most precise first. A blank country means the default one, if any. */
export function geocodeQueries(s: DraftSpot, defaultCountry: string): string[] {
  const country = s.country || defaultCountry;
  const join = (...p: string[]) => p.map(x => x.trim()).filter(Boolean).join(', ');
  const qs = [
    s.locality && join(s.locality, s.region, country),
    s.locality && join(s.locality, country),
    s.area && join(s.area, country),
    join(s.name, country),
  ];
  return [...new Set(qs.filter(Boolean) as string[])];
}

const ALPS = { lat: 46, lng: 9.5 };

/**
 * Where the geocoder should look first: the middle of the pins we already
 * know (from the file, or existing spots the import links to). Without a
 * country, "Dro, TN" is only found in Italy when the search starts nearby.
 */
export function searchCenter(spots: ResolvedSpot[]): { lat: number; lng: number } {
  const known = spots.flatMap(s => {
    const linked = typeof s.choice === 'number' ? s.matches.find(m => m.place_id === s.choice) : null;
    if (linked) return [{ lat: linked.lat, lng: linked.lng }];
    return s.lat != null && s.lng != null && s.pinSource !== 'geocoded' ? [{ lat: s.lat, lng: s.lng }] : [];
  });
  if (!known.length) return ALPS;
  const mid = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return { lat: mid(known.map(k => k.lat)), lng: mid(known.map(k => k.lng)) };
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Pins every new spot that has none, one geocoder call per distinct query
 * (Photon is a free shared service: calls go one at a time).
 */
export async function geocodeSpots(
  spots: ResolvedSpot[], defaultCountry: string,
  onProgress: (done: number, total: number) => void, signal?: AbortSignal,
): Promise<ResolvedSpot[]> {
  const cache = new Map<string, { lat: number; lng: number; label: string } | null>();
  const todo = spots.filter(s => s.choice === 'new' && s.lat == null);
  const near = searchCenter(spots);
  let done = 0;
  const out = new Map<string, ResolvedSpot>();
  for (const s of todo) {
    for (const q of geocodeQueries(s, defaultCountry)) {
      if (!cache.has(q)) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        try {
          const [hit] = await searchLocations(q, near, signal);
          cache.set(q, hit ? { lat: hit.lat, lng: hit.lng, label: [hit.name, hit.detail].filter(Boolean).join(', ') } : null);
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          cache.set(q, null);
        }
        await sleep(250);
      }
      const hit = cache.get(q);
      if (hit) {
        out.set(s.key, { ...s, lat: hit.lat, lng: hit.lng, pinSource: 'geocoded', pinLabel: `${q} → ${hit.label}` });
        break;
      }
    }
    onProgress(++done, todo.length);
  }
  return spots.map(s => out.get(s.key) ?? s);
}

// ---------------------------------------------------------------- payload

export type ImportPayload = {
  file_name: string;
  summary: Record<string, unknown>;
  spots: ({ key: string; place_id: number } | { key: string; place: PlaceInput; links: { title: string; url: string }[] })[];
  visits: (Omit<VisitInput, 'place_id'> & { spot: string })[];
};

export const isReady = (s: ResolvedSpot) => s.choice === 'skip' || typeof s.choice === 'number' || s.lat != null;

export function buildPayload(fileName: string, spots: ResolvedSpot[], visibility: Visibility): ImportPayload {
  const used = spots.filter(s => s.choice !== 'skip');
  return {
    file_name: fileName,
    summary: { spots: used.length },
    spots: used.map(s => (typeof s.choice === 'number'
      ? { key: s.key, place_id: s.choice }
      : {
        key: s.key,
        links: s.links,
        place: {
          area_name: s.area, name: s.name, activity: s.activity, lat: s.lat!, lng: s.lng!,
          parking_lat: null, parking_lng: null, start_lat: null, start_lng: null,
          rock: s.rock, exposition: [], description: s.description, grade: s.grade,
          max_altitude: s.max_altitude, elevation_gain: s.elevation_gain, distance_km: s.distance_km,
          sectors: [...new Set(s.visits.flatMap(v => v.ascents.map(a => a.sector)).filter(Boolean))].map(name => ({ name })),
        },
      })),
    visits: used.flatMap(s => s.visits.map(v => {
      const f = ACTIVITIES[s.activity];
      // At a spot that is itself a route, the visit is a go at it (as in the visit form).
      let ascents = v.ascents;
      if (f.isRoute && f.routes) {
        ascents = ascents.length
          ? ascents.map(a => (a.name ? a : { ...a, name: s.name, grade: a.grade || s.grade }))
          : [{ name: s.name, grade: s.grade, comment: '', sector: '' }];
      }
      return {
        spot: s.key,
        date: v.date,
        summary: v.summary,
        approach: v.approach,
        descent: v.descent,
        conditions: v.conditions,
        duration_hours: v.duration_hours,
        visibility: v.visibility ?? visibility,
        partners: v.partners,
        add_routes: false,
        // Sectors of a new spot are resolved by name on the server; existing spots keep routes unfiled.
        ascents: f.routes ? ascents.map(a => ({ name: a.name, grade: a.grade, comment: a.comment, route_id: null, sector_id: null, sector: a.sector })) : [],
      };
    })),
  };
}
