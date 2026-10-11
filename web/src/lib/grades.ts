/*
 * French-grade half of public.grade_rank() in supabase/migrations — keep the
 * formula in sync (supabase/tests/grades.test.sql pins the SQL side). The
 * database also ranks UIAA grades (VI-, IV+); the UI only needs French ones.
 * rank = French number*6 + letter(a=0,b=2,c=4) + plus(1)
 */
export function gradeRank(grade: string): number | null {
  const g = grade.trim().toUpperCase();
  const m = g.match(/^([1-9])([ABC])?(\+)?/);
  if (!m) return null;
  return Number(m[1]) * 6 + (m[2] ? 'ABC'.indexOf(m[2]) * 2 : 0) + (m[3] ? 1 : 0);
}

/** French grades offered by the "at least" filter. */
export const GRADE_OPTIONS = ['4a', '4b', '4c', '5a', '5b', '5c']
  .concat(...[6, 7, 8].map(n => ['a', 'a+', 'b', 'b+', 'c', 'c+'].map(l => `${n}${l}`)))
  .map(label => ({ label, rank: gradeRank(label)! }));
