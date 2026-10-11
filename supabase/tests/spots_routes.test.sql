-- Area → Spot → Visit, one activity per spot, shared route lists. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'butch', id from public.places where name = 'Muro del Butch';
insert into ids select 'civate', id from public.places where name = 'Falesia di Civate';
insert into ids select 'scala', id from public.sectors
  where place_id = (select v from ids where k = 'butch') and name = 'Scala dei sogni';

-- ---------------------------------------------------------------- shape of the data
select is((select count(*) from public.places where activity is null), 0::bigint, 'every spot has an activity');
select is((select array_agg(p.name order by p.name) from public.places p join public.areas a on a.id = p.area_id
           where a.name = 'Grignetta'),
          array['Spigolo Dorn', 'Via Zucchi'], 'Grignetta is an area with one spot per route');
select ok((select bool_and(v.place_id = p.id) from public.visits v join public.places p on p.name = 'Via Zucchi'
           join public.ascents a on a.visit_id = v.id where a.name = 'Via Zucchi'),
          'the Via Zucchi visit sits on the Via Zucchi spot');
select throws_ok($$update public.places set activity = 'bouldering' where id = (select v from ids where k = 'butch')$$,
                 '23514', null, 'activity must be a known one');

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(format($$insert into public.routes (place_id, name) values (%s, 'x')$$, (select v from ids where k = 'butch')),
                 '42501', null, 'anon cannot add routes');

-- ---------------------------------------------------------------- fra lists a route at her crag
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select lives_ok(format($$insert into public.routes (place_id, sector_id, name, grade) values (%s, %s, 'Su alto', '6c')$$,
                       (select v from ids where k = 'butch'), (select v from ids where k = 'scala')),
                'a signed-in user adds a route to a crag''s list');
select throws_ok(format($$insert into public.routes (place_id, name) values (%s, 'su ALTO')$$, (select v from ids where k = 'butch')),
                 '23505', null, 'route names are unique per spot, ignoring case');
select throws_ok(format($$insert into public.routes (place_id, sector_id, name) values (%s, %s, 'Elsewhere')$$,
                        (select v from ids where k = 'civate'), (select v from ids where k = 'scala')),
                 'P0001', null, 'a route''s sector must belong to its spot');

-- ---------------------------------------------------------------- vale logs visits
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

insert into ids select 'v1', public.save_visit(jsonb_build_object(
  'place_id', (select v from ids where k = 'butch'), 'date', '2026-10-01',
  'ascents', jsonb_build_array(jsonb_build_object('name', ' su alto ', 'grade', '6c'),
                               jsonb_build_object('name', 'Free text only', 'grade', '6a'))));
select is((select count(*) from public.ascents a join public.routes r on r.id = a.route_id
           where a.visit_id = (select v from ids where k = 'v1') and r.name = 'Su alto'), 1::bigint,
          'a route typed with the same name (any case) is linked to the list');
select is((select count(*) from public.routes where place_id = (select v from ids where k = 'butch')), 1::bigint,
          'free-text routes are not added to the list by default');

insert into ids select 'v2', public.save_visit(jsonb_build_object(
  'place_id', (select v from ids where k = 'butch'), 'add_routes', true,
  'ascents', jsonb_build_array(jsonb_build_object('name', 'New line', 'grade', '7a', 'sector_id', (select v from ids where k = 'scala')),
                               jsonb_build_object('name', 'Su alto'))));
select is((select array_agg(name order by name) from public.routes where place_id = (select v from ids where k = 'butch')),
          array['New line', 'Su alto'], 'with add_routes, new names join the list (existing ones are not duplicated)');
select is((select count(*) from public.ascents where visit_id = (select v from ids where k = 'v2') and route_id is not null),
          2::bigint, 'and both ascents are linked');

delete from public.routes where name = 'Su alto';
select ok(exists (select 1 from public.routes where name = 'Su alto'), 'vale cannot delete a route fra listed on fra''s spot');

select throws_ok(format($$select public.save_visit(%L)$$, jsonb_build_object(
  'place_id', (select v from ids where k = 'civate'),
  'ascents', jsonb_build_array(jsonb_build_object('route_id', (select min(id) from public.routes where name = 'Su alto'))))),
  'P0001', null, 'an ascent cannot point at another spot''s route');

select * from finish();
rollback;
