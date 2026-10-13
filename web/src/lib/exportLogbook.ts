/*
 * Turns a logbook (fetchLogbook) into downloadable files: CSV for
 * spreadsheets, JSON as a complete backup, GPX waypoints for GPS apps.
 */
import type { LogbookVisit } from './api';
import { tr } from '../i18n';
import { activityLabel, localToday } from './labels';
import type { Activity } from './types';

export type ExportFormat = 'csv' | 'json' | 'gpx';

const activityOf = (v: LogbookVisit) => (v.place ? activityLabel(v.place.activity as Activity) : '');

// ---------------------------------------------------------------- CSV
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per route; a visit without routes still gets one row. */
function toCsv(visits: LogbookVisit[]): string {
  const rows = visits.flatMap(v => {
    const base = [
      v.date, v.place?.name, v.place?.area?.name, activityOf(v),
      v.place?.lat, v.place?.lng, v.visibility, v.partners.join('; '), v.duration_hours,
      v.conditions, v.summary, v.approach, v.descent,
    ];
    const routes = v.ascents.length ? v.ascents : [null];
    return routes.map(a => [...base, a?.name, a?.grade, a?.sector?.name, a?.comment]);
  });
  // The byte-order mark makes Excel read the file as UTF-8 (accents, ° signs).
  return '﻿' + [tr().account.export.csvHeader, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- JSON
function toJson(visits: LogbookVisit[], username: string): string {
  return JSON.stringify({
    format: 'alpine-log/v2',
    exported_at: new Date().toISOString(),
    user: username,
    visits: visits.map(v => ({
      date: v.date,
      visibility: v.visibility,
      with: v.partners,
      duration_hours: v.duration_hours,
      conditions: v.conditions,
      summary: v.summary,
      approach: v.approach,
      descent: v.descent,
      spot: v.place && {
        name: v.place.name,
        area: v.place.area?.name ?? null,
        activity: v.place.activity,
        grade: v.place.grade,
        max_altitude: v.place.max_altitude,
        pin: { lat: v.place.lat, lng: v.place.lng },
        parking: v.place.parking_lat != null ? { lat: v.place.parking_lat, lng: v.place.parking_lng } : null,
        start: v.place.start_lat != null ? { lat: v.place.start_lat, lng: v.place.start_lng } : null,
      },
      routes: v.ascents.map(a => ({ name: a.name, grade: a.grade, sector: a.sector?.name ?? null, comment: a.comment })),
    })),
  }, null, 2);
}

// ---------------------------------------------------------------- GPX
const xml = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

/** One waypoint per spot visited, listing the visit dates. */
function toGpx(visits: LogbookVisit[], username: string): string {
  const byPlace = new Map<number, { place: NonNullable<LogbookVisit['place']>; dates: string[]; routes: number }>();
  for (const v of visits) {
    if (!v.place) continue;
    const e = byPlace.get(v.place.id) ?? { place: v.place, dates: [], routes: 0 };
    if (v.date) e.dates.push(v.date);
    e.routes += v.ascents.length;
    byPlace.set(v.place.id, e);
  }
  const wpts = [...byPlace.values()].map(({ place: p, dates, routes }) => {
    const desc = [
      p.area?.name, activityLabel(p.activity as Activity), p.grade,
      `${dates.length ? tr().account.export.gpxVisits(dates.length) : tr().account.export.undated}${dates.length ? `: ${dates.sort().join(', ')}` : ''}`,
      routes ? tr().account.export.gpxRoutes(routes) : null,
    ].filter(Boolean).join(' — ');
    return `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${xml(p.name)}</name>
    <desc>${xml(desc)}</desc>
    <type>${xml(activityLabel(p.activity as Activity))}</type>
  </wpt>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Alpine Log" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(tr().account.export.gpxTitle(username))}</name><time>${new Date().toISOString()}</time></metadata>
${wpts.join('\n')}
</gpx>
`;
}

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8', json: 'application/json', gpx: 'application/gpx+xml',
};

/** Builds the file and hands it to the browser as a download. */
export function downloadLogbook(visits: LogbookVisit[], username: string, format: ExportFormat) {
  const body = format === 'csv' ? toCsv(visits) : format === 'json' ? toJson(visits, username) : toGpx(visits, username);
  const url = URL.createObjectURL(new Blob([body], { type: MIME[format] }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `alpine-log-${username.replace(/[^A-Za-z0-9_.-]/g, '_')}-${localToday()}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
