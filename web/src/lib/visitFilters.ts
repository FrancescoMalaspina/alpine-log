import { foldName } from './names';
import type { VisitFilters, VisitSummary } from './types';

/** How many filters are set behind the Filters button (the search and the activity chips are in sight). */
export const countVisitFilters = (f: VisitFilters) =>
  (f.partnerId ? 1 : 0) + (f.areaId ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0) + (f.minGradeRank != null ? 1 : 0);

/**
 * The visits of a logbook that match its filters. One person's visits are few,
 * so this runs in the browser; the search ignores accents and case.
 */
export function filterVisits(visits: VisitSummary[], f: VisitFilters): VisitSummary[] {
  const q = foldName(f.search);
  return visits.filter(v =>
    (!q || foldName(v.search_text).includes(q))
    && (!f.partnerId || v.partner_ids.includes(f.partnerId))
    && (!f.areaId || v.area_id === f.areaId)
    && (!f.from || (!!v.date && v.date >= f.from))
    && (!f.to || (!!v.date && v.date <= f.to))
    && (f.minGradeRank == null || (v.max_grade_rank ?? -Infinity) >= f.minGradeRank)
    && (!f.activity || v.place_activity === f.activity));
}
