/*
 * Decides where each imported spot goes: an existing spot with a similar
 * name, or a new one whose pin comes from the file or from the geocoder.
 * Then builds the import_logbook payload.
 */
import {
  findAreasForSpots, findSimilarAreas, findSimilarSpots, isLikelySameArea, likelyMatch, type SimilarSpot,
} from '../duplicates';
import { reverseGeocode, searchLocations } from '../geocode';
import { foldName, sameName } from '../names';
import type { PlaceInput, VisitInput, Visibility } from '../types';
import { tr } from '../../i18n';
import { ACTIVITIES } from '../labels';
import type { DraftSpot } from './rows';

export type PinSource = 'file' | 'geocoded' | 'map' | null;

export type ResolvedSpot = DraftSpot & {
  matches: SimilarSpot[];
  /** An existing spot id, "new", or "skip". */
  choice: number | 'new' | 'skip';
  pinSource: PinSource;
  /** What the pin was found from: "Lanzada, SO, Italia → Lanzada, Lombardia". */
  pinLabel: string;
};

/** Existing spots that look like each imported one; one that is almost certainly the same is preselected. */
export async function matchExisting(spots: DraftSpot[]): Promise<ResolvedSpot[]> {
  const similar = await findSimilarSpots(spots.map(spotQuery));
  return spots.map(s => ({
    ...s,
    ...linkTo(s, similar.get(s.key) ?? []),
    pinSource: s.lat != null ? 'file' : null,
    pinLabel: s.lat != null ? tr().import.spots.fromFile : '',
  }));
}

/** Looks for a spot again after its name changed ("keep whole"). */
export async function rematch(s: ResolvedSpot): Promise<ResolvedSpot> {
  const similar = await findSimilarSpots([spotQuery(s)]);
  return { ...s, ...linkTo(s, similar.get(s.key) ?? []) };
}

const spotQuery = (s: DraftSpot) =>
  ({ key: s.key, name: s.name, activity: s.activity, sector: s.sector, area: s.area, lat: s.lat, lng: s.lng });

function linkTo(s: DraftSpot, matches: SimilarSpot[]): Pick<ResolvedSpot, 'matches' | 'choice'> {
  return { matches, choice: likelyMatch(s, matches)?.place_id ?? 'new' };
}

// ---------------------------------------------------------------- areas

/** An existing area new spots may go to, and why it is offered. */
export type AreaOption = {
  area_id: number;
  name: string;
  place_count: number;
  /** Of the names, when the area is named like the file's. */
  similarity: number | null;
  /** One of the spots' sectors, already in this area. */
  sector_name: string | null;
  /** From the nearest pin to the area's nearest spot, when within 25 km. */
  distance_km: number | null;
};

/** Where a group of new spots goes: the spots of one area of the file, or one spot of the file with no area. */
export type AreaChoice = {
  group: string;
  /** The area as written in the file; '' when the file names none. */
  name: string;
  /** What the spots are, when the file names no area: their sector, or the spot. */
  label: string;
  /** Most likely first. */
  matches: AreaOption[];
  /** An existing area's name, or `name` for a new area (no area when blank). */
  use: string;
};

/** Spots of the same area of the file go together; a spot without one goes on its own, with its sector. */
export const areaGroup = (s: DraftSpot) =>
  s.area.trim() ? `area:${foldName(s.area)}` : `spot:${foldName(s.sector) || foldName(s.name)}`;

/**
 * Existing areas each group of spots may belong to: named alike ("Valsassina"
 * / "Val Sassina"), where one of its sectors already is (Weissmies in "Valle
 * di Saas", not the file's "Gruppo Andolla"), or with spots near its pins.
 * Nearby areas come first. One is chosen when its name is almost the same,
 * or when it is nearby and named alike or holds one of the sectors
 * ("Massiccio Monte Rosa" / "Monte Rosa"); otherwise the file's own area.
 * An area spelled the same is the same area anyway (the server compares
 * folded names), so it isn't asked.
 */
export async function matchAreas(spots: ResolvedSpot[]): Promise<AreaChoice[]> {
  const groups = new Map<string, ResolvedSpot[]>();
  for (const s of spots) groups.set(areaGroup(s), [...(groups.get(areaGroup(s)) ?? []), s]);
  const [byName, bySpots] = await Promise.all([
    // Without an area in the file, the sector may be one ("Placche di Oriana").
    findSimilarAreas(spots.map(s => s.area.trim() || s.sector)),
    findAreasForSpots([...groups].map(([key, ss]) => ({
      key,
      sectors: [...new Set(ss.map(s => s.sector).filter(Boolean))],
      points: ss.flatMap(s => (s.lat != null && s.lng != null ? [{ lat: s.lat, lng: s.lng }] : [])),
    }))),
  ]);
  return [...groups].flatMap(([group, ss]) => {
    const name = ss[0].area.trim();
    const named = byName.get(name || ss[0].sector) ?? [];
    if (name && named.some(m => sameName(m.name, name))) return [];
    const matches: AreaOption[] = named.map(m => ({ ...m, sector_name: null, distance_km: null }));
    for (const a of bySpots.get(group) ?? []) {
      const known = matches.find(m => m.area_id === a.area_id);
      if (known) Object.assign(known, { sector_name: a.sector_name, distance_km: a.distance_km });
      else matches.push({ ...a, similarity: null });
    }
    if (!matches.length) return [];
    const near = (m: AreaOption) => m.distance_km != null;
    const evidence = (m: AreaOption) => 4 * Number(near(m)) + 2 * Number(m.sector_name != null) + Number(m.similarity != null);
    matches.sort((a, b) => evidence(b) - evidence(a)
      || (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) || (b.similarity ?? 0) - (a.similarity ?? 0));
    const likely = (m: AreaOption) => (m.similarity != null && isLikelySameArea({ ...m, similarity: m.similarity }))
      || (near(m) && (m.similarity != null || m.sector_name != null));
    const use = matches.find(likely)?.name ?? name;
    return [{ group, name, label: name || ss[0].sector || ss[0].name, matches, use }];
  });
}

/** The area name a spot is saved under. */
const areaOf = (s: DraftSpot, areas: AreaChoice[]) => areas.find(a => a.group === areaGroup(s))?.use ?? s.area;

/** What to search for, most precise first. A blank country means the default one, if any. */
const COUNTRY_NAMES: Record<string, string> = {
  IT: 'Italia', FR: 'France', CH: 'Schweiz', AT: 'Österreich', DE: 'Deutschland', ES: 'España', SI: 'Slovenija',
};

export function geocodeQueries(s: DraftSpot, defaultCountry: string): string[] {
  const country = COUNTRY_NAMES[s.country] ?? (s.country || defaultCountry);
  const join = (...p: string[]) => p.map(x => x.trim()).filter(Boolean).join(', ');
  const qs = [
    s.locality && join(s.locality, s.region, country),
    s.locality && join(s.locality, country),
    s.sector && join(s.sector, country),
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
  // Country and province of new spots the file didn't give, from their pin.
  const pinned = spots.map(s => out.get(s.key) ?? s);
  for (const s of pinned) {
    if (s.choice !== 'new' || s.lat == null || s.lng == null || (s.country && s.region)) continue;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const place = await reverseGeocode({ lat: s.lat, lng: s.lng }, signal);
      out.set(s.key, { ...s, country: s.country || (place.country ?? ''), region: s.region || (place.province ?? '') });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
    await sleep(250);
  }
  return spots.map(s => out.get(s.key) ?? s);
}

// ---------------------------------------------------------------- payload

export type ImportPayload = {
  file_name: string;
  summary: Record<string, unknown>;
  spots: ({ key: string; place_id: number }
    | { key: string; place: PlaceInput; links: { title: string; url: string }[]; area_description: string })[];
  visits: (Omit<VisitInput, 'place_id'> & { spot: string })[];
};

export const isReady = (s: ResolvedSpot) => s.choice === 'skip' || typeof s.choice === 'number' || s.lat != null;

export function buildPayload(fileName: string, spots: ResolvedSpot[], areas: AreaChoice[], visibility: Visibility): ImportPayload {
  const used = spots.filter(s => s.choice !== 'skip');
  return {
    file_name: fileName,
    summary: { spots: used.length },
    spots: used.map(s => (typeof s.choice === 'number'
      ? { key: s.key, place_id: s.choice }
      : {
        key: s.key,
        links: s.links,
        area_description: s.areaDescription,
        place: {
          area_name: areaOf(s, areas), name: s.name, activity: s.activity, lat: s.lat!, lng: s.lng!,
          parking_lat: null, parking_lng: null, start_lat: null, start_lng: null,
          rock: s.rock, exposition: [], description: s.description, grade: s.grade,
          max_altitude: s.max_altitude, elevation_gain: s.elevation_gain, distance_km: s.distance_km,
          sector_name: s.sector,
          country: s.country, province: s.region, start_locality: s.locality, protection: s.protection,
          pitches: s.pitches, length_m: s.length_m, alpine_grade: s.alpine_grade, grade_obligatory: s.grade_obligatory,
          aid: s.aid,
        },
      })),
    visits: used.flatMap(s => s.visits.map(v => {
      const f = ACTIVITIES[s.activity];
      // At a spot that is itself a route, the visit is a go at it (as in the visit form).
      let ascents = v.ascents;
      if (f.isRoute && f.routes) {
        ascents = ascents.length
          ? ascents.map(a => (a.name ? a : { ...a, name: s.name, grade: a.grade || s.grade }))
          : [{ name: s.name, grade: s.grade, comment: '', sector: '', style: null }];
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
        rating: v.rating,
        partners: v.partners,
        other_partners: v.otherPartners,
        add_routes: false,
        // A route's sector names another spot of the visit's sector, found by name on the
        // server; one that doesn't exist is kept in the route's comment.
        ascents: f.routes ? ascents.map(a => ({
          name: a.name, grade: a.grade, comment: a.comment, route_id: null, place_id: null, sector: a.sector,
          style: a.style, pitches: null, aid: '',
        })) : [],
        tip: v.tip ? { body: v.tip, topic: null } : null,
      };
    })),
  };
}
