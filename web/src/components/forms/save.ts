import { fetchSectors, saveVisit } from '../../lib/api';
import { buildVisitInput, type VisitSpot, type VisitValues } from './visitForm';

/**
 * Saves a visit at a spot. Routes filed under a sector of a spot created
 * in the same save carry "name:<sector>" keys, resolved here to real ids.
 */
export async function saveVisitAt(spot: VisitSpot, values: VisitValues, visitId?: number) {
  const byName = values.ascents.some(a => a.sectorKey.startsWith('name:'))
    ? new Map((await fetchSectors(spot.id)).map(s => [s.name.toLowerCase(), s.id]))
    : null;
  const sectorId = (key: string) =>
    key.startsWith('name:') ? byName?.get(key.slice(5).toLowerCase()) ?? null : Number(key);
  return saveVisit(buildVisitInput(values, spot, sectorId, visitId));
}

/** Sector choices for a spot being created: keyed by name until it has ids. */
export const newSectorOptions = (names: string[]) =>
  names.map(n => n.trim()).filter(Boolean).map(n => ({ key: `name:${n}`, label: n }));
