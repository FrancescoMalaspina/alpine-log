import { tr } from '../../i18n';
import { ACTIVITIES, localToday } from '../../lib/labels';
import type { Activity, AscentStyle, Place, Visibility, VisitDetail, VisitInput } from '../../lib/types';

/**
 * A route row. `wallId` is another spot of the visit's sector the route was
 * climbed on (another wall of the crag), or '' for the visit's own spot.
 */
export type AscentRow = {
  key: number; name: string; grade: string; wallId: string; comment: string;
  style: AscentStyle | null;
  /** Override the spot's values for this climb (empty: as the spot says). */
  pitches: string; aid: string;
};

export type VisitValues = {
  date: string;
  visibility: Visibility;
  withPeople: string[];
  /** People in other ropes of the same group. */
  otherPeople: string[];
  rating: number | null;
  summary: string;
  approach: string;
  descent: string;
  conditions: string;
  duration: string;
  ascents: AscentRow[];
  /** Add new route names to the spot's shared list. */
  addRoutes: boolean;
};

let nextKey = 1;
export const ascentRow = (): AscentRow => ({
  key: nextKey++, name: '', grade: '', wallId: '', comment: '', style: null, pitches: '', aid: '',
});

/**
 * Empty or existing visit values. For a new visit at a spot that is itself a
 * route (multipitch, alpine, ice), the first route row is that route.
 */
export function visitValuesFrom(visit?: VisitDetail, spot?: Pick<Place, 'name' | 'grade' | 'activity'>): VisitValues {
  const first = ascentRow();
  if (!visit && spot && ACTIVITIES[spot.activity].isRoute) {
    first.name = spot.name;
    first.grade = spot.grade ?? '';
  }
  return {
    date: visit ? visit.date ?? '' : localToday(),
    visibility: visit?.visibility ?? 'private',
    withPeople: visit?.partners ?? [],
    otherPeople: visit?.other_partners ?? [],
    rating: visit?.rating ?? null,
    summary: visit?.summary ?? '',
    approach: visit?.approach ?? '',
    descent: visit?.descent ?? '',
    conditions: visit?.conditions ?? '',
    duration: visit?.duration_hours?.toString() ?? '',
    ascents: visit?.ascents.length
      ? visit.ascents.map(a => ({
        key: nextKey++, name: a.name ?? '', grade: a.grade ?? '', comment: a.comment ?? '',
        wallId: a.place ? String(a.place.id) : '',
        style: a.style, pitches: a.pitches?.toString() ?? '', aid: a.aid ?? '',
      }))
      : [first],
    addRoutes: false,
  };
}

const filledAscents = (v: VisitValues) =>
  v.ascents.filter(a => a.name.trim() || a.grade.trim() || a.comment.trim() || a.wallId || a.style || a.pitches.trim() || a.aid.trim());

/** A message if the visit has nothing in it yet, otherwise null. */
export function visitProblem(v: VisitValues): string | null {
  return !v.date && !v.summary.trim() && !v.withPeople.length && !v.otherPeople.length && !v.rating && !filledAscents(v).length
    ? tr().spot.visitForm.empty
    : null;
}

/** The spot a visit is saved at: its route, when the spot is itself a route. */
export type VisitSpot = { id: number; name: string; grade: string | null; activity: Activity };

/**
 * The routes to save. At a spot that is itself a route (multipitch, alpine,
 * ice), a visit is a go at that route: rows without a name get the spot's
 * name, and a visit with no rows gets one, so it always counts as a route.
 */
function routesFor(v: VisitValues, spot: VisitSpot) {
  const f = ACTIVITIES[spot.activity];
  if (!f.routes) return [];
  const rows = filledAscents(v);
  if (!f.isRoute) return rows;
  if (!rows.length) return [{ ...ascentRow(), name: spot.name, grade: spot.grade ?? '' }];
  return rows.map(a => (a.name.trim() ? a : { ...a, name: spot.name, grade: a.grade || spot.grade || '' }));
}

/** The save_visit payload. */
export function buildVisitInput(v: VisitValues, spot: VisitSpot, id?: number): VisitInput {
  const f = ACTIVITIES[spot.activity];
  const placeId = spot.id;
  return {
    id,
    place_id: placeId,
    date: v.date || null,
    summary: v.summary,
    approach: f.approach ? v.approach : '',
    descent: f.approach ? v.descent : '',
    conditions: f.conditions ? v.conditions : '',
    duration_hours: f.conditions && v.duration.trim() ? Number(v.duration) : null,
    visibility: v.visibility,
    rating: v.rating,
    partners: v.withPeople,
    other_partners: v.otherPeople,
    add_routes: f.routeList && v.addRoutes,
    ascents: routesFor(v, spot).map(a => ({
      name: a.name, grade: a.grade, comment: a.comment, route_id: null,
      place_id: a.wallId ? Number(a.wallId) : null,
      style: a.style,
      pitches: f.pitches && a.pitches.trim() ? Math.round(Number(a.pitches)) : null,
      aid: f.pitches ? a.aid : '',
    })),
  };
}
