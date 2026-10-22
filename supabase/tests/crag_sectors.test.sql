-- A crag's sectors: who adds, changes and merges them, a crag in no sector (#11). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''
\set ugo  '\'33333333-3333-4333-8333-333333333333\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
create function pg_temp.id(key text) returns bigint language sql as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to anon, authenticated;
create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
-- fra's crag "Muro del Butch" (seed) and its sector "Scala dei sogni"; a sector of an area.
insert into ids select 'butch', id from public.places where name = 'Muro del Butch';
insert into ids select 'scala', id from public.crag_sectors where name = 'Scala dei sogni';
with s as (insert into public.sectors (name) values ('Pilastro') returning id) insert into ids select 'area_sector', id from s;

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok((select count(*) from public.crag_sectors) > 0, 'anon reads crag sectors');
select throws_ok(format($$insert into public.crag_sectors (place_id, name) values (%s, 'Nope')$$, pg_temp.id('butch')),
                 '42501', null, 'anon cannot add one');

-- ---------------------------------------------------------------- vale
reset role;
set local role authenticated;
select pg_temp.as_user(:vale);
with s as (insert into public.crag_sectors (place_id, name, lat, lng) values (pg_temp.id('butch'), 'Placche', 45.9, 9.4) returning id)
insert into ids select 'placche', id from s;
select ok(pg_temp.id('placche') is not null, 'a signed-in user adds a sector to any crag');
select throws_ok(format($$insert into public.crag_sectors (place_id, name) values (%s, ' placche ')$$, pg_temp.id('butch')),
                 '23505', null, 'sector names are unique per crag, ignoring case and blanks');
select throws_ok(format($$insert into public.crag_sectors (place_id, name, lat) values (%s, 'Mezzo', 45.9)$$, pg_temp.id('butch')),
                 '23514', null, 'a sector''s position has both coordinates or none');
update public.crag_sectors set name = 'hijacked' where id = pg_temp.id('scala');
select is((select name from public.crag_sectors where id = pg_temp.id('scala')), 'Scala dei sogni',
          'nobody else renames a sector of fra''s crag');
select lives_ok(format($$update public.crag_sectors set description = 'Short approach' where id = %s$$, pg_temp.id('placche')),
                'the sector''s author changes it');

-- ---------------------------------------------------------------- fra, the crag's creator
select pg_temp.as_user(:fra);
select lives_ok(format($$update public.crag_sectors set name = 'Placche basse' where id = %s$$, pg_temp.id('placche')),
                'the crag''s editor renames a sector someone else added');
insert into public.routes (place_id, crag_sector_id, name) values (pg_temp.id('butch'), pg_temp.id('placche'), 'Lavagna');
delete from public.crag_sectors where id = pg_temp.id('placche');
select is((select crag_sector_id from public.routes where name = 'Lavagna'), null::bigint,
          'removing a sector keeps its tiri, in no sector');

-- ---------------------------------------------------------------- a crag is in no sector
reset role;
update public.places set sector_id = pg_temp.id('area_sector') where id = pg_temp.id('butch');
select is((select sector_id from public.places where id = pg_temp.id('butch')), null::bigint, 'a crag cannot be put in a sector');
insert into public.places (name, activity, lat, lng, sector_id) values ('Diedro', 'multipitch', 45.9, 9.4, pg_temp.id('area_sector'));
update public.places set activity = 'crag' where name = 'Diedro';
select is((select sector_id from public.places where name = 'Diedro'), null::bigint, 'a via lunga that becomes a crag leaves its sector');

-- ---------------------------------------------------------------- two sectors become one
-- vale added "Scala sogni", the same as "Scala dei sogni": tiri "lavagna" (Scala dei sogni has
-- "Lavagna") and "Solo", a visit on "lavagna" and on something unlisted there.
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', :ugo, 'authenticated', 'authenticated', 'ugo@example.com');
with x as (insert into public.crag_sectors (place_id, name, description, lat, lng, created_by)
           values (pg_temp.id('butch'), 'Scala sogni', 'Shade after 3pm', 45.91, 9.43, :vale) returning id)
insert into ids select 'dup', id from x;
with x as (insert into public.routes (place_id, crag_sector_id, name) values
  (pg_temp.id('butch'), pg_temp.id('scala'), 'Lavagna'), (pg_temp.id('butch'), pg_temp.id('dup'), 'lavagna'),
  (pg_temp.id('butch'), pg_temp.id('dup'), 'Solo')
  returning id, case when crag_sector_id = pg_temp.id('scala') then 'keep.lavagna' when name = 'lavagna' then 'dup.lavagna' else 'dup.solo' end as k)
insert into ids select k, id from x;
with x as (insert into public.visits (user_id, place_id, date) values (:vale, pg_temp.id('butch'), '2026-10-20') returning id)
insert into ids select 'visit', id from x;
insert into public.ascents (visit_id, name, route_id, crag_sector_id, position) values
  (pg_temp.id('visit'), 'lavagna', pg_temp.id('dup.lavagna'), pg_temp.id('dup'), 0),
  (pg_temp.id('visit'), 'Unlisted', null, pg_temp.id('dup'), 1);

set local role authenticated;
select pg_temp.as_user(:ugo);
select throws_ok(format('select public.merge_crag_sectors(%s, %s)', pg_temp.id('scala'), pg_temp.id('dup')),
                 '42501', null, 'someone else cannot merge vale''s sector');
select pg_temp.as_user(:vale);
select throws_ok(format('select public.merge_crag_sectors(%s, %s)', (select id from public.crag_sectors where name = 'Valle degli Orti'), pg_temp.id('dup')),
                 'P0002', null, 'sectors of two crags are not merged this way');
select is(public.merge_crag_sectors(pg_temp.id('scala'), pg_temp.id('dup')), pg_temp.id('scala'), 'vale merges her sector into another');
reset role;
select ok(not exists (select 1 from public.crag_sectors where id = pg_temp.id('dup')), 'the merged sector is gone');
select is((select array[route_id, crag_sector_id] from public.ascents where visit_id = pg_temp.id('visit') and name = 'lavagna'),
          array[pg_temp.id('keep.lavagna'), pg_temp.id('scala')], 'a route on a tiro of the same name is on the kept one');
select ok(not exists (select 1 from public.routes where id = pg_temp.id('dup.lavagna')), '…and that tiro is gone');
select is((select crag_sector_id from public.routes where id = pg_temp.id('dup.solo')), pg_temp.id('scala'), 'another tiro moves');
select is((select crag_sector_id from public.ascents where visit_id = pg_temp.id('visit') and name = 'Unlisted'), pg_temp.id('scala'),
          'an unlisted route climbed there is in the kept sector');
select is((select array[lat::text, lng::text, description] from public.crag_sectors where id = pg_temp.id('scala')),
          array['45.91', '9.43', 'Shade after 3pm'], 'the kept sector takes the position and description it lacked');

select * from finish();
rollback;
