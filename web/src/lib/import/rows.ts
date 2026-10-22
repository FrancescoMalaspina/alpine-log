/*
 * Applies a column mapping to a table: every row becomes a spot (merged with
 * the same spot from other rows) and one visit per repeat group. Columns
 * with no field of their own, and fields the spot's activity has no use
 * for, end up as "Header: value" lines in the visit notes.
 */
import { tr } from '../../i18n';
import { ACTIVITIES } from '../labels';
import { isItalianProvinceCode, provinceCode } from '../provinces';
import type { Activity, AscentStyle, Protection, Visibility } from '../types';
import type { AlpineLogBackup, Cell, RawTable } from './parse';
import type { SheetMapping } from './automap';
import { foldName, sameName } from '../names';
import type { FieldId } from './fields';
import {
  cleanGrade, isBlank, parseActivity, parseAscentList, parseCoordinates, parseCountry, parseDate, parseDifficulty,
  parseInteger, parseLink, parseNumber, parsePartners, parseProtection, parseRating, parseStyle,
} from './transforms';

export type DraftAscent = { name: string; grade: string; comment: string; sector: string; style: AscentStyle | null };

export type DraftVisit = {
  date: string | null;
  partners: string[];
  /** People in other ropes of the same group. */
  otherPartners: string[];
  rating: number | null;
  ascents: DraftAscent[];
  summary: string;
  conditions: string;
  approach: string;
  descent: string;
  duration_hours: number | null;
  /** A tip for everyone, posted on the spot with the visit. */
  tip: string;
  visibility?: Visibility;
  /** "Falesie, row 3" */
  source: string;
};

export type DraftSpot = {
  key: string;
  name: string;
  activity: Activity;
  area: string;
  /** Mountain range, kept as the description of a new area. */
  areaDescription: string;
  /** The wall, mountain or crag the spot is part of. */
  sector: string;
  /** "Breithorn - via normale", when the name was split into sector and spot (undo restores it). */
  splitFrom: string;
  grade: string;
  rock: string;
  elevation_gain: number | null;
  max_altitude: number | null;
  distance_km: number | null;
  description: string;
  pitches: number | null;
  length_m: number | null;
  protection: Protection | null;
  alpine_grade: string;
  grade_obligatory: string;
  aid: string;
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
/** Rows of a file are the same spot when activity, area, sector and name are the same once folded. */
export const spotKey = (s: Pick<DraftSpot, 'activity' | 'area' | 'sector' | 'name'>) =>
  `${s.activity}|${foldName(s.area)}|${foldName(s.sector)}|${foldName(s.name)}`;

/** Words a route's name starts with: "Via normale al Weissmies" names the mountain after them. */
const ROUTE_WORDS = /^(via|vie|cresta|spigolo|parete|canale|canalone|couloir|diedro|pilastro|traversata|normale|voie|ar[eê]te|route|ridge|face|grat|weg)\b/i;

/**
 * The mountain and the route of a name that holds both, the way people
 * write them: "Breithorn - via normale", "Castore: via normale",
 * "Breithorn (via normale)", "Via normale al Weissmies". Null when the name
 * is one thing ("Canale della Nona", "Zucco di Pesciola (m.2092)").
 */
export function splitRouteName(name: string): { sector: string; name: string } | null {
  const parts = (sector?: string, route?: string) =>
    sector?.trim() && route?.trim() ? { sector: sector.trim(), name: route.trim() } : null;
  const dash = name.match(/^(.+?)\s+[-–—]\s+(.+)$/) ?? name.match(/^(.+?):\s+(.+)$/);
  if (dash) return parts(dash[1], dash[2]);
  const brackets = name.match(/^(.+?)\s*\((.+)\)$/);
  if (brackets && ROUTE_WORDS.test(brackets[2].trim())) return parts(brackets[1], brackets[2]);
  const to = name.match(/^(.+?)\s+(?:(?:al|alla|allo|ai|agli|alle)\s+|all['’]\s*)(.+)$/i);
  if (to && ROUTE_WORDS.test(to[1])) return parts(to[2], to[1]);
  return null;
}

function emptySpot(name: string, activity: Activity): DraftSpot {
  return {
    key: '', name, activity, area: '', areaDescription: '', sector: '', splitFrom: '', grade: '', rock: '',
    elevation_gain: null, max_altitude: null, distance_km: null, description: '',
    pitches: null, length_m: null, protection: null, alpine_grade: '', grade_obligatory: '', aid: '',
    locality: '', region: '', country: '', lat: null, lng: null, links: [], visits: [],
  };
}

const emptyVisit = (source: string): DraftVisit => ({
  date: null, partners: [], otherPartners: [], rating: null, ascents: [], summary: '', conditions: '', approach: '', descent: '',
  duration_hours: null, tip: '', source,
});

/** A visit with nothing in it (repeat-group columns left blank) is not a visit. */
const hasContent = (v: DraftVisit) =>
  !!(v.date || v.partners.length || v.otherPartners.length || v.rating || v.ascents.length || v.summary || v.conditions || v.tip);

/** Merges spots with the same key, keeping the first non-empty value of each detail. */
export function mergeSpots(spots: DraftSpot[]): DraftSpot[] {
  const byKey = new Map<string, DraftSpot>();
  for (const s of spots) {
    const prev = byKey.get(s.key);
    if (!prev) { byKey.set(s.key, { ...s, links: [...s.links], visits: [...s.visits] }); continue; }
    for (const k of ['grade', 'rock', 'description', 'locality', 'region', 'country', 'areaDescription',
      'alpine_grade', 'grade_obligatory', 'aid'] as const) prev[k] ||= s[k];
    for (const k of ['elevation_gain', 'max_altitude', 'distance_km', 'lat', 'lng', 'pitches', 'length_m', 'protection'] as const) {
      (prev[k] as unknown) ??= s[k];
    }
    for (const l of s.links) if (!prev.links.some(x => x.url === l.url)) prev.links.push(l);
    // One route per row: rows of the same day at the same spot are one visit.
    for (const v of s.visits) {
      const same = v.date && prev.visits.find(x => x.date === v.date);
      if (same) {
        same.ascents.push(...v.ascents);
        for (const p of v.partners) if (!same.partners.includes(p)) same.partners.push(p);
        for (const p of v.otherPartners) if (!same.otherPartners.includes(p)) same.otherPartners.push(p);
        same.rating ??= v.rating;
        if (v.summary && !same.summary.includes(v.summary)) same.summary = [same.summary, v.summary].filter(Boolean).join('\n');
        if (v.tip && !same.tip.includes(v.tip)) same.tip = [same.tip, v.tip].filter(Boolean).join('\n');
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
    let name = text(first(row, 'spot.name'));
    if (!name) {
      if (row.some(c => !isBlank(c.v))) skipped.push({ source, reason: tr().import.reasons.noSpotName });
      return;
    }
    const activity = parseActivity(first(row, 'spot.activity')?.v) ?? m.activity;
    if (!activity) { skipped.push({ source, reason: tr().import.reasons.noActivity }); return; }
    const f = ACTIVITIES[activity];

    let sector = text(first(row, 'sector.name'));
    // At a crag the "Settore" column is the crag's sector the routes are in ("Tutti"/"all": the whole crag).
    let cragSector = '';
    if (f.cragSectors) {
      cragSector = /^(tutti|tutto|all|tous|alle)$/i.test(sector) ? '' : sector;
      sector = '';
    }
    let splitFrom = '';
    // A mountain's column and a route's column, at a spot that is a route: the route is the spot.
    const route = f.isRoute && f.routes && !colsOf('sector.name').length && groups.length === 1
      ? text(first(row, 'ascent.name')) : '';
    const split = splitRouteName(name);
    if (sector && split && sameName(split.sector, sector)) {
      // The sector again in the name: "Breithorn" and "Breithorn - via normale".
      name = split.name;
    } else if (route && !sameName(route, name)) {
      splitFrom = `${name} - ${route}`;
      [sector, name] = [name, route];
    } else if (f.isRoute && !sector && split) {
      // "Breithorn - via normale": the mountain is the sector, the route the spot.
      splitFrom = name;
      ({ sector, name } = split);
    }

    const spot = emptySpot(name, activity);
    spot.sector = sector;
    spot.splitFrom = splitFrom;
    spot.area = text(first(row, 'area.name'));
    spot.areaDescription = text(first(row, 'area.description'));
    if (f.pitches) {
      const d = parseDifficulty(first(row, 'spot.grade')?.v);
      spot.grade = d.grade;
      spot.grade_obligatory = d.obligatory;
      spot.aid = d.aid;
      spot.pitches = parseInteger(first(row, 'spot.pitches')?.v);
      spot.length_m = parseInteger(first(row, 'spot.length_m')?.v);
    } else {
      spot.grade = cleanGrade(first(row, 'spot.grade')?.v);
    }
    spot.protection = f.protection ? parseProtection(first(row, 'spot.protection')?.v) : null;
    spot.alpine_grade = f.alpineGrade ? cleanGrade(first(row, 'spot.alpine_grade')?.v) : '';
    spot.rock = f.rock ? text(first(row, 'spot.rock')) : '';
    spot.elevation_gain = f.altitude ? parseInteger(first(row, 'spot.elevation_gain')?.v) : null;
    spot.max_altitude = f.altitude ? parseInteger(first(row, 'spot.max_altitude')?.v) : null;
    spot.distance_km = f.distance ? parseNumber(first(row, 'spot.distance_km')?.v) : null;
    spot.description = text(first(row, 'spot.description'));
    spot.locality = text(first(row, 'place.locality'));
    spot.region = text(first(row, 'place.region'));
    spot.country = parseCountry(first(row, 'place.country')?.v)
      // An Italian province code without a country ("TN") means Italy.
      || (isItalianProvinceCode(spot.region) ? 'IT' : '');
    // Italian province names become their code, as the app stores them ("Torino" → "TO").
    if (spot.country === 'IT' && spot.region) spot.region = provinceCode('IT', spot.region) ?? spot.region;
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
      ...(!f.routeList ? ['sector' as const] : []),
      ...(!f.pitches ? ['spot.pitches' as const, 'spot.length_m' as const] : []),
      ...(!f.protection ? ['spot.protection' as const] : []),
      ...(!f.alpineGrade ? ['spot.alpine_grade' as const] : []),
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
      v.otherPartners = parsePartners(first(row, 'visit.other_partners', g)?.v).filter(p => !v.partners.includes(p));
      v.rating = parseRating(first(row, 'visit.rating', g)?.v);
      // A later visit without its own sector column climbed in the row's sector.
      const wall = f.routeList ? text(first(row, 'sector', g)) || text(first(row, 'sector')) || cragSector : '';
      if (f.routes) {
        v.ascents = parseAscentList(first(row, 'visit.ascents', g)?.v).map(a => ({ ...a, sector: wall }));
        const routeName = text(first(row, 'ascent.name', g));
        const routeGrade = cleanGrade(first(row, 'ascent.grade', g)?.v);
        if (routeName || routeGrade) {
          const status = text(first(row, 'ascent.comment', g));
          const style = status ? parseStyle(status) : null;
          v.ascents.push({ name: routeName, grade: routeGrade, comment: style ? '' : status, sector: wall, style });
        }
      }
      v.summary = [text(first(row, 'visit.summary', g)), ...(g === 0 ? notes : [])].filter(Boolean).join('\n');
      v.tip = text(first(row, 'visit.tip', g));
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
      area: v.spot.area ?? '', sector: v.spot.sector ?? '', grade: v.spot.grade ?? '', rock: v.spot.rock ?? '',
      elevation_gain: v.spot.elevation_gain ?? null, max_altitude: v.spot.max_altitude ?? null,
      distance_km: v.spot.distance_km ?? null, lat: v.spot.pin?.lat ?? null, lng: v.spot.pin?.lng ?? null,
      country: v.spot.country ?? '', region: v.spot.province ?? '', locality: v.spot.start_locality ?? '',
      protection: parseProtection(v.spot.protection) ?? (['bolted', 'trad', 'mixed'].includes(v.spot.protection ?? '')
        ? v.spot.protection as Protection : null),
      pitches: v.spot.pitches ?? null, length_m: v.spot.length_m ?? null, alpine_grade: v.spot.alpine_grade ?? '',
      grade_obligatory: v.spot.grade_obligatory ?? '', aid: v.spot.aid ?? '',
    });
    spot.key = spotKey(spot);
    spot.visits.push({
      date: v.date, partners: v.with ?? [], otherPartners: v.other_ropes ?? [], rating: v.rating ?? null,
      summary: v.summary ?? '', conditions: v.conditions ?? '',
      approach: v.approach ?? '', descent: v.descent ?? '', duration_hours: v.duration_hours ?? null, tip: '',
      visibility: v.visibility === 'public' ? 'public' : 'private',
      ascents: (v.routes ?? []).map(a => ({
        name: a.name ?? '', grade: a.grade ?? '', comment: a.comment ?? '', sector: a.sector ?? '',
        style: a.style ? parseStyle(a.style) ?? (a.style as AscentStyle) : null,
      })),
      source,
    });
    spots.push(spot);
  });
  return { spots: mergeSpots(spots), skipped };
}

