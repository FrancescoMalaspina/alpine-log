import { GRADE_OPTIONS } from './grades';
import type { Activity } from './types';

/** Which fields make sense for a spot (and its visits) of each activity. */
type Fields = {
  /** Sectors, and the optional shared route list. */
  sectors: boolean;
  rock: boolean;
  /** Max altitude and elevation gain. */
  altitude: boolean;
  distance: boolean;
  /** Visits: approach and descent notes. */
  approach: boolean;
  /** Visits: conditions and duration. */
  conditions: boolean;
  /** The spot is itself one route: a visit is one go at it. */
  isRoute: boolean;
  /** Visits log the routes climbed. */
  routes: boolean;
};

type ActivityInfo = Fields & {
  label: string;
  /** Pin colour on the map. */
  color: string;
  /** Suggestions for the free-text grade fields. */
  grades: string[];
};

const FRENCH = GRADE_OPTIONS.map(g => g.label);
const FONT = ['4', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '8A'];

export const ACTIVITIES: Record<Activity, ActivityInfo> = {
  crag: {
    label: 'Crag', color: '#4A5560', grades: FRENCH,
    sectors: true, rock: true, altitude: false, distance: false, approach: false, conditions: false, isRoute: false, routes: true,
  },
  multipitch: {
    label: 'Multipitch', color: '#A55A17', grades: FRENCH,
    sectors: false, rock: true, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
  },
  alpine: {
    label: 'Alpinism', color: '#6A4C93',
    grades: ['F', 'PD-', 'PD', 'PD+', 'AD-', 'AD', 'AD+', 'D-', 'D', 'D+', 'TD-', 'TD', 'TD+', 'ED'],
    sectors: false, rock: true, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
  },
  ice: {
    label: 'Ice climbing', color: '#1F7898',
    grades: ['WI2', 'WI3', 'WI3+', 'WI4', 'WI4+', 'WI5', 'WI5+', 'WI6', 'M4', 'M5', 'M6', 'M7'],
    sectors: false, rock: false, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
  },
  dws: {
    label: 'Deep water solo', color: '#2E4FA3', grades: ['S0', 'S1', 'S2', 'S3', ...FRENCH],
    sectors: true, rock: true, altitude: false, distance: false, approach: false, conditions: true, isRoute: false, routes: true,
  },
  indoor: {
    label: 'Indoor climbing', color: '#8C6D1F', grades: [...FRENCH, ...FONT],
    sectors: true, rock: false, altitude: false, distance: false, approach: false, conditions: false, isRoute: false, routes: true,
  },
  ski: {
    label: 'Ski mountaineering', color: '#2F7D5B',
    grades: ['MS', 'MSA', 'BS', 'BSA', 'OS', 'OSA', '1.2', '1.3', '2.1', '2.3', '3.1', '3.3', '4.1', '5.1'],
    sectors: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
  },
  hike: {
    label: 'Hiking', color: '#6E7B22', grades: ['T', 'E', 'EE', 'EEA', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
    sectors: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
  },
  trail: {
    label: 'Trail running', color: '#B03A6E', grades: [],
    sectors: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
  },
};

export const activityLabel = (a: Activity) => ACTIVITIES[a].label;
export const gradeSuggestions = (a: Activity) => ACTIVITIES[a].grades;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const formatHours = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${String(min).padStart(2, '0')}` : `${whole}h`;
};
export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
export const formatKm = (km: number) => `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** "11 Jul 2026" in the reader's locale, from an ISO date (yyyy-mm-dd). */
export const formatDate = (iso: string) => DATE_FORMAT.format(new Date(`${iso}T00:00:00`));
/** Today's date as yyyy-mm-dd in local time (toISOString would give the UTC day). */
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Phones get no autofocus: it opens the keyboard over a full-screen form. */
export const isTouchLayout = () => window.matchMedia('(max-width: 820px)').matches;

/** Google Maps directions to a point (opens the app on phones). */
export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
