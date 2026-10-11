import { isRouteLike, localToday } from '../../lib/labels';
import type { PlaceType, Visibility, VisitDetail, VisitInput } from '../../lib/types';

/**
 * A route row. `sectorKey` is a sector id for an existing place, or
 * "name:<sector name>" for a place that is being created in the same save.
 */
export type AscentRow = { key: number; name: string; grade: string; sectorKey: string; comment: string };

export type VisitValues = {
  date: string;
  visibility: Visibility;
  withPeople: string[];
  summary: string;
  approach: string;
  descent: string;
  conditions: string;
  duration: string;
  ascents: AscentRow[];
};

let nextKey = 1;
export const ascentRow = (): AscentRow => ({ key: nextKey++, name: '', grade: '', sectorKey: '', comment: '' });

export function visitValuesFrom(visit?: VisitDetail): VisitValues {
  return {
    date: visit ? visit.date ?? '' : localToday(),
    visibility: visit?.visibility ?? 'private',
    withPeople: visit?.partners ?? [],
    summary: visit?.summary ?? '',
    approach: visit?.approach ?? '',
    descent: visit?.descent ?? '',
    conditions: visit?.conditions ?? '',
    duration: visit?.duration_hours?.toString() ?? '',
    ascents: visit?.ascents.length
      ? visit.ascents.map(a => ({
        key: nextKey++, name: a.name ?? '', grade: a.grade ?? '', comment: a.comment ?? '',
        sectorKey: a.sector ? String(a.sector.id) : '',
      }))
      : [ascentRow()],
  };
}

const filledAscents = (v: VisitValues) =>
  v.ascents.filter(a => a.name.trim() || a.grade.trim() || a.comment.trim() || a.sectorKey);

/** A message if the visit has nothing in it yet, otherwise null. */
export function visitProblem(v: VisitValues): string | null {
  return !v.date && !v.summary.trim() && !v.withPeople.length && !filledAscents(v).length
    ? 'Fill in at least a date, who you were with, or a route.'
    : null;
}

/** The save_visit payload. `sectorId` resolves a row's sectorKey to a real sector id. */
export function buildVisitInput(
  v: VisitValues, placeId: number, types: PlaceType[], sectorId: (key: string) => number | null, id?: number,
): VisitInput {
  const routeLike = isRouteLike(types);
  return {
    id,
    place_id: placeId,
    date: v.date || null,
    summary: v.summary,
    approach: routeLike ? v.approach : '',
    descent: routeLike ? v.descent : '',
    conditions: routeLike ? v.conditions : '',
    duration_hours: routeLike && v.duration.trim() ? Number(v.duration) : null,
    visibility: v.visibility,
    partners: v.withPeople,
    ascents: filledAscents(v).map(a => ({
      name: a.name, grade: a.grade, comment: a.comment, sector_id: a.sectorKey ? sectorId(a.sectorKey) : null,
    })),
  };
}
