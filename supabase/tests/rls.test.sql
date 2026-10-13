-- Row level security tests. Run with: supabase test db
-- Relies on supabase/seed.sql: user "fra" (admin, owns all imported data,
-- every visit private) and user "vale" (regular user, owns nothing).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Fixed ids from scripts/import-crags.mjs --local
\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'fra_place', min(id) from public.places;
insert into ids select 'fra_visit', min(id) from public.visits;
insert into ids select 'fra_partner', min(id) from public.partners;

-- ---------------------------------------------------------------- anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*) from public.places), 34::bigint, 'anon sees the whole spot catalog');
select is((select count(*) from public.visits), 0::bigint, 'anon sees no private visits');
select is((select count(*) from public.visit_overview), 0::bigint, 'anon sees no private visits in the overview');
select is((select count(*) from public.partners), 0::bigint, 'anon sees no partners');
select throws_ok(
  $$insert into public.places (name, lat, lng) values ('x', 1, 1)$$,
  '42501', null, 'anon cannot add a place');

-- ---------------------------------------------------------------- vale
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

select is((select count(*) from public.visits), 0::bigint, 'vale cannot read fra''s private visits');
select is((select count(*) from public.ascents), 0::bigint, 'vale cannot read ascents of private visits');
select is((select count(*) from public.partners), 0::bigint, 'vale cannot read fra''s partner list');

select throws_ok(
  $$update public.profiles set role = 'admin' where id = auth.uid()$$,
  '42501', null, 'vale cannot promote herself to admin');
select lives_ok(
  $$update public.profiles set username = 'vale_k' where id = auth.uid()$$,
  'vale can change her username');

update public.places set name = 'hijacked' where id = (select v from ids where k = 'fra_place');
select throws_ok(
  $$update public.places set created_by = auth.uid()$$,
  '42501', null, 'nobody can reassign a place''s creator');
delete from public.places where id = (select v from ids where k = 'fra_place');

insert into public.places (name, lat, lng) values ('Vale crag', 45, 9);
insert into ids select 'vale_place', id from public.places where name = 'Vale crag';
select is((select created_by from public.places where name = 'Vale crag'), :vale::uuid,
          'a new place records its creator');

insert into public.visits (place_id, date) values ((select v from ids where k = 'fra_place'), '2026-10-01');
insert into ids select 'vale_visit', id from public.visits where user_id = auth.uid();
select is((select count(*) from public.visits), 1::bigint, 'vale can log a visit at someone else''s place');

select throws_ok(
  format($$insert into public.visits (user_id, place_id) values (%L, %s)$$,
         :fra, (select v from ids where k = 'fra_place')),
  '42501', null, 'vale cannot log a visit as fra');
select throws_ok(
  format($$insert into public.visit_partners (visit_id, partner_id) values (%s, %s)$$,
         (select v from ids where k = 'vale_visit'), (select v from ids where k = 'fra_partner')),
  '42501', null, 'vale cannot attach fra''s partners to her visit');
select throws_ok(
  format($$insert into public.ascents (visit_id, grade) values (%s, '6a')$$,
         (select v from ids where k = 'fra_visit')),
  '42501', null, 'vale cannot add ascents to fra''s visit');

-- ---------------------------------------------------------------- fra (admin)
reset role;
select is((select name from public.places where id = (select v from ids where k = 'fra_place')),
          (select name from public.places order by id limit 1),
          'vale''s update of fra''s place changed nothing');
select ok(exists (select 1 from public.places where id = (select v from ids where k = 'fra_place')),
          'vale''s delete of fra''s place removed nothing');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);

select is((select count(*) from public.visits), 31::bigint, 'admin sees every visit, including vale''s private one');
insert into public.visits (place_id) values ((select v from ids where k = 'vale_place'));
update public.visits set visibility = 'public' where id = (select v from ids where k = 'fra_visit');

-- ---------------------------------------------------------------- vale again
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

delete from public.places where id = (select v from ids where k = 'vale_place');
select ok(exists (select 1 from public.places where id = (select v from ids where k = 'vale_place')),
          'creator cannot delete a place holding someone else''s visits');

-- ---------------------------------------------------------------- anon again
reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*) from public.visits), 1::bigint, 'a public visit becomes readable by anon');
select ok((select count(*) from public.ascents) > 0, 'its ascents are readable too');
select ok((select count(*) from public.partners) > 0, 'its partner names are readable too');
select is((select count(*) from public.visit_overview), 1::bigint, 'and it shows up in the overview');

reset role;
select * from finish();
rollback;
