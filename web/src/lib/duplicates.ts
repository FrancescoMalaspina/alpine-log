/*
 * Spots and areas that may already exist. The spot form, the import and the
 * admin's duplicates list all ask here, so they agree on what "similar" and
 * "almost certainly the same" mean.
 */
import { similarAreas, similarPlaces } from './api';
import { sameName } from './names';
import type { Activity } from './types';

/** A spot being typed or imported. */
export type SpotQuery = {
  key: string;
  name: string;
  activity: Activity;
  sector?: string;
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
  /** 0–1, of the folded names. */
  similarity: number;
  /** From the query's point, when it has one. */
  distance_km: number | null;
};

export type SimilarArea = { area_id: number; name: string; similarity: number; place_count: number };

/** How similar two names must be to be taken for the same without asking. */
const SAME_NAME = 0.75;
/** How far apart the same spot can be pinned by two people. */
const SAME_SPOT_KM = 10;
const BATCH = 200;

/** Existing spots like each query, by key: same activity first, then most similar. */
export async function findSimilarSpots(queries: SpotQuery[]): Promise<Map<string, SimilarSpot[]>> {
  const rows = [];
  for (let i = 0; i < queries.length; i += BATCH) {
    rows.push(...await similarPlaces(queries.slice(i, i + BATCH).map(q => ({
      key: q.key, name: q.name, activity: q.activity, lat: q.lat ?? null, lng: q.lng ?? null, exclude_id: q.excludeId ?? null,
    }))));
  }
  const byKey = new Map<string, SimilarSpot[]>(queries.map(q => [q.key, []]));
  for (const { key, ...m } of rows) byKey.get(key)?.push(m as SimilarSpot);
  for (const q of queries) {
    byKey.get(q.key)!.sort((a, b) =>
      Number(b.activity === q.activity) - Number(a.activity === q.activity) || b.similarity - a.similarity);
  }
  return byKey;
}

/**
 * A match that is almost certainly the query itself: same activity, a very
 * similar name, the same sector (another mountain's "via normale" is not the
 * same route) and not far away.
 */
export function isLikelySame(q: Pick<SpotQuery, 'activity' | 'sector'>, m: SimilarSpot): boolean {
  const sameSector = !q.sector || !m.sector_name || sameName(q.sector, m.sector_name);
  return m.activity === q.activity && m.similarity >= SAME_NAME && sameSector
    && (m.distance_km == null || m.distance_km < SAME_SPOT_KM);
}

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
export const isLikelySameArea = (a: SimilarArea) => a.similarity >= SAME_NAME;
