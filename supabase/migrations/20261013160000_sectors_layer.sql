-- =====================================================================
-- Area → Sector → Spot, the same for every sport.
--
--   Area    groups nearby things            Valle dell'Orco · Monte Rosa · Lecco
--   Sector  (optional) groups spots:        Parete di Pezol · Breithorn · Falesia di Civate
--           a wall, a mountain, a crag
--   Spot    the thing you go and do:        Claudia 22 · via normale · Parete Sud
--
-- Until now a crag spot had its own list of sectors (its walls) that routes
-- were filed under. Those become spots of their own: a crag with sectors
-- turns into a sector, and each of its old sectors into a spot. The crag's
-- row stays as the first wall, so its id, links, photos and visits are kept.
-- A visit is still at one spot; each route climbed can name another spot of
-- the same sector (ascents.place_id), so a day across walls is one visit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The old per-crag sectors make way for the new layer
-- ---------------------------------------------------------------------
drop view public.visit_overview;
drop trigger routes_check_sector on public.routes;
drop function public.check_route_sector();
drop trigger ascents_check_sector on public.ascents;
drop function public.check_ascent_sector();
alter table public.sectors rename to crag_sectors_old;

-- ---------------------------------------------------------------------
-- Sectors
-- ---------------------------------------------------------------------
create table public.sectors (
  id           bigint generated always as identity primary key,
  area_id      bigint references public.areas (id) on delete set null,
  name         text not null check (length(trim(name)) > 0),
  description  text,
  max_altitude integer,   -- a summit's height, for mountains
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index sectors_area_name_key on public.sectors (coalesce(area_id, 0), lower(name));
create index sectors_area_id_idx on public.sectors (area_id);

create trigger sectors_touch before update on public.sectors
  for each row execute function public.touch_updated_at();

create function public.can_edit_sector(p_sector_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.sectors
    where id = p_sector_id and created_by = (select auth.uid())
  );
$$;

alter table public.sectors enable row level security;
create policy "sectors are readable by everyone" on public.sectors
  for select using (true);
create policy "signed-in users add sectors" on public.sectors
  for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "creator or admin updates a sector" on public.sectors
  for update to authenticated
  using (public.can_edit_sector(id)) with check (public.can_edit_sector(id));
create policy "creator or admin deletes a sector" on public.sectors
  for delete to authenticated
  using (public.can_edit_sector(id));

revoke update on public.sectors from anon, authenticated;
grant update (area_id, name, description, max_altitude) on public.sectors to authenticated;

-- ---------------------------------------------------------------------
-- Spots belong to a sector; a spot in a sector is in the sector's area
-- ---------------------------------------------------------------------
alter table public.places add column sector_id bigint references public.sectors (id) on delete set null;
create index places_sector_id_idx on public.places (sector_id);
grant update (sector_id) on public.places to authenticated;

create function public.place_area_from_sector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sector_id is not null then
    new.area_id := (select area_id from public.sectors where id = new.sector_id);
  end if;
  return new;
end;
$$;
create trigger places_area_from_sector before insert or update of sector_id, area_id on public.places
  for each row execute function public.place_area_from_sector();

-- Moving a sector to another area moves its spots with it. Security definer:
-- the sector's editor may not be allowed to edit every spot in it.
create function public.sector_area_to_places()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.places set area_id = new.area_id where sector_id = new.id;
  return new;
end;
$$;
create trigger sectors_area_to_places after update of area_id on public.sectors
  for each row when (old.area_id is distinct from new.area_id)
  execute function public.sector_area_to_places();

-- ---------------------------------------------------------------------
-- Routes climbed can be on another spot of the visit's sector
-- ---------------------------------------------------------------------
alter table public.ascents add column place_id bigint references public.places (id) on delete set null;
create index ascents_place_id_idx on public.ascents (place_id);

-- ---------------------------------------------------------------------
-- Data: each crag with sectors becomes a sector, each old sector a spot
-- ---------------------------------------------------------------------
do $$
declare
  p record;
  s record;
  sid bigint;
  first boolean;
  new_pid bigint;
begin
  for p in select * from public.places pl
           where exists (select 1 from public.crag_sectors_old o where o.place_id = pl.id)
           order by pl.id loop
    insert into public.sectors (area_id, name, description, created_by)
    values (p.area_id, p.name, p.description, p.created_by)
    returning id into sid;

    first := true;
    for s in select * from public.crag_sectors_old where place_id = p.id order by position, id loop
      if first then
        -- The crag's own row becomes its first wall.
        update public.places set name = s.name, sector_id = sid, description = null where id = p.id;
        new_pid := p.id;
        first := false;
      else
        insert into public.places (
          area_id, sector_id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
          rock, exposition, created_by)
        values (
          p.area_id, sid, s.name, p.activity, p.lat, p.lng, p.parking_lat, p.parking_lng, p.start_lat, p.start_lng,
          p.rock, p.exposition, p.created_by)
        returning id into new_pid;
        update public.routes r set place_id = new_pid
        where r.sector_id = s.id
          and not exists (select 1 from public.routes x where x.place_id = new_pid and lower(x.name) = lower(r.name));
      end if;
      update public.ascents set place_id = new_pid where sector_id = s.id and new_pid <> p.id;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Drop the old columns and table
-- ---------------------------------------------------------------------
alter table public.ascents drop column sector_id;
alter table public.routes drop column sector_id;
drop table public.crag_sectors_old;

revoke update on public.routes from anon, authenticated;
grant update (name, grade) on public.routes to authenticated;

-- An ascent's spot is the visit's spot or another spot of the same sector;
-- its route is on that spot.
create function public.check_ascent_spot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  visit_spot bigint := (select place_id from public.visits where id = new.visit_id);
  spot bigint := coalesce(new.place_id, visit_spot);
begin
  if new.place_id is not null and new.place_id <> visit_spot and not exists (
    select 1 from public.places a, public.places b
    where a.id = visit_spot and b.id = new.place_id and a.sector_id = b.sector_id
  ) then
    raise exception 'spot % is not in the sector of visit %', new.place_id, new.visit_id;
  end if;
  if new.route_id is not null
     and not exists (select 1 from public.routes where id = new.route_id and place_id = spot) then
    raise exception 'route % does not belong to spot %', new.route_id, spot;
  end if;
  return new;
end;
$$;
create trigger ascents_check_spot before insert or update on public.ascents
  for each row execute function public.check_ascent_spot();

-- ---------------------------------------------------------------------
-- save_place: sector by name instead of the list of crag sectors
--   { id?, area_name, sector_name?, name, activity, lat, lng, … }
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
  sid bigint;
  area_name text := nullif(trim(p ->> 'area_name'), '');
  sector_name text := nullif(trim(p ->> 'sector_name'), '');
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

  -- The sector of that name in the spot's area (any case), or a new one.
  if sector_name is not null then
    select id into sid from public.sectors
    where area_id is not distinct from aid and lower(name) = lower(sector_name);
    if sid is null then
      insert into public.sectors (area_id, name) values (aid, sector_name) returning id into sid;
    end if;
  end if;

  if pid is null then
    insert into public.places (
      area_id, sector_id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
      rock, exposition, description, grade, max_altitude, elevation_gain, distance_km)
    values (
      aid,
      sid,
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
      sector_id      = sid,
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

  return pid;
end;
$$;

-- ---------------------------------------------------------------------
-- save_visit: each route can be on another spot of the sector
--   { …, add_routes: boolean,
--     ascents: [{ name?, grade?, place_id?, route_id?, comment? }] }
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

  -- Contribute the visit's new route names to each spot's shared list.
  if coalesce((v ->> 'add_routes')::boolean, false) then
    insert into public.routes (place_id, name, grade)
    select distinct on (coalesce((a ->> 'place_id')::bigint, spot), lower(trim(a ->> 'name')))
           coalesce((a ->> 'place_id')::bigint, spot), trim(a ->> 'name'), nullif(trim(a ->> 'grade'), '')
    from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) a
    where nullif(trim(a ->> 'name'), '') is not null
    on conflict (place_id, lower(name)) do nothing;
  end if;

  delete from public.ascents where visit_id = vid;
  insert into public.ascents (visit_id, place_id, route_id, name, grade, comment, position)
  select vid,
         nullif((a.value ->> 'place_id')::bigint, spot),
         coalesce((a.value ->> 'route_id')::bigint,
                  (select r.id from public.routes r
                   where r.place_id = coalesce((a.value ->> 'place_id')::bigint, spot)
                     and lower(r.name) = lower(trim(a.value ->> 'name')))),
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
-- import_logbook: a route's "sector" names a spot of the visit's sector
-- (one that doesn't exist is kept in the route's comment)
-- ---------------------------------------------------------------------
create or replace function public.import_logbook(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  imp bigint;
  s jsonb;
  v jsonb;
  l jsonb;
  pid bigint;
  vid bigint;
  spot_ids jsonb := '{}';
  added int := 0;
  skipped int := 0;
  new_spots int := 0;
begin
  -- See save_place: checked here instead of revoking EXECUTE.
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  insert into public.imports (file_name, summary)
  values (coalesce(nullif(trim(p ->> 'file_name'), ''), 'import'), coalesce(p -> 'summary', '{}'))
  returning id into imp;

  for s in select * from jsonb_array_elements(coalesce(p -> 'spots', '[]')) loop
    pid := (s ->> 'place_id')::bigint;
    if pid is null then
      pid := public.save_place(s -> 'place');
      new_spots := new_spots + 1;
      for l in select * from jsonb_array_elements(coalesce(s -> 'links', '[]')) loop
        if l ->> 'url' ~* '^https?://' then
          insert into public.attachments (place_id, kind, title, url)
          values (pid, 'link', nullif(trim(l ->> 'title'), ''), l ->> 'url');
        end if;
      end loop;
    elsif not exists (select 1 from public.places where id = pid) then
      raise exception 'Spot % no longer exists', pid;
    end if;
    spot_ids := spot_ids || jsonb_build_object(s ->> 'key', pid);
  end loop;

  for v in select * from jsonb_array_elements(coalesce(p -> 'visits', '[]')) loop
    pid := (spot_ids ->> (v ->> 'spot'))::bigint;
    if pid is null then
      raise exception 'Visit refers to unknown spot "%"', v ->> 'spot';
    end if;
    if exists (select 1 from public.visits
               where user_id = uid and place_id = pid
                 and date is not distinct from (v ->> 'date')::date) then
      skipped := skipped + 1;
      continue;
    end if;
    v := jsonb_set(v, '{ascents}', coalesce((
      select jsonb_agg(
               case
                 when nullif(trim(a ->> 'sector'), '') is null then a - 'sector'
                 when wall.id is not null then (a - 'sector') || jsonb_build_object('place_id', wall.id)
                 else (a - 'sector') || jsonb_build_object('comment',
                        concat_ws(' ', nullif(trim(a ->> 'comment'), ''), '(' || trim(a ->> 'sector') || ')'))
               end
             order by ord)
      from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality as t (a, ord)
      left join lateral (
        select w.id from public.places w, public.places me
        where me.id = pid and me.sector_id is not null and w.sector_id = me.sector_id
          and lower(w.name) = lower(trim(a ->> 'sector'))
        limit 1
      ) wall on true), '[]'));
    vid := public.save_visit((v - 'spot') || jsonb_build_object('place_id', pid));
    update public.visits set import_id = imp where id = vid;
    added := added + 1;
  end loop;

  if added = 0 then
    delete from public.imports where id = imp;
    imp := null;
  else
    update public.imports
    set summary = summary || jsonb_build_object('visits', added, 'skipped', skipped, 'new_spots', new_spots)
    where id = imp;
  end if;
  return jsonb_build_object('import_id', imp, 'visits', added, 'skipped', skipped, 'new_spots', new_spots);
end;
$$;

-- ---------------------------------------------------------------------
-- visit_overview: the spot's sector, and the other walls climbed that day
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
  p.sector_id,
  se.name                                                  as sector_name,
  v.date,
  v.summary,
  v.conditions,
  v.duration_hours,
  v.visibility,
  coalesce(a.ascent_count, 0)                              as ascent_count,
  a.max_grade_rank,
  coalesce(a.grades, '{}')                                 as grades,
  coalesce(a.wall_names, '{}')                             as wall_names,
  coalesce(vp.partner_ids, '{}')                           as partner_ids,
  coalesce(vp.partner_names, '{}')                         as partner_names,
  lower(concat_ws(' ', p.name, se.name, ar.name, v.summary, v.conditions, pr.username,
                  array_to_string(vp.partner_names, ' '), a.search_text)) as search_text
from public.visits v
join public.places p on p.id = v.place_id
left join public.sectors se on se.id = p.sector_id
left join public.areas ar on ar.id = p.area_id
left join public.profiles pr on pr.id = v.user_id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         array_agg(asc_.grade order by asc_.position) filter (where asc_.grade is not null) as grades,
         array_agg(distinct w.name) filter (where w.name is not null) as wall_names,
         string_agg(concat_ws(' ', asc_.name, asc_.grade, w.name, asc_.comment), ' ') as search_text
  from public.ascents asc_
  left join public.places w on w.id = asc_.place_id
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
