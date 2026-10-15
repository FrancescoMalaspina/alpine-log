-- Tracks on visits: private tracks for their uploader, publish_track, deleting a visit. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'place', min(id) from public.places;
with v as (insert into public.visits (user_id, place_id, visibility)
           select :fra::uuid, v, 'private' from ids where k = 'place' returning id)
insert into ids select 'fra_visit', id from v;
with v as (insert into public.visits (user_id, place_id, visibility)
           select :fra::uuid, v, 'private' from ids where k = 'place' returning id)
insert into ids select 'fra_visit_2', id from v;
with v as (insert into public.visits (user_id, place_id, visibility)
           select :vale::uuid, v, 'private' from ids where k = 'place' returning id)
insert into ids select 'vale_visit', id from v;

create function pg_temp.add_track(visit text, path text, is_private boolean) returns void language sql as $$
  insert into public.attachments (place_id, visit_id, kind, storage_path, private)
  select (select v from ids where k = 'place'), (select v from ids where k = visit), 'gpx', path, is_private;
$$;
grant execute on function pg_temp.add_track(text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- fra (admin) logs tracks
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
insert into storage.objects (bucket_id, name) values ('visit-tracks', :fra || '/visit-1/a.gpx');
select lives_ok(format('select pg_temp.add_track(%L, %L, true)', 'fra_visit', :fra || '/visit-1/a.gpx'),
                'fra adds a private track to her private visit');
select lives_ok(format('select pg_temp.add_track(%L, %L, true)', 'fra_visit_2', :fra || '/visit-2/b.gpx'),
                'and another to a second visit');
select lives_ok(format('select pg_temp.add_track(%L, %L, false)', 'fra_visit_2', :fra || '/place-1/c.gpx'),
                'and a public one to the same visit');
select throws_ok(format($$insert into public.attachments (place_id, kind, storage_path, private) values (%s, 'gpx', %L, true)$$,
                        (select v from ids where k = 'place'), :fra || '/visit-x/d.gpx'),
                 '23514', null, 'a private track needs a visit');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('visit-tracks', %L)$$, :fra || '/visit-1/e.pdf'),
                 '42501', null, 'only GPX files go in the private bucket');

reset role;
insert into ids select 'fra_track', id from public.attachments where storage_path = :fra || '/visit-1/a.gpx';

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.attachments where private), 0::bigint, 'anon cannot see private tracks');
select is((select count(*) from public.attachments where visit_id is not null and not private), 1::bigint,
          'anon sees the public track of a visit');
select is((select count(*) from storage.objects where bucket_id = 'visit-tracks'), 0::bigint,
          'anon cannot fetch private track files');

-- ---------------------------------------------------------------- vale
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select is((select count(*) from public.attachments where private), 0::bigint, 'vale cannot see fra''s private tracks');
select is((select count(*) from storage.objects where bucket_id = 'visit-tracks'), 0::bigint,
          'nor their files');
select throws_ok(format('select pg_temp.add_track(%L, %L, false)', 'fra_visit', :vale || '/place-1/x.gpx'),
                 '42501', null, 'vale cannot put a track on fra''s visit');
select lives_ok(format('select pg_temp.add_track(%L, %L, true)', 'vale_visit', :vale || '/visit-3/v.gpx'),
                'vale adds a private track to her own visit');
insert into storage.objects (bucket_id, name) values ('place-files', :vale || '/place-1/v.gpx');
select throws_ok(format('select public.publish_track(%s, %L)', (select v from ids where k = 'fra_track'), :vale || '/place-1/v.gpx'),
                 '42501', null, 'vale cannot publish someone else''s track');
update public.attachments set gain_m = 999 where created_by <> :vale::uuid;
reset role;
select is((select count(*) from public.attachments where gain_m = 999), 0::bigint, 'nor fill in its statistics');

-- ---------------------------------------------------------------- fra publishes
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select is((select count(*) from public.attachments where private and created_by = :vale::uuid), 1::bigint,
          'an admin sees other users'' private tracks');
select throws_ok(format('select public.publish_track(%s, %L)', (select v from ids where k = 'fra_track'), :fra || '/place-1/a.gpx'),
                 '22023', null, 'publishing needs the public copy of the file first');
insert into storage.objects (bucket_id, name) values ('place-files', :fra || '/place-1/a.gpx');
select lives_ok(format('select public.publish_track(%s, %L)', (select v from ids where k = 'fra_track'), :fra || '/place-1/a.gpx'),
                'fra publishes her track once its file is in place-files');
select throws_ok(format('select public.publish_track(%s, %L)', (select v from ids where k = 'fra_track'), :fra || '/place-1/a.gpx'),
                 '42501', null, 'a public track can''t be published (or made private) again');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.attachments where storage_path = :fra || '/place-1/a.gpx'), 1::bigint,
          'the published track is visible to everyone');

-- ---------------------------------------------------------------- deleting a visit
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
delete from public.visits where id = (select v from ids where k = 'fra_visit_2');
reset role;
select is((select count(*) from public.attachments where storage_path = :fra || '/visit-2/b.gpx'), 0::bigint,
          'deleting a visit deletes its private track');
select is((select visit_id from public.attachments where storage_path = :fra || '/place-1/c.gpx'), null,
          'and keeps its public track on the spot');

select * from finish();
rollback;
