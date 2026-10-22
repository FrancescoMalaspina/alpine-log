-- A crag's sectors: who adds and changes them, a crag in no sector (#11). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

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

select * from finish();
rollback;
