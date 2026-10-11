import { formatCoords, parseCoordinates } from '../../lib/coords';
import { isRouteLike } from '../../lib/labels';
import type { Exposition, Place, PlaceInput, PlaceType } from '../../lib/types';

export type SectorRow = { key: number; id?: number; name: string };

/** Everything the place fields hold while being edited (raw strings, as typed). */
export type PlaceValues = {
  types: PlaceType[];
  areaName: string;
  name: string;
  coords: string;
  parking: string;
  start: string;
  grade: string;
  altitude: string;
  gain: string;
  rock: string;
  exposition: Exposition[];
  description: string;
  sectors: SectorRow[];
};

/** Which coordinate field a "pick on map" request fills. */
export type CoordField = 'coords' | 'parking' | 'start';
export const COORD_LABELS: Record<CoordField, string> = { coords: 'the map pin', parking: 'the parking', start: 'the start' };

let nextKey = 1;
export const sectorRow = (name = '', id?: number): SectorRow => ({ key: nextKey++, id, name });

export function placeValuesFrom(place?: Place): PlaceValues {
  return {
    types: place?.types ?? ['crag'],
    areaName: place?.area?.name ?? '',
    name: place?.name ?? '',
    coords: formatCoords(place?.lat, place?.lng),
    parking: formatCoords(place?.parking_lat, place?.parking_lng),
    start: formatCoords(place?.start_lat, place?.start_lng),
    grade: place?.grade ?? '',
    altitude: place?.max_altitude?.toString() ?? '',
    gain: place?.elevation_gain?.toString() ?? '',
    rock: place?.rock ?? '',
    exposition: place?.exposition ?? [],
    description: place?.description ?? '',
    sectors: (place?.sectors ?? []).map(s => sectorRow(s.name, s.id)),
  };
}

export const hasRock = (types: PlaceType[]) => types.some(t => t === 'crag' || t === 'multipitch' || t === 'alpine');
const intOrNull = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));

/** The save_place payload, or a message saying what to fix. */
export function buildPlaceInput(v: PlaceValues, id?: number): PlaceInput | string {
  const pin = parseCoordinates(v.coords);
  if (!v.name.trim()) return 'Give the place a name.';
  if (!pin) return 'Set the map pin: type coordinates, use your location, or pick it on the map.';
  if (!v.types.length) return 'Pick at least one activity.';
  const parking = parseCoordinates(v.parking);
  if (v.parking.trim() && !parking) return "Couldn't read the parking coordinates.";
  const start = parseCoordinates(v.start);
  if (v.start.trim() && !start) return "Couldn't read the start coordinates.";
  const sectorNames = v.sectors.map(s => s.name.trim()).filter(Boolean);
  if (new Set(sectorNames.map(s => s.toLowerCase())).size !== sectorNames.length) return 'Two sectors have the same name.';
  const routeLike = isRouteLike(v.types);

  return {
    id,
    area_name: v.areaName,
    name: v.name.trim(),
    types: v.types,
    lat: pin.lat,
    lng: pin.lng,
    parking_lat: parking?.lat ?? null,
    parking_lng: parking?.lng ?? null,
    start_lat: start?.lat ?? null,
    start_lng: start?.lng ?? null,
    rock: hasRock(v.types) ? v.rock : '',
    exposition: v.exposition,
    description: v.description,
    grade: v.grade,
    max_altitude: routeLike ? intOrNull(v.altitude) : null,
    elevation_gain: routeLike ? intOrNull(v.gain) : null,
    sectors: v.types.includes('crag')
      ? v.sectors.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name.trim() }))
      : [],
  };
}
