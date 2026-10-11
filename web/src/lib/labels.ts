import { GRADE_OPTIONS } from './grades';
import type { PlaceType } from './types';

type Activity = {
  label: string;
  /** Pin colour on the map. */
  color: string;
  /** Suggestions for the free-text grade fields. */
  grades: string[];
};

export const ACTIVITIES: Record<PlaceType, Activity> = {
  crag:       { label: 'Crag',               color: '#4A5560', grades: GRADE_OPTIONS.map(g => g.label) },
  multipitch: { label: 'Multipitch',         color: '#A55A17', grades: GRADE_OPTIONS.map(g => g.label) },
  alpine:     { label: 'Alpinism',           color: '#6B4E9B',
                grades: ['F', 'PD-', 'PD', 'PD+', 'AD-', 'AD', 'AD+', 'D-', 'D', 'D+', 'TD-', 'TD', 'TD+', 'ED'] },
  ice:        { label: 'Ice climbing',       color: '#1F7898',
                grades: ['WI2', 'WI3', 'WI3+', 'WI4', 'WI4+', 'WI5', 'WI5+', 'WI6', 'M4', 'M5', 'M6', 'M7'] },
  ski:        { label: 'Ski mountaineering', color: '#2F7D5B',
                grades: ['MS', 'MSA', 'BS', 'BSA', 'OS', 'OSA', '1.2', '1.3', '2.1', '2.3', '3.1', '3.3', '4.1', '5.1'] },
};

/** Most specific activity first: a crag that also has multipitch routes is drawn as multipitch. */
const PRIORITY: PlaceType[] = ['alpine', 'ice', 'ski', 'multipitch', 'crag'];
export const primaryType = (types: PlaceType[]): PlaceType => PRIORITY.find(t => types.includes(t)) ?? 'crag';

export const typeLabel = (t: PlaceType) => ACTIVITIES[t].label;
export const typesLabel = (types: PlaceType[]) => (types.length ? types : ['crag' as const]).map(typeLabel).join(', ');
export const isRouteLike = (types: PlaceType[]) => types.some(t => t !== 'crag');
export const gradeSuggestions = (types: PlaceType[]) =>
  [...new Set((types.length ? types : ['crag' as const]).flatMap(t => ACTIVITIES[t].grades))];

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const formatHours = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${String(min).padStart(2, '0')}` : `${whole}h`;
};
export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
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
