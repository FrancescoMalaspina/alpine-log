-- Area → Sector → Spot (vie lunghe and the like; a crag has its sectors inside): save_place, area consistency, RLS.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
with s as (insert into public.sectors (name, created_by) values ('Pilastri', :fra) returning id) insert into ids select 'civate', id from s;
insert into ids select 'albard', id from public.areas where name = 'Albard';
insert into ids select 'ozzy', id from public.places where name = 'Ozzy';

-- ---------------------------------------------------------------- the layout
select is((select array_agg(cs.name order by cs.name) from public.crag_sectors cs join public.places p on p.id = cs.place_id
           where p.name = 'Falesia di Civate'),
          array['Amazzonia + Palestra vecchia', 'Buco della Sabbia', 'La balconata', 'Valle degli Orti'],
          'Falesia di Civate is one crag, with its sectors inside');
select ok((select coalesce(bool_and(p.area_id is not distinct from s.area_id), true) from public.places p join public.sectors s on s.id = p.sector_id),
          'every spot in a sector is in the sector''s area');
select is((select count(*) from public.places where sector_id is not null and public.has_crag_sectors(activity)), 0::bigint,
          'no crag, boulder or DWS spot is in a sector');

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok((select count(*) from public.sectors) > 0, 'anon reads sectors');
select throws_ok($$insert into public.sectors (name) values ('Nope')$$, '42501', null, 'anon cannot add a sector');

-- ---------------------------------------------------------------- vale
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

insert into ids select 'route', public.save_place(jsonb_build_object(
  'name', 'Via del Pilastro', 'activity', 'multipitch', 'lat', 45.6, 'lng', 7.7,
  'area_name', 'albard', 'sector_name', 'Parete Nord'));
insert into ids select 'north', sector_id from public.places where id = (select v from ids where k = 'route');
select is((select area_id from public.sectors where id = (select v from ids where k = 'north')),
          (select v from ids where k = 'albard'), 'save_place creates the sector in the spot''s area');
insert into ids select 'diedro', public.save_place(jsonb_build_object(
  'name', 'Diedro', 'activity', 'multipitch', 'lat', 45.6, 'lng', 7.7, 'area_name', 'Albard', 'sector_name', 'parete NORD'));
select is((select sector_id from public.places where id = (select v from ids where k = 'diedro')),
          (select v from ids where k = 'north'), 'a second spot joins the same sector, matched ignoring case');
select is((select count(*) from public.sectors where lower(name) = 'parete nord'), 1::bigint, 'no duplicate sector');

update public.sectors set name = 'hijacked' where id = (select v from ids where k = 'civate');
select is((select name from public.sectors where id = (select v from ids where k = 'civate')), 'Pilastri',
          'vale cannot rename fra''s sector');
select lives_ok(format($$update public.sectors set description = 'Big north face' where id = %s$$, (select v from ids where k = 'north')),
                'vale edits the sector she created');

-- Moving her sector to another area moves its spots, even ones she can't edit.
reset role;
update public.places set sector_id = (select v from ids where k = 'north') where id = (select v from ids where k = 'ozzy');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
update public.sectors set area_id = (select id from public.areas where name = 'Grignetta') where id = (select v from ids where k = 'north');
select is((select a.name from public.places p join public.areas a on a.id = p.area_id where p.id = (select v from ids where k = 'ozzy')),
          'Grignetta', 'a sector''s spots follow it to its new area');

-- ---------------------------------------------------------------- fra (admin)
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select lives_ok(format($$delete from public.sectors where id = %s$$, (select v from ids where k = 'north')),
                'an admin deletes any sector');
reset role;
select is((select sector_id from public.places where id = (select v from ids where k = 'route')), null,
          'its spots stay, without a sector');

select * from finish();
rollback;
