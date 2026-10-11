-- =====================================================================
-- Ontology: Area → Spot → Visit.
--
-- * A spot (table "places") has exactly one activity. New activities:
--   trail running, hiking, deep water solo, indoor climbing.
-- * Multipitch/alpine/ice/ski "places" that held several logged routes are
--   converted: the place becomes an area, each route becomes a spot, and
--   every visit moves to the spot of the route it logged (see
--   private.convert_route_spots below, which reports what it does).
-- * Optional shared route lists for crags, deep water solo and gyms
--   ("routes"). Visits still log routes as free text; a route whose name
--   matches the spot's list is linked to it, so repeats can be counted.
-- * Spots get a distance (trail running, hiking, ski touring).
-- =====================================================================

alter table public.places
  add column activity text,
  add column distance_km numeric(6, 2) check (distance_km > 0 and distance_km < 1000);

-- ---------------------------------------------------------------------
-- Data conversion (runs once here; kept for reference, not exposed by the API)
-- ---------------------------------------------------------------------
create schema if not exists private;

create function private.convert_route_spots()
returns setof text
language plpgsql
set search_path = ''
as $$
declare
  route_acts constant text[] := array['alpine', 'ice', 'ski', 'multipitch'];
  p record;
  v record;
  grp record;
  aid bigint;
  area_name text;
  route_act text;
  sid bigint;
  first_spot bigint;
  new_vid bigint;
begin
  for p in
    select pl.* from public.places pl
    where pl.types && route_acts
      and exists (select 1 from public.visits vv join public.ascents a on a.visit_id = vv.id
                  where vv.place_id = pl.id and nullif(trim(a.name), '') is not null)
    order by pl.name
  loop
    route_act := (select t from unnest(route_acts) t where t = any (p.types) limit 1);

    aid := p.area_id;
    if aid is null then
      select id into aid from public.areas where lower(name) = lower(p.name);
      if aid is null then
        insert into public.areas (created_by, name, description, lat, lng)
        values (p.created_by, p.name, p.description, p.lat, p.lng)
        returning id into aid;
        return next format('New area "%s" (from the place of the same name)', p.name);
      end if;
    end if;
    select name into area_name from public.areas where id = aid;

    for v in select * from public.visits where place_id = p.id order by date nulls last, id loop
      first_spot := null;
      for grp in
        select lower(trim(a.name)) as k, min(trim(a.name)) as nm, min(a.grade) as grade
        from public.ascents a
        where a.visit_id = v.id and nullif(trim(a.name), '') is not null
        group by 1 order by min(a.position)
      loop
        select id into sid from public.places
        where area_id = aid and lower(name) = grp.k and id <> p.id;
        if sid is null then
          insert into public.places (created_by, area_id, name, types, activity, lat, lng, parking_lat, parking_lng,
                                     start_lat, start_lng, rock, exposition, grade)
          values (p.created_by, aid, grp.nm, array[route_act], route_act, p.lat, p.lng, p.parking_lat, p.parking_lng,
                  p.start_lat, p.start_lng, p.rock, p.exposition, grp.grade)
          returning id into sid;
          return next format('  New %s spot "%s" in "%s"', route_act, grp.nm, area_name);
        end if;

        if first_spot is null then
          first_spot := sid;
          update public.visits set place_id = sid where id = v.id;
          return next format('  Visit of %s moved from "%s" to "%s"', coalesce(v.date::text, 'no date'), p.name, grp.nm);
        else
          insert into public.visits (user_id, place_id, date, summary, approach, descent, conditions, duration_hours,
                                     visibility, created_at)
          select user_id, sid, date, summary, approach, descent, conditions, duration_hours, visibility, created_at
          from public.visits where id = v.id
          returning id into new_vid;
          insert into public.visit_partners (visit_id, partner_id)
          select new_vid, partner_id from public.visit_partners where visit_id = v.id;
          update public.ascents set visit_id = new_vid where visit_id = v.id and lower(trim(name)) = grp.k;
          return next format('  Visit of %s split: "%s" got its own visit', coalesce(v.date::text, 'no date'), grp.nm);
        end if;
      end loop;
    end loop;

    -- A route that moved away from its sector keeps the sector's name (before
    -- the old place, and with it the sector, may be deleted below).
    update public.ascents a
    set comment = concat_ws(' ', a.comment, '(sector: ' || s.name || ')'), sector_id = null
    from public.sectors s, public.visits vv
    where a.sector_id = s.id and vv.id = a.visit_id and s.place_id <> vv.place_id;

    if not exists (select 1 from public.visits where place_id = p.id)
       and not exists (select 1 from public.photos where place_id = p.id) then
      update public.attachments set place_id = null, area_id = aid where place_id = p.id;
      update public.areas set description = p.description where id = aid and description is null;
      delete from public.places where id = p.id;
      return next format('  Place "%s" removed: the area "%s" stands for it now', p.name, area_name);
    else
      update public.places
      set area_id = aid, activity = case when 'crag' = any (types) then 'crag' else route_act end
      where id = p.id;
      return next format('  "%s" stays as a %s spot in "%s" (it still has visits)',
                         p.name, case when 'crag' = any (p.types) then 'crag' else route_act end, area_name);
    end if;
  end loop;

  -- Everything else: the most specific of its activities.
  update public.places
  set activity = (select t from unnest(array['alpine', 'ice', 'ski', 'multipitch', 'crag']) t
                  where t = any (types) limit 1)
  where activity is null;
end;
$$;

revoke all on function private.convert_route_spots() from public;

do $$
declare
  line text;
begin
  for line in select * from private.convert_route_spots() loop
    raise notice '%', line;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- One activity per spot
-- ---------------------------------------------------------------------
drop view public.visit_overview;

alter table public.places drop column types;
alter table public.places alter column activity set not null;
alter table public.places alter column activity set default 'crag';
alter table public.places add constraint places_activity_check
  check (activity in ('crag', 'multipitch', 'alpine', 'ice', 'ski', 'trail', 'hike', 'dws', 'indoor'));
create index places_activity_idx on public.places (activity);

grant update (activity, distance_km) on public.places to authenticated;

-- ---------------------------------------------------------------------
-- Shared route lists
-- ---------------------------------------------------------------------
create table public.routes (
  id         bigint generated always as identity primary key,
  place_id   bigint not null references public.places (id) on delete cascade,
  sector_id  bigint references public.sectors (id) on delete set null,
  name       text not null check (length(trim(name)) > 0),
  grade      text,
  grade_rank integer generated always as (public.grade_rank(grade)) stored,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index routes_place_name_key on public.routes (place_id, lower(name));
create index routes_sector_id_idx on public.routes (sector_id);

alter table public.routes enable row level security;
create policy "routes are readable by everyone" on public.routes
  for select using (true);
create policy "signed-in users add routes" on public.routes
  for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "route creator or spot editor changes a route" on public.routes
  for update to authenticated
  using (created_by = (select auth.uid()) or public.can_edit_place(place_id))
  with check (created_by = (select auth.uid()) or public.can_edit_place(place_id));
create policy "route creator or spot editor deletes a route" on public.routes
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.can_edit_place(place_id));

revoke update on public.routes from anon, authenticated;
grant update (name, grade, sector_id) on public.routes to authenticated;

alter table public.ascents add column route_id bigint references public.routes (id) on delete set null;
create index ascents_route_id_idx on public.ascents (route_id);

-- A route's sector, and an ascent's sector and route, must belong to the right spot.
create function public.check_route_sector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sector_id is not null
     and not exists (select 1 from public.sectors where id = new.sector_id and place_id = new.place_id) then
    raise exception 'sector % does not belong to spot %', new.sector_id, new.place_id;
  end if;
  return new;
end;
$$;
create trigger routes_check_sector before insert or update on public.routes
  for each row execute function public.check_route_sector();

create or replace function public.check_ascent_sector()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  spot bigint := (select place_id from public.visits where id = new.visit_id);
begin
  if new.sector_id is not null
     and not exists (select 1 from public.sectors where id = new.sector_id and place_id = spot) then
    raise exception 'sector % does not belong to the spot of visit %', new.sector_id, new.visit_id;
  end if;
  if new.route_id is not null
     and not exists (select 1 from public.routes where id = new.route_id and place_id = spot) then
    raise exception 'route % does not belong to the spot of visit %', new.route_id, new.visit_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- save_place: activity, distance
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
      area_id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
      rock, exposition, description, grade, max_altitude, elevation_gain, distance_km)
    values (
      aid,
      p ->> 'name',
      p ->> 'activity',
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
      (p ->> 'elevation_gain')::integer,
      (p ->> 'distance_km')::numeric
    )
    returning id into pid;
  else
    update public.places set
      area_id        = aid,
      name           = p ->> 'name',
      activity       = p ->> 'activity',
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
      elevation_gain = (p ->> 'elevation_gain')::integer,
      distance_km    = (p ->> 'distance_km')::numeric
    where id = pid;
    if not found then
      raise exception 'You can only edit spots you created' using errcode = '42501';
    end if;
  end if;

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
-- save_visit: link routes from the spot's list, optionally add new ones
--   { …, add_routes: boolean, ascents: [{ name?, grade?, sector_id?, route_id?, comment? }] }
-- ---------------------------------------------------------------------
create or replace function public.save_visit(v jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  vid bigint := (v ->> 'id')::bigint;
  spot bigint;
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
    returning id, place_id into vid, spot;
  else
    update public.visits set
      date           = (v ->> 'date')::date,
      summary        = nullif(trim(v ->> 'summary'), ''),
      approach       = nullif(trim(v ->> 'approach'), ''),
      descent        = nullif(trim(v ->> 'descent'), ''),
      conditions     = nullif(trim(v ->> 'conditions'), ''),
      duration_hours = (v ->> 'duration_hours')::numeric,
      visibility     = coalesce(v ->> 'visibility', 'private')
    where id = vid and user_id = (select auth.uid())
    returning place_id into spot;
    if not found then
      raise exception 'You can only edit your own visits' using errcode = '42501';
    end if;
  end if;

  -- Contribute the visit's new route names to the spot's shared list.
  if coalesce((v ->> 'add_routes')::boolean, false) then
    insert into public.routes (place_id, sector_id, name, grade)
    select distinct on (lower(trim(a ->> 'name')))
           spot, (a ->> 'sector_id')::bigint, trim(a ->> 'name'), nullif(trim(a ->> 'grade'), '')
    from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) a
    where nullif(trim(a ->> 'name'), '') is not null
    on conflict (place_id, lower(name)) do nothing;
  end if;

  delete from public.ascents where visit_id = vid;
  insert into public.ascents (visit_id, sector_id, route_id, name, grade, comment, position)
  select vid,
         (a.value ->> 'sector_id')::bigint,
         coalesce((a.value ->> 'route_id')::bigint,
                  (select r.id from public.routes r
                   where r.place_id = spot and lower(r.name) = lower(trim(a.value ->> 'name')))),
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
-- visit_overview: place_types → place_activity
-- ---------------------------------------------------------------------
create view public.visit_overview
with (security_invoker = true)
as
select
  v.id,
  v.user_id,
  pr.username,
  v.place_id,
  p.name                                                   as place_name,
  p.activity                                               as place_activity,
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
