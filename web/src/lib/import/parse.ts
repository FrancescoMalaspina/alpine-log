/*
 * Reads an uploaded file into plain tables, whatever its format:
 * Excel / OpenDocument / CSV via SheetJS (loaded only when someone imports),
 * JSON by flattening its largest list of records.
 */
import { excelSerialToIso, isBlank } from './transforms';

/** One cell: its value, and the URL behind it when it is a hyperlink. */
export type Cell = { v: string | number | boolean | null; link?: string };

export type RawTable = {
  name: string;
  headers: string[];
  rows: Cell[][];
};

/** What a file turned into: tables to map, or our own JSON backup, which needs no mapping. */
export type ParsedFile =
  | { kind: 'tables'; fileName: string; tables: RawTable[] }
  | { kind: 'alpine-log'; fileName: string; data: AlpineLogBackup };

export type AlpineLogBackup = {
  format: string;
  visits: {
    date: string | null; visibility?: string; with?: string[]; duration_hours?: number | null;
    conditions?: string | null; summary?: string | null; approach?: string | null; descent?: string | null;
    spot: null | {
      name: string; area: string | null; activity: string; grade?: string | null;
      max_altitude?: number | null; elevation_gain?: number | null; distance_km?: number | null;
      rock?: string | null; pin: { lat: number; lng: number };
    };
    routes?: { name: string | null; grade: string | null; sector: string | null; comment: string | null }[];
  }[];
};

const MAX_ROWS = 5000;

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;
  if (/\.json$/i.test(name) || file.type === 'application/json') {
    const data = JSON.parse(await file.text());
    if (data && typeof data === 'object' && typeof data.format === 'string' && data.format.startsWith('alpine-log/')) {
      return { kind: 'alpine-log', fileName: name, data };
    }
    return { kind: 'tables', fileName: name, tables: [jsonToTable(data, name.replace(/\.json$/i, ''))] };
  }
  return { kind: 'tables', fileName: name, tables: await sheetsToTables(file) };
}

// ---------------------------------------------------------------- spreadsheets

async function sheetsToTables(file: File): Promise<RawTable[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false, dense: true });
  const tables: RawTable[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const ref = ws['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const grid: Cell[][] = [];
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + MAX_ROWS); r++) {
      const row: Cell[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = (ws['!data'] as unknown as XlsxCell[][] | undefined)?.[r]?.[c];
        row.push(toCell(cell, XLSX.SSF.is_date));
      }
      grid.push(row);
    }
    const table = gridToTable(sheetName, grid);
    if (table) tables.push(table);
  }
  return tables;
}

type XlsxCell = { t: string; v?: unknown; w?: string; z?: string | number; l?: { Target?: string } };

function toCell(cell: XlsxCell | undefined, isDateFormat: (fmt: string) => boolean): Cell {
  if (!cell || cell.v == null) return { v: null, link: cell?.l?.Target };
  let v: Cell['v'];
  if (cell.t === 'n' && typeof cell.z === 'string' && isDateFormat(cell.z)) v = excelSerialToIso(cell.v as number);
  else if (cell.t === 'e') v = null;
  else v = cell.v as Cell['v'];
  if (typeof v === 'string') v = v.trim() || null;
  return { v, link: cell.l?.Target };
}

/**
 * The header row is the first of the top ten rows that has the most text
 * cells (titles and blank lines above a table are common). Empty rows and
 * columns are dropped.
 */
export function gridToTable(name: string, grid: Cell[][]): RawTable | null {
  const filled = (row: Cell[]) => row.filter(c => typeof c.v === 'string' && c.v.trim()).length;
  let headerAt = -1;
  let best = 0;
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const n = filled(grid[i]);
    if (n > best) { best = n; headerAt = i; }
  }
  if (headerAt < 0 || best < 1) return null;

  const width = Math.max(...grid.map(r => r.length));
  const body = grid.slice(headerAt + 1).filter(r => r.some(c => !isBlank(c.v)));
  const keep = [...Array(width).keys()].filter(c =>
    !isBlank(grid[headerAt][c]?.v) || body.some(r => !isBlank(r[c]?.v)));
  if (!body.length) return null;

  const seen = new Map<string, number>();
  const headers = keep.map(c => {
    const h = String(grid[headerAt][c]?.v ?? '').trim() || `Column ${c + 1}`;
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n > 1 ? `${h} (${n})` : h;
  });
  return { name, headers, rows: body.map(r => keep.map(c => r[c] ?? { v: null })) };
}

// ---------------------------------------------------------------- JSON

/** Finds the largest array of objects anywhere in the document. */
function largestRecordList(data: unknown): Record<string, unknown>[] {
  let best: Record<string, unknown>[] = [];
  const walk = (x: unknown, depth: number) => {
    if (depth > 6 || x == null || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      const objs = x.filter(i => i && typeof i === 'object' && !Array.isArray(i)) as Record<string, unknown>[];
      if (objs.length > best.length) best = objs;
      x.forEach(i => walk(i, depth + 1));
    } else {
      Object.values(x).forEach(v => walk(v, depth + 1));
    }
  };
  walk(data, 0);
  return best;
}

/** { spot: { pin: { lat } } } → { "spot.pin.lat": … }; lists of plain values are joined with ", ". */
function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, Cell['v']> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) out[key] = null;
    else if (Array.isArray(v)) {
      out[key] = v.every(i => i == null || typeof i !== 'object')
        ? v.filter(i => i != null).join(', ')
        : JSON.stringify(v);
    } else if (typeof v === 'object') flatten(v as Record<string, unknown>, key, out);
    else out[key] = v as Cell['v'];
  }
  return out;
}

export function jsonToTable(data: unknown, name: string): RawTable {
  const records = largestRecordList(data).slice(0, MAX_ROWS).map(r => flatten(r));
  if (!records.length) throw new Error('No list of records found in this JSON file.');
  const headers = [...new Set(records.flatMap(r => Object.keys(r)))];
  return {
    name,
    headers,
    rows: records.map(r => headers.map(h => {
      const v = r[h] ?? null;
      return { v: typeof v === 'string' ? v.trim() || null : v };
    })),
  };
}
