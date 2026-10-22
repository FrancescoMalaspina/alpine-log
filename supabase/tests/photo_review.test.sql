-- Spot photos wait for review; a visit photo moves to its spot (#32). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
create function pg_temp.leftovers(u uuid) returns bigint language sql as $$
  select count(*) from public.leftover_photo_files where owner_id = u
$$;

-- ---------------------------------------------------------------- fixtures
-- fra (admin) created spot P; vale created spot V. ugo is a third user.
-- vale has a private visit to P and one to V, each with a photo.
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', :ugo, 'authenticated', 'authenticated', 'ugo@example.com');
insert into ids select 'P', min(id) from public.places where created_by = :fra::uuid;
insert into public.places (created_by, name, activity, lat, lng) values (:vale, 'Placca di Vale', 'crag', 45.9, 9.4);
insert into ids select 'V', max(id) from public.places where created_by = :vale::uuid;
insert into public.visits (user_id, place_id) values (:vale, pg_temp.id('P'));
insert into ids select 'visitP', max(id) from public.visits where user_id = :vale::uuid;
insert into public.visits (user_id, place_id) values (:vale, pg_temp.id('V'));
insert into ids select 'visitV', max(id) from public.visits where user_id = :vale::uuid;
insert into storage.objects (bucket_id, name) values
  ('visit-photos', :vale || '/v/1.jpg'), ('visit-photos', :vale || '/v/1.thumb.jpg'),
  ('visit-photos', :vale || '/v/2.jpg'), ('visit-photos', :vale || '/v/2.thumb.jpg'),
  ('place-photos', :vale || '/p/1.jpg'), ('place-photos', :vale || '/p/1.thumb.jpg'),
  ('place-photos', :vale || '/p/2.jpg'), ('place-photos', :vale || '/p/2.thumb.jpg'),
  ('place-photos', :vale || '/p/3.jpg'), ('place-photos', :vale || '/p/3.thumb.jpg');

set local role authenticated;
select pg_temp.as_user(:vale);
insert into public.photos (visit_id, storage_path, thumb_path, caption)
values (pg_temp.id('visitP'), :vale || '/v/1.jpg', :vale || '/v/1.thumb.jpg', 'Sulla placca');
insert into public.photos (visit_id, storage_path, thumb_path)
values (pg_temp.id('visitV'), :vale || '/v/2.jpg', :vale || '/v/2.thumb.jpg');
reset role;
insert into ids select 'photoP', id from public.photos where storage_path = :vale || '/v/1.jpg';
insert into ids select 'photoV', id from public.photos where storage_path = :vale || '/v/2.jpg';
set local role authenticated;

-- ---------------------------------------------------------------- uploading to a spot
select pg_temp.as_user(:vale);
insert into public.photos (place_id, storage_path, thumb_path) values (pg_temp.id('P'), :vale || '/p/3.jpg', :vale || '/p/3.thumb.jpg');
select is((select pending from public.photos where storage_path = :vale || '/p/3.jpg'), true,
          'a photo on someone else''s spot waits for review');
select throws_ok(format($$insert into public.photos (place_id, storage_path, thumb_path, moved_from) values (%s, %L, %L, %s)$$,
  pg_temp.id('V'), :vale || '/p/x.jpg', :vale || '/p/x.thumb.jpg', pg_temp.id('photoP')),
  '42501', null, 'an upload cannot claim to be a move');
select throws_ok(format($$update public.photos set pending = false where storage_path = %L$$, :vale || '/p/3.jpg'),
  '42501', null, 'nor clear its own review');

select pg_temp.as_user(:ugo);
select is((select count(*) from public.photos where place_id = pg_temp.id('P') and pending), 0::bigint,
          'others don''t see a photo waiting for review');
select is((select count(*) from storage.objects where name = :vale || '/p/3.jpg'), 0::bigint,
          'nor find its file in the bucket');
select pg_temp.as_user(:fra);
select is((select count(*) from public.photos where place_id = pg_temp.id('P') and pending), 1::bigint,
          'admins see it');

-- ---------------------------------------------------------------- moving a visit photo
select pg_temp.as_user(:ugo);
select throws_ok(format('select public.move_photo_to_spot(%s, %L, %L)', pg_temp.id('photoP'), :ugo || '/p/1.jpg', :ugo || '/p/1.thumb.jpg'),
  '42501', null, 'nobody moves someone else''s photo');

select pg_temp.as_user(:vale);
select throws_ok(format('select public.move_photo_to_spot(%s, %L, %L)', pg_temp.id('photoP'), :vale || '/p/nope.jpg', :vale || '/p/nope.thumb.jpg'),
  '22023', null, 'the spot''s copy must be uploaded first');
-- On her own spot it moves at once.
select is(public.move_photo_to_spot(pg_temp.id('photoV'), :vale || '/p/2.jpg', :vale || '/p/2.thumb.jpg'), false,
          'a photo moved to a spot you may edit needs no review');
select is((select count(*) from public.photos where id = pg_temp.id('photoV')), 0::bigint, 'and leaves the visit');
select is((select count(*) from public.photos where place_id = pg_temp.id('V') and storage_path = :vale || '/p/2.jpg'), 1::bigint,
          'for the spot');
select is(pg_temp.leftovers(:vale), 2::bigint, 'its old files are left for vale to remove');
delete from public.leftover_photo_files;
select is(pg_temp.leftovers(:vale), 0::bigint, 'and she can forget them once removed');

-- On fra's spot it waits.
select is(public.move_photo_to_spot(pg_temp.id('photoP'), :vale || '/p/1.jpg', :vale || '/p/1.thumb.jpg'), true,
          'a photo moved to someone else''s spot waits for review');
select is((select count(*) from public.photos where id = pg_temp.id('photoP')), 1::bigint, 'and stays in the visit meanwhile');
select is((select caption from public.photos where moved_from = pg_temp.id('photoP')), 'Sulla placca', 'the copy keeps the caption');
select throws_ok(format('select public.move_photo_to_spot(%s, %L, %L)', pg_temp.id('photoP'), :vale || '/p/1.jpg', :vale || '/p/1.thumb.jpg'),
  '23505', null, 'a photo moves once');
select throws_ok(format('select public.approve_photo(%s)', (select id from public.photos where moved_from = pg_temp.id('photoP'))),
  '42501', null, 'only admins approve');

-- Another photo waiting, added later: approving must not trip over it.
insert into public.photos (place_id, storage_path, thumb_path) values (pg_temp.id('P'), :vale || '/p/4.jpg', :vale || '/p/4.thumb.jpg');

-- ---------------------------------------------------------------- review
select pg_temp.as_user(:fra);
select lives_ok(format('select public.approve_photo(%s)', (select id from public.photos where moved_from = pg_temp.id('photoP'))),
  'fra approves the moved photo');
reset role;
select is((select count(*) from public.photos where id = pg_temp.id('photoP')), 0::bigint, 'the visit photo is gone');
select is((select count(*) from public.photos where storage_path = :vale || '/p/1.jpg' and not pending and moved_from is null), 1::bigint,
          'the spot photo is public');
select is(pg_temp.leftovers(:vale), 2::bigint, 'the visit photo''s files are left for vale');
set local role authenticated;

select pg_temp.as_user(:fra);
select lives_ok(format('select public.reject_photo(%s)', (select id from public.photos where storage_path = :vale || '/p/3.jpg')),
  'fra rejects the uploaded one');
reset role;
select is((select count(*) from public.photos where storage_path = :vale || '/p/3.jpg'), 0::bigint, 'it is gone');

select * from finish();
rollback;
