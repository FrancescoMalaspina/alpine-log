import { locale, tr } from '../i18n';
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
  /** Pin colour on the map. */
  color: string;
  /** Suggestions for the free-text grade fields. */
  grades: string[];
};

const FRENCH = GRADE_OPTIONS.map(g => g.label);
const FONT = ['4', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '8A'];

export const ACTIVITIES: Record<Activity, ActivityInfo> = {
  crag: {
    color: '#4A5560', grades: FRENCH,
    sectors: true, rock: true, altitude: false, distance: false, approach: false, conditions: false, isRoute: false, routes: true,
  },
  multipitch: {
    color: '#A55A17', grades: FRENCH,
    sectors: false, rock: true, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
  },
  alpine: {
    color: '#6A4C93',
    grades: ['F', 'PD-', 'PD', 'PD+', 'AD-', 'AD', 'AD+', 'D-', 'D', 'D+', 'TD-', 'TD', 'TD+', 'ED'],
    sectors: false, rock: true, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
  },
  ice: {
    color: '#1F7898',
    grades: ['WI2', 'WI3', 'WI3+', 'WI4', 'WI4+', 'WI5', 'WI5+', 'WI6', 'M4', 'M5', 'M6', 'M7'],
    sectors: false, rock: false, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
  },
  dws: {
    color: '#2E4FA3', grades: ['S0', 'S1', 'S2', 'S3', ...FRENCH],
    sectors: true, rock: true, altitude: false, distance: false, approach: false, conditions: true, isRoute: false, routes: true,
  },
  indoor: {
    color: '#8C6D1F', grades: [...FRENCH, ...FONT],
    sectors: true, rock: false, altitude: false, distance: false, approach: false, conditions: false, isRoute: false, routes: true,
  },
  ski: {
    color: '#2F7D5B',
    grades: ['MS', 'MSA', 'BS', 'BSA', 'OS', 'OSA', '1.2', '1.3', '2.1', '2.3', '3.1', '3.3', '4.1', '5.1'],
    sectors: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
  },
  hike: {
    color: '#6E7B22', grades: ['T', 'E', 'EE', 'EEA', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
    sectors: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
  },
  trail: {
    color: '#B03A6E', grades: [],
    sectors: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
  },
};

/** The activity's name in the current language. */
export const activityLabel = (a: Activity) => tr().common.activities[a];
export const gradeSuggestions = (a: Activity) => ACTIVITIES[a].grades;

/** English-only plural; interface text uses the dictionary's plural functions instead. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const priorityLabel = (p: 1 | 2 | 3) => tr().common.priorities[p];
export const seasonLabel = (s: 'winter' | 'spring' | 'summer' | 'autumn') => tr().common.seasons[s];

/** Same rule as the profiles.username check constraint. */
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
export const usernameHint = () => tr().common.usernameHint;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const formatHours = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${String(min).padStart(2, '0')}` : `${whole}h`;
};
export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
export const formatKm = (km: number) => `${km.toLocaleString(locale(), { maximumFractionDigits: 1 })} km`;

const dateFormats = new Map<string, Intl.DateTimeFormat>();
/** "11 Jul 2026" / "11 lug 2026" in the interface language, from an ISO date (yyyy-mm-dd). */
export function formatDate(iso: string) {
  const loc = locale();
  if (!dateFormats.has(loc)) dateFormats.set(loc, new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }));
  return dateFormats.get(loc)!.format(new Date(`${iso}T00:00:00`));
}

/** "just now", "5 minutes ago", "3 days ago"… for a timestamp in the past. */
export function timeAgo(iso: string, now = Date.now()) {
  const t = tr().common.timeAgo;
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return t.justNow;
  if (minutes < 60) return t.minutes(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? t.hour : t.hours(hours);
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? t.yesterday : t.days(days);
  return formatDate(iso.slice(0, 10));
}
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
