-- A visit's notes are only for its author; a tip posted with it is for everyone.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'wall', id from public.places where name = 'Muro del Butch';

-- ---------------------------------------------------------------- vale logs a public visit
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

insert into ids select 'visit', public.save_visit(jsonb_build_object(
  'place_id', (select v from ids where k = 'wall'),
  'date', '2026-10-10',
  'visibility', 'public',
  'summary', 'Felt heavy, too much pizza',
  'conditions', 'wet at the top',
  'ascents', jsonb_build_array(
    jsonb_build_object('name', 'Su alto', 'grade', '6c', 'comment', '  fell at the crux  '),
    jsonb_build_object('name', 'Busazza', 'grade', '6b')),
  'tip', jsonb_build_object('body', '  Bring a 70 m rope  ', 'topic', 'gear')));

select is((select summary from public.visit_notes where visit_id = (select v from ids where k = 'visit')),
          'Felt heavy, too much pizza', 'the author reads her notes');
select is((select array_agg(an.comment) from public.ascent_notes an join public.ascents a on a.id = an.ascent_id
           where a.visit_id = (select v from ids where k = 'visit')),
          array['fell at the crux'], 'route comments are saved trimmed, empty ones skipped');
select is((select summary from public.visit_overview where id = (select v from ids where k = 'visit')),
          'Felt heavy, too much pizza', 'and sees them in her logbook');
select is((select (body, topic, observed_on)::text from public.spot_comments
           where place_id = (select v from ids where k = 'wall') and user_id = :vale::uuid),
          '("Bring a 70 m rope",gear,2026-10-10)', 'the tip is posted on the spot, as of the visit''s date');

select lives_ok(format($$select public.save_visit(%L)$$, jsonb_build_object(
  'id', (select v from ids where k = 'visit'), 'place_id', (select v from ids where k = 'wall'),
  'date', '2026-10-10', 'visibility', 'public', 'summary', 'Felt fine after all')),
  'editing the visit without a tip');
select is((select count(*) from public.spot_comments where user_id = :vale::uuid), 1::bigint,
          'posts no other tip');

-- ---------------------------------------------------------------- fra (admin) reads the public visit
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :fra, 'role', 'authenticated')::text, true);
select is((select count(*) from public.visit_overview where id = (select v from ids where k = 'visit')), 1::bigint,
          'others see the public visit');
select is((select count(*) from public.visit_notes where visit_id = (select v from ids where k = 'visit')), 0::bigint,
          'but not its notes, not even an admin');
select is((select count(*) from public.visit_overview where id = (select v from ids where k = 'visit')
           and search_text like '%pizza%'), 0::bigint, 'nor find it by them');

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select summary from public.visit_overview where id = (select v from ids where k = 'visit')), null,
          'anon sees the visit without its notes');
select is((select count(*) from public.ascent_notes), 0::bigint, 'nor any route comment');

select * from finish();
rollback;
