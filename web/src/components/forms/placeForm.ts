import { formatCoords, parseCoordinates } from '../../lib/coords';
import { tr } from '../../i18n';
import { ACTIVITIES } from '../../lib/labels';
import type { Activity, Exposition, Place, PlaceInput } from '../../lib/types';

export type SectorRow = { key: number; id?: number; name: string };

/** Everything the place fields hold while being edited (raw strings, as typed). */
export type PlaceValues = {
  activity: Activity;
  areaName: string;
  name: string;
  coords: string;
  parking: string;
  start: string;
  grade: string;
  altitude: string;
  gain: string;
  distance: string;
  rock: string;
  exposition: Exposition[];
  description: string;
  sectors: SectorRow[];
};

/** Which coordinate field a "pick on map" request fills. */
export type CoordField = 'coords' | 'parking' | 'start';
export const coordLabel = (field: CoordField) => tr().spot.placeForm.pickLabels[field];

let nextKey = 1;
export const sectorRow = (name = '', id?: number): SectorRow => ({ key: nextKey++, id, name });

export function placeValuesFrom(place?: Place): PlaceValues {
  return {
    activity: place?.activity ?? 'crag',
    areaName: place?.area?.name ?? '',
    name: place?.name ?? '',
    coords: formatCoords(place?.lat, place?.lng),
    parking: formatCoords(place?.parking_lat, place?.parking_lng),
    start: formatCoords(place?.start_lat, place?.start_lng),
    grade: place?.grade ?? '',
    altitude: place?.max_altitude?.toString() ?? '',
    gain: place?.elevation_gain?.toString() ?? '',
    distance: place?.distance_km?.toString() ?? '',
    rock: place?.rock ?? '',
    exposition: place?.exposition ?? [],
    description: place?.description ?? '',
    sectors: (place?.sectors ?? []).map(s => sectorRow(s.name, s.id)),
  };
}

const intOrNull = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));

/** The save_place payload, or a message saying what to fix. */
export function buildPlaceInput(v: PlaceValues, id?: number): PlaceInput | string {
  const s = tr().spot.placeForm;
  const pin = parseCoordinates(v.coords);
  if (!v.name.trim()) return s.needName;
  if (!pin) return s.needPin;
  const parking = parseCoordinates(v.parking);
  if (v.parking.trim() && !parking) return s.parkingUnreadable;
  const start = parseCoordinates(v.start);
  if (v.start.trim() && !start) return s.startUnreadable;
  const sectorNames = v.sectors.map(s => s.name.trim()).filter(Boolean);
  if (new Set(sectorNames.map(s => s.toLowerCase())).size !== sectorNames.length) return s.duplicateSector;
  const f = ACTIVITIES[v.activity];
  const distance = v.distance.trim() === '' ? null : Number(v.distance.replace(',', '.'));
  if (distance != null && !(distance > 0 && distance < 1000)) return s.badDistance;

  return {
    id,
    area_name: v.areaName,
    name: v.name.trim(),
    activity: v.activity,
    lat: pin.lat,
    lng: pin.lng,
    parking_lat: parking?.lat ?? null,
    parking_lng: parking?.lng ?? null,
    start_lat: start?.lat ?? null,
    start_lng: start?.lng ?? null,
    rock: f.rock ? v.rock : '',
    exposition: v.exposition,
    description: v.description,
    grade: v.grade,
    max_altitude: f.altitude ? intOrNull(v.altitude) : null,
    elevation_gain: f.altitude ? intOrNull(v.gain) : null,
    distance_km: f.distance ? distance : null,
    sectors: f.sectors
      ? v.sectors.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name.trim() }))
      : [],
  };
}
