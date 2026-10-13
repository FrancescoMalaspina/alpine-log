/*
 * Turns the free text people type in spreadsheets into typed values:
 * dates, partner lists, route lists, numbers, activities. Pure functions.
 */
import { parseCoordinates } from '../coords';
import type { Activity, AscentStyle, Protection } from '../types';

export type DateOrder = 'dmy' | 'mdy';

const NOTHING = /^(n\/?a|nd|n\.d\.|-+|\?+|none|nessuno|null|tbd|x)$/i;

/** True for "", "N/A", "-", "?" and friends. */
export const isBlank = (v: unknown) => v == null || (typeof v === 'string' && (!v.trim() || NOTHING.test(v.trim())));

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Excel's serial day number (1 = 1900-01-01, with its 1900 leap-year bug). */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  return validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const year = (y: string) => {
  // "02026" (a typo for 2026) and two-digit years
  const n = Number(y.length === 5 && y.startsWith('0') ? y.slice(1) : y);
  return y.length <= 2 ? 2000 + n : n;
};

/** A date as yyyy-mm-dd, or null. Accepts ISO, d/m/y (or m/d/y), d.m.y, Excel serials. */
export function parseDate(v: unknown, order: DateOrder = 'dmy'): string | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return validDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') return excelSerialToIso(v);
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.\s-](\d{1,2})[/.\s-](\d{2}|\d{4,5})$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    let [d, mo] = order === 'dmy' ? [a, b] : [b, a];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return validDate(year(m[3]), mo, d);
  }
  if (/^\d{5}(\.\d+)?$/.test(t)) return excelSerialToIso(Number(t));
  return null;
}

/** For a whole column: "mdy" only when some value can't be day-first. */
export function guessDateOrder(values: unknown[]): DateOrder {
  for (const v of values) {
    const m = typeof v === 'string' && v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,5}$/);
    if (m && +m[1] <= 12 && +m[2] > 12) return 'mdy';
  }
  return 'dmy';
}

/** "Fra. Japo, Vale e Sara (?)" → ["Fra", "Japo", "Vale", "Sara"]. */
export function parsePartners(v: unknown): string[] {
  if (isBlank(v)) return [];
  const names = String(v)
    .replace(/\(\s*\?\s*\)|\?/g, '')            // "(?)": unsure, still a name
    .replace(/\([^)]*\)/g, '')                  // "(amica Andre)"
    .replace(/\.\s+(?=\p{Lu})/gu, ',')          // "Fra. Japo" typed for "Fra, Japo"
    .split(/[,;/\n+&]|\s+(?:e|and|und|et|y)\s+/i)
    .map(n => n.trim().replace(/\s+/g, ' '))
    .filter(n => n && !isBlank(n));
  return [...new Set(names)];
}

const GRADE = String.raw`(?:[3-9][abc]?\+?(?:\/[abc]?\+?)?|(?:IX|VIII|VII|VI|V|IV|III|II|I)[+-]?|WI[1-7]\+?|M[1-9]\d?\+?|[FD][+-]?|PD[+-]?|AD[+-]?|TD[+-]?|ED\d?[+-]?)`;
const GRADE_RE = new RegExp(String.raw`(?:^|[\s(])(${GRADE})(?=$|[\s),>/])`, 'i');
const STATUS_RE = /\(\s*([^)]*)\)\s*$|\s+(ok|no|ko|top|flash|os|onsight|rp|redpoint|af|tr|fail|sent|project|progetto)\s*$/i;

export type ParsedAscent = { name: string; grade: string; comment: string; style: AscentStyle | null };

const STYLE_WORDS: [AscentStyle, RegExp][] = [
  ['onsight', /^(os|o\.s\.|onsight|on ?sight|a vista|a vue)$/i],
  ['flash', /^(fl|flash)$/i],
  ['redpoint', /^(ok|sent|rp|redpoint|red ?point|chiusa|chiuso|lavorata|top|libera|done|fatto|fatta|si|sì|yes|v|✓|✔)$/i],
  ['toprope', /^(tr|top ?rope|toprope|moulinette|in moulinette|corda dall'alto)$/i],
  ['attempt', /^(no|ko|fail|failed|attempt|tentativo|tentata|project|progetto|non chiusa|x|✗|✘)$/i],
];

/** "ok" → redpoint, "no" → attempt, "os" → onsight…; null for anything else (kept as a comment). */
export function parseStyle(v: string): AscentStyle | null {
  const t = v.trim();
  return STYLE_WORDS.find(([, re]) => re.test(t))?.[0] ?? null;
}

/**
 * A list of routes typed in one cell: "5c, 6a (ok), 6a+ (no)" or
 * "Via Bianca 6a ok; Spigolo 5c". A status in brackets after a route also
 * applies to the routes before it that have none ("5c, 6a (ok)": both ok).
 */
export function parseAscentList(v: unknown): ParsedAscent[] {
  if (isBlank(v)) return [];
  const tokens = String(v).split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
  const out: { name: string; grade: string; comment: string; explicit: boolean }[] = tokens.map(token => {
    let rest = token;
    let comment = '';
    const st = rest.match(STATUS_RE);
    // "(ok)" is a status, but "V+ (5b)" is a second grade
    if (st && !GRADE_RE.test(` ${st[1] ?? st[2]}`)) {
      comment = (st[1] ?? st[2]).trim();
      rest = rest.slice(0, st.index).trim();
    }
    const g = rest.match(GRADE_RE);
    let grade = '';
    if (g) {
      grade = g[1];
      rest = (rest.slice(0, g.index) + rest.slice(g.index! + g[0].length)).trim();
    }
    return { name: rest.replace(/^[-–:]+|[-–:]+$/g, '').trim(), grade, comment, explicit: !!comment };
  });
  // Carry each status back over the routes before it that have none.
  let carry = '';
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].explicit) carry = out[i].comment;
    else out[i].comment = carry;
  }
  // A status that is a known outcome becomes the route's style; anything else stays its comment.
  return out.filter(a => a.name || a.grade).map(({ name, grade, comment }) => {
    const style = comment ? parseStyle(comment) : null;
    return { name, grade, comment: style ? '' : comment, style };
  });
}

/** "1.311", "750 m", "4,5 km" → number. */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (isBlank(v)) return null;
  let t = String(v).replace(/[^\d.,-]/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');          // 1.311 (thousands)
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');       // 1,311
  else t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export const parseInteger = (v: unknown) => {
  const n = parseNumber(v);
  return n == null ? null : Math.round(n);
};

export { parseCoordinates };

/** Grade as typed, tidied: " V+ (5b)" → "V+ (5b)". */
export const cleanGrade = (v: unknown) => (isBlank(v) ? '' : String(v).trim().replace(/\s+/g, ' '));

const ACTIVITY_WORDS: [Activity, RegExp][] = [
  ['dws', /\b(dws|deep water|psicobloc)/],
  ['indoor', /\b(indoor|palestra|gym|halle|salle|boulder)/],
  ['ski', /\b(sci ?alp|scialpinismo|ski|skitour|sci)\b/],
  ['ice', /\b(ice|ghiaccio|cascat|icefall|glace|eis)/],
  ['multipitch', /\b(vie lunghe|via lunga|multi ?pitch|grandes? voies?|mehrseill|long routes?)/],
  ['alpine', /\b(alpin|neve|misto|mountaineering|hochtour|alta montagna|mixed|snow)/],
  ['crag', /\b(falesi|crag|single ?pitch|monotiri|sport climbing|klettergarten|couennes?)/],
  ['hike', /\b(hik|escursion|trekking|wander|randonn|ferrat)/],
  ['trail', /\b(trail|corsa|running|run)\b/],
];

/** An activity from a word in any of the usual languages, or the app's own codes and labels. */
export function parseActivity(v: unknown): Activity | null {
  if (isBlank(v)) return null;
  const t = String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const exact = ['crag', 'multipitch', 'alpine', 'ice', 'ski', 'trail', 'hike', 'dws', 'indoor'].find(a => a === t.trim());
  if (exact) return exact as Activity;
  return ACTIVITY_WORDS.find(([, re]) => re.test(t))?.[0] ?? null;
}

const URL_RE = /^https?:\/\/\S+$/i;
export const isUrl = (v: unknown) => typeof v === 'string' && URL_RE.test(v.trim());

/** A guide link from a cell: its hyperlink, or its text when that is a URL. */
export function parseLink(text: unknown, hyperlink?: string): { title: string; url: string } | null {
  const url = hyperlink && URL_RE.test(hyperlink) ? hyperlink : isUrl(text) ? String(text).trim() : null;
  if (!url) return null;
  const title = !isBlank(text) && String(text).trim() !== url ? String(text).trim() : '';
  return { title: title.slice(0, 200), url };
}

/** Looks like a grade (French, UIAA, alpine, ice)? */
export const looksLikeGrade = (v: unknown) => !isBlank(v) && GRADE_RE.test(` ${String(v).trim()}`);

const AID_RE = /(?:^|[\s,;(])(A[0-5][+-]?)(?=$|[\s,;)])/i;

/**
 * A route's "Difficoltà" split into its parts: the hardest grade, the
 * mandatory grade and the aid. "6a+>5c", "VI/V, A0", "6a un passo/5b, A0".
 * A single grade ("V+ (5b)", "5c") is kept whole as the grade.
 */
export function parseDifficulty(v: unknown): { grade: string; obligatory: string; aid: string } {
  let t = cleanGrade(v);
  if (!t) return { grade: '', obligatory: '', aid: '' };
  let aid = '';
  const a = t.match(AID_RE);
  if (a) {
    aid = a[1].toUpperCase();
    t = (t.slice(0, a.index) + t.slice(a.index! + a[0].length)).replace(/[\s,;]+$/, '').trim();
  }
  // "X>Y" or "X/Y" where both sides hold a grade: hardest, then mandatory.
  const parts = t.split(/\s*[>/]\s*/);
  if (parts.length === 2) {
    const hardest = parts[0].match(GRADE_RE);
    const mandatory = parts[1].match(GRADE_RE);
    if (hardest && mandatory) return { grade: hardest[1], obligatory: mandatory[1], aid };
  }
  return { grade: t, obligatory: '', aid };
}

/** "Sportiva" → bolted, "Trad" → trad, "Mista" → mixed. */
export function parseProtection(v: unknown): Protection | null {
  if (isBlank(v)) return null;
  const t = String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/\b(mist|mixed|semi|parz)/.test(t)) return 'mixed';
  if (/\b(trad|clean|friend|nut|da proteggere|protezioni veloci|alpinistic)/.test(t)) return 'trad';
  if (/\b(sport|spit|bolt|chiodat|plaisir|attrezzat|fix)/.test(t)) return 'bolted';
  return null;
}

/** A 1–5 rating: 4, "4/5", "★★★★"; anything else (or "nd") is none. */
export function parseRating(v: unknown): number | null {
  if (isBlank(v)) return null;
  const stars = String(v).match(/★/g);
  if (stars) return Math.min(5, stars.length);
  const n = parseNumber(String(v).split('/')[0]);
  return n != null && n >= 1 && n <= 5 ? Math.round(n) : null;
}

const COUNTRIES: Record<string, string> = {
  italia: 'IT', italy: 'IT', italie: 'IT', italien: 'IT', francia: 'FR', france: 'FR', frankreich: 'FR',
  svizzera: 'CH', switzerland: 'CH', suisse: 'CH', schweiz: 'CH', austria: 'AT', osterreich: 'AT', autriche: 'AT',
  germania: 'DE', germany: 'DE', deutschland: 'DE', spagna: 'ES', spain: 'ES', espana: 'ES', slovenia: 'SI',
  croazia: 'HR', croatia: 'HR', grecia: 'GR', greece: 'GR', portogallo: 'PT', portugal: 'PT',
};

/** "FR", "Francia", "France" → "FR"; unknown names give "". */
export function parseCountry(v: unknown): string {
  if (isBlank(v)) return '';
  const t = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRIES[t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()] ?? '';
}
