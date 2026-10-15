-- Suggested changes to spots (#19): suggest, review, withdraw, merge. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''
\set ugo  '\'33333333-3333-4333-8333-333333333333\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
create function pg_temp.id(key text) returns bigint language sql as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to anon, authenticated;
-- Spot S as the edit form sends it, with some fields replaced.
create function pg_temp.spot(changes jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', pg_temp.id('S'), 'name', 'Placca Gialla', 'activity', 'crag', 'lat', 45.9, 'lng', 9.4,
                            'area_name', 'Valle', 'sector_name', 'Sasso', 'grade', '6a', 'rock', 'granite',
                            'exposition', '["Sud"]'::jsonb, 'description', '') || changes
$$;
grant execute on function pg_temp.spot(jsonb) to anon, authenticated;
create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
-- fra (admin) created spot S, in area "Valle", sector "Sasso". ugo is a third user.
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', :ugo, 'authenticated', 'authenticated', 'ugo@example.com');
set local role authenticated;
select pg_temp.as_user(:fra);
insert into ids select 'S', public.save_place(pg_temp.spot() - 'id');

-- ---------------------------------------------------------------- vale suggests
select pg_temp.as_user(:vale);
select throws_ok(format('select public.save_place(%L)', pg_temp.spot('{"grade": "6b"}')), '42501', null,
                 'someone else still cannot edit the spot directly');
select throws_ok(format('select public.suggest_place_changes(%L)', pg_temp.spot('{"area_name": " valle ", "description": "  "}')),
                 '22023', null, 'a suggestion that changes nothing (case, blanks) is refused');
select throws_ok(format('select public.suggest_place_changes(%L)', pg_temp.spot('{"country": "Italy"}')),
                 '23514', null, 'a suggestion that breaks a rule of spots is refused when written');

insert into ids select 'first', public.suggest_place_changes(pg_temp.spot('{"grade": "6b"}'));
insert into ids select 'sugg', public.suggest_place_changes(
  pg_temp.spot('{"grade": "6b", "lat": 45.91, "sector_name": "Nuovo"}'), 'Regraded after the rockfall');
select is(pg_temp.id('sugg'), pg_temp.id('first'), 'suggesting again replaces the pending suggestion');

reset role;
select is((select array_agg(k order by k) from public.place_suggestions, jsonb_object_keys(changes) k where id = pg_temp.id('sugg')),
          array['area_name', 'grade', 'lat', 'lng', 'sector_name'],
          'it holds the changed fields, with their pin and their area');
select is((select base ->> 'grade' from public.place_suggestions where id = pg_temp.id('sugg')), '6a',
          '…and what they were');
select is((select note from public.place_suggestions where id = pg_temp.id('sugg')), 'Regraded after the rockfall', '…and the note');
select is((select grade from public.places where id = pg_temp.id('S')), '6a', 'the spot does not change');
select ok(not exists (select 1 from public.sectors where name = 'Nuovo'), 'a suggested sector does not exist yet');

set local role authenticated;
select pg_temp.as_user(:vale);
select is((select count(*) from public.place_suggestions), 1::bigint, 'the author reads their suggestion');
select throws_ok(format($$insert into public.place_suggestions (place_id, changes, base) values (%s, '{"grade": "9a"}', '{}')$$, pg_temp.id('S')),
                 '42501', null, 'suggestions are not written directly');
select throws_ok(format('select public.approve_place_suggestion(%s)', pg_temp.id('sugg')), '42501', null, 'a user cannot approve');
select throws_ok('select * from public.pending_place_suggestions()', '42501', null, 'a user cannot list the queue');

select pg_temp.as_user(:ugo);
select is((select count(*) from public.place_suggestions), 0::bigint, 'others do not read it');
select throws_ok(format('select public.withdraw_place_suggestion(%s)', pg_temp.id('sugg')), 'P0002', null,
                 'others cannot withdraw it');

-- ---------------------------------------------------------------- fra reviews
select pg_temp.as_user(:fra);
select throws_ok(format('select public.suggest_place_changes(%L)', pg_temp.spot('{"grade": "7a"}')), '22023', null,
                 'the creator edits directly instead of suggesting');
select is((select current ->> 'grade' from public.pending_place_suggestions() where id = pg_temp.id('sugg')), '6a',
          'the queue shows what the changed fields hold now');
select lives_ok(format('select public.save_place(%L)', pg_temp.spot('{"grade": "6a+"}')), 'the creator still edits directly');
select is((select current ->> 'grade' from public.pending_place_suggestions() where id = pg_temp.id('sugg')), '6a+',
          '…and the queue shows the spot changed since the suggestion');
select throws_ok(format($$select public.approve_place_suggestion(%s, '{aid}')$$, pg_temp.id('sugg')), '22023', null,
                 'approving none of the suggested fields is refused');
select is(public.approve_place_suggestion(pg_temp.id('sugg'), '{grade, sector_name}', 'Thanks'),
          array['area_name', 'grade', 'sector_name'], 'an approval takes the chosen fields, with their group');

reset role;
select is((select (p.grade, s.name, a.name, p.lat)::text from public.places p join public.sectors s on s.id = p.sector_id
           join public.areas a on a.id = p.area_id where p.id = pg_temp.id('S')),
          '(6b,Nuovo,Valle,45.9)', 'the spot has the approved fields, a new sector in its area, and its old pin');
select is((select (status, reviewed_by = :fra, review_note)::text from public.place_suggestions where id = pg_temp.id('sugg')),
          '(approved,t,Thanks)', 'the suggestion is approved, by whom, with a note');

set local role authenticated;
select pg_temp.as_user(:fra);
select throws_ok(format('select public.approve_place_suggestion(%s)', pg_temp.id('sugg')), 'P0002', null,
                 'a reviewed suggestion cannot be approved again');

-- Rejected, and withdrawn.
select pg_temp.as_user(:vale);
insert into ids select 'rock', public.suggest_place_changes(pg_temp.spot('{"grade": "6b", "sector_name": "Nuovo", "rock": "limestone"}'));
select pg_temp.as_user(:fra);
select lives_ok(format($$select public.reject_place_suggestion(%s, 'It is granite')$$, pg_temp.id('rock')), 'an admin rejects');
select is((select rock from public.places where id = pg_temp.id('S')), 'granite', 'a rejected suggestion changes nothing');
select pg_temp.as_user(:vale);
select is((select review_note from public.place_suggestions where id = pg_temp.id('rock')), 'It is granite',
          'the author reads why');
insert into ids select 'oops', public.suggest_place_changes(pg_temp.spot('{"grade": "6b", "sector_name": "Nuovo", "rock": "gneiss"}'));
select lives_ok(format('select public.withdraw_place_suggestion(%s)', pg_temp.id('oops')), 'the author withdraws');
select is((select status from public.place_suggestions where id = pg_temp.id('oops')), 'withdrawn', '…and it is withdrawn');

-- ---------------------------------------------------------------- merging
-- D duplicates S. vale has a pending suggestion on both, ugo on D only.
select pg_temp.as_user(:fra);
insert into ids select 'D', public.save_place(jsonb_build_object('name', 'Placca gialla', 'activity', 'crag', 'lat', 45.9, 'lng', 9.4));
select pg_temp.as_user(:vale);
insert into ids select 'vS', public.suggest_place_changes(pg_temp.spot('{"grade": "6b", "sector_name": "Nuovo", "rock": "gneiss"}'));
insert into ids select 'vD', public.suggest_place_changes(jsonb_build_object('id', pg_temp.id('D'), 'name', 'Placca gialla',
  'activity', 'crag', 'lat', 45.9, 'lng', 9.4, 'grade', '5c'));
select pg_temp.as_user(:ugo);
insert into ids select 'uD', public.suggest_place_changes(jsonb_build_object('id', pg_temp.id('D'), 'name', 'Placca gialla',
  'activity', 'crag', 'lat', 45.9, 'lng', 9.4, 'rock', 'gneiss'));
select pg_temp.as_user(:fra);
select lives_ok(format('select public.merge_places(%s, %s)', pg_temp.id('S'), pg_temp.id('D')), 'an admin merges D into S');

reset role;
select is((select (place_id = pg_temp.id('S'), status)::text from public.place_suggestions where id = pg_temp.id('uD')),
          '(t,pending)', 'a suggestion on the duplicate moves to the kept spot');
select is((select status from public.place_suggestions where id = pg_temp.id('vD')), 'withdrawn',
          'one by someone with a suggestion on the kept spot too is withdrawn');

select * from finish();
rollback;
