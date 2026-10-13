-- Tips on spots and sectors. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'wall', id from public.places where name = 'Scala dei sogni';
insert into ids select 'butch', sector_id from public.places where name = 'Scala dei sogni';

-- ---------------------------------------------------------------- vale posts
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

with t as (insert into public.spot_comments (place_id, body, topic)
           select v, 'Bring a 70 m rope', 'gear' from ids where k = 'wall' returning id)
insert into ids select 'tip', id from t;
select ok((select v from ids where k = 'tip') is not null, 'a signed-in user posts a tip on a spot');
select lives_ok(format($$insert into public.spot_comments (sector_id, body, topic, observed_on)
                         values (%s, 'Park at the church when full', 'parking', '2026-10-01')$$, (select v from ids where k = 'butch')),
                'or on a whole sector');
select throws_ok(format($$insert into public.spot_comments (place_id, sector_id, body) values (%s, %s, 'x')$$,
                        (select v from ids where k = 'wall'), (select v from ids where k = 'butch')),
                 '23514', null, 'a tip is on a spot or a sector, not both');
select throws_ok(format($$insert into public.spot_comments (place_id, body) values (%s, '   ')$$, (select v from ids where k = 'wall')),
                 '23514', null, 'a tip has some text');
select throws_ok(format($$insert into public.spot_comments (place_id, body, user_id) values (%s, 'as fra', %L)$$,
                        (select v from ids where k = 'wall'), :fra),
                 '42501', null, 'nobody posts in someone else''s name');
select lives_ok(format($$update public.spot_comments set body = 'Bring a 70 m rope, 12 quickdraws' where id = %s$$,
                       (select v from ids where k = 'tip')), 'the author edits her tip');

-- ---------------------------------------------------------------- anon reads
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.spot_comments), 2::bigint, 'anon reads every tip');

-- ---------------------------------------------------------------- fra (admin) can remove but not edit
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
update public.spot_comments set body = 'hijacked' where id = (select v from ids where k = 'tip');
select is((select body from public.spot_comments where id = (select v from ids where k = 'tip')),
          'Bring a 70 m rope, 12 quickdraws', 'nobody else edits a tip, not even an admin');
delete from public.spot_comments where id = (select v from ids where k = 'tip');
select is((select count(*) from public.spot_comments where id = (select v from ids where k = 'tip')), 0::bigint,
          'an admin removes any tip');

-- Deleting a sector removes its sector-wide tips.
reset role;
delete from public.sectors where id = (select v from ids where k = 'butch');
select is((select count(*) from public.spot_comments), 0::bigint, 'a sector''s tips go with it');

select * from finish();
rollback;
