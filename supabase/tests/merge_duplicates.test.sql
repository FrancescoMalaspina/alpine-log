-- Merging duplicates: merge_places, merge_areas, duplicate_places. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
create function pg_temp.id(key text) returns bigint language sql as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
-- Area "Valle" (with a sector "Sasso" for vie lunghe): the kept crag K, its duplicate D, and
-- another crag S. K has sector "Placca" with tiro "Via Uno"; D has "placca" (same folded
-- name) with "via-uno", and "Tetto" with "Via Due".
with x as (insert into public.areas (name) values ('Valle') returning id) insert into ids select 'area', id from x;
with x as (insert into public.sectors (area_id, name) values (pg_temp.id('area'), 'Sasso') returning id) insert into ids select 'sector', id from x;
with x as (
  insert into public.places (name, activity, lat, lng, area_id, grade, description, created_by)
  values ('Placca Bella', 'crag', 45.9, 9.4, pg_temp.id('area'), null, 'Kept.', :fra),
         ('Placca bèlla', 'crag', 45.9001, 9.4, pg_temp.id('area'), '6a', 'Duplicate.', :vale),
         ('Torrione', 'crag', 45.901, 9.4, pg_temp.id('area'), null, null, :fra)
  returning id, case name when 'Placca Bella' then 'K' when 'Placca bèlla' then 'D' else 'S' end as k
) insert into ids select k, id from x;
with x as (
  insert into public.crag_sectors (place_id, name) values (pg_temp.id('K'), 'Placca'), (pg_temp.id('D'), 'placca'), (pg_temp.id('D'), 'Tetto')
  returning id, case when place_id = pg_temp.id('K') then 'K.placca' when name = 'placca' then 'D.placca' else 'D.tetto' end as k
) insert into ids select k, id from x;
with x as (
  insert into public.routes (place_id, crag_sector_id, name) values
    (pg_temp.id('K'), pg_temp.id('K.placca'), 'Via Uno'), (pg_temp.id('D'), pg_temp.id('D.placca'), 'via-uno'),
    (pg_temp.id('D'), pg_temp.id('D.tetto'), 'Via Due')
  returning id, case name when 'Via Uno' then 'K.uno' when 'via-uno' then 'D.uno' else 'D.due' end as k
) insert into ids select k, id from x;

-- vale climbed both tiri of D, and something unlisted in its "placca".
with x as (insert into public.visits (user_id, place_id, date) values (:vale, pg_temp.id('D'), '2026-09-01') returning id) insert into ids select 'vD', id from x;
insert into public.ascents (visit_id, name, route_id, crag_sector_id, position) values
  (pg_temp.id('vD'), 'via-uno', pg_temp.id('D.uno'), pg_temp.id('D.placca'), 0),
  (pg_temp.id('vD'), 'Via Due', pg_temp.id('D.due'), pg_temp.id('D.tetto'), 1),
  (pg_temp.id('vD'), 'Unlisted', null, pg_temp.id('D.placca'), 2);

insert into public.photos (place_id, storage_path, thumb_path, created_by) values (pg_temp.id('D'), 'x/place/1.jpg', 'x/place/1.thumb.jpg', :vale);
insert into public.attachments (place_id, kind, url, title, created_by) values (pg_temp.id('D'), 'link', 'https://example.com/topo', 'Topo', :vale);
insert into public.spot_comments (place_id, user_id, body) values (pg_temp.id('D'), :vale, 'Wet after rain');
-- vale wishes for both (one is dropped), fra only for D (it moves).
insert into public.wishlist (user_id, place_id) values (:vale, pg_temp.id('K')), (:vale, pg_temp.id('D')), (:fra, pg_temp.id('D'));

-- ---------------------------------------------------------------- vale is not an admin
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select throws_ok(format('select public.merge_places(%s, %s)', pg_temp.id('K'), pg_temp.id('D')), '42501', null, 'a user cannot merge spots');
select throws_ok('select * from public.duplicate_places()', '42501', null, 'a user cannot list duplicates');

-- ---------------------------------------------------------------- fra merges D into K
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select ok(exists (select 1 from public.duplicate_places()
                  where (place_id, other_id) = (least(pg_temp.id('K'), pg_temp.id('D')), greatest(pg_temp.id('K'), pg_temp.id('D')))),
          'duplicate_places lists the pair');
select throws_ok(format('select public.merge_places(%s, %s)', pg_temp.id('K'), pg_temp.id('K')), '22023', null, 'a spot cannot be merged into itself');
select is(public.merge_places(pg_temp.id('K'), pg_temp.id('D')) ->> 'visits', '1', 'merge_places reports the visits moved');

reset role;
select ok(not exists (select 1 from public.places where id = pg_temp.id('D')), 'the duplicate is gone');
select is((select place_id from public.visits where id = pg_temp.id('vD')), pg_temp.id('K'), 'another user''s visit moved to the kept spot');
select is((select grade from public.places where id = pg_temp.id('K')), '6a', 'a blank detail is filled from the duplicate');
select is((select description from public.places where id = pg_temp.id('K')), E'Kept.\n\nDuplicate.', 'descriptions are put together');
select is((select array_agg(name order by name) from public.crag_sectors where place_id = pg_temp.id('K')), array['Placca', 'Tetto'],
          'the kept crag has both crags'' sectors, one of the same name once');
select is((select count(*) from public.routes where place_id = pg_temp.id('K')), 2::bigint, 'the kept spot has both routes, once');
select is((select array[route_id, crag_sector_id] from public.ascents where visit_id = pg_temp.id('vD') and name = 'via-uno'),
          array[pg_temp.id('K.uno'), pg_temp.id('K.placca')], 'a tiro of the same name in the same sector is the kept spot''s');
select is((select array[route_id, crag_sector_id] from public.ascents where visit_id = pg_temp.id('vD') and name = 'Via Due'),
          array[pg_temp.id('D.due'), pg_temp.id('D.tetto')], 'a tiro the kept spot hadn''t got moved with its sector and ascents');
select is((select place_id from public.routes where id = pg_temp.id('D.due')), pg_temp.id('K'), 'that tiro is on the kept spot');
select is((select crag_sector_id from public.ascents where visit_id = pg_temp.id('vD') and name = 'Unlisted'), pg_temp.id('K.placca'),
          'a route in a sector of the same name is in the kept one');
select is((select count(*) from public.photos where place_id = pg_temp.id('K')), 1::bigint, 'photos moved');
select is((select count(*) from public.attachments where place_id = pg_temp.id('K')), 1::bigint, 'links moved');
select is((select count(*) from public.spot_comments where place_id = pg_temp.id('K')), 1::bigint, 'tips moved');
select is((select count(*) from public.wishlist where place_id = pg_temp.id('K') and done_at is null), 2::bigint,
          'one open wish per person on the kept spot');

-- ---------------------------------------------------------------- areas
-- "Vallé" has a sector "sasso" (merged into "Sasso"), a sector "Pilastro" (moves),
-- and a spot without a sector.
with x as (insert into public.areas (name, description) values ('Vallé', 'From the north.') returning id) insert into ids select 'area2', id from x;
with x as (
  insert into public.sectors (area_id, name) values (pg_temp.id('area2'), 'sasso'), (pg_temp.id('area2'), 'Pilastro')
  returning id, case name when 'sasso' then 'sasso2' else 'pilastro' end as k
) insert into ids select k, id from x;
with x as (
  insert into public.places (name, activity, lat, lng, area_id, sector_id) values
    ('Diedro', 'multipitch', 45.9, 9.4, pg_temp.id('area2'), pg_temp.id('sasso2')),
    ('Spigolo', 'multipitch', 45.9, 9.4, pg_temp.id('area2'), pg_temp.id('pilastro')),
    ('Masso', 'boulder', 45.9, 9.4, pg_temp.id('area2'), null)
  returning id, name as k
) insert into ids select k, id from x;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select throws_ok(format('select public.merge_areas(%s, %s)', pg_temp.id('area'), pg_temp.id('area2')), '42501', null, 'a user cannot merge areas');
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select is(public.merge_areas(pg_temp.id('area'), pg_temp.id('area2')) ->> 'spots', '3', 'merge_areas reports the spots moved');

reset role;
select is((select count(*) from public.places where area_id = pg_temp.id('area')), 5::bigint, 'every spot is in the kept area');
select is((select sector_id from public.places where id = pg_temp.id('Diedro')), pg_temp.id('sector'),
          'a sector of the same folded name is merged into the kept one');
select is((select area_id from public.sectors where id = pg_temp.id('pilastro')), pg_temp.id('area'), 'another sector moves');

select * from finish();
rollback;
