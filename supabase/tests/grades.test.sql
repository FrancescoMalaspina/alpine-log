-- grade_rank must agree with web/src/lib/grades.ts. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select is(public.grade_rank('6a'), 36, '6a');
select is(public.grade_rank('6a+'), 37, '6a+');
select is(public.grade_rank('6b'), 38, '6b');
select is(public.grade_rank('7a'), 42, '7a');
select is(public.grade_rank('5'), 30, 'bare number counts as the "a" grade');
select is(public.grade_rank('VI-'), public.grade_rank('5c'), 'UIAA VI- = 5c');
select is(public.grade_rank('VI A0/V'), public.grade_rank('VI'), 'first grade of a combined grade wins');
select is(public.grade_rank(' 6b+ '), 39, 'whitespace and case are ignored');
select is(public.grade_rank(''), null, 'empty grade has no rank');
select is(public.grade_rank('project'), null, 'unknown grade has no rank');

select * from finish();
rollback;
