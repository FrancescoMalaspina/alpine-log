/*
 * Guesses what each column of a table is, from its header (synonyms in
 * several languages) and from its values (dates, grades, URLs, numbers).
 * The user reviews and corrects the result; nothing here is final.
 */
import type { Activity } from '../types';
import { foldName } from '../names';
import { FIELD_BY_ID, FIELDS, isSingle, type FieldId } from './fields';
import type { Cell, RawTable } from './parse';
import {
  guessDateOrder, isBlank, isUrl, looksLikeGrade, parseActivity, parseDate, parseNumber, parseProtection, parseRating,
  type DateOrder,
} from './transforms';

export type ColumnMapping = {
  field: FieldId;
  /** 0 for "Date", 1 for "Date (2)": each group beyond 0 is one more visit per row. */
  group: number;
  /** 0–1: how sure the guess is. 1 for anything the user (or a preset) set. */
  confidence: number;
};

export type SheetMapping = {
  include: boolean;
  /** Activity of every row, unless a column says otherwise. */
  activity: Activity | null;
  dateOrder: DateOrder;
  columns: ColumnMapping[];
};

const SUFFIX = /\s*(?:\((\d+)\)|#(\d+)|[\s_-](\d))$/;

/** "Data ripetizione (2)" → ["Data ripetizione", 1]; headers without a twin stay as they are. */
export function repeatGroups(headers: string[]): { base: string; group: number }[] {
  const plain = new Set(headers.map(foldName));
  return headers.map(h => {
    const m = h.match(SUFFIX);
    const base = m ? h.slice(0, m.index).trim() : h;
    const n = m ? Number(m[1] ?? m[2] ?? m[3]) : 0;
    return m && n >= 2 && plain.has(foldName(base)) ? { base, group: n - 1 } : { base: h, group: 0 };
  });
}

function headerScore(header: string, field: FieldId): number {
  const h = foldName(header);
  if (!h) return 0;
  let best = 0;
  for (const [syn, w] of FIELD_BY_ID[field].synonyms) {
    if (h === syn) best = Math.max(best, w);
    else if (` ${h} `.includes(` ${syn} `)) best = Math.max(best, w * (0.55 + 0.35 * syn.length / h.length));
  }
  return best;
}

const frac = (values: Cell[], test: (c: Cell) => boolean) =>
  values.length ? values.filter(test).length / values.length : 0;

/** Adjusts a header score by what the column actually holds. */
function valueScore(field: FieldId, header: number, values: Cell[]): number {
  const v = (c: Cell) => c.v;
  const numeric = frac(values, c => typeof v(c) === 'number' || /^\s*-?[\d.,]+\s*(m|km|h)?\s*$/i.test(String(v(c))));
  switch (field) {
    case 'visit.date': {
      const f = frac(values, c => parseDate(v(c)) != null);
      return Math.max(header * (0.4 + 0.6 * f), f > 0.8 ? 0.7 : 0);
    }
    case 'link': {
      const f = frac(values, c => !!c.link || isUrl(v(c)));
      return Math.max(header * (0.5 + 0.5 * f), f > 0.5 ? 0.9 : 0);
    }
    case 'lat': case 'lng': {
      const lim = field === 'lat' ? 90 : 180;
      return header * frac(values, c => { const n = parseNumber(v(c)); return n != null && Math.abs(n) <= lim && !Number.isInteger(n); });
    }
    case 'visit.ascents':
      return header * (numeric > 0.5 ? 0.1 : 0.3 + 0.7 * frac(values, c => looksLikeGrade(v(c))));
    case 'spot.grade': case 'ascent.grade': case 'spot.alpine_grade':
      return header * (numeric > 0.5 ? 0.2 : 0.4 + 0.6 * frac(values, c => looksLikeGrade(v(c))));
    case 'spot.activity':
      return header * (frac(values, c => parseActivity(v(c)) != null) >= 0.6 ? 1 : 0.1);
    case 'spot.protection':
      return header * (frac(values, c => parseProtection(v(c)) != null) >= 0.6 ? 1 : 0.1);
    case 'visit.rating':
      return header * (frac(values, c => parseRating(v(c)) != null) >= 0.6 ? 1 : 0.2);
    case 'spot.elevation_gain': case 'spot.max_altitude': case 'spot.distance_km': case 'visit.duration_hours':
    case 'spot.pitches': case 'spot.length_m':
      return header * (numeric >= 0.6 ? 1 : 0.3);
    case 'visit.partners': case 'visit.other_partners': case 'spot.name': case 'area.name': case 'place.locality':
    case 'sector.name': case 'area.description':
      return header * (numeric > 0.5 ? 0.2 : 1);
    default:
      return header;
  }
}

const THRESHOLD = 0.35;

/** Fields that a value of the sheet name alone can't tell; the activity can come from the sheet name. */
export function guessActivity(table: RawTable, columns: ColumnMapping[]): Activity | null {
  const fromName = parseActivity(table.name);
  if (fromName) return fromName;
  const actCol = columns.findIndex(c => c.field === 'spot.activity');
  if (actCol >= 0) return null;   // per row
  const gradeCol = columns.findIndex(c => c.field === 'spot.grade');
  if (gradeCol >= 0) {
    const grades = table.rows.map(r => String(r[gradeCol]?.v ?? '').trim()).filter(Boolean);
    if (grades.length && grades.every(g => /^(F|PD|AD|D|TD|ED)[+-]?$/i.test(g))) return 'alpine';
    if (grades.length && grades.every(g => /^(WI|M)\d/i.test(g))) return 'ice';
  }
  return null;
}

export function autoMap(table: RawTable): SheetMapping {
  const groups = repeatGroups(table.headers);
  const sample = (c: number) => table.rows.slice(0, 60).map(r => r[c]).filter(cell => cell && (!isBlank(cell.v) || cell.link));

  // Every (column, field) pair with its score, best first; group-0 columns only.
  const pairs: { col: number; field: FieldId; score: number }[] = [];
  table.headers.forEach((_, col) => {
    if (groups[col].group) return;
    const values = sample(col);
    if (!values.length) return;
    for (const f of FIELDS) {
      const score = valueScore(f.id, headerScore(groups[col].base, f.id), values);
      if (score >= THRESHOLD) pairs.push({ col, field: f.id, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score);

  const columns: ColumnMapping[] = table.headers.map(() => ({ field: 'note', group: 0, confidence: 0 }));
  const taken = new Set<FieldId>();
  const done = new Set<number>();
  for (const p of pairs) {
    if (done.has(p.col) || (isSingle(p.field) && taken.has(p.field))) continue;
    columns[p.col] = { field: p.field, group: 0, confidence: Math.min(1, p.score) };
    done.add(p.col);
    taken.add(p.field);
  }

  // "X (2)" columns follow their "X" column when that is a visit field.
  table.headers.forEach((_, col) => {
    const g = groups[col];
    if (!g.group) return;
    const twin = table.headers.findIndex((h, i) => !groups[i].group && foldName(h) === foldName(g.base));
    const f = twin >= 0 ? columns[twin].field : 'note';
    columns[col] = FIELD_BY_ID[f].level === 'visit'
      ? { field: f, group: g.group, confidence: columns[twin].confidence }
      : { field: 'note', group: 0, confidence: 0 };
  });

  // Empty columns are skipped rather than kept as notes.
  table.headers.forEach((_, col) => {
    if (columns[col].field === 'note' && !sample(col).length) columns[col] = { field: 'ignore', group: 0, confidence: 1 };
  });

  // One route per row (a long list): a plain "grade" column is the route's grade.
  const has = (f: FieldId) => columns.some(c => c.field === f);
  if (has('ascent.name') && !has('ascent.grade')) {
    const g = columns.find(c => c.field === 'spot.grade');
    if (g) g.field = 'ascent.grade';
  }
  // Without a spot column, a "route"/"via" column names the spot.
  if (!has('spot.name') && has('ascent.name')) columns.find(c => c.field === 'ascent.name')!.field = 'spot.name';

  const dateCol = columns.findIndex(c => c.field === 'visit.date');
  return {
    include: true,
    activity: guessActivity(table, columns),
    dateOrder: dateCol >= 0 ? guessDateOrder(table.rows.map(r => r[dateCol]?.v)) : 'dmy',
    columns,
  };
}

// ---------------------------------------------------------------- presets

const PRESETS_KEY = 'import-presets:v1';

/** Same headers (in any order, any case) → same source → same mapping. */
export const fingerprint = (headers: string[]) => [...headers].map(foldName).sort().join('|');

type Preset = { activity: Activity | null; dateOrder: DateOrder; columns: Record<string, Omit<ColumnMapping, 'confidence'>> };

function readPresets(): Record<string, Preset> {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function savePreset(table: RawTable, m: SheetMapping) {
  try {
    const all = readPresets();
    all[fingerprint(table.headers)] = {
      activity: m.activity,
      dateOrder: m.dateOrder,
      columns: Object.fromEntries(table.headers.map((h, i) => [foldName(h), { field: m.columns[i].field, group: m.columns[i].group }])),
    };
    localStorage.setItem(PRESETS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: presets are only a convenience
  }
}

/** The mapping confirmed last time for a table with these headers, if any. */
export function loadPreset(table: RawTable): SheetMapping | null {
  const p = readPresets()[fingerprint(table.headers)];
  if (!p) return null;
  return {
    include: true,
    activity: p.activity,
    dateOrder: p.dateOrder,
    columns: table.headers.map(h => {
      const c = p.columns[foldName(h)];
      return c ? { ...c, confidence: 1 } : { field: 'note', group: 0, confidence: 0 };
    }),
  };
}
