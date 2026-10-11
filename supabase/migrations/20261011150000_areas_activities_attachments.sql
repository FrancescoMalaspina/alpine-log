-- =====================================================================
-- Macroareas, more activities, route details, attachments.
--
-- * areas: a macroarea (Albard, Grignetta…) groups places. Every crag and
--   every route is a place; multipitch routes are no longer pins inside a
--   place (mp_routes is migrated into places and dropped).
-- * places: start point (attacco), reference grade, max altitude, elevation
--   gain, and the activities alpine / ice / ski besides crag / multipitch.
-- * visits: conditions and duration.
-- * attachments: guide links, GPX approach tracks and PDF guides for a place
--   or an area. Always public; uploader or admin may delete. Files live in the
--   public storage bucket "place-files" under <uploader uid>/….
-- =====================================================================

-- ---------------------------------------------------------------------
-- Areas
-- ---------------------------------------------------------------------
create table public.areas (
  id          bigint generated always as identity primary key,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create unique index areas_name_key on public.areas (lower(name));

create trigger areas_touch before update on public.areas
  for each row execute function public.touch_updated_at();

create function public.can_edit_area(p_area_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.areas
    where id = p_area_id and created_by = (select auth.uid())
  );
$$;

alter table public.areas enable row level security;
create policy "areas are readable by everyone" on public.areas
  for select using (true);
create policy "signed-in users add areas" on public.areas
  for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "creator or admin updates an area" on public.areas
  for update to authenticated
  using (public.can_edit_area(id)) with check (public.can_edit_area(id));
create policy "creator or admin deletes an area" on public.areas
  for delete to authenticated
  using (public.can_edit_area(id));

revoke update on public.areas from anon, authenticated;
grant update (name, description, lat, lng) on public.areas to authenticated;

-- ---------------------------------------------------------------------
-- Places: area, start point, activity details, more types
-- ---------------------------------------------------------------------
alter table public.places
  add column area_id        bigint references public.areas (id) on delete set null,
  add column start_lat      double precision check (start_lat between -90 and 90),
  add column start_lng      double precision check (start_lng between -180 and 180),
  add column grade          text,
  add column max_altitude   integer check (max_altitude between -500 and 9000),
  add column elevation_gain integer check (elevation_gain between 0 and 10000),
  add constraint places_start_pair check ((start_lat is null) = (start_lng is null));
create index places_area_id_idx on public.places (area_id);

alter table public.places drop constraint places_types_check;
alter table public.places add constraint places_types_check
  check (cardinality(types) > 0 and types <@ array['crag', 'multipitch', 'alpine', 'ice', 'ski']);

grant update (area_id, start_lat, start_lng, grade, max_altitude, elevation_gain)
  on public.places to authenticated;

-- ---------------------------------------------------------------------
-- Visits: conditions and duration
-- ---------------------------------------------------------------------
alter table public.visits
  add column conditions     text,
  add column duration_hours numeric(5, 1) check (duration_hours > 0 and duration_hours < 1000);

-- ---------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------
create table public.attachments (
  id           bigint generated always as identity primary key,
  place_id     bigint references public.places (id) on delete cascade,
  area_id      bigint references public.areas (id) on delete cascade,
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('link', 'gpx', 'pdf')),
  title        text,
  url          text check (url ~* '^https?://'),
  storage_path text unique,
  size_bytes   bigint,
  created_at   timestamptz not null default now(),
  check (num_nonnulls(place_id, area_id) = 1),
  check ((kind = 'link') = (url is not null)),
  check ((kind = 'link') = (storage_path is null))
);
create index attachments_place_id_idx on public.attachments (place_id);
create index attachments_area_id_idx on public.attachments (area_id);

alter table public.attachments enable row level security;
create policy "attachments are readable by everyone" on public.attachments
  for select using (true);
create policy "signed-in users attach links and files" on public.attachments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (storage_path is null or split_part(storage_path, '/', 1) = (select auth.uid())::text)
  );
create policy "uploader or admin removes an attachment" on public.attachments
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_admin());

revoke update on public.attachments from anon, authenticated;
grant update (title) on public.attachments to authenticated;
create policy "uploader renames an attachment" on public.attachments
  for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

-- Storage bucket: public reads, uploads only into your own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('place-files', 'place-files', true, 20 * 1024 * 1024)
on conflict (id) do nothing;

create policy "place files are readable by everyone" on storage.objects
  for select using (bucket_id = 'place-files');
create policy "users upload gpx and pdf into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'place-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('gpx', 'pdf')
  );
create policy "uploader or admin deletes place files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'place-files'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

-- ---------------------------------------------------------------------
-- Data: places.link -> attachments, mp_routes -> places in an area
-- ---------------------------------------------------------------------
insert into public.attachments (place_id, created_by, kind, title, url)
select id, created_by, 'link', 'Guide', link
from public.places
where link ~* '^https?://' and created_by is not null;

alter table public.places drop column link;

do $$
declare
  parent record;
  aid bigint;
begin
  for parent in
    select p.* from public.places p
    where exists (select 1 from public.mp_routes m where m.place_id = p.id)
  loop
    insert into public.areas (created_by, name, lat, lng)
    values (parent.created_by, parent.name, parent.lat, parent.lng)
    on conflict ((lower(name))) do update set name = excluded.name
    returning id into aid;

    update public.places set area_id = aid where id = parent.id;

    insert into public.places (created_by, area_id, name, types, lat, lng, start_lat, start_lng, rock, exposition)
    select parent.created_by, aid, coalesce(m.name, parent.name || ' route'), '{multipitch}',
           coalesce(m.lat, parent.lat), coalesce(m.lng, parent.lng), m.lat, m.lng,
           parent.rock, parent.exposition
    from public.mp_routes m
    where m.place_id = parent.id
    order by m.position;
  end loop;
end;
$$;

drop table public.mp_routes;

-- ---------------------------------------------------------------------
-- save_place: new fields, area by name (found or created)
--   { id?, area_name?, name, types[], lat, lng, parking_lat?, parking_lng?,
--     start_lat?, start_lng?, rock?, exposition[], description?, grade?,
--     max_altitude?, elevation_gain?, sectors: [{ id?, name }] }
-- ---------------------------------------------------------------------
drop function public.save_place(jsonb);

create function public.save_place(p jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  pid bigint := (p ->> 'id')::bigint;
  aid bigint;
  area_name text := nullif(trim(p ->> 'area_name'), '');
  keep_ids bigint[];
begin
  -- Checked here rather than by revoking EXECUTE from anon: a permission-denied
  -- function call segfaults some Supabase Postgres builds (seen on 17.6.1.x).
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if area_name is not null then
    select id into aid from public.areas where lower(name) = lower(area_name);
    if aid is null then
      insert into public.areas (name, lat, lng)
      values (area_name, (p ->> 'lat')::double precision, (p ->> 'lng')::double precision)
      returning id into aid;
    end if;
  end if;

  if pid is null then
    insert into public.places (
      area_id, name, types, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
      rock, exposition, description, grade, max_altitude, elevation_gain)
    values (
      aid,
      p ->> 'name',
      array(select jsonb_array_elements_text(p -> 'types')),
      (p ->> 'lat')::double precision,
      (p ->> 'lng')::double precision,
      (p ->> 'parking_lat')::double precision,
      (p ->> 'parking_lng')::double precision,
      (p ->> 'start_lat')::double precision,
      (p ->> 'start_lng')::double precision,
      nullif(trim(p ->> 'rock'), ''),
      array(select jsonb_array_elements_text(coalesce(p -> 'exposition', '[]'))),
      nullif(trim(p ->> 'description'), ''),
      nullif(trim(p ->> 'grade'), ''),
      (p ->> 'max_altitude')::integer,
      (p ->> 'elevation_gain')::integer
    )
    returning id into pid;
  else
    update public.places set
      area_id        = aid,
      name           = p ->> 'name',
      types          = array(select jsonb_array_elements_text(p -> 'types')),
      lat            = (p ->> 'lat')::double precision,
      lng            = (p ->> 'lng')::double precision,
      parking_lat    = (p ->> 'parking_lat')::double precision,
      parking_lng    = (p ->> 'parking_lng')::double precision,
      start_lat      = (p ->> 'start_lat')::double precision,
      start_lng      = (p ->> 'start_lng')::double precision,
      rock           = nullif(trim(p ->> 'rock'), ''),
      exposition     = array(select jsonb_array_elements_text(coalesce(p -> 'exposition', '[]'))),
      description    = nullif(trim(p ->> 'description'), ''),
      grade          = nullif(trim(p ->> 'grade'), ''),
      max_altitude   = (p ->> 'max_altitude')::integer,
      elevation_gain = (p ->> 'elevation_gain')::integer
    where id = pid;
    if not found then
      raise exception 'You can only edit places you created' using errcode = '42501';
    end if;
  end if;

  -- Sectors: delete the ones no longer listed, rename kept ones, add new ones.
  select coalesce(array_agg((s ->> 'id')::bigint), '{}') into keep_ids
  from jsonb_array_elements(coalesce(p -> 'sectors', '[]')) s
  where s ->> 'id' is not null;

  delete from public.sectors where place_id = pid and id <> all (keep_ids);

  update public.sectors sec set name = trim(s.value ->> 'name'), position = s.ordinality - 1
  from jsonb_array_elements(coalesce(p -> 'sectors', '[]')) with ordinality s
  where s.value ->> 'id' is not null
    and sec.id = (s.value ->> 'id')::bigint
    and sec.place_id = pid;

  insert into public.sectors (place_id, name, position)
  select pid, trim(s.value ->> 'name'), s.ordinality - 1
  from jsonb_array_elements(coalesce(p -> 'sectors', '[]')) with ordinality s
  where s.value ->> 'id' is null;

  return pid;
end;
$$;

-- ---------------------------------------------------------------------
-- save_visit: conditions and duration
-- ---------------------------------------------------------------------
create or replace function public.save_visit(v jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  vid bigint := (v ->> 'id')::bigint;
  names text[] := array(
    select distinct trim(n) from jsonb_array_elements_text(coalesce(v -> 'partners', '[]')) n
    where trim(n) <> ''
  );
begin
  -- See save_place: checked here instead of revoking EXECUTE.
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if vid is null then
    insert into public.visits (place_id, date, summary, approach, descent, conditions, duration_hours, visibility)
    values (
      (v ->> 'place_id')::bigint,
      (v ->> 'date')::date,
      nullif(trim(v ->> 'summary'), ''),
      nullif(trim(v ->> 'approach'), ''),
      nullif(trim(v ->> 'descent'), ''),
      nullif(trim(v ->> 'conditions'), ''),
      (v ->> 'duration_hours')::numeric,
      coalesce(v ->> 'visibility', 'private')
    )
    returning id into vid;
  else
    update public.visits set
      date           = (v ->> 'date')::date,
      summary        = nullif(trim(v ->> 'summary'), ''),
      approach       = nullif(trim(v ->> 'approach'), ''),
      descent        = nullif(trim(v ->> 'descent'), ''),
      conditions     = nullif(trim(v ->> 'conditions'), ''),
      duration_hours = (v ->> 'duration_hours')::numeric,
      visibility     = coalesce(v ->> 'visibility', 'private')
    where id = vid and user_id = (select auth.uid());
    if not found then
      raise exception 'You can only edit your own visits' using errcode = '42501';
    end if;
  end if;

  delete from public.ascents where visit_id = vid;
  insert into public.ascents (visit_id, sector_id, name, grade, comment, position)
  select vid,
         (a.value ->> 'sector_id')::bigint,
         nullif(trim(a.value ->> 'name'), ''),
         nullif(trim(a.value ->> 'grade'), ''),
         nullif(trim(a.value ->> 'comment'), ''),
         a.ordinality - 1
  from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a;

  insert into public.partners (owner_id, name)
  select (select auth.uid()), n from unnest(names) n
  on conflict (owner_id, name) do nothing;

  delete from public.visit_partners where visit_id = vid;
  insert into public.visit_partners (visit_id, partner_id)
  select vid, pa.id from public.partners pa
  where pa.owner_id = (select auth.uid()) and pa.name = any (names);

  return vid;
end;
$$;

-- ---------------------------------------------------------------------
-- visit_overview: + area, conditions, duration
-- ---------------------------------------------------------------------
drop view public.visit_overview;

create view public.visit_overview
with (security_invoker = true)
as
select
  v.id,
  v.user_id,
  pr.username,
  v.place_id,
  p.name                                                   as place_name,
  p.types                                                  as place_types,
  p.area_id,
  ar.name                                                  as area_name,
  v.date,
  v.summary,
  v.conditions,
  v.duration_hours,
  v.visibility,
  coalesce(a.ascent_count, 0)                              as ascent_count,
  a.max_grade_rank,
  coalesce(a.grades, '{}')                                 as grades,
  coalesce(a.sector_names, '{}')                           as sector_names,
  coalesce(vp.partner_ids, '{}')                           as partner_ids,
  coalesce(vp.partner_names, '{}')                         as partner_names,
  lower(concat_ws(' ', p.name, ar.name, v.summary, v.conditions, pr.username,
                  array_to_string(vp.partner_names, ' '), a.search_text)) as search_text
from public.visits v
join public.places p on p.id = v.place_id
left join public.areas ar on ar.id = p.area_id
left join public.profiles pr on pr.id = v.user_id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         array_agg(asc_.grade order by asc_.position) filter (where asc_.grade is not null) as grades,
         array_agg(distinct s.name) filter (where s.name is not null) as sector_names,
         string_agg(concat_ws(' ', asc_.name, asc_.grade, s.name, asc_.comment), ' ') as search_text
  from public.ascents asc_
  left join public.sectors s on s.id = asc_.sector_id
  where asc_.visit_id = v.id
) a on true
left join lateral (
  select array_agg(pa.id order by pa.name)   as partner_ids,
         array_agg(pa.name order by pa.name) as partner_names
  from public.visit_partners x
  join public.partners pa on pa.id = x.partner_id
  where x.visit_id = v.id
) vp on true;

grant select on public.visit_overview to anon, authenticated;
