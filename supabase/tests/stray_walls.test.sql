-- A spot that changes sector takes its routes' walls along (#38). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
create function pg_temp.id(key text) returns bigint language sql as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
-- Sector "Muro" with spots A, B and C. vale climbed at A, also on wall B ("Fratelli", which
-- A has too, and "Solo B"), and at C on wall A. Sector "Due" holds D and E, with a visit at D
-- on wall E; "Uno" is empty.
with x as (insert into public.sectors (name) values ('Muro'), ('Scala'), ('Uno'), ('Due') returning id, name)
insert into ids select name, id from x;
with x as (
  insert into public.places (name, activity, lat, lng, sector_id, created_by) values
    ('A', 'crag', 45.1, 9.1, pg_temp.id('Muro'), :vale), ('B', 'crag', 45.1, 9.1, pg_temp.id('Muro'), :vale),
    ('C', 'crag', 45.1, 9.1, pg_temp.id('Muro'), :vale), ('D', 'crag', 45.2, 9.2, pg_temp.id('Due'), :vale),
    ('E', 'crag', 45.2, 9.2, pg_temp.id('Due'), :vale)
  returning id, name
) insert into ids select name, id from x;
with x as (
  insert into public.routes (place_id, name) values (pg_temp.id('B'), 'Fratelli'), (pg_temp.id('A'), 'fratelli'), (pg_temp.id('B'), 'Solo B')
  returning id, place_id::text || name as k
) insert into ids select case k when pg_temp.id('B') || 'Fratelli' then 'B.fratelli' when pg_temp.id('A') || 'fratelli' then 'A.fratelli' else 'B.solo' end, id from x;
with x as (insert into public.visits (user_id, place_id, date) values
  (:vale, pg_temp.id('A'), '2026-05-23'), (:vale, pg_temp.id('C'), '2026-05-24'), (:vale, pg_temp.id('D'), '2026-05-25')
  returning id, place_id) insert into ids select 'v' || (select name from public.places where id = place_id), id from x;
insert into public.ascents (visit_id, name, grade, place_id, route_id, position) values
  (pg_temp.id('vA'), 'Fratelli', '6a', pg_temp.id('B'), pg_temp.id('B.fratelli'), 0),
  (pg_temp.id('vA'), 'Solo B', '6b', pg_temp.id('B'), pg_temp.id('B.solo'), 1),
  (pg_temp.id('vC'), 'Spigolo', null, pg_temp.id('A'), null, 0),
  (pg_temp.id('vD'), 'Placca', null, pg_temp.id('E'), null, 0);

select throws_ok(format('insert into public.ascents (visit_id, name, place_id) values (%s, %L, %s)', pg_temp.id('vD'), 'X', pg_temp.id('A')),
                 '23514', 'A route can only be on another wall of the same crag: "A" isn''t in this spot''s sector',
                 'a route on a wall of another crag is refused, in words');

-- ---------------------------------------------------------------- A moves to another sector
update public.places set sector_id = pg_temp.id('Scala') where id = pg_temp.id('A');
select is((select count(*) from public.ascents where visit_id = pg_temp.id('vA') and place_id is not null), 0::bigint,
          'its routes on walls of the old sector lose the wall');
select is((select route_id from public.ascents where visit_id = pg_temp.id('vA') and name = 'Fratelli'), pg_temp.id('A.fratelli'),
          'a route the spot has too is linked to the spot''s');
select is((select array[name, grade, route_id::text] from public.ascents where visit_id = pg_temp.id('vA') and name = 'Solo B'),
          array['Solo B', '6b', null], 'any other keeps its name and grade');
select is((select place_id from public.ascents where visit_id = pg_temp.id('vC')), null::bigint,
          'routes logged on it as a wall, from the old sector, lose it too');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select lives_ok(format('select public.save_visit(%L)', jsonb_build_object(
  'id', pg_temp.id('vA'), 'place_id', pg_temp.id('A'), 'date', '2026-05-23',
  'ascents', (select jsonb_agg(jsonb_build_object('name', name, 'grade', grade, 'place_id', place_id) order by position)
              from public.ascents where visit_id = pg_temp.id('vA')))),
  'the visit saves again');
reset role;

-- ---------------------------------------------------------------- merging sectors moves walls together
select private.merge_sectors(pg_temp.id('Uno'), pg_temp.id('Due'));
select is((select place_id from public.ascents where visit_id = pg_temp.id('vD')), pg_temp.id('E'),
          'spots moved into one sector together keep their walls');

-- ---------------------------------------------------------------- the routes left on stray walls so far
select is((select count(*) from public.ascents a join public.visits v on v.id = a.visit_id
           where a.place_id is not null and a.place_id <> v.place_id and not private.same_sector(v.place_id, a.place_id)),
          0::bigint, 'no route is on a wall outside its visit''s sector');

select * from finish();
rollback;
