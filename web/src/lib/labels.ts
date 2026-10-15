import { locale, tr } from '../i18n';
import { GRADE_OPTIONS } from './grades';
import type { Activity, AscentStyle, Protection } from './types';

/** Which fields make sense for a spot (and its visits) of each activity. */
type Fields = {
  /** The spot keeps a shared list of its single routes (a crag wall, a gym). */
  routeList: boolean;
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
  /** A route of several pitches: pitches, climbing length, mandatory grade, aid. */
  pitches: boolean;
  /** Bolted, trad or mixed. */
  protection: boolean;
  /** An overall alpine grade (F … ED) besides the technical one. */
  alpineGrade: boolean;
};

type ActivityInfo = Fields & {
  /** Pin colour on the map. */
  color: string;
  /** Suggestions for the free-text grade fields. */
  grades: string[];
};

const FRENCH = GRADE_OPTIONS.map(g => g.label);
const FONT = ['4', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B'];

export const ACTIVITIES: Record<Activity, ActivityInfo> = {
  crag: {
    color: '#4A5560', grades: FRENCH,
    routeList: true, rock: true, altitude: false, distance: false, approach: false, conditions: false, isRoute: false, routes: true,
    pitches: false, protection: true, alpineGrade: false,
  },
  boulder: {
    color: '#7D2E46', grades: FONT,
    routeList: true, rock: true, altitude: false, distance: false, approach: false, conditions: false, isRoute: false, routes: true,
    pitches: false, protection: false, alpineGrade: false,
  },
  multipitch: {
    color: '#A55A17', grades: FRENCH,
    routeList: false, rock: true, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
    pitches: true, protection: true, alpineGrade: true,
  },
  alpine: {
    color: '#6A4C93',
    grades: ['F', 'PD-', 'PD', 'PD+', 'AD-', 'AD', 'AD+', 'D-', 'D', 'D+', 'TD-', 'TD', 'TD+', 'ED'],
    routeList: false, rock: true, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
    pitches: true, protection: true, alpineGrade: true,
  },
  ice: {
    color: '#1F7898',
    grades: ['WI2', 'WI3', 'WI3+', 'WI4', 'WI4+', 'WI5', 'WI5+', 'WI6', 'M4', 'M5', 'M6', 'M7'],
    routeList: false, rock: false, altitude: true, distance: false, approach: true, conditions: true, isRoute: true, routes: true,
    pitches: true, protection: false, alpineGrade: true,
  },
  dws: {
    color: '#2E4FA3', grades: ['S0', 'S1', 'S2', 'S3', ...FRENCH],
    routeList: true, rock: true, altitude: false, distance: false, approach: false, conditions: true, isRoute: false, routes: true,
    pitches: false, protection: false, alpineGrade: false,
  },
  indoor: {
    color: '#8C6D1F', grades: [...FRENCH, ...FONT],
    routeList: true, rock: false, altitude: false, distance: false, approach: false, conditions: false, isRoute: false, routes: true,
    pitches: false, protection: false, alpineGrade: false,
  },
  ski: {
    color: '#2F7D5B',
    grades: ['MS', 'MSA', 'BS', 'BSA', 'OS', 'OSA', '1.2', '1.3', '2.1', '2.3', '3.1', '3.3', '4.1', '5.1'],
    routeList: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
    pitches: false, protection: false, alpineGrade: false,
  },
  hike: {
    color: '#6E7B22', grades: ['T', 'E', 'EE', 'EEA', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
    routeList: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
    pitches: false, protection: false, alpineGrade: false,
  },
  trail: {
    color: '#B03A6E', grades: [],
    routeList: false, rock: false, altitude: true, distance: true, approach: false, conditions: true, isRoute: true, routes: false,
    pitches: false, protection: false, alpineGrade: false,
  },
};

/** The activity's name in the current language. */
export const activityLabel = (a: Activity) => tr().common.activities[a];

/** "Sasso › Placca Bella", or just the name. */
export const spotTitle = (name: string, sector: string | null | undefined) => (sector ? `${sector} › ${name}` : name);
export const gradeSuggestions = (a: Activity) => ACTIVITIES[a].grades;

/** English-only plural; interface text uses the dictionary's plural functions instead. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const protectionLabel = (p: Protection) => tr().common.protections[p];
export const styleLabel = (st: AscentStyle) => tr().common.styles[st];
/** Alpine grades, for the overall grade of routes and alpine climbs. */
export const ALPINE_GRADES = ['F', 'F+', 'PD-', 'PD', 'PD+', 'AD-', 'AD', 'AD+', 'D-', 'D', 'D+', 'TD-', 'TD', 'TD+', 'ED1', 'ED2', 'ED3'];
export const priorityLabel = (p: 1 | 2 | 3) => tr().common.priorities[p];
export const seasonLabel = (s: 'winter' | 'spring' | 'summer' | 'autumn') => tr().common.seasons[s];

/** Same rule as the profiles.username check constraint. */
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
export const usernameHint = () => tr().common.usernameHint;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const formatHours = (h: number) => {
  const total = Math.round(h * 60);
  const whole = Math.floor(total / 60);
  const min = total % 60;
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
