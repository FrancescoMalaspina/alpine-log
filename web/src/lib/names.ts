/*
 * How names are compared: spot, area and sector names, and the column
 * headers of an imported file. The database compares them the same way
 * (public.fold_name in supabase/migrations/20261016100000_similar_names.sql);
 * keep the two in step.
 */

/** Letters that are not "a letter plus an accent", spelled as Postgres' unaccent spells them. */
const LETTERS: Record<string, string> = { ß: 'ss', ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D' };

/** "Località Øvre" → "Localita Ovre". */
export const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[ßøØæÆœŒłŁđĐ]/g, c => LETTERS[c]);

/** "Corna Rossa – Parete N°1 " → "corna rossa parete n 1": accents, case, punctuation and spacing don't count. */
export const foldName = (s: string) =>
  stripAccents(s).toLowerCase().replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();

/** Two names that are the same once folded. */
export const sameName = (a: string, b: string) => foldName(a) === foldName(b);
