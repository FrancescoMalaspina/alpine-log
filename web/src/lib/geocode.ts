/*
 * Location search with Photon (https://photon.komoot.io), a free geocoder
 * built on OpenStreetMap that, unlike Nominatim's public API, allows
 * search-as-you-type. Results are biased toward the current map centre.
 */
import { tr } from '../i18n';
import type { LatLng } from './coords';
import { provinceCode } from './provinces';

export type Location = {
  id: string;
  name: string;
  /** "peak, Lombardia, Italia" */
  detail: string;
  lat: number;
  lng: number;
  /** [west, north, east, south] for areas such as towns and parks. */
  extent?: [number, number, number, number];
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string; osm_id?: number; osm_value?: string;
    name?: string; street?: string; city?: string; county?: string; state?: string; country?: string; countrycode?: string;
    extent?: [number, number, number, number];
  };
};

const KIND: Record<string, string> = {
  peak: 'peak', alpine_hut: 'hut', wilderness_hut: 'hut', saddle: 'pass', glacier: 'glacier',
  village: 'village', hamlet: 'hamlet', town: 'town', city: 'city', parking: 'parking', cliff: 'cliff',
};

export async function searchLocations(query: string, near: LatLng, signal?: AbortSignal): Promise<Location[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lat', near.lat.toFixed(3));
  url.searchParams.set('lon', near.lng.toFixed(3));
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(tr().common.errors.locationSearch(res.status));
  const data: { features: PhotonFeature[] } = await res.json();

  const seen = new Set<string>();
  return data.features.flatMap(f => {
    const p = f.properties;
    const name = p.name ?? p.street;
    if (!name) return [];
    const [lng, lat] = f.geometry.coordinates;
    const kind = p.osm_value ? KIND[p.osm_value] : undefined;
    const detail = [kind, p.city !== name ? p.city : null, p.state, p.country].filter(Boolean).join(', ');
    const key = `${name}|${detail}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: `${p.osm_type}${p.osm_id}`, name, detail, lat, lng, extent: p.extent }];
  });
}

/**
 * Country (ISO code) and province of a point, for a new spot's details:
 * "IT" + "LC", or "FR" + "Hautes-Alpes". Italian provinces use their code;
 * Valle d'Aosta has no county in OpenStreetMap, so its region is used.
 */
export async function reverseGeocode(at: LatLng, signal?: AbortSignal): Promise<{ country: string | null; province: string | null }> {
  const url = new URL('https://photon.komoot.io/reverse');
  url.searchParams.set('lat', at.lat.toFixed(5));
  url.searchParams.set('lon', at.lng.toFixed(5));
  url.searchParams.set('limit', '1');
  // Local names ("Valle d'Aosta", "Torino"), whatever the browser's language: they map to province codes.
  url.searchParams.set('lang', 'default');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(tr().common.errors.locationSearch(res.status));
  const data: { features: PhotonFeature[] } = await res.json();
  const p = data.features[0]?.properties;
  const country = p?.countrycode?.toUpperCase() ?? null;
  return { country, province: provinceCode(country, p?.county ?? p?.state ?? null) };
}
