-- Spots compared by sector and name together: spot_full_name, similar_places, areas_for_spots (#29).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
create function pg_temp.id(key text) returns bigint language sql as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to anon, authenticated;

select is(public.spot_full_name('Weissmies', 'via normale'), 'weissmies via normale', 'spot_full_name puts sector and name together');
select is(public.spot_full_name('Weissmies', 'Weissmies - via normale'), 'weissmies via normale', '…with the sector once');
select is(public.spot_full_name(null, 'Via Normale'), 'via normale', '…or the name alone');
select is(public.core_name('Falesia di Civate'), 'civate', 'core_name drops the words that say what kind of place it is');

-- ---------------------------------------------------------------- fixtures
-- Many mountains with a "via normale", one written as a whole name, one with no mountain at all.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
insert into ids select k, public.save_place(jsonb_build_object(
  'name', n, 'activity', 'alpine', 'lat', lat, 'lng', lng, 'area_name', a, 'sector_name', s))
from (values
  ('gp',   'via normale', 'Gran Paradiso',         'Gruppo Gran Paradiso', 45.52, 7.27),
  ('br',   'via normale', 'Breithorn',             'Monte Rosa',           45.94, 7.75),
  ('bro',  'via normale', 'Breithorn Occidentale', 'Monte Rosa',           45.94, 7.74),
  ('ca',   'via normale', 'Castore',               'Monte Rosa',           45.92, 7.79),
  ('po',   'via normale', 'Polluce',               'Monte Rosa',           45.92, 7.78),
  
  ('na',   'via normale', 'Nadelhorn',             'Mischabel',            46.11, 7.86),
  ('lag',  'via normale', 'Lagginhorn',            'Valle di Saas',        46.15, 8.00),
  ('wm',   'Weissmies - via normale', null,        'Valle di Saas',        46.13, 8.01),
  ('orph', 'Via Normale', null,                    null,                   46.0,  9.4),
  ('cbn',  'Via Normale', null,                    'Campanile Basso',      46.18, 10.88)
) as x (k, n, s, a, lat, lng);

create function pg_temp.top(q jsonb) returns bigint language sql as $$
  select place_id from public.similar_places(jsonb_build_array(q)) limit 1 $$;
create function pg_temp.found(q jsonb, k text) returns boolean language sql as $$
  select exists (select 1 from public.similar_places(jsonb_build_array(q)) where place_id = pg_temp.id(k)) $$;
grant execute on function pg_temp.top(jsonb), pg_temp.found(jsonb, text) to authenticated;

-- ---------------------------------------------------------------- similar_places
select is(pg_temp.top('{"key":"q","name":"via normale","sector":"Gran Paradiso","activity":"alpine"}'), pg_temp.id('gp'),
          'the via normale of the same mountain comes first');
select is(pg_temp.top('{"key":"q","name":"via normale","sector":"Breithorn","activity":"alpine"}'), pg_temp.id('br'),
          'Breithorn is not Breithorn Occidentale');
select is(pg_temp.top('{"key":"q","name":"via normale","sector":"Weissmies","activity":"alpine"}'), pg_temp.id('wm'),
          'a spot written as one whole name is found from sector and name');
select is(pg_temp.top('{"key":"q","name":"Via normale al Weissmies","activity":"alpine"}'), pg_temp.id('wm'),
          '…and from the words in another order');
select ok(pg_temp.found('{"key":"q","name":"via normale","sector":"Nadelhorn","activity":"alpine"}', 'na'),
          'the right mountain is never cut off the list by other via normale');
select is((select same_sector from public.similar_places(
            '[{"key":"q","name":"via normale","sector":"Breithorn","activity":"alpine"}]') where place_id = pg_temp.id('bro')),
          false, 'another sector is reported as such');
select ok((select similarity < 0.75 from public.similar_places(
            '[{"key":"q","name":"via normale","sector":"Castore","activity":"alpine"}]') where place_id = pg_temp.id('orph')),
          'a "Via Normale" of no mountain is not alike enough to be taken for one');

select ok((select similarity = 1 from public.similar_places(
            '[{"key":"q","name":"via normale","sector":"Campanile Basso","area":"Dolomiti","activity":"alpine"}]') where place_id = pg_temp.id('cbn')),
          'a spot whose mountain is its area is the same as one whose sector names it');
select ok((select similarity = 1 from public.similar_places(
            '[{"key":"q","name":"via normale","area":"Campanile Basso","activity":"alpine"}]') where place_id = pg_temp.id('cbn')),
          '…or whose area does');
select ok((select similarity < 0.75 from public.similar_places(
            '[{"key":"q","name":"via normale","area":"Monte Rosa","activity":"alpine"}]') where place_id = pg_temp.id('ca')),
          'an area alone does not say which of its mountains is meant');

-- ---------------------------------------------------------------- areas_for_spots
select ok(exists (select 1 from public.areas_for_spots('[{"key":"g","sectors":["Lagginhorn"],"points":[]}]')
                  where name = 'Valle di Saas' and sector_name = 'Lagginhorn'),
          'areas_for_spots finds the area a sector is already in');
select ok(exists (select 1 from public.areas_for_spots('[{"key":"g","sectors":["Weissmies"],"points":[{"lat":46.12,"lng":8.0}]}]')
                  where name = 'Valle di Saas' and distance_km < 5),
          'areas_for_spots finds areas with spots near the pins');

select * from finish();
rollback;
