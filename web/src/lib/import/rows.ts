/*
 * Applies a column mapping to a table: every row becomes a spot (merged with
 * the same spot from other rows) and one visit per repeat group. Columns
 * with no field of their own, and fields the spot's activity has no use
 * for, end up as "Header: value" lines in the visit notes.
 */
import { tr } from '../../i18n';
import { ACTIVITIES } from '../labels';
import type { Activity, Visibility } from '../types';
import type { AlpineLogBackup, Cell, RawTable } from './parse';
import type { SheetMapping } from './automap';
import { normalizeHeader, type FieldId } from './fields';
import {
  cleanGrade, isBlank, parseActivity, parseAscentList, parseCoordinates, parseDate, parseInteger, parseLink,
  parseNumber, parsePartners,
} from './transforms';

export type DraftAscent = { name: string; grade: string; comment: string; sector: string };

export type DraftVisit = {
  date: string | null;
  partners: string[];
  ascents: DraftAscent[];
  summary: string;
  conditions: string;
  approach: string;
  descent: string;
  duration_hours: number | null;
  visibility?: Visibility;
  /** "Falesie, row 3" */
  source: string;
};

export type DraftSpot = {
  key: string;
  name: string;
  activity: Activity;
  area: string;
  grade: string;
  rock: string;
  elevation_gain: number | null;
  max_altitude: number | null;
  distance_km: number | null;
  description: string;
  locality: string;
  region: string;
  country: string;
  lat: number | null;
  lng: number | null;
  links: { title: string; url: string }[];
  visits: DraftVisit[];
};

export type SkippedRow = { source: string; reason: string };

const text = (c: Cell | undefined) => (c == null || isBlank(c.v) ? '' : String(c.v).trim().replace(/\s+/g, ' '));
const keyPart = (s: string) => normalizeHeader(s);
export const spotKey = (s: Pick<DraftSpot, 'activity' | 'area' | 'name'>) =>
  `${s.activity}|${keyPart(s.area)}|${keyPart(s.name)}`;

function emptySpot(name: string, activity: Activity): DraftSpot {
  return {
    key: '', name, activity, area: '', grade: '', rock: '', elevation_gain: null, max_altitude: null, distance_km: null,
    description: '', locality: '', region: '', country: '', lat: null, lng: null, links: [], visits: [],
  };
}

const emptyVisit = (source: string): DraftVisit => ({
  date: null, partners: [], ascents: [], summary: '', conditions: '', approach: '', descent: '', duration_hours: null, source,
});

/** A visit with nothing in it (repeat-group columns left blank) is not a visit. */
const hasContent = (v: DraftVisit) => !!(v.date || v.partners.length || v.ascents.length || v.summary || v.conditions);

/** Merges spots with the same key, keeping the first non-empty value of each detail. */
export function mergeSpots(spots: DraftSpot[]): DraftSpot[] {
  const byKey = new Map<string, DraftSpot>();
  for (const s of spots) {
    const prev = byKey.get(s.key);
    if (!prev) { byKey.set(s.key, { ...s, links: [...s.links], visits: [...s.visits] }); continue; }
    for (const k of ['grade', 'rock', 'description', 'locality', 'region', 'country'] as const) prev[k] ||= s[k];
    for (const k of ['elevation_gain', 'max_altitude', 'distance_km', 'lat', 'lng'] as const) prev[k] ??= s[k];
    for (const l of s.links) if (!prev.links.some(x => x.url === l.url)) prev.links.push(l);
    // One route per row: rows of the same day at the same spot are one visit.
    for (const v of s.visits) {
      const same = v.date && prev.visits.find(x => x.date === v.date);
      if (same) {
        same.ascents.push(...v.ascents);
        for (const p of v.partners) if (!same.partners.includes(p)) same.partners.push(p);
        if (v.summary && !same.summary.includes(v.summary)) same.summary = [same.summary, v.summary].filter(Boolean).join('\n');
      } else {
        prev.visits.push(v);
      }
    }
  }
  return [...byKey.values()];
}

export function applyMapping(table: RawTable, m: SheetMapping): { spots: DraftSpot[]; skipped: SkippedRow[] } {
  const spots: DraftSpot[] = [];
  const skipped: SkippedRow[] = [];
  const groups = [...new Set(m.columns.map(c => c.group))].sort();
  const colsOf = (f: FieldId, group = 0) => m.columns.flatMap((c, i) => (c.field === f && c.group === group ? [i] : []));
  const first = (row: Cell[], f: FieldId, group = 0) => {
    const i = colsOf(f, group)[0];
    return i == null ? undefined : row[i];
  };

  table.rows.forEach((row, r) => {
    const source = `${table.name}, row ${r + 2}`;
    const name = text(first(row, 'spot.name'));
    if (!name) {
      if (row.some(c => !isBlank(c.v))) skipped.push({ source, reason: tr().import.reasons.noSpotName });
      return;
    }
    const activity = parseActivity(first(row, 'spot.activity')?.v) ?? m.activity;
    if (!activity) { skipped.push({ source, reason: tr().import.reasons.noActivity }); return; }
    const f = ACTIVITIES[activity];

    const spot = emptySpot(name, activity);
    spot.area = text(first(row, 'area.name'));
    spot.grade = cleanGrade(first(row, 'spot.grade')?.v);
    spot.rock = f.rock ? text(first(row, 'spot.rock')) : '';
    spot.elevation_gain = f.altitude ? parseInteger(first(row, 'spot.elevation_gain')?.v) : null;
    spot.max_altitude = f.altitude ? parseInteger(first(row, 'spot.max_altitude')?.v) : null;
    spot.distance_km = f.distance ? parseNumber(first(row, 'spot.distance_km')?.v) : null;
    spot.description = text(first(row, 'spot.description'));
    spot.locality = text(first(row, 'place.locality'));
    spot.region = text(first(row, 'place.region'));
    spot.country = text(first(row, 'place.country'));
    const lat = parseNumber(first(row, 'lat')?.v);
    const lng = parseNumber(first(row, 'lng')?.v);
    const pair = parseCoordinates(text(first(row, 'coords')));
    if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { spot.lat = lat; spot.lng = lng; }
    else if (pair) { spot.lat = pair.lat; spot.lng = pair.lng; }
    for (const i of colsOf('link')) {
      const l = parseLink(row[i]?.v, row[i]?.link);
      if (l) spot.links.push(l);
    }
    spot.key = spotKey(spot);

    // Notes: unmapped columns, and spot details this activity doesn't keep.
    const notes: string[] = [];
    const unused: FieldId[] = [
      ...(!f.rock ? ['spot.rock' as const] : []),
      ...(!f.altitude ? ['spot.elevation_gain' as const, 'spot.max_altitude' as const] : []),
      ...(!f.distance ? ['spot.distance_km' as const] : []),
      ...(!f.sectors ? ['sector' as const] : []),
    ];
    m.columns.forEach((c, i) => {
      if (c.group === 0 && (c.field === 'note' || unused.includes(c.field)) && text(row[i])) {
        notes.push(`${table.headers[i]}: ${text(row[i])}`);
      }
    });

    for (const g of groups) {
      const v = emptyVisit(source);
      v.date = parseDate(first(row, 'visit.date', g)?.v, m.dateOrder);
      const rawDate = text(first(row, 'visit.date', g));
      v.partners = parsePartners(first(row, 'visit.partners', g)?.v);
      // A later visit without its own sector column climbed in the row's sector.
      const sector = f.sectors ? text(first(row, 'sector', g)) || text(first(row, 'sector')) : '';
      if (f.routes) {
        v.ascents = parseAscentList(first(row, 'visit.ascents', g)?.v).map(a => ({ ...a, sector }));
        const routeName = text(first(row, 'ascent.name', g));
        const routeGrade = cleanGrade(first(row, 'ascent.grade', g)?.v);
        if (routeName || routeGrade) {
          v.ascents.push({ name: routeName, grade: routeGrade, comment: text(first(row, 'ascent.comment', g)), sector });
        }
      }
      v.summary = [text(first(row, 'visit.summary', g)), ...(g === 0 ? notes : [])].filter(Boolean).join('\n');
      if (rawDate && !v.date) v.summary = [v.summary, `Date: ${rawDate}`].filter(Boolean).join('\n');
      if (f.conditions) {
        v.conditions = text(first(row, 'visit.conditions', g));
        v.duration_hours = parseNumber(first(row, 'visit.duration_hours', g)?.v);
      }
      if (f.approach) {
        v.approach = text(first(row, 'visit.approach', g));
        v.descent = text(first(row, 'visit.descent', g));
      }
      // The first group always counts (a spot listed with no date is still a visit);
      // further groups only when filled in.
      if (g === 0 || hasContent(v)) spot.visits.push(v);
    }
    spots.push(spot);
  });
  return { spots: mergeSpots(spots), skipped };
}

/** Our own JSON backup needs no mapping. */
export function fromBackup(data: AlpineLogBackup): { spots: DraftSpot[]; skipped: SkippedRow[] } {
  const skipped: SkippedRow[] = [];
  const spots: DraftSpot[] = [];
  data.visits.forEach((v, i) => {
    const source = `visit ${i + 1}`;
    const activity = v.spot && parseActivity(v.spot.activity);
    if (!v.spot || !activity) { skipped.push({ source, reason: tr().import.reasons.noSpot }); return; }
    const spot = emptySpot(v.spot.name, activity);
    Object.assign(spot, {
      area: v.spot.area ?? '', grade: v.spot.grade ?? '', rock: v.spot.rock ?? '',
      elevation_gain: v.spot.elevation_gain ?? null, max_altitude: v.spot.max_altitude ?? null,
      distance_km: v.spot.distance_km ?? null, lat: v.spot.pin?.lat ?? null, lng: v.spot.pin?.lng ?? null,
    });
    spot.key = spotKey(spot);
    spot.visits.push({
      date: v.date, partners: v.with ?? [], summary: v.summary ?? '', conditions: v.conditions ?? '',
      approach: v.approach ?? '', descent: v.descent ?? '', duration_hours: v.duration_hours ?? null,
      visibility: v.visibility === 'public' ? 'public' : 'private',
      ascents: (v.routes ?? []).map(a => ({ name: a.name ?? '', grade: a.grade ?? '', comment: a.comment ?? '', sector: a.sector ?? '' })),
      source,
    });
    spots.push(spot);
  });
  return { spots: mergeSpots(spots), skipped };
}

