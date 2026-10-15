/*
 * Spots and areas that may already exist. The spot form, the import and the
 * admin's duplicates list all ask here, so they agree on what "similar" and
 * "almost certainly the same" mean.
 */
import { areasForSpots, fetchDuplicatePairs, similarAreas, similarPlaces } from './api';
import type { Activity, Area, Place } from './types';

/** A spot being typed or imported. */
export type SpotQuery = {
  key: string;
  name: string;
  activity: Activity;
  /** The mountain, wall or crag: "Weissmies" for "Weissmies › via normale". */
  sector?: string;
  /** Only ranks: people group the same mountains under different areas. */
  area?: string;
  lat?: number | null;
  lng?: number | null;
  /** The spot itself, when an existing one is compared with the others. */
  excludeId?: number;
};

/** An existing spot that looks like a query. */
export type SimilarSpot = {
  place_id: number;
  name: string;
  activity: Activity;
  area_name: string | null;
  sector_name: string | null;
  lat: number;
  lng: number;
  /**
   * 0–1: of the spot names when this spot's place (its sector, or its area)
   * is one the query names; otherwise of sector and spot together
   * ("weissmies via normale" / "castore via normale").
   */
  similarity: number;
  /** Null when either spot has no sector. */
  same_sector: boolean | null;
  /** From the query's point, when it has one. */
  distance_km: number | null;
};

export type SimilarArea = { area_id: number; name: string; similarity: number; place_count: number };

/** How similar two spot names must be to be taken for the same without asking. */
const SAME_NAME = 0.75;
/**
 * The same for areas, lower: an area is always asked about, and typos in
 * one word ("Grigneta", "Val Sassina") score 0.6–0.75.
 */
const SAME_AREA_NAME = 0.6;
/** How far apart the same spot can be pinned by two people. */
const SAME_SPOT_KM = 10;
const BATCH = 200;

/** Existing spots like each query, by key: same activity first, then as the server ranks them. */
export async function findSimilarSpots(queries: SpotQuery[]): Promise<Map<string, SimilarSpot[]>> {
  const rows = [];
  for (let i = 0; i < queries.length; i += BATCH) {
    rows.push(...await similarPlaces(queries.slice(i, i + BATCH).map(q => ({
      key: q.key, name: q.name, sector: q.sector ?? null, area: q.area ?? null, activity: q.activity,
      lat: q.lat ?? null, lng: q.lng ?? null, exclude_id: q.excludeId ?? null,
    }))));
  }
  const byKey = new Map<string, SimilarSpot[]>(queries.map(q => [q.key, []]));
  for (const { key, ...m } of rows) byKey.get(key)?.push(m as SimilarSpot);
  for (const q of queries) {
    byKey.get(q.key)!.sort((a, b) => Number(b.activity === q.activity) - Number(a.activity === q.activity));
  }
  return byKey;
}

/**
 * A match that is almost certainly the query itself: same activity, very
 * similar (see `similarity`), not far away, and not in another sector:
 * Breithorn's "via normale" is not Breithorn Occidentale's.
 */
export function isLikelySame(q: Pick<SpotQuery, 'activity'>, m: SimilarSpot): boolean {
  return m.activity === q.activity && m.similarity >= SAME_NAME && m.same_sector !== false
    && (m.distance_km == null || m.distance_km < SAME_SPOT_KM);
}

/** The first match that is almost certainly the query itself. */
export const likelyMatch = (q: Pick<SpotQuery, 'activity'>, matches: SimilarSpot[]) =>
  matches.find(m => isLikelySame(q, m));

/** Existing areas like each name, by name, most similar first (1 when only accents or case differ). */
export async function findSimilarAreas(names: string[]): Promise<Map<string, SimilarArea[]>> {
  const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))];
  const byName = new Map<string, SimilarArea[]>(unique.map(n => [n, []]));
  for (let i = 0; i < unique.length; i += BATCH) {
    for (const { query, ...a } of await similarAreas(unique.slice(i, i + BATCH))) byName.get(query)?.push(a);
  }
  return byName;
}

/** An area that is almost certainly the one named. */
export const isLikelySameArea = (a: SimilarArea) => a.similarity >= SAME_AREA_NAME;

/** A group of new spots: where their sectors are, and where their pins fall. */
export type AreaQuery = { key: string; sectors: string[]; points: { lat: number; lng: number }[] };

/** An area found from a group's spots rather than its name. */
export type AreaNearby = {
  area_id: number;
  name: string;
  place_count: number;
  /** One of the group's sectors, already in this area. */
  sector_name: string | null;
  /** From the nearest pin to the area's nearest spot; null when found by sector only. */
  distance_km: number | null;
};

/** Areas new spots may belong to that a similar name can't find, by key: their sector's first, then the nearest. */
export async function findAreasForSpots(queries: AreaQuery[]): Promise<Map<string, AreaNearby[]>> {
  const byKey = new Map<string, AreaNearby[]>(queries.map(q => [q.key, []]));
  for (let i = 0; i < queries.length; i += BATCH) {
    for (const { key, ...a } of await areasForSpots(queries.slice(i, i + BATCH))) byKey.get(key)?.push(a as AreaNearby);
  }
  return byKey;
}

// ---------------------------------------------------------------- admins' list

export type DuplicatePair<T> = { a: T; b: T; similarity: number; distance_km: number | null; likely: boolean };

/**
 * Spots and areas that look alike, as pairs of the given (loaded) ones:
 * almost certainly the same first, then the most similar.
 */
export async function findDuplicatePairs(places: Place[], areas: Area[]) {
  const rows = await fetchDuplicatePairs();
  const placeById = new Map(places.map(p => [p.id, p]));
  const areaById = new Map(areas.map(a => [a.id, a]));
  const byLikely = <T,>(pairs: DuplicatePair<T>[]) =>
    pairs.sort((x, y) => Number(y.likely) - Number(x.likely) || y.similarity - x.similarity);

  const placePairs = rows.places.flatMap(r => {
    const a = placeById.get(r.place_id);
    const b = placeById.get(r.other_id);
    if (!a || !b) return [];
    const match: SimilarSpot = {
      place_id: b.id, name: b.name, activity: b.activity, area_name: b.area?.name ?? null, sector_name: b.sector?.name ?? null,
      lat: b.lat, lng: b.lng, similarity: r.similarity, same_sector: r.same_sector,
      distance_km: r.distance_km,
    };
    return [{ a, b, similarity: r.similarity, distance_km: r.distance_km, likely: isLikelySame(a, match) }];
  });
  const areaPairs = rows.areas.flatMap(r => {
    const a = areaById.get(r.area_id);
    const b = areaById.get(r.other_id);
    return a && b ? [{ a, b, similarity: r.similarity, distance_km: null,
                       likely: isLikelySameArea({ area_id: b.id, name: b.name, similarity: r.similarity, place_count: b.place_count }) }] : [];
  });
  return { places: byLikely(placePairs), areas: byLikely(areaPairs) };
}
