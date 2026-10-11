/*
 * Mirrors public.grade_rank() in supabase/migrations — keep the two in sync
 * (supabase/tests/grades.test.sql pins the SQL side).
 * French grades: rank = number*6 + letter(a=0,b=2,c=4) + plus(1).
 * UIAA grades (VI-, IV+, "VI A0/V") map onto the same scale.
 */
const UIAA: Record<string, number> = {
  'I': 6, 'II': 12, 'III': 18, 'III+': 20, 'IV-': 22, 'IV': 24, 'IV+': 26, 'V-': 28, 'V': 30, 'V+': 32,
  'VI-': 34, 'VI': 36, 'VI+': 37, 'VII-': 38, 'VII': 39, 'VII+': 40, 'VIII-': 41, 'VIII': 42, 'VIII+': 44,
  'IX-': 45, 'IX': 46, 'IX+': 47,
};

export function gradeRank(grade: string): number | null {
  const g = grade.trim().toUpperCase();
  const fr = g.match(/^([1-9])([ABC])?(\+)?/);
  if (fr) return Number(fr[1]) * 6 + (fr[2] ? 'ABC'.indexOf(fr[2]) * 2 : 0) + (fr[3] ? 1 : 0);
  const uiaa = g.match(/^(IX|VIII|VII|VI|V|IV|III|II|I)([+-])?/);
  return uiaa ? UIAA[uiaa[1] + (uiaa[2] ?? '')] ?? null : null;
}

/** French grades offered by the "at least" filter. */
export const GRADE_OPTIONS = ['4a', '4b', '4c', '5a', '5b', '5c']
  .concat(...[6, 7, 8].map(n => ['a', 'a+', 'b', 'b+', 'c', 'c+'].map(l => `${n}${l}`)))
  .map(label => ({ label, rank: gradeRank(label)! }));
