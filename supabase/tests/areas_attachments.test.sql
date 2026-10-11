-- Areas, attachments and the place-files bucket. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\set fra  '\'11111111-1111-4111-8111-111111111111\''
\set vale '\'22222222-2222-4222-8222-222222222222\''

create temp table ids (k text primary key, v bigint);
grant all on ids to anon, authenticated;
insert into ids select 'albard', id from public.areas where name = 'Albard';
insert into ids select 'butch', id from public.places where name = 'Muro del Butch';

-- ---------------------------------------------------------------- seed / migration shape
select is((select array_agg(name order by name) from public.places where area_id = (select v from ids where k = 'albard')),
          array['Ozzy'], 'Albard is an area holding its route; the old Albard place is gone');
select ok((select count(*) from public.attachments where kind = 'link') > 0, 'guide links became attachments');

-- ---------------------------------------------------------------- anon
set local role anon;
select is((select count(*) from public.areas), 10::bigint, 'anon reads areas');
select ok((select count(*) from public.attachments) > 0, 'anon reads attachments');
select throws_ok($$insert into public.areas (name) values ('Nope')$$, '42501', null, 'anon cannot add an area');

-- ---------------------------------------------------------------- vale
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vale, 'role', 'authenticated')::text, true);

update public.areas set name = 'hijacked' where id = (select v from ids where k = 'albard');
select lives_ok($$insert into public.attachments (place_id, kind, title, url)
                  select v, 'link', 'Topo', 'https://example.com/topo' from ids where k = 'butch'$$,
                'vale can add a guide link to fra''s place');
select throws_ok($$insert into public.attachments (place_id, kind, url)
                   select v, 'link', 'javascript:alert(1)' from ids where k = 'butch'$$,
                 '23514', null, 'links must be http(s)');
select throws_ok(format($$insert into public.attachments (place_id, kind, storage_path) values (%s, 'gpx', %L)$$,
                        (select v from ids where k = 'butch'), :fra || '/x.gpx'),
                 '42501', null, 'vale cannot register a file in fra''s folder');
delete from public.attachments where created_by = :fra::uuid;

select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('place-files', %L)$$, :vale || '/1/approach.gpx'),
                'vale uploads a gpx into her folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('place-files', %L)$$, :fra || '/1/approach.gpx'),
                 '42501', null, 'vale cannot upload into fra''s folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('place-files', %L)$$, :vale || '/1/run.exe'),
                 '42501', null, 'only gpx and pdf files');

select is(public.save_place(jsonb_build_object(
  'name', 'Raggio di sole', 'activity', 'multipitch', 'lat', 45.7, 'lng', 7.7,
  'area_name', 'albard', 'start_lat', 45.71, 'start_lng', 7.71, 'grade', '6a+ (5c obbl.)')) is not null,
  true, 'save_place files a new route under an existing area, matched case-insensitively');
select is((select area_id from public.places where name = 'Raggio di sole'), (select v from ids where k = 'albard'),
          'the route is in Albard');
select lives_ok($$select public.save_place('{"name": "Pizzo Tre Signori", "activity": "ski", "lat": 46.0, "lng": 9.5,
                  "area_name": "Valsassina", "max_altitude": 2554, "elevation_gain": 1400}')$$,
                'a ski tour with a new area');

-- ---------------------------------------------------------------- checks as superuser
reset role;
select ok((select name from public.areas where id = (select v from ids where k = 'albard')) = 'Albard'
          and (select count(*) from public.attachments where created_by = :fra::uuid) > 0,
          'vale could neither rename fra''s area nor delete fra''s attachments');

select * from finish();
rollback;
