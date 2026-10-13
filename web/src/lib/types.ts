import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

/** What a spot is for. A spot has exactly one. */
export type Activity = 'crag' | 'multipitch' | 'alpine' | 'ice' | 'ski' | 'trail' | 'hike' | 'dws' | 'indoor';
export type Exposition = 'Nord' | 'Sud' | 'Est' | 'Ovest';
export type Visibility = 'private' | 'public';
export type Protection = 'bolted' | 'trad' | 'mixed';
export const PROTECTIONS: Protection[] = ['bolted', 'trad', 'mixed'];
/** How a route went: sent (onsight, flash, redpoint), on top rope, or not finished. */
export type AscentStyle = 'onsight' | 'flash' | 'redpoint' | 'toprope' | 'attempt';
export const ASCENT_STYLES: AscentStyle[] = ['onsight', 'flash', 'redpoint', 'toprope', 'attempt'];

export const ACTIVITY_ORDER: Activity[] = ['crag', 'multipitch', 'alpine', 'ice', 'dws', 'indoor', 'ski', 'hike', 'trail'];
export const EXPOSITIONS: Exposition[] = ['Nord', 'Sud', 'Est', 'Ovest'];

/**
 * What groups spots inside an area: a wall (multipitch), a mountain (alpinism),
 * a crag (its walls are the spots). Optional for a spot.
 */
export type Sector = Omit<Tables['sectors']['Row'], 'created_at' | 'updated_at'> & { place_count: number };

/** A spot: one crag wall, route, icefall, trail, gym… (table "places"). Area › Sector › Spot. */
export type Place = Omit<Tables['places']['Row'], 'location' | 'activity' | 'exposition' | 'protection'> & {
  activity: Activity;
  exposition: Exposition[];
  protection: Protection | null;
  area: { id: number; name: string } | null;
  sector: { id: number; name: string } | null;
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
  place_activity: Activity;
  area_id: number | null;
  area_name: string | null;
  sector_id: number | null;
  sector_name: string | null;
  date: string | null;
  summary: string | null;
  conditions: string | null;
  duration_hours: number | null;
  visibility: Visibility;
  ascent_count: number;
  max_grade_rank: number | null;
  grades: string[];
  /** Other spots of the sector where routes were climbed that day. */
  wall_names: string[];
  rating: number | null;
  /** Hardest grade among routes not marked as an attempt. */
  max_sent_grade_rank: number | null;
  partner_ids: number[];
  partner_names: string[];
};

/** A route in a spot's shared list. */
export type Route = {
  id: number;
  place_id: number;
  name: string;
  grade: string | null;
  grade_rank: number | null;
  created_by: string | null;
  /** Ascents of it you can see (yours, public ones, everything for admins). */
  ascent_count: number;
};

export type Ascent = {
  id: number;
  route_id: number | null;
  name: string | null;
  grade: string | null;
  comment: string | null;
  position: number;
  /** Set when the route is on another spot of the visit's sector (another wall of the crag). */
  place: { id: number; name: string } | null;
  style: AscentStyle | null;
  /** Overrides the spot's pitches (pitches linked together…). */
  pitches: number | null;
  /** Overrides the spot's aid. */
  aid: string | null;
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
  rating: number | null;
  username: string | null;
  ascents: Ascent[];
  /** People in your rope. */
  partners: string[];
  /** People in other ropes of the same group. */
  other_partners: string[];
};

export type Partner = { id: number; name: string };

export const TIP_TOPICS = ['conditions', 'gear', 'parking', 'approach', 'descent', 'other'] as const;
export type TipTopic = typeof TIP_TOPICS[number];

/** A dated tip under a spot, or under a whole sector (then shown on each of its spots). */
export type Tip = {
  id: number;
  place_id: number | null;
  sector_id: number | null;
  user_id: string;
  username: string | null;
  body: string;
  topic: TipTopic | null;
  observed_on: string | null;
  created_at: string;
  updated_at: string;
};
export type TipInput = { body: string; topic: TipTopic | null; observed_on: string | null };

export type Profile = { id: string; username: string; role: 'user' | 'admin'; language: 'en' | 'it' | null };

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;
export type Season = typeof SEASONS[number];

/** A place on someone's wishlist (public.wishlist). Done once a visit resolves it. */
export type Wish = {
  id: number;
  user_id: string;
  place_id: number;
  priority: 1 | 2 | 3;
  seasons: Season[];
  with_people: string[];
  notes: string | null;
  visibility: Visibility;
  done_at: string | null;
  done_visit_id: number | null;
  created_at: string;
  /** Date of the visit that resolved it, when that visit still exists. */
  done_visit: { date: string | null } | null;
};

export type WishInput = Pick<Wish, 'place_id' | 'priority' | 'seasons' | 'with_people' | 'notes' | 'visibility'> & { id?: number };

/** Payload of public.save_place (see supabase/migrations). */
export type PlaceInput = {
  id?: number;
  area_name: string;
  /** Found (any case) or created in the spot's area; empty for none. */
  sector_name: string;
  name: string;
  activity: Activity;
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
  distance_km: number | null;
  country: string;
  province: string;
  start_locality: string;
  protection: Protection | null;
  pitches: number | null;
  length_m: number | null;
  alpine_grade: string;
  grade_obligatory: string;
  aid: string;
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
  rating: number | null;
  partners: string[];
  other_partners: string[];
  /** Add the visit's route names to the spot's shared route list. */
  add_routes: boolean;
  /** place_id: another spot of the same sector, when the route was climbed there. */
  ascents: {
    name: string; grade: string; place_id: number | null; route_id: number | null; comment: string;
    style: AscentStyle | null; pitches: number | null; aid: string;
  }[];
};

export type VisitScope = 'mine' | 'public' | 'all';

export type PlaceFilters = {
  search: string;
  activities: Activity[];
  areaId: number | null;
  rock: string;
  exposition: Exposition[];
  near: { lat: number; lng: number; km: number } | null;
  protection: Protection[];
  /** Only routes whose mandatory grade is at most this rank. */
  maxObligatoryRank: number | null;
  country: string;
  /** Only places on your open wishlist (filtered in the browser). */
  wishlist: boolean;
};

export type VisitFilters = {
  search: string;
  scope: VisitScope;
  partnerId: number | null;
  areaId: number | null;
  from: string;
  to: string;
  minGradeRank: number | null;
  activity: Activity | '';
};

export const EMPTY_PLACE_FILTERS: PlaceFilters = {
  search: '', activities: [], areaId: null, rock: '', exposition: [], near: null, protection: [], maxObligatoryRank: null, country: '', wishlist: false,
};
export const EMPTY_VISIT_FILTERS: VisitFilters = {
  search: '', scope: 'all', partnerId: null, areaId: null, from: '', to: '', minGradeRank: null, activity: '',
};
