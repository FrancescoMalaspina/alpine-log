import { tr } from '../../i18n';
import { ACTIVITIES, localToday } from '../../lib/labels';
import type { Activity, AscentStyle, InvitePrefill, Place, PrefillPerson, TipTopic, Visibility, VisitDetail, VisitInput } from '../../lib/types';
import { summarize, trackVisit } from '../../lib/tracks';
import type { PlaceValues, TrackDraft } from './placeForm';

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
  /** A new tip for everyone, posted on the spot when the visit is saved. */
  tip: string;
  tipTopic: TipTopic | null;
};

let nextKey = 1;
export const ascentRow = (): AscentRow => ({
  key: nextKey++, name: '', grade: '', wallId: '', comment: '', style: null, pitches: '', aid: '',
});

/**
 * Empty or existing visit values. At a spot that is itself a route
 * (multipitch, alpine, ice), the first row is your climb of that route: it
 * holds only what you'd say differently from the topo, so its name, and a
 * grade equal to the spot's, are left empty (the form shows the topo's as
 * placeholders; saving fills them back in).
 */
export function visitValuesFrom(visit?: VisitDetail, spot?: Pick<Place, 'name' | 'grade' | 'activity'>): VisitValues {
  const isRoute = !!spot && ACTIVITIES[spot.activity].isRoute;
  const same = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const rows: AscentRow[] = (visit?.ascents ?? []).map(a => ({
    key: nextKey++, name: a.name ?? '', grade: a.grade ?? '', comment: a.comment ?? '',
    wallId: a.place ? String(a.place.id) : '',
    style: a.style, pitches: a.pitches?.toString() ?? '', aid: a.aid ?? '',
  }));
  if (isRoute && rows[0] && !rows[0].wallId && same(rows[0].name, spot.name)) {
    rows[0].name = '';
    if (same(rows[0].grade, spot.grade)) rows[0].grade = '';
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
    ascents: rows.length ? rows : [ascentRow()],
    addRoutes: false,
    tip: '',
    tipTopic: null,
  };
}

/**
 * Your visit as an invitation starts it: the day's date, the people (yours
 * by the names you know them by, `nameOf` a registered user), and the
 * inviter's routes when you were in their rope, without how they climbed them.
 */
export function visitPrefillFromInvite(p: InvitePrefill, nameOf: (userId: string) => string): Partial<VisitValues> {
  const names = (people: PrefillPerson[]) =>
    [...new Set(people.map(x => (x.user_id ? nameOf(x.user_id) : x.name ?? '')).filter(Boolean))];
  return {
    date: p.date,
    withPeople: names(p.people.filter(x => x.same_rope)),
    otherPeople: names(p.people.filter(x => !x.same_rope)),
    ...(p.ascents.length ? {
      ascents: p.ascents.map(a => ({
        ...ascentRow(), name: a.name ?? '', grade: a.grade ?? '', wallId: a.place_id ? String(a.place_id) : '',
        pitches: a.pitches?.toString() ?? '', aid: a.aid ?? '',
      })),
    } : {}),
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

/** The date and duration of a visit recorded as a track, if the track has times. */
export function visitFromTrack(track: TrackDraft | null): Partial<VisitValues> | null {
  const summary = track && summarize(track.file.segments);
  const visit = summary && trackVisit(summary);
  return visit ? { date: visit.date, ...(visit.hours ? { duration: String(visit.hours) } : {}) } : null;
}

/** A spot being written in the form, as the topo values a visit's climb overrides. */
export const topoOf = (p: Pick<PlaceValues, 'grade' | 'pitches' | 'aid'>) => ({
  grade: p.grade.trim() || null,
  pitches: p.pitches.trim() ? Number(p.pitches) : null,
  aid: p.aid.trim() || null,
});

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
    tip: v.tip.trim() ? { body: v.tip, topic: v.tipTopic } : null,
  };
}
