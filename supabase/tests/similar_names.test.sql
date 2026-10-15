-- Similar names: fold_name, save_place reusing areas and sectors, similar_places, similar_areas.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'butch', id from public.places where name = 'Muro del Butch';

-- The same examples are checked against foldName in web/src/lib/duplicates.test.ts.
select is(public.fold_name('Valsàssina'), 'valsassina', 'fold_name strips accents and case');
select is(public.fold_name('  Val  Sassina!'), 'val sassina', 'fold_name collapses spaces and punctuation');
select is(public.fold_name('Straße Øresund'), 'strasse oresund', 'fold_name spells out ß and ø');
select is(public.fold_name('Corna Rossa - Parete N°1'), 'corna rossa parete n 1', 'fold_name drops symbols');
select is(public.fold_name('ÉCRINS l''Ailefroide'), 'ecrins l ailefroide', 'fold_name drops apostrophes');

-- ---------------------------------------------------------------- vale adds spots
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

insert into ids select 'p1', public.save_place(jsonb_build_object(
  'name', 'Placca alta', 'activity', 'crag', 'lat', 45.9, 'lng', 9.4, 'area_name', 'Valsàssina', 'sector_name', 'Cornà'));
insert into ids select 'p2', public.save_place(jsonb_build_object(
  'name', 'Placca bassa', 'activity', 'crag', 'lat', 45.9, 'lng', 9.4, 'area_name', 'VALSASSINA ', 'sector_name', 'corna'));

select is((select area_id from public.places where id = (select v from ids where k = 'p2')),
          (select area_id from public.places where id = (select v from ids where k = 'p1')),
          'save_place reuses an area that differs only in accents and case');
select is((select sector_id from public.places where id = (select v from ids where k = 'p2')),
          (select sector_id from public.places where id = (select v from ids where k = 'p1')),
          'save_place reuses a sector that differs only in accents and case');

select ok(exists (select 1 from public.similar_places('[{"key":"a","name":"Placca Alta!","activity":"crag"}]')
                  where place_id = (select v from ids where k = 'p1') and similarity = 1),
          'similar_places finds a spot whose folded name is the same');
select ok(exists (select 1 from public.similar_places(jsonb_build_array(jsonb_build_object(
                    'key', 'a', 'name', 'Placca', 'activity', 'crag', 'lat', 45.9001, 'lng', 9.4)))
                  where place_id = (select v from ids where k = 'p1') and distance_km < 0.3),
          'similar_places finds a nearby spot of the same activity with a loosely similar name');
select ok(not exists (select 1 from public.similar_places(jsonb_build_array(jsonb_build_object(
                        'key', 'a', 'name', 'Placca alta', 'exclude_id', (select v from ids where k = 'p1'))))
                      where place_id = (select v from ids where k = 'p1')),
          'similar_places leaves out the excluded spot');

select ok(exists (select 1 from public.similar_areas(array['Val Sassina']) where name = 'Valsàssina'),
          'similar_areas finds an area spelled differently');

select * from finish();
rollback;
