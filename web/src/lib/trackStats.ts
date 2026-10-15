/*
 * A track's stored numbers as short phrases, keeping those that matter for the
 * activity: climbing rate on ski tours and alpine climbs, descent on hikes, pace
 * on trail runs, speed on rides, the walk in at climbing spots.
 */
import { tr } from '../i18n';
import { formatHours, formatKm } from './labels';
import type { Activity, TrackStats } from './types';

type Part = 'distance' | 'up' | 'down' | 'top' | 'moving' | 'rate' | 'pace' | 'speed';

const PARTS: Partial<Record<Activity, Part[]>> = {
  ski: ['distance', 'up', 'top', 'moving', 'rate'],
  alpine: ['distance', 'up', 'top', 'moving', 'rate'],
  hike: ['distance', 'up', 'down', 'top', 'moving'],
  trail: ['distance', 'up', 'moving', 'pace'],
  mtb: ['distance', 'up', 'moving', 'speed'],
};
/** Climbing spots: the track is the approach. */
const APPROACH: Part[] = ['distance', 'up', 'moving'];

/** Below this much uphill time a climbing rate means little. */
const MIN_UPHILL_S = 10 * 60;

/** Minutes and seconds per km, e.g. 6'05". */
const formatPace = (secondsPerKm: number) => {
  const s = Math.round(secondsPerKm);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
};

export function trackStatsParts(s: TrackStats, activity: Activity | undefined): string[] {
  const t = tr().spot.trackStats;
  const part = (p: Part): string | null => {
    switch (p) {
      case 'distance': return formatKm(s.distance_km);
      case 'up': return s.gain_m != null ? t.up(s.gain_m) : null;
      case 'down': return s.loss_m != null ? t.down(s.loss_m) : null;
      case 'top': return s.max_ele_m != null ? t.top(s.max_ele_m) : null;
      case 'moving': return s.moving_s ? t.moving(formatHours(s.moving_s / 3600)) : null;
      case 'rate': return s.gain_m && s.uphill_s != null && s.uphill_s >= MIN_UPHILL_S
        ? t.uphillRate(Math.round(s.gain_m / (s.uphill_s / 3600))) : null;
      case 'speed': return s.moving_s && s.distance_km ? t.speed((s.distance_km / (s.moving_s / 3600)).toFixed(1)) : null;
      case 'pace': return s.moving_s && s.distance_km ? t.pace(formatPace(s.moving_s / s.distance_km)) : null;
    }
  };
  return ((activity && PARTS[activity]) ?? APPROACH).map(part).filter((x): x is string => !!x);
}
