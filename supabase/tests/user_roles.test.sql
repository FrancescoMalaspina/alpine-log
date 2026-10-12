-- Admins manage roles: list_users, set_user_role. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.list_users()$$, '42501', null, 'anon cannot list users');

-- ---------------------------------------------------------------- vale (user)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

select throws_ok($$select * from public.list_users()$$, '42501', null, 'a user cannot list users');
select throws_ok(format('select public.set_user_role(%L, %L)', :vale, 'admin'),
                 '42501', null, 'a user cannot promote themselves');
select throws_ok(format('update public.profiles set role = %L where id = %L', 'admin', :vale),
                 '42501', null, 'nor by updating the column');

-- ---------------------------------------------------------------- fra (admin)
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);

select ok((select count(*) from public.list_users() where email = 'friend@example.com') = 1,
          'an admin lists users with their emails');
select is((select visits from public.list_users() where username = 'fra'),
          (select count(*) from public.visits where user_id = :fra::uuid), 'with how many visits they logged');
select lives_ok(format('select public.set_user_role(%L, %L)', :vale, 'admin'), 'an admin promotes vale');
select is((select role from public.profiles where id = :vale::uuid), 'admin', 'vale is now an admin');
select throws_ok(format('select public.set_user_role(%L, %L)', :fra, 'user'),
                 '42501', null, 'an admin cannot demote themselves');
select throws_ok(format('select public.set_user_role(%L, %L)', :vale, 'owner'),
                 '22023', null, 'only known roles');

-- ---------------------------------------------------------------- vale (now admin)
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);
select lives_ok(format('select public.set_user_role(%L, %L)', :fra, 'user'), 'the new admin can demote the old one');

reset role;
select * from finish();
rollback;
