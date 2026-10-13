-- Spot details, visit rating, other ropes, route style and overrides. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

-- ---------------------------------------------------------------- a multipitch route as published
insert into ids select 'caprice', public.save_place(jsonb_build_object(
  'name', 'Via Caprice', 'activity', 'multipitch', 'lat', 46.27, 'lng', 9.87,
  'area_name', 'Valmalenco', 'sector_name', 'Pilastri del Lago',
  'country', 'it', 'province', ' SO ', 'start_locality', 'Lanzada', 'protection', 'bolted',
  'pitches', 12, 'length_m', 180, 'grade', '6a+', 'grade_obligatory', '5c', 'aid', 'A0', 'alpine_grade', 'D+'));

select is((select row(country, province, start_locality, protection, pitches, length_m, alpine_grade, aid)::text
           from public.places where id = (select v from ids where k = 'caprice')),
          '(IT,SO,Lanzada,bolted,12,180,D+,A0)', 'save_place stores the new spot fields, trimmed, country upper-cased');
select is((select grade_obligatory_rank from public.places where id = (select v from ids where k = 'caprice')),
          public.grade_rank('5c'), 'the mandatory grade is ranked like any grade');
select throws_ok($$select public.save_place('{"name": "x", "activity": "crag", "lat": 1, "lng": 1, "protection": "glue"}')$$,
                 '23514', null, 'protection is bolted, trad or mixed');
select throws_ok($$select public.save_place('{"name": "x", "activity": "crag", "lat": 1, "lng": 1, "country": "Italy"}')$$,
                 '23514', null, 'country is a two-letter code');

-- ---------------------------------------------------------------- a visit with overrides
insert into ids select 'visit', public.save_visit(jsonb_build_object(
  'place_id', (select v from ids where k = 'caprice'), 'date', '2025-07-02', 'rating', 4,
  'partners', jsonb_build_array('Andre'), 'other_partners', jsonb_build_array('Sere', 'Andre', ' '),
  'ascents', jsonb_build_array(
    jsonb_build_object('name', 'Via Caprice', 'grade', '6a+', 'style', 'redpoint', 'pitches', 8, 'aid', 'A0 on L4'),
    jsonb_build_object('name', 'Variante', 'grade', '7a', 'style', 'attempt'))));

select is((select rating from public.visits where id = (select v from ids where k = 'visit')), 4::smallint, 'the visit keeps its rating');
select is((select array_agg(pa.name || ':' || x.same_rope order by pa.name) from public.visit_partners x
           join public.partners pa on pa.id = x.partner_id where x.visit_id = (select v from ids where k = 'visit')),
          array['Andre:true', 'Sere:false'], 'other ropes are kept apart; someone in both lists is in your rope');
select is((select row(style, pitches, aid)::text from public.ascents
           where visit_id = (select v from ids where k = 'visit') and position = 0),
          '(redpoint,8,"A0 on L4")', 'a route keeps its style and its own pitches and aid');
select is((select max_grade_rank from public.visit_overview where id = (select v from ids where k = 'visit')),
          public.grade_rank('7a'), 'the overview''s hardest grade counts attempts');
select is((select max_sent_grade_rank from public.visit_overview where id = (select v from ids where k = 'visit')),
          public.grade_rank('6a+'), 'but the hardest sent does not');
select is((select rating from public.visit_overview where id = (select v from ids where k = 'visit')), 4::smallint,
          'the overview has the rating');
select is((select pitches_climbed from public.visit_overview where id = (select v from ids where k = 'visit')), 20,
          'pitches climbed: the route''s own 8, and the topo''s 12 for a route without its own');
select throws_ok(format($$select public.save_visit(%L)$$, jsonb_build_object(
  'place_id', (select v from ids where k = 'caprice'), 'rating', 6)), '23514', null, 'ratings go from 1 to 5');
select throws_ok(format($$select public.save_visit(%L)$$, jsonb_build_object(
  'place_id', (select v from ids where k = 'caprice'), 'ascents', jsonb_build_array(jsonb_build_object('style', 'aided')))),
  '23514', null, 'only known styles');

select * from finish();
rollback;
