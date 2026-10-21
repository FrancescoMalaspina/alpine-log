-- Shared visits: invitations, requests, the day's date, leaving, merging (#33).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''
\set ugo  '\'33333333-3333-4333-8333-333333333333\''
\set ada  '\'44444444-4444-4444-8444-444444444444\''

create temp table ids (k text primary key, v bigint);
create temp table names (k text primary key, v text);
grant all on ids, names to anon, authenticated;
create function pg_temp.id(key text) returns bigint language sql as $$ select v from ids where k = key $$;
create function pg_temp.nm(key text) returns text language sql as $$ select v from names where k = key $$;
-- The invitation from visit from_key to user u, as far as the caller can read it.
create function pg_temp.inv(from_key text, u uuid) returns bigint language sql as $$
  select id from public.outing_invites where from_visit_id = pg_temp.id(from_key) and to_user_id = u
$$;
create function pg_temp.day(key text) returns bigint language sql as $$
  select outing_id from public.visits where id = pg_temp.id(key)
$$;
grant execute on function pg_temp.id(text), pg_temp.nm(text), pg_temp.inv(text, uuid), pg_temp.day(text) to anon, authenticated;
create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', :ugo, 'authenticated', 'authenticated', 'ugo@example.com'),
  ('00000000-0000-0000-0000-000000000000', :ada, 'authenticated', 'authenticated', 'ada@example.com');
insert into ids select 'spot', id from public.places order by id limit 1;
insert into ids select 'spot2', id from public.places order by id offset 1 limit 1;
with x as (insert into public.places (name, activity, lat, lng, created_by)
           values ('Doppione', 'crag', 45.5, 9.5, :fra) returning id)
insert into ids select 'dup', id from x;
set local role authenticated;

-- ---------------------------------------------------------------- an invitation
-- fra climbs with vale (her rope) and Marco (another rope, not registered).
select pg_temp.as_user(:fra);
insert into names select 'vale', public.partner_for_user(:vale);
insert into ids select 'f1', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot'), 'date', '2026-10-05', 'visibility', 'public', 'summary', 'secret note',
  'partners', jsonb_build_array(pg_temp.nm('vale')), 'other_partners', '["Marco"]'::jsonb,
  'ascents', '[{"name": "Spigolo", "grade": "6a", "style": "redpoint"}]'::jsonb));
insert into ids select 'i1', pg_temp.inv('f1', :vale);
select is((select count(*) from public.outing_invites where from_visit_id = pg_temp.id('f1')), 1::bigint,
          'naming a registered user invites them; a plain name invites nobody');

select pg_temp.as_user(:ugo);
select is((select count(*) from public.outing_invites), 0::bigint, 'nobody else reads the invitation');
select throws_ok(format('select public.invite_prefill(%s)', pg_temp.id('i1')), 'P0002', null, '…or its prefill');
select throws_ok(format('select public.accept_invitation(%s)', pg_temp.id('i1')), 'P0002', null, '…or accepts it');

select pg_temp.as_user(:vale);
select is((select from_visit_id from public.my_invitations()), pg_temp.id('f1'), 'vale finds the invitation');
select is((select my_visit_id from public.my_invitations()), null::bigint, '…with no visit of hers to link yet');
select is(public.invite_prefill(pg_temp.id('i1')) -> 'ascents' -> 0 ->> 'name', 'Spigolo',
          'in fra''s rope, vale starts from her routes');
select ok(public.invite_prefill(pg_temp.id('i1')) -> 'ascents' -> 0 -> 'style' is null, '…without how fra climbed them');
select ok(exists (select 1 from jsonb_array_elements(public.invite_prefill(pg_temp.id('i1')) -> 'people') p
                  where p ->> 'user_id' = :fra and (p ->> 'same_rope')::boolean),
          'fra is in vale''s rope');
select ok(exists (select 1 from jsonb_array_elements(public.invite_prefill(pg_temp.id('i1')) -> 'people') p
                  where p ->> 'name' = 'Marco' and not (p ->> 'same_rope')::boolean),
          'Marco is in another rope');
select ok(public.invite_prefill(pg_temp.id('i1'))::text not like '%secret%', 'fra''s notes never come along');

-- ---------------------------------------------------------------- accepting
insert into names select 'fra', public.partner_for_user(:fra);
insert into ids select 'v1', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot'), 'date', '2026-10-05', 'visibility', 'private',
  'partners', jsonb_build_array(pg_temp.nm('fra'))));
select lives_ok(format('select public.accept_invitation(%s, %s)', pg_temp.id('i1'), pg_temp.id('v1')),
                'vale accepts with her new visit');
insert into ids select 'day', pg_temp.day('v1');
select is((select count(*) from public.visits where outing_id = pg_temp.id('day')), 2::bigint,
          'fra''s visit and vale''s are one day');
select is((select count(*) from public.outing_invites where status = 'pending'), 0::bigint,
          'vale''s own invitation to fra is answered with it');

select pg_temp.as_user(:fra);
select is((select count(*) from public.visits where outing_id = pg_temp.id('day')), 1::bigint,
          'vale''s visit stays private');
select is((select count(*) from public.outing_members(array[pg_temp.id('day')]) where user_id = :vale and visit_id is null),
          1::bigint, 'fra sees vale is in the day, not her visit');

-- ---------------------------------------------------------------- the day's date
select pg_temp.as_user(:vale);
select lives_ok(format('select public.save_visit(%L)', jsonb_build_object(
  'id', pg_temp.id('v1'), 'place_id', pg_temp.id('spot'), 'date', '2026-10-06', 'visibility', 'private',
  'partners', jsonb_build_array(pg_temp.nm('fra')))), 'vale moves her visit to the next day');
select throws_ok(format('select public.save_visit(%L)', jsonb_build_object(
  'id', pg_temp.id('v1'), 'place_id', pg_temp.id('spot'), 'date', null)), '22023', null, 'a shared visit keeps a date');
select throws_ok(format('update public.visits set date = %L where id = %s', '2026-10-07', pg_temp.id('v1')),
                 '23514', null, 'a visit in a day has its date');
select throws_ok(format('update public.visits set outing_id = null where id = %s', pg_temp.id('v1')),
                 '42501', null, 'outing_id changes only through the functions');

select pg_temp.as_user(:fra);
select is((select date from public.visits where id = pg_temp.id('f1')), '2026-10-06'::date, 'fra''s visit moves with it');
select is((select date_changed_by from public.outings where id = pg_temp.id('day')), :vale::uuid, '…saying who moved it');

-- ---------------------------------------------------------------- declining, withdrawing
insert into ids select 'f2', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot2'), 'date', '2026-10-01', 'partners', jsonb_build_array(pg_temp.nm('vale'))));
select pg_temp.as_user(:vale);
select lives_ok(format('select public.decline_invitation(%s)', pg_temp.inv('f2', :vale)), '"Not me"');
select pg_temp.as_user(:fra);
select public.save_visit(jsonb_build_object(
  'id', pg_temp.id('f2'), 'place_id', pg_temp.id('spot2'), 'date', '2026-10-01', 'partners', jsonb_build_array(pg_temp.nm('vale'))));
select is((select status from public.outing_invites where from_visit_id = pg_temp.id('f2')), 'declined',
          'saving again doesn''t invite vale again');

insert into ids select 'f3', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot2'), 'date', '2026-10-02', 'partners', jsonb_build_array(pg_temp.nm('vale'))));
select public.save_visit(jsonb_build_object('id', pg_temp.id('f3'), 'place_id', pg_temp.id('spot2'), 'date', '2026-10-02'));
select is((select count(*) from public.outing_invites where from_visit_id = pg_temp.id('f3')), 0::bigint,
          'taking vale off the visit withdraws the invitation');

-- ---------------------------------------------------------------- asking to join
select pg_temp.as_user(:ugo);
insert into ids select 'u1', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot'), 'date', '2026-10-06', 'visibility', 'public'));
select is(public.request_to_join(pg_temp.id('u1'), pg_temp.id('f1')), 'requested', 'ugo asks to join fra''s day');
insert into ids select 'r1', id from public.outing_invites where from_visit_id = pg_temp.id('u1');
insert into public.photos (visit_id, storage_path, thumb_path)
values (pg_temp.id('u1'), :ugo || '/v/u1.jpg', :ugo || '/v/u1.thumb.jpg');

select pg_temp.as_user(:vale);
select throws_ok(format('select public.decline_invitation(%s)', pg_temp.id('r1')), 'P0002', null, 'only fra answers it');

select pg_temp.as_user(:fra);
select is((select kind from public.my_invitations() where id = pg_temp.id('r1')), 'request', 'fra finds the request');
select lives_ok(format('select public.accept_invitation(%s)', pg_temp.id('r1')), '…and accepts it');

select pg_temp.as_user(:vale);
select is(pg_temp.day('u1'), pg_temp.id('day'), 'ugo is in the day');
select is((select count(*) from public.photos p join public.visits v on v.id = p.visit_id
           where v.outing_id = pg_temp.id('day')), 1::bigint, 'the photos of its public visits show on the day');

-- ---------------------------------------------------------------- leaving
select pg_temp.as_user(:ugo);
select lives_ok(format('select public.leave_outing(%s)', pg_temp.id('u1')), 'ugo leaves the day');
select pg_temp.as_user(:fra);
select is((select count(*) from public.outing_members(array[pg_temp.id('day')])), 2::bigint, 'fra and vale are still in it');
select pg_temp.as_user(:vale);
select public.leave_outing(pg_temp.id('v1'));
select pg_temp.as_user(:fra);
select is((select outing_id from public.visits where id = pg_temp.id('f1')), null::bigint,
          'a day of one is a solo visit again');

-- ---------------------------------------------------------------- linking a visit, two days made one
-- Day A: fra and vale. Day B: ugo and ada. Then fra names ugo too.
insert into ids select 'f4', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot'), 'date', '2026-10-10', 'visibility', 'public', 'partners', jsonb_build_array(pg_temp.nm('vale'))));
select pg_temp.as_user(:vale);
insert into ids select 'v4', public.save_visit(jsonb_build_object('place_id', pg_temp.id('spot'), 'date', '2026-10-10'));
select public.accept_invitation(pg_temp.inv('f4', :vale), pg_temp.id('v4'));
select pg_temp.as_user(:ugo);
insert into names select 'ada', public.partner_for_user(:ada);
insert into ids select 'u4', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot'), 'date', '2026-10-10', 'partners', jsonb_build_array(pg_temp.nm('ada'))));
select pg_temp.as_user(:ada);
insert into ids select 'a4', public.save_visit(jsonb_build_object('place_id', pg_temp.id('spot'), 'date', '2026-10-10'));
select public.accept_invitation(pg_temp.inv('u4', :ada), pg_temp.id('a4'));

select pg_temp.as_user(:fra);
insert into names select 'ugo', public.partner_for_user(:ugo);
select public.save_visit(jsonb_build_object(
  'id', pg_temp.id('f4'), 'place_id', pg_temp.id('spot'), 'date', '2026-10-10', 'visibility', 'public',
  'partners', jsonb_build_array(pg_temp.nm('vale'), pg_temp.nm('ugo'))));
select pg_temp.as_user(:vale);
select is((select count(*) from public.my_invitations()), 0::bigint, 'nobody already in the day is invited again');

select pg_temp.as_user(:ugo);
select is((select my_visit_id from public.my_invitations() where from_visit_id = pg_temp.id('f4')), pg_temp.id('u4'),
          'ugo already logged that day: the invitation links his visit');
select lives_ok(format('select public.accept_invitation(%s, %s)', pg_temp.inv('f4', :ugo), pg_temp.id('u4')), '…he links it');
select pg_temp.as_user(:fra);
select is((select count(*) from public.outing_members(array[pg_temp.day('f4')])), 4::bigint, 'the two days are one');

-- ---------------------------------------------------------------- merging spots
reset role;
with x as (insert into public.visits (user_id, place_id, date) values (:fra, pg_temp.id('dup'), '2026-09-01'),
                                                                      (:vale, pg_temp.id('dup'), '2026-09-01') returning id)
insert into ids select 'dup' || row_number() over (), id from x;
insert into ids select 'dupday', private.join_visits(pg_temp.id('dup1'), pg_temp.id('dup2'));
set local role authenticated;
select pg_temp.as_user(:fra);
select public.merge_places(pg_temp.id('spot'), pg_temp.id('dup'));
select is((select place_id from public.outings where id = pg_temp.id('dupday')), pg_temp.id('spot'),
          'merging spots moves the days with their visits');

select * from finish();
rollback;
