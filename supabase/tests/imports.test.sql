-- Logbook import: import_logbook, similar_places, undo. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'butch', id from public.places where name = 'Muro del Butch';

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.import_logbook('{"file_name":"x"}')$$, '42501', null, 'anon cannot import');

-- ---------------------------------------------------------------- vale imports a file
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

select ok(exists (select 1 from public.similar_places('[{"key":"a","name":"muro del bùtch"}]') where place_id = (select v from ids where k = 'butch')),
          'similar_places finds a spot by name, ignoring case and accents');
select ok(exists (select 1 from public.similar_places('[{"key":"a","name":"Muro Butch"}]') where place_id = (select v from ids where k = 'butch')),
          'similar_places finds a spot by a similar name');

insert into ids select 'imp1', (public.import_logbook(jsonb_build_object(
  'file_name', 'log.xlsx',
  'spots', jsonb_build_array(
    jsonb_build_object('key', 's1', 'place_id', (select v from ids where k = 'butch')),
    jsonb_build_object('key', 's2', 'place', jsonb_build_object(
      'name', 'Cane Trippa', 'activity', 'multipitch', 'area_name', 'Valle del Sarca Import',
      'lat', 45.99, 'lng', 10.91, 'grade', '5c'),
      'links', jsonb_build_array(jsonb_build_object('title', 'Topo', 'url', 'https://example.com/topo'),
                                 jsonb_build_object('title', 'bad', 'url', 'javascript:alert(1)')))),
  'visits', jsonb_build_array(
    jsonb_build_object('spot', 's1', 'date', '1999-05-23', 'partners', jsonb_build_array('Fra'),
                       'ascents', jsonb_build_array(jsonb_build_object('grade', '5c', 'comment', 'ok', 'sector', 'scala dei SOGNI'))),
    jsonb_build_object('spot', 's2', 'date', '1999-06-01',
                       'ascents', jsonb_build_array(jsonb_build_object('name', 'Cane Trippa', 'grade', '5c')))))) ->> 'import_id')::bigint;

select is((select count(*) from public.visits where import_id = (select v from ids where k = 'imp1')), 2::bigint,
          'the import adds its visits');
select is((select cs.name from public.ascents a join public.visits v on v.id = a.visit_id
           join public.crag_sectors cs on cs.id = a.crag_sector_id where v.import_id = (select v from ids where k = 'imp1')),
          'Scala dei sogni', 'a route''s sector is the crag''s sector of that name, found ignoring case');
select is((select activity from public.places where name = 'Cane Trippa'), 'multipitch', 'a new spot is created');
select is((select count(*) from public.attachments a join public.places p on p.id = a.place_id where p.name = 'Cane Trippa'),
          1::bigint, 'only http(s) links become attachments');
select is((select (summary ->> 'visits')::int from public.imports where id = (select v from ids where k = 'imp1')), 2,
          'the import records what it did');

-- The same file again: same spots and dates are skipped, and nothing is recorded.
select is(public.import_logbook(jsonb_build_object(
  'file_name', 'log.xlsx',
  'spots', jsonb_build_array(jsonb_build_object('key', 's1', 'place_id', (select v from ids where k = 'butch'))),
  'visits', jsonb_build_array(jsonb_build_object('spot', 's1', 'date', '1999-05-23')))),
  '{"import_id": null, "visits": 0, "skipped": 1, "new_spots": 0}'::jsonb,
  're-importing a visit on the same day at the same spot skips it');

-- ---------------------------------------------------------------- fra cannot see or undo vale's import
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select is((select count(*) from public.imports), 0::bigint, 'imports are private');
delete from public.imports where id = (select v from ids where k = 'imp1');

-- ---------------------------------------------------------------- vale undoes it
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select is((select count(*) from public.visits where import_id = (select v from ids where k = 'imp1')), 2::bigint,
          'someone else cannot undo your import');
delete from public.imports where id = (select v from ids where k = 'imp1');
select is((select count(*) from public.visits v join public.places p on p.id = v.place_id
           where p.name = 'Cane Trippa'), 0::bigint, 'undoing an import deletes its visits');

select * from finish();
rollback;
