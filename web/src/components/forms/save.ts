import { fetchSectors, saveVisit } from '../../lib/api';
import type { PlaceType } from '../../lib/types';
import { buildVisitInput, type VisitValues } from './visitForm';

/**
 * Saves a visit at a place. Routes filed under a sector of a place created
 * in the same save carry "name:<sector>" keys, resolved here to real ids.
 */
export async function saveVisitAt(placeId: number, values: VisitValues, types: PlaceType[], visitId?: number) {
  const byName = values.ascents.some(a => a.sectorKey.startsWith('name:'))
    ? new Map((await fetchSectors(placeId)).map(s => [s.name.toLowerCase(), s.id]))
    : null;
  const sectorId = (key: string) =>
    key.startsWith('name:') ? byName?.get(key.slice(5).toLowerCase()) ?? null : Number(key);
  return saveVisit(buildVisitInput(values, placeId, types, sectorId, visitId));
}

/** Sector choices for a place being created: keyed by name until it has ids. */
export const newSectorOptions = (names: string[]) =>
  names.map(n => n.trim()).filter(Boolean).map(n => ({ key: `name:${n}`, label: n }));
