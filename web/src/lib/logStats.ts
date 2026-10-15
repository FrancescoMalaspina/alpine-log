import { gradeRank } from './grades';
import { ACTIVITIES } from './labels';
import { ACTIVITY_ORDER, type Activity, type VisitSummary } from './types';

/** km and gain: what the visits' tracks add up to. */
export type Tally = { days: number; routes: number; pitches: number; km: number; gain: number };
/** hardestSent: the hardest climbing grade not marked as an attempt. */
export type ActivityTally = Tally & { type: Activity; hardest: string | null; hardestSent: string | null };
export type LogStats = {
  totals: Tally & { places: number; areas: number; first: string | null; last: string | null };
  byActivity: ActivityTally[];
  byYear: (Tally & { year: string })[];
};

const CLIMBING: Activity[] = ['crag', 'boulder', 'multipitch', 'dws', 'indoor'];

/**
 * How hard a grade is within an activity. Climbing grades (French, UIAA,
 * Font) use the shared rank; other scales use the order of their list.
 */
function difficulty(type: Activity, grade: string): number | null {
  if (CLIMBING.includes(type)) return gradeRank(grade);
  const i = ACTIVITIES[type].grades.findIndex(g => g.toUpperCase() === grade.trim().toUpperCase());
  return i === -1 ? null : i;
}

const emptyTally = (): Tally => ({ days: 0, routes: 0, pitches: 0, km: 0, gain: 0 });

/** Counts one visit into a tally. */
function add(t: Tally, v: VisitSummary) {
  t.days += 1;
  t.routes += v.ascent_count;
  t.pitches += v.pitches_climbed;
  t.km += v.track_distance_km ?? 0;
  t.gain += v.track_gain_m ?? 0;
}

/** A "day" is one visit, counted toward its spot's activity. */
export function computeStats(visits: VisitSummary[]): LogStats {
  const dates = visits.map(v => v.date).filter((d): d is string => !!d).sort();
  const acts = new Map<Activity, ActivityTally & { best: number; bestSent: number }>();
  const years = new Map<string, Tally>();
  const totals = emptyTally();

  for (const v of visits) {
    add(totals, v);
    const type = v.place_activity;
    const a = acts.get(type)
      ?? { type, ...emptyTally(), hardest: null, hardestSent: null, best: -Infinity, bestSent: -Infinity };
    add(a, v);
    for (const g of v.grades) {
      const d = difficulty(type, g);
      if (d != null && d > a.best) { a.best = d; a.hardest = g; }
    }
    const sent = v.max_sent_grade_rank;
    if (CLIMBING.includes(type) && sent != null && sent > a.bestSent) {
      a.bestSent = sent;
      a.hardestSent = v.grades.find(g => gradeRank(g) === sent) ?? a.hardestSent;
    }
    acts.set(type, a);

    const year = v.date?.slice(0, 4) ?? 'No date';
    const y = years.get(year) ?? emptyTally();
    add(y, v);
    years.set(year, y);
  }

  return {
    totals: {
      ...totals,
      places: new Set(visits.map(v => v.place_id)).size,
      areas: new Set(visits.map(v => v.area_id).filter(a => a != null)).size,
      first: dates[0] ?? null,
      last: dates[dates.length - 1] ?? null,
    },
    byActivity: ACTIVITY_ORDER.filter(t => acts.has(t)).map(t => {
      const { best: _best, bestSent: _bestSent, ...tally } = acts.get(t)!;
      return tally;
    }),
    byYear: [...years.entries()]
      .sort(([a], [b]) => (a === 'No date' ? 1 : b === 'No date' ? -1 : b.localeCompare(a)))
      .map(([year, t]) => ({ year, ...t })),
  };
}
