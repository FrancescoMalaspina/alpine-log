-- Photos: place photos public, visit photos follow the visit. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'place', min(id) from public.places;
insert into ids select 'fra_visit', min(id) from public.visits where user_id = :fra::uuid;

-- fra adds one photo to a place and one to her (private) visit, files included
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
insert into storage.objects (bucket_id, name) values
  ('place-photos', :fra || '/p/a.jpg'), ('place-photos', :fra || '/p/a.thumb.jpg'),
  ('visit-photos', :fra || '/v/b.jpg'), ('visit-photos', :fra || '/v/b.thumb.jpg');
select lives_ok(format($$insert into public.photos (place_id, storage_path, thumb_path) values (%s, %L, %L)$$,
  (select v from ids where k = 'place'), :fra || '/p/a.jpg', :fra || '/p/a.thumb.jpg'), 'fra adds a place photo');
select lives_ok(format($$insert into public.photos (visit_id, storage_path, thumb_path) values (%s, %L, %L)$$,
  (select v from ids where k = 'fra_visit'), :fra || '/v/b.jpg', :fra || '/v/b.thumb.jpg'), 'fra adds a photo to her visit');

-- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.photos where place_id is not null), 1::bigint, 'anon sees place photos');
select is((select count(*) from public.photos where visit_id is not null), 0::bigint, 'anon cannot see photos of a private visit');
select is((select count(*) from storage.objects where bucket_id = 'visit-photos'), 0::bigint,
          'anon cannot fetch the private files either');

-- vale
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select is((select count(*) from public.photos where visit_id is not null), 0::bigint, 'vale cannot see fra''s private visit photos');
select throws_ok(format($$insert into public.photos (visit_id, storage_path, thumb_path) values (%s, %L, %L)$$,
  (select v from ids where k = 'fra_visit'), :vale || '/v/x.jpg', :vale || '/v/x.thumb.jpg'),
  '42501', null, 'vale cannot add photos to fra''s visit');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('visit-photos', %L)$$, :fra || '/v/evil.jpg'),
  '42501', null, 'vale cannot upload into fra''s folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('place-photos', %L)$$, :vale || '/p/run.exe'),
  '42501', null, 'only image files');
delete from public.photos;
reset role;
select is((select count(*) from public.photos), 2::bigint, 'vale''s delete removed nothing');

-- fra makes the visit public: its photos and files become readable
update public.visits set visibility = 'public' where id = (select v from ids where k = 'fra_visit');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.photos where visit_id is not null), 1::bigint, 'photos of a public visit are visible');
select is((select count(*) from storage.objects where bucket_id = 'visit-photos'), 2::bigint,
          'and its files (display + thumbnail) can be fetched');

reset role;
select * from finish();
rollback;
