-- Partners linked to registered users: rename_partner, partner_for_user, tags readable with their visit (#4).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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
-- ugo logs two visits: a public one with "Vale" and "V." (other rope), a private one with "V.".
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', :ugo, 'authenticated', 'authenticated', 'ugo@example.com');
insert into ids select 'spot', id from public.places order by id limit 1;
set local role authenticated;
select pg_temp.as_user(:ugo);
insert into ids select 'pub', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot'), 'date', '2026-10-01', 'visibility', 'public',
  'partners', '["Vale"]'::jsonb, 'other_partners', '["V."]'::jsonb));
insert into ids select 'priv', public.save_visit(jsonb_build_object(
  'place_id', pg_temp.id('spot'), 'date', '2026-10-02', 'visibility', 'private', 'partners', '["V."]'::jsonb));
insert into public.wishlist (user_id, place_id, with_people) values (:ugo, pg_temp.id('spot'), '{V.}');
insert into ids select 'Vale', id from public.partners where name = 'Vale';
insert into ids select 'V.', id from public.partners where name = 'V.';

-- ---------------------------------------------------------------- linking
select throws_ok(format('update public.partners set linked_user_id = %L where id = %s', :ugo, pg_temp.id('Vale')),
                 '23514', null, 'a name cannot be linked to its owner');
select lives_ok(format('update public.partners set linked_user_id = %L where id = %s', :vale, pg_temp.id('Vale')),
                'the owner links a name to a registered user');
select is(public.partner_for_user(:vale), 'Vale', 'partner_for_user finds the name linked to them');
select throws_ok(format('select public.partner_for_user(%L)', :ugo), '22023', null, '…not for yourself');
select is(public.partner_for_user(:fra), (select username from public.profiles where id = :fra),
          '…and makes a linked name from the username when there is none');
select is((select linked_user_id from public.partners where owner_id = :ugo and name = public.partner_for_user(:fra)), :fra::uuid,
          '…once');

-- ---------------------------------------------------------------- others see the tag with readable visits
select pg_temp.as_user(:fra);
update public.partners set linked_user_id = :fra where id = pg_temp.id('V.');
select is((select linked_user_id from public.partners where id = pg_temp.id('V.')), null, 'nobody else links your names');
select is((select linked_user_id from public.partners where id = pg_temp.id('Vale')), :vale::uuid,
          'on a public visit, the tag is readable');
select pg_temp.as_user(:vale);
select ok(exists (select 1 from public.visit_overview v
                  where v.user_id = :ugo and v.partner_ids && array(select id from public.partners where linked_user_id = :vale)),
          'the linked user finds the public visit they are tagged in');
select is((select count(*) from public.visit_overview where user_id = :ugo), 1::bigint,
          'and only that: the private visit stays private');

-- ---------------------------------------------------------------- renaming and merging
select pg_temp.as_user(:fra);
select throws_ok(format($$select public.rename_partner(%s, 'X')$$, pg_temp.id('Vale')), 'P0002', null, 'only your own partners are renamed');
select pg_temp.as_user(:ugo);
select throws_ok(format($$select public.rename_partner(%s, '  ')$$, pg_temp.id('Vale')), '22023', null, 'a name cannot be blank');
select is(public.rename_partner(pg_temp.id('V.'), ' Valentina '), pg_temp.id('V.'), 'renaming to a new name keeps the partner');
select is((select with_people from public.wishlist where user_id = :ugo), '{Valentina}', '…and renames them in wishes');
select is(public.rename_partner(pg_temp.id('V.'), 'Vale'), pg_temp.id('Vale'), 'renaming to a name you use merges into it');
select ok(not exists (select 1 from public.partners where id = pg_temp.id('V.')), 'the other name is gone');
select is((select array_agg(visit_id order by visit_id) from public.visit_partners where partner_id = pg_temp.id('Vale')),
          array[pg_temp.id('pub'), pg_temp.id('priv')], 'the merged partner is on both visits, once');
select is((select same_rope from public.visit_partners where partner_id = pg_temp.id('Vale') and visit_id = pg_temp.id('pub')), true,
          'in the same rope where either was');
select is((select linked_user_id from public.partners where id = pg_temp.id('Vale')), :vale::uuid, 'and still linked');

select * from finish();
rollback;
