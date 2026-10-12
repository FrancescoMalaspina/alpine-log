-- Wishlist (complete_wish, reopen_wish) and account deletion (delete_user). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'butch', id from public.places where name = 'Muro del Butch';
insert into ids select 'ozzy', id from public.places where name = 'Ozzy';

-- ---------------------------------------------------------------- fra keeps a private wish
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
with w as (insert into public.wishlist (place_id, notes) select v, 'secret plan' from ids where k = 'butch' returning id)
insert into ids select 'fra_wish', id from w;
insert into ids select 'fra_visit', public.save_visit(jsonb_build_object('place_id', (select v from ids where k = 'butch'), 'date', '2026-06-01'));

-- ---------------------------------------------------------------- vale
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

select is((select count(*) from public.wishlist where user_id = :fra::uuid), 0::bigint, 'vale cannot read fra''s private wish');
update public.wishlist set notes = 'hijacked' where id = (select v from ids where k = 'fra_wish');
delete from public.wishlist where id = (select v from ids where k = 'fra_wish');

with w as (insert into public.wishlist (place_id, priority, seasons, with_people, visibility)
           select v, 1, array['summer', 'autumn'], array['Marco'], 'public' from ids where k = 'butch' returning id)
insert into ids select 'vale_wish', id from w;
select ok((select v from ids where k = 'vale_wish') is not null, 'vale adds a public wish with seasons and people');
select throws_ok(format('insert into public.wishlist (place_id) values (%s)', (select v from ids where k = 'butch')),
                 '23505', null, 'only one open wish per place');
select throws_ok(format('insert into public.wishlist (place_id, seasons) values (%s, %L)', (select v from ids where k = 'ozzy'), '{monsoon}'),
                 '23514', null, 'only the four seasons');
select throws_ok(format('insert into public.wishlist (place_id, done_at) values (%s, now())', (select v from ids where k = 'ozzy')),
                 '42501', null, 'a wish starts open');
select throws_ok(format('update public.wishlist set done_at = now() where id = %s', (select v from ids where k = 'vale_wish')),
                 '42501', null, 'done_at is only set through complete_wish');

insert into ids select 'vale_visit', public.save_visit(jsonb_build_object('place_id', (select v from ids where k = 'butch'), 'date', '2026-07-01'));
insert into ids select 'vale_ozzy_visit', public.save_visit(jsonb_build_object('place_id', (select v from ids where k = 'ozzy'), 'date', '2026-07-02'));
select throws_ok(format('select public.complete_wish(%s, %s)', (select v from ids where k = 'vale_wish'), (select v from ids where k = 'fra_visit')),
                 '42501', null, 'someone else''s visit cannot resolve a wish');
select throws_ok(format('select public.complete_wish(%s, %s)', (select v from ids where k = 'vale_wish'), (select v from ids where k = 'vale_ozzy_visit')),
                 '42501', null, 'a visit at another place cannot resolve it');
select lives_ok(format('select public.complete_wish(%s, %s)', (select v from ids where k = 'vale_wish'), (select v from ids where k = 'vale_visit')),
                'her visit there resolves it');
select is((select done_visit_id from public.wishlist where id = (select v from ids where k = 'vale_wish')),
          (select v from ids where k = 'vale_visit'), 'the wish links to the visit');
select lives_ok(format('insert into public.wishlist (place_id) values (%s)', (select v from ids where k = 'butch')),
                'after visiting she can wish for the place again');
select throws_ok(format('select public.reopen_wish(%s)', (select v from ids where k = 'vale_wish')),
                 '23505', null, 'but cannot reopen the old one while a new one is open');
select throws_ok(format('select public.reopen_wish(%s)', (select v from ids where k = 'fra_wish')),
                 '42501', null, 'nor reopen fra''s');

-- vale adds a spot, so we can see it survive her account
insert into ids select 'vale_spot', public.save_place(jsonb_build_object(
  'name', 'Placca di Vale', 'activity', 'crag', 'lat', 45.6, 'lng', 7.6, 'area_name', 'Albard'));

select throws_ok(format('select public.delete_user(%L)', :fra), '42501', null, 'vale cannot delete fra');
update public.profiles set username = 'hijacked' where id = :fra::uuid;

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.wishlist), 1::bigint, 'anon sees only the public wish');
select throws_ok(format('select public.delete_user(%L)', :vale), '42501', null, 'anon cannot delete anyone');

-- ---------------------------------------------------------------- checks as superuser
reset role;
select is((select notes from public.wishlist where id = (select v from ids where k = 'fra_wish')), 'secret plan',
          'vale could neither edit nor delete fra''s wish');
select is((select username from public.profiles where id = :fra::uuid), 'fra', 'vale cannot rename fra');

-- ---------------------------------------------------------------- vale deletes herself (rolled back)
savepoint before_self_delete;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select lives_ok(format('select public.delete_user(%L)', :vale), 'vale deletes her own account');
reset role;
select is((select count(*) from public.profiles where id = :vale::uuid), 0::bigint, 'her profile is gone');
rollback to savepoint before_self_delete;

-- ---------------------------------------------------------------- fra (admin)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select throws_ok(format('select public.delete_user(%L)', :fra), '42501', null, 'the last admin cannot delete themselves');
update public.profiles set username = 'vale_renamed' where id = :vale::uuid;
select lives_ok(format('select public.delete_user(%L, true)', :vale), 'the check-only call passes');
select lives_ok(format('select public.delete_user(%L)', :vale), 'an admin deletes vale');

reset role;
select is((select username from public.profiles where id = :fra::uuid), 'fra', 'fra is untouched');
select is((select count(*) from public.visits where user_id = :vale::uuid), 0::bigint, 'vale''s visits went with her');
select is((select created_by from public.places where id = (select v from ids where k = 'vale_spot')), null,
          'her spot stays, without an owner');

select * from finish();
rollback;
