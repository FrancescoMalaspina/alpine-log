import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

export type PlaceType = 'crag' | 'multipitch' | 'alpine' | 'ice' | 'ski';
export type Exposition = 'Nord' | 'Sud' | 'Est' | 'Ovest';
export type Visibility = 'private' | 'public';

export const PLACE_TYPES: PlaceType[] = ['crag', 'multipitch', 'alpine', 'ice', 'ski'];
export const EXPOSITIONS: Exposition[] = ['Nord', 'Sud', 'Est', 'Ovest'];

export type Sector = Pick<Tables['sectors']['Row'], 'id' | 'name' | 'position'>;

export type Place = Omit<Tables['places']['Row'], 'location' | 'types' | 'exposition'> & {
  types: PlaceType[];
  exposition: Exposition[];
  sectors: Sector[];
  area: { id: number; name: string } | null;
  visit_count: number;
};

export type Area = Omit<Tables['areas']['Row'], 'created_at' | 'updated_at'> & { place_count: number };

export type Attachment = {
  id: number;
  place_id: number | null;
  area_id: number | null;
  created_by: string;
  kind: 'link' | 'gpx' | 'pdf';
  title: string | null;
  url: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  created_at: string;
  username: string | null;
};

/** One row of the visit_overview view (a visit card). */
export type VisitSummary = {
  id: number;
  user_id: string;
  username: string | null;
  place_id: number;
  place_name: string;
  place_types: PlaceType[];
  area_id: number | null;
  area_name: string | null;
  date: string | null;
  summary: string | null;
  conditions: string | null;
  duration_hours: number | null;
  visibility: Visibility;
  ascent_count: number;
  max_grade_rank: number | null;
  grades: string[];
  sector_names: string[];
  partner_ids: number[];
  partner_names: string[];
};

export type Ascent = {
  id: number;
  name: string | null;
  grade: string | null;
  comment: string | null;
  position: number;
  sector: { id: number; name: string } | null;
};

/** A visit with everything needed to show or edit it. */
export type VisitDetail = {
  id: number;
  user_id: string;
  place_id: number;
  date: string | null;
  summary: string | null;
  approach: string | null;
  descent: string | null;
  conditions: string | null;
  duration_hours: number | null;
  visibility: Visibility;
  username: string | null;
  ascents: Ascent[];
  partners: string[];
};

export type Partner = { id: number; name: string };

export type Profile = { id: string; username: string; role: 'user' | 'admin' };

/** Payload of public.save_place (see supabase/migrations). */
export type PlaceInput = {
  id?: number;
  area_name: string;
  name: string;
  types: PlaceType[];
  lat: number;
  lng: number;
  parking_lat: number | null;
  parking_lng: number | null;
  start_lat: number | null;
  start_lng: number | null;
  rock: string;
  exposition: Exposition[];
  description: string;
  grade: string;
  max_altitude: number | null;
  elevation_gain: number | null;
  sectors: { id?: number; name: string }[];
};

/** Payload of public.save_visit. */
export type VisitInput = {
  id?: number;
  place_id: number;
  date: string | null;
  summary: string;
  approach: string;
  descent: string;
  conditions: string;
  duration_hours: number | null;
  visibility: Visibility;
  partners: string[];
  ascents: { name: string; grade: string; sector_id: number | null; comment: string }[];
};

export type VisitScope = 'mine' | 'public' | 'all';

export type PlaceFilters = {
  search: string;
  types: PlaceType[];
  areaId: number | null;
  rock: string;
  exposition: Exposition[];
  near: { lat: number; lng: number; km: number } | null;
};

export type VisitFilters = {
  search: string;
  scope: VisitScope;
  partnerId: number | null;
  areaId: number | null;
  from: string;
  to: string;
  minGradeRank: number | null;
  placeType: PlaceType | '';
};

export const EMPTY_PLACE_FILTERS: PlaceFilters = {
  search: '', types: [], areaId: null, rock: '', exposition: [], near: null,
};
export const EMPTY_VISIT_FILTERS: VisitFilters = {
  search: '', scope: 'all', partnerId: null, areaId: null, from: '', to: '', minGradeRank: null, placeType: '',
};
