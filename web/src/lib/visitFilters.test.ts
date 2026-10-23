import { describe, expect, it } from 'vitest';
import { countVisitFilters, filterVisits } from './visitFilters';
import { EMPTY_VISIT_FILTERS, type VisitSummary } from './types';

const visit = (v: Partial<VisitSummary>): VisitSummary => ({
  id: 1, user_id: 'u', username: 'marco', place_id: 1, place_name: 'Muro del Butch', place_activity: 'crag',
  area_id: 1, area_name: 'Lecco', sector_id: null, sector_name: null, date: '2024-06-01', summary: null,
  conditions: null, duration_hours: null, visibility: 'public', ascent_count: 0, max_grade_rank: null, grades: [],
  crag_sector_names: [], rating: null, max_sent_grade_rank: null, pitches_climbed: 0, track_distance_km: null,
  track_gain_m: null, partner_ids: [], partner_names: [], search_text: 'muro del butch lecco', outing_id: null, ...v,
});

const visits = [
  visit({ id: 1 }),
  visit({ id: 2, date: '2023-02-10', place_activity: 'ski', area_id: 2, search_text: 'pizzo tre signori valsassina', partner_ids: [7] }),
  visit({ id: 3, date: null, max_grade_rank: 30, search_text: 'falesia di civate spigolo 6b' }),
];
const ids = (f: Partial<typeof EMPTY_VISIT_FILTERS>) => filterVisits(visits, { ...EMPTY_VISIT_FILTERS, ...f }).map(v => v.id);

describe('filterVisits', () => {
  it('keeps everything without filters', () => expect(ids({})).toEqual([1, 2, 3]));

  it('searches ignoring accents and case', () => {
    expect(ids({ search: 'VALSÀSSINA' })).toEqual([2]);
    expect(ids({ search: 'spigolo 6b' })).toEqual([3]);
  });

  it('filters by partner, area and activity', () => {
    expect(ids({ partnerId: 7 })).toEqual([2]);
    expect(ids({ areaId: 1 })).toEqual([1, 3]);
    expect(ids({ activity: 'ski' })).toEqual([2]);
  });

  it('leaves undated visits out of a date range', () => {
    expect(ids({ from: '2024-01-01' })).toEqual([1]);
    expect(ids({ to: '2023-12-31' })).toEqual([2]);
  });

  it('keeps visits at least as hard as the grade', () => expect(ids({ minGradeRank: 20 })).toEqual([3]));
});

describe('countVisitFilters', () => {
  it('counts the filters behind the button, not the search or the activity', () => {
    expect(countVisitFilters({ ...EMPTY_VISIT_FILTERS, search: 'x', activity: 'crag' })).toBe(0);
    expect(countVisitFilters({ ...EMPTY_VISIT_FILTERS, partnerId: 3, from: '2024-01-01' })).toBe(2);
  });
});
