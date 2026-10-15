-- save_place / save_visit behaviour. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
-- Muro del Butch: a crag (sector) with three walls (spots)
insert into ids select 'butch', id from public.places where name = 'Muro del Butch';
insert into ids select 'butch_wall', id from public.places where name = 'Scala dei sogni';
insert into ids select 'butch_sector', sector_id from public.places where name = 'Muro del Butch';
insert into ids select 'fra_visit', min(id) from public.visits where user_id = :fra::uuid;

-- ---------------------------------------------------------------- anon
set local role anon;
select throws_ok($$select public.save_visit('{"place_id": 1}')$$, '42501', null,
                 'anon cannot call save_visit');

-- ---------------------------------------------------------------- vale
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

insert into ids select 'vale_visit', public.save_visit(jsonb_build_object(
  'place_id', (select v from ids where k = 'butch'),
  'date', '2026-10-10',
  'visibility', 'public',
  'summary', '  great day  ',
  'partners', jsonb_build_array('Gio', 'Ire', 'Gio', ' '),
  'ascents', jsonb_build_array(
    jsonb_build_object('name', 'Su alto', 'grade', '6c', 'place_id', (select v from ids where k = 'butch_wall')),
    jsonb_build_object('name', 'Busazza', 'grade', '6b'))));

select is((select summary from public.visit_notes where visit_id = (select v from ids where k = 'vale_visit')),
          'great day', 'text fields are trimmed');
select is((select count(*) from public.partners where owner_id = :vale::uuid), 2::bigint,
          'new partner names are added once, blanks ignored');
select is((select array_agg(name order by position) from public.ascents
           where visit_id = (select v from ids where k = 'vale_visit')),
          array['Su alto', 'Busazza'], 'ascents saved in order');
select is((select max_grade_rank from public.visit_overview where id = (select v from ids where k = 'vale_visit')),
          40, 'overview reports the hardest grade');

select lives_ok(format($$select public.save_visit(%L)$$, jsonb_build_object(
  'id', (select v from ids where k = 'vale_visit'),
  'visibility', 'private',
  'partners', jsonb_build_array('Ire'),
  'ascents', jsonb_build_array(jsonb_build_object('grade', '7a')))), 'vale edits her visit');
select is((select count(*) from public.ascents where visit_id = (select v from ids where k = 'vale_visit')),
          1::bigint, 'editing replaces the ascents');
select is((select partner_names from public.visit_overview where id = (select v from ids where k = 'vale_visit')),
          array['Ire'], 'editing replaces the partners');

select throws_ok(format($$select public.save_visit(%L)$$, jsonb_build_object(
  'id', (select v from ids where k = 'fra_visit'))),
  '42501', null, 'vale cannot edit fra''s visit through save_visit');
select throws_ok(format($$select public.save_place(%L)$$, jsonb_build_object(
  'id', (select v from ids where k = 'butch'), 'name', 'x', 'activity', 'crag', 'lat', 1, 'lng', 1)),
  '42501', null, 'vale cannot edit fra''s place through save_place');

-- ---------------------------------------------------------------- fra saves a wall with its sector named
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);

select lives_ok(format($$select public.save_place(%L)$$, jsonb_build_object(
  'id', (select v from ids where k = 'butch'), 'name', 'Muro del Butch', 'activity', 'crag',
  'lat', 45.908774, 'lng', 9.434212, 'area_name', (select a.name from public.areas a join public.places p on p.area_id = a.id
                                                    where p.id = (select v from ids where k = 'butch')),
  'sector_name', '  muro DEL butch ')), 'creator saves her spot, naming its sector in any case');

reset role;
select is((select sector_id from public.places where id = (select v from ids where k = 'butch')),
          (select v from ids where k = 'butch_sector'), 'the existing sector of that name is kept, not duplicated');

select * from finish();
rollback;
