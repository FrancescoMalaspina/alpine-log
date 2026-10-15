import { formatCoords, parseCoordinates } from '../../lib/coords';
import { tr } from '../../i18n';
import { ACTIVITIES } from '../../lib/labels';
import type { TrackFile } from '../../lib/tracks';
import type { Activity, Exposition, Place, PlaceInput, Protection } from '../../lib/types';

/** Everything the place fields hold while being edited (raw strings, as typed). */
export type PlaceValues = {
  activity: Activity;
  areaName: string;
  sectorName: string;
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
  country: string;
  province: string;
  startLocality: string;
  protection: Protection | null;
  pitches: string;
  length: string;
  alpineGrade: string;
  gradeObligatory: string;
  aid: string;
  /** A link to a guide (relazione), added to the spot's links when it's saved. */
  guideUrl: string;
  /** A track loaded to fill in the fields; saved on the spot when `save` is ticked. */
  track: TrackDraft | null;
};

export type TrackDraft = {
  fileName: string;
  file: TrackFile;
  /** Metres cut from the start and the end, e.g. a stretch from home. */
  trimStartM: number;
  trimEndM: number;
  save: boolean;
};

/** Activities whose spots can be filled in from a recorded track. */
export const TRACK_ACTIVITIES: Activity[] = ['ski', 'hike', 'trail', 'mtb', 'alpine'];

/** Which coordinate field a "pick on map" request fills. */
export type CoordField = 'coords' | 'parking' | 'start';
export const coordLabel = (field: CoordField) => tr().spot.placeForm.pickLabels[field];

export function placeValuesFrom(place?: Place): PlaceValues {
  return {
    activity: place?.activity ?? 'crag',
    areaName: place?.area?.name ?? '',
    sectorName: place?.sector?.name ?? '',
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
    country: place?.country ?? '',
    province: place?.province ?? '',
    startLocality: place?.start_locality ?? '',
    protection: place?.protection ?? null,
    pitches: place?.pitches?.toString() ?? '',
    length: place?.length_m?.toString() ?? '',
    alpineGrade: place?.alpine_grade ?? '',
    gradeObligatory: place?.grade_obligatory ?? '',
    aid: place?.aid ?? '',
    guideUrl: '',
    track: null,
  };
}

/** The spot as a suggestion would leave it: the suggested fields over the current ones. */
export function placeWithChanges(place: Place, changes: Partial<PlaceInput>): Place {
  const { area_name, sector_name, ...fields } = changes;
  const named = (now: Place['area'], name: string | null | undefined) =>
    name === undefined ? now : name ? { id: now?.id ?? 0, name } : null;
  return {
    ...place,
    ...(fields as Partial<Place>),
    area: named(place.area, area_name),
    sector: named(place.sector, sector_name),
  };
}

/** The guide link as it will be saved: `https://` added when only the address was typed; null if empty or unusable. */
export function guideUrlOf(v: Pick<PlaceValues, 'guideUrl'>): string | null {
  const raw = v.guideUrl.trim();
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
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
  const f = ACTIVITIES[v.activity];
  const distance = v.distance.trim() === '' ? null : Number(v.distance.replace(',', '.'));
  if (distance != null && !(distance > 0 && distance < 1000)) return s.badDistance;
  const country = v.country.trim().toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return s.badCountry;
  if (v.guideUrl.trim() && !guideUrlOf(v)) return s.badGuideUrl;

  return {
    id,
    area_name: v.areaName,
    sector_name: v.sectorName.trim(),
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
    country,
    province: v.province,
    start_locality: v.startLocality,
    protection: f.protection ? v.protection : null,
    pitches: f.pitches ? intOrNull(v.pitches) : null,
    length_m: f.pitches ? intOrNull(v.length) : null,
    alpine_grade: f.alpineGrade ? v.alpineGrade : '',
    grade_obligatory: f.pitches ? v.gradeObligatory : '',
    aid: f.pitches ? v.aid : '',
  };
}
