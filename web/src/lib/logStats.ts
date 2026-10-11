import { gradeRank } from './grades';
import { ACTIVITIES, primaryType } from './labels';
import { PLACE_TYPES, type PlaceType, type VisitSummary } from './types';

export type Tally = { days: number; routes: number };
export type ActivityTally = Tally & { type: PlaceType; hardest: string | null };
export type LogStats = {
  totals: Tally & { places: number; areas: number; first: string | null; last: string | null };
  byActivity: ActivityTally[];
  byYear: (Tally & { year: string })[];
};

/**
 * How hard a grade is within an activity. Climbing grades (French, UIAA) use
 * the shared rank; alpine, ice and ski grades use the order of their scale.
 */
function difficulty(type: PlaceType, grade: string): number | null {
  if (type === 'crag' || type === 'multipitch') return gradeRank(grade);
  const i = ACTIVITIES[type].grades.findIndex(g => g.toUpperCase() === grade.trim().toUpperCase());
  return i === -1 ? null : i;
}

/** A "day" is one visit; a visit counts toward the most specific activity of its place. */
export function computeStats(visits: VisitSummary[]): LogStats {
  const dates = visits.map(v => v.date).filter((d): d is string => !!d).sort();
  const acts = new Map<PlaceType, ActivityTally & { best: number }>();
  const years = new Map<string, Tally>();

  for (const v of visits) {
    const type = primaryType(v.place_types);
    const a = acts.get(type) ?? { type, days: 0, routes: 0, hardest: null, best: -Infinity };
    a.days += 1;
    a.routes += v.ascent_count;
    for (const g of v.grades) {
      const d = difficulty(type, g);
      if (d != null && d > a.best) { a.best = d; a.hardest = g; }
    }
    acts.set(type, a);

    const year = v.date?.slice(0, 4) ?? 'No date';
    const y = years.get(year) ?? { days: 0, routes: 0 };
    y.days += 1;
    y.routes += v.ascent_count;
    years.set(year, y);
  }

  return {
    totals: {
      days: visits.length,
      routes: visits.reduce((n, v) => n + v.ascent_count, 0),
      places: new Set(visits.map(v => v.place_id)).size,
      areas: new Set(visits.map(v => v.area_id).filter(a => a != null)).size,
      first: dates[0] ?? null,
      last: dates[dates.length - 1] ?? null,
    },
    byActivity: PLACE_TYPES.filter(t => acts.has(t)).map(t => {
      const { best: _best, ...tally } = acts.get(t)!;
      return tally;
    }),
    byYear: [...years.entries()]
      .sort(([a], [b]) => (a === 'No date' ? 1 : b === 'No date' ? -1 : b.localeCompare(a)))
      .map(([year, t]) => ({ year, ...t })),
  };
}
