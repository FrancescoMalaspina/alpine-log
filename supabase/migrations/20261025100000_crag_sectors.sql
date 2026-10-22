-- =====================================================================
-- A crag is one spot, with its sectors inside (#11, #23).
--
-- Vie lunghe, alpine routes, ice and tours keep Area › Sector › Spot: a
-- sector groups spots. A crag (also a boulder area, a deep water solo
-- spot) is different: the spot is the whole crag, and the crag has its own
-- sectors, each with its tiri. Until now a crag was filed as a sector whose
-- spots were its walls, and a visit's route could be "on another wall".
--
-- * crag_sectors: the sectors of a crag, with optional coordinates. Anyone
--   signed in adds one (logging a route in it does); the crag's editors and
--   the sector's author rename or remove it.
-- * routes (the crag's tiri) and ascents (the routes of a visit) name their
--   crag sector. The wall (ascents.place_id) is gone.
-- * A crag, boulder or DWS spot is in no sector.
-- * Every sector holding crags becomes one crag named after it (its first
--   spot, renamed), and its spots become the crag's sectors: their visits,
--   routes, tiri, days, photos, files, tips and wishes move to the crag,
--   each route into the sector it was climbed in.
-- * merge_places merges the two crags' sectors by name.
-- =====================================================================

-- Spots that have sectors inside (crags) rather than being in one.
create function public.has_crag_sectors(p_activity text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_activity in ('crag', 'boulder', 'dws');
$$;

-- ---------------------------------------------------------------------
-- Crag sectors
-- ---------------------------------------------------------------------
create table public.crag_sectors (
  id          bigint generated always as identity primary key,
  place_id    bigint not null references public.places (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  description text,
  lat         double precision,
  lng         double precision,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create unique index crag_sectors_place_name_key on public.crag_sectors (place_id, public.fold_name(name));

alter table public.crag_sectors enable row level security;
create policy "crag sectors are readable by everyone" on public.crag_sectors
  for select using (true);
create policy "signed-in users add crag sectors" on public.crag_sectors
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "sector author or crag editor changes a crag sector" on public.crag_sectors
  for update to authenticated
  using (created_by = (select auth.uid()) or public.can_edit_place(place_id));
create policy "sector author or crag editor removes a crag sector" on public.crag_sectors
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.can_edit_place(place_id));
revoke update on public.crag_sectors from anon, authenticated;
grant update (name, description, lat, lng) on public.crag_sectors to authenticated;

-- A crag's tiri, and the routes of a visit, are in one of its sectors.
alter table public.routes add column crag_sector_id bigint references public.crag_sectors (id) on delete set null;
alter table public.ascents add column crag_sector_id bigint references public.crag_sectors (id) on delete set null;
create index routes_crag_sector_id_idx on public.routes (crag_sector_id);
create index ascents_crag_sector_id_idx on public.ascents (crag_sector_id);
drop index public.routes_place_name_key;
create unique index routes_place_sector_name_key on public.routes (place_id, coalesce(crag_sector_id, 0), lower(name));
grant update (crag_sector_id) on public.routes to authenticated;

create function public.check_route_crag_sector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.crag_sector_id is not null
     and not exists (select 1 from public.crag_sectors where id = new.crag_sector_id and place_id = new.place_id) then
    raise exception 'That sector isn''t at "%"', (select name from public.places where id = new.place_id) using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger routes_check_crag_sector before insert or update of place_id, crag_sector_id on public.routes
  for each row execute function public.check_route_crag_sector();

-- ---------------------------------------------------------------------
-- The walls go: their checks first, the column after the conversion.
-- ---------------------------------------------------------------------
drop trigger places_drop_stray_walls on public.places;
drop function public.places_sector_changed();
drop function private.drop_stray_walls(bigint);
drop trigger ascents_check_spot on public.ascents;

-- ---------------------------------------------------------------------
-- merge_places: the work, for an admin's merge and for the conversion below.
-- Step 3 is new: the duplicate's crag sectors and tiri join the kept spot's,
-- one of the same name becoming it.
-- ---------------------------------------------------------------------
create function private.merge_places(p_keep bigint, p_duplicate bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_visits int;
  n_routes int;
  n_photos int;
  n_files int;
begin
  -- 1. Details the kept spot lacks come from the duplicate. Its sector only
  --    when it is in the kept spot's area (a sector sets the spot's area).
  update public.places k set
    area_id          = coalesce(k.area_id, d.area_id),
    sector_id        = case when k.sector_id is null and (k.area_id is null or k.area_id = d.area_id)
                            then d.sector_id else k.sector_id end,
    parking_lat      = coalesce(k.parking_lat, d.parking_lat),
    parking_lng      = case when k.parking_lat is null then d.parking_lng else k.parking_lng end,
    start_lat        = coalesce(k.start_lat, d.start_lat),
    start_lng        = case when k.start_lat is null then d.start_lng else k.start_lng end,
    rock             = coalesce(k.rock, d.rock),
    exposition       = case when cardinality(k.exposition) = 0 then d.exposition else k.exposition end,
    description      = private.join_texts(k.description, d.description),
    grade            = coalesce(k.grade, d.grade),
    max_altitude     = coalesce(k.max_altitude, d.max_altitude),
    elevation_gain   = coalesce(k.elevation_gain, d.elevation_gain),
    distance_km      = coalesce(k.distance_km, d.distance_km),
    country          = coalesce(k.country, d.country),
    province         = coalesce(k.province, d.province),
    start_locality   = coalesce(k.start_locality, d.start_locality),
    protection       = coalesce(k.protection, d.protection),
    pitches          = coalesce(k.pitches, d.pitches),
    length_m         = coalesce(k.length_m, d.length_m),
    alpine_grade     = coalesce(k.alpine_grade, d.alpine_grade),
    grade_obligatory = coalesce(k.grade_obligatory, d.grade_obligatory),
    aid              = coalesce(k.aid, d.aid)
  from public.places d
  where k.id = p_keep and d.id = p_duplicate;

  -- 2. Everyone's days and visits (days first: a visit in a day has its spot).
  update public.outings set place_id = p_keep where place_id = p_duplicate;
  update public.visits set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_visits = row_count;

  -- 3. Crag sectors and tiri. A sector, or a tiro in the same sector, that
  --    the kept spot already has (same folded name) becomes the kept one;
  --    the others move. Logged routes are moved with both at once, as the
  --    ascents_check_spot trigger checks them together.
  create temp table merge_sector (dup bigint primary key, keep bigint) on commit drop;
  insert into merge_sector
  select d.id, k.id from public.crag_sectors d
  join public.crag_sectors k on k.place_id = p_keep and public.fold_name(k.name) = public.fold_name(d.name)
  where d.place_id = p_duplicate;
  update public.crag_sectors set place_id = p_keep
  where place_id = p_duplicate and id not in (select dup from merge_sector);

  create temp table merge_route (dup bigint primary key, sector bigint, keep bigint) on commit drop;
  insert into merge_route
  select r.id, coalesce(ms.keep, r.crag_sector_id),
         (select k.id from public.routes k
          where k.place_id = p_keep and k.crag_sector_id is not distinct from coalesce(ms.keep, r.crag_sector_id)
            and public.fold_name(k.name) = public.fold_name(r.name)
          order by k.id limit 1)
  from public.routes r
  left join merge_sector ms on ms.dup = r.crag_sector_id
  where r.place_id = p_duplicate;

  update public.routes r set place_id = p_keep, crag_sector_id = mr.sector
  from merge_route mr where r.id = mr.dup and mr.keep is null;
  get diagnostics n_routes = row_count;
  update public.ascents a set
    route_id = coalesce(mr.keep, a.route_id),
    crag_sector_id = coalesce(ms.keep, a.crag_sector_id)
  from public.visits v, public.ascents x
  left join merge_route mr on mr.dup = x.route_id
  left join merge_sector ms on ms.dup = x.crag_sector_id
  where a.id = x.id and v.id = a.visit_id and v.place_id = p_keep
    and (mr.keep is not null or ms.keep is not null);
  delete from public.routes where id in (select dup from merge_route where keep is not null);
  delete from public.crag_sectors where id in (select dup from merge_sector);
  drop table merge_route;
  drop table merge_sector;

  -- 4. What hangs off the spot itself.
  update public.photos set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_photos = row_count;
  update public.attachments set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_files = row_count;
  update public.spot_comments set place_id = p_keep where place_id = p_duplicate;

  -- 5. Suggested changes. Someone with a pending suggestion on both keeps
  --    the one on the kept spot.
  update public.place_suggestions d set status = 'withdrawn'
  where d.place_id = p_duplicate and d.status = 'pending'
    and exists (select 1 from public.place_suggestions k
                where k.place_id = p_keep and k.author_id = d.author_id and k.status = 'pending');
  update public.place_suggestions set place_id = p_keep where place_id = p_duplicate;

  -- 6. Wishlists: one open wish per person and spot.
  delete from public.wishlist d
  where d.place_id = p_duplicate and d.done_at is null
    and exists (select 1 from public.wishlist k where k.user_id = d.user_id and k.place_id = p_keep and k.done_at is null);
  update public.wishlist set place_id = p_keep where place_id = p_duplicate;

  -- 7. The duplicate.
  delete from public.places where id = p_duplicate;

  return jsonb_build_object('visits', n_visits, 'routes', n_routes, 'photos', n_photos, 'files', n_files);
end;
$$;

revoke execute on function private.merge_places(bigint, bigint) from public;

create or replace function public.merge_places(p_keep bigint, p_duplicate bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Checked here rather than by revoking EXECUTE from anon: a permission-denied
  -- function call segfaults some Supabase Postgres builds (seen on 17.6.1.x).
  if not public.is_admin() then
    raise exception 'Only admins can merge spots' using errcode = '42501';
  end if;
  if p_keep = p_duplicate then
    raise exception 'A spot cannot be merged into itself' using errcode = '22023';
  end if;
  if (select count(*) from public.places where id in (p_keep, p_duplicate)) <> 2 then
    raise exception 'Spot not found' using errcode = 'P0002';
  end if;
  return private.merge_places(p_keep, p_duplicate);
end;
$$;

-- ---------------------------------------------------------------------
-- The conversion: each sector holding crags becomes one crag.
-- ---------------------------------------------------------------------
do $convert$
declare
  s public.sectors;
  k bigint;
  p bigint;
begin
  for s in select * from public.sectors sec
           where exists (select 1 from public.places where sector_id = sec.id and public.has_crag_sectors(activity))
  loop
    select min(id) into k from public.places where sector_id = s.id and public.has_crag_sectors(activity);

    -- Its spots become the crag's sectors, where they were.
    insert into public.crag_sectors (place_id, name, description, lat, lng, created_by)
    select k, w.name, w.description, w.lat, w.lng, w.created_by
    from public.places w
    where w.sector_id = s.id and public.has_crag_sectors(w.activity)
    order by w.id
    on conflict (place_id, (public.fold_name(name))) do nothing;

    -- Each route climbed there is in the sector of its spot, or of its wall.
    update public.ascents a set crag_sector_id = cs.id
    from public.visits v, public.places w, public.crag_sectors cs
    where v.id = a.visit_id and w.id = coalesce(a.place_id, v.place_id)
      and w.sector_id = s.id and public.has_crag_sectors(w.activity)
      and cs.place_id = k and public.fold_name(cs.name) = public.fold_name(w.name);

    -- Tiri go to the crag, into their spot's sector.
    update public.routes r set place_id = k, crag_sector_id = cs.id
    from public.places w, public.crag_sectors cs
    where w.id = r.place_id and w.sector_id = s.id and public.has_crag_sectors(w.activity)
      and cs.place_id = k and public.fold_name(cs.name) = public.fold_name(w.name);

    -- The rest of each spot moves to the crag, and the spot goes.
    for p in select id from public.places
             where sector_id = s.id and public.has_crag_sectors(activity) and id <> k
    loop
      perform private.merge_places(k, p);
    end loop;

    update public.places set name = s.name, description = s.description, sector_id = null where id = k;
    -- A sector that held only crags is gone; its tips are the crag's.
    if not exists (select 1 from public.places where sector_id = s.id) then
      update public.spot_comments set place_id = k, sector_id = null where sector_id = s.id;
      delete from public.sectors where id = s.id;
    end if;
  end loop;
end
$convert$;

-- A crag is in no sector.
update public.places set sector_id = null where sector_id is not null and public.has_crag_sectors(activity);

create function public.crag_in_no_sector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.has_crag_sectors(new.activity) then
    new.sector_id := null;
  end if;
  return new;
end;
$$;
-- Named to run after places_area_from_sector: a crag keeps the area a sector gave it.
create trigger places_crag_no_sector before insert or update of sector_id, activity on public.places
  for each row execute function public.crag_in_no_sector();

-- ---------------------------------------------------------------------
-- No more walls
-- ---------------------------------------------------------------------
drop view public.visit_overview;
alter table public.ascents drop column place_id;
drop function private.route_twin(bigint, bigint);
drop function private.same_sector(bigint, bigint);

-- A logged route's sector and tiro are at the visit's spot.
create or replace function public.check_ascent_spot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  spot bigint := (select place_id from public.visits where id = new.visit_id);
begin
  if new.crag_sector_id is not null
     and not exists (select 1 from public.crag_sectors where id = new.crag_sector_id and place_id = spot) then
    raise exception 'That sector isn''t at "%"', (select name from public.places where id = spot) using errcode = '23514';
  end if;
  if new.route_id is not null
     and not exists (select 1 from public.routes where id = new.route_id and place_id = spot) then
    raise exception 'That route isn''t at "%"', (select name from public.places where id = spot) using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger ascents_check_spot before insert or update on public.ascents
  for each row execute function public.check_ascent_spot();

-- ---------------------------------------------------------------------
-- visit_overview: sector_names (the crag sectors climbed in) for wall_names.
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
  n.summary,
  n.conditions,
  v.duration_hours,
  v.visibility,
  coalesce(a.ascent_count, 0)                              as ascent_count,
  a.max_grade_rank,
  coalesce(a.grades, '{}')                                 as grades,
  coalesce(a.sector_names, '{}')                           as crag_sector_names,
  coalesce(vp.partner_ids, '{}')                           as partner_ids,
  coalesce(vp.partner_names, '{}')                         as partner_names,
  lower(concat_ws(' ', p.name, se.name, ar.name, n.summary, n.conditions, pr.username,
                  array_to_string(vp.partner_names, ' '), a.search_text)) as search_text,
  v.rating,
  a.max_sent_grade_rank,
  coalesce(a.pitches_climbed, 0)                           as pitches_climbed,
  t.track_distance_km,
  t.track_gain_m,
  v.outing_id
from public.visits v
join public.places p on p.id = v.place_id
left join public.sectors se on se.id = p.sector_id
left join public.areas ar on ar.id = p.area_id
left join public.profiles pr on pr.id = v.user_id
left join public.visit_notes n on n.visit_id = v.id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         max(asc_.grade_rank) filter (where asc_.style is distinct from 'attempt') as max_sent_grade_rank,
         -- A route's own pitches, else its spot's (the topo), else one at a crag, DWS or gym.
         sum(coalesce(asc_.pitches, p.pitches,
                      case when p.activity in ('crag', 'dws', 'indoor') then 1 end))::int as pitches_climbed,
         array_agg(asc_.grade order by asc_.position) filter (where asc_.grade is not null) as grades,
         array_agg(distinct cs.name) filter (where cs.name is not null) as sector_names,
         string_agg(concat_ws(' ', asc_.name, asc_.grade, cs.name, an.comment), ' ') as search_text
  from public.ascents asc_
  left join public.ascent_notes an on an.ascent_id = asc_.id
  left join public.crag_sectors cs on cs.id = asc_.crag_sector_id
  where asc_.visit_id = v.id
) a on true
left join lateral (
  select array_agg(pa.id order by pa.name)   as partner_ids,
         array_agg(pa.name order by pa.name) as partner_names
  from public.visit_partners x
  join public.partners pa on pa.id = x.partner_id
  where x.visit_id = v.id
) vp on true
left join lateral (
  select sum(tr.distance_km)  as track_distance_km,
         sum(tr.gain_m)::int  as track_gain_m
  from public.attachments tr
  where tr.visit_id = v.id
) t on true;

grant select on public.visit_overview to anon, authenticated;

-- ---------------------------------------------------------------------
-- save_visit: a route names its sector ("sector": a name). At a crag a new
-- name adds the sector; a listed tiro gives its sector to a route that
-- names none. With add_routes, new tiri join the crag's list in their sector.
-- ---------------------------------------------------------------------
create or replace function public.save_visit(v jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  vid bigint := (v ->> 'id')::bigint;
  spot bigint;
  has_sectors boolean;
  names text[] := array(
    select distinct trim(n) from jsonb_array_elements_text(coalesce(v -> 'partners', '[]')) n
    where trim(n) <> ''
  );
  -- Someone listed in both is in your rope.
  others text[] := array(
    select distinct trim(n) from jsonb_array_elements_text(coalesce(v -> 'other_partners', '[]')) n
    where trim(n) <> '' and trim(n) <> all (array(
      select trim(x) from jsonb_array_elements_text(coalesce(v -> 'partners', '[]')) x))
  );
  day bigint;
  old_date date;
begin
  -- See save_place: checked here instead of revoking EXECUTE.
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if vid is null then
    insert into public.visits (place_id, date, duration_hours, visibility, rating)
    values (
      (v ->> 'place_id')::bigint,
      (v ->> 'date')::date,
      (v ->> 'duration_hours')::numeric,
      coalesce(v ->> 'visibility', 'private'),
      (v ->> 'rating')::smallint
    )
    returning id, place_id into vid, spot;
  else
    select outing_id, date into day, old_date from public.visits
    where id = vid and user_id = (select auth.uid());
    if day is not null and (v ->> 'date')::date is distinct from old_date then
      perform private.set_outing_date(day, (v ->> 'date')::date);
    end if;

    update public.visits set
      date           = (v ->> 'date')::date,
      duration_hours = (v ->> 'duration_hours')::numeric,
      visibility     = coalesce(v ->> 'visibility', 'private'),
      rating         = (v ->> 'rating')::smallint
    where id = vid and user_id = (select auth.uid())
    returning place_id into spot;
    if not found then
      raise exception 'You can only edit your own visits' using errcode = '42501';
    end if;
  end if;
  has_sectors := (select public.has_crag_sectors(activity) from public.places where id = spot);

  insert into public.visit_notes (visit_id, summary, conditions, approach, descent)
  values (
    vid,
    nullif(trim(v ->> 'summary'), ''),
    nullif(trim(v ->> 'conditions'), ''),
    nullif(trim(v ->> 'approach'), ''),
    nullif(trim(v ->> 'descent'), '')
  )
  on conflict (visit_id) do update set
    summary    = excluded.summary,
    conditions = excluded.conditions,
    approach   = excluded.approach,
    descent    = excluded.descent;

  -- The crag sectors the routes name that the crag hasn't got yet.
  if has_sectors then
    insert into public.crag_sectors (place_id, name)
    select distinct on (public.fold_name(trim(a ->> 'sector'))) spot, trim(a ->> 'sector')
    from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) a
    where nullif(trim(a ->> 'sector'), '') is not null
    on conflict (place_id, (public.fold_name(name))) do nothing;
  end if;

  -- Each route with its sector (by name) and its tiro: the one given, else the
  -- one of that name (in that sector, when it names one).
  create temp table visit_route on commit drop as
  select a.ordinality - 1 as position, a.value as r, sec.id as sector_id, rt.id as route_id, rt.crag_sector_id as route_sector
  from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a
  left join lateral (
    select cs.id from public.crag_sectors cs
    where has_sectors and cs.place_id = spot and cs.name is not null
      and public.fold_name(cs.name) = public.fold_name(trim(a.value ->> 'sector'))
  ) sec on true
  left join lateral (
    select r.id, r.crag_sector_id from public.routes r
    where r.place_id = spot
      and case when a.value ->> 'route_id' is not null then r.id = (a.value ->> 'route_id')::bigint
               else lower(r.name) = lower(trim(a.value ->> 'name')) end
      and (sec.id is null or r.crag_sector_id is not distinct from sec.id)
    order by r.id
    limit 1
  ) rt on true;

  -- Contribute the visit's new route names to the spot's shared list.
  if coalesce((v ->> 'add_routes')::boolean, false) then
    insert into public.routes (place_id, crag_sector_id, name, grade)
    select distinct on (coalesce(sector_id, 0), lower(trim(r ->> 'name')))
           spot, sector_id, trim(r ->> 'name'), nullif(trim(r ->> 'grade'), '')
    from visit_route
    where route_id is null and nullif(trim(r ->> 'name'), '') is not null
    on conflict (place_id, (coalesce(crag_sector_id, 0)), (lower(name))) do nothing;
    update visit_route x set route_id = rt.id
    from public.routes rt
    where x.route_id is null and rt.place_id = spot
      and rt.crag_sector_id is not distinct from x.sector_id and lower(rt.name) = lower(trim(x.r ->> 'name'));
  end if;

  delete from public.ascents where visit_id = vid;
  insert into public.ascents (visit_id, crag_sector_id, route_id, name, grade, style, pitches, aid, position)
  select vid,
         coalesce(sector_id, route_sector),
         route_id,
         nullif(trim(r ->> 'name'), ''),
         nullif(trim(r ->> 'grade'), ''),
         nullif(r ->> 'style', ''),
         (r ->> 'pitches')::integer,
         nullif(trim(r ->> 'aid'), ''),
         position
  from visit_route
  order by position;
  drop table visit_route;

  -- Each route's comment, matched to it by position.
  insert into public.ascent_notes (ascent_id, comment)
  select asc_.id, trim(a.value ->> 'comment')
  from public.ascents asc_
  join jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a on a.ordinality - 1 = asc_.position
  where asc_.visit_id = vid and nullif(trim(a.value ->> 'comment'), '') is not null;

  insert into public.partners (owner_id, name)
  select (select auth.uid()), n from unnest(names || others) n
  on conflict (owner_id, name) do nothing;

  delete from public.visit_partners where visit_id = vid;
  insert into public.visit_partners (visit_id, partner_id, same_rope)
  select vid, pa.id, pa.name = any (names) from public.partners pa
  where pa.owner_id = (select auth.uid()) and pa.name = any (names || others);

  perform private.sync_invites(vid);

  -- A tip for everyone, on the spot, as of the visit's date.
  if nullif(trim(v -> 'tip' ->> 'body'), '') is not null then
    insert into public.spot_comments (place_id, body, topic, observed_on)
    values (spot, trim(v -> 'tip' ->> 'body'), nullif(v -> 'tip' ->> 'topic', ''), (v ->> 'date')::date);
  end if;

  return vid;
end;
$$;

-- ---------------------------------------------------------------------
-- invite_prefill: the inviter's routes come with their sector's name.
-- ---------------------------------------------------------------------
create or replace function public.invite_prefill(p_invite_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  f public.visits;
  my_rope boolean;
begin
  select v.* into f from public.outing_invites i
  join public.visits v on v.id = i.from_visit_id
  where i.id = p_invite_id and i.kind = 'invite' and i.status = 'pending' and i.to_user_id = me;
  if f.id is null then
    raise exception 'No pending invitation of yours with that id' using errcode = 'P0002';
  end if;

  my_rope := exists (select 1 from public.visit_partners x
                     join public.partners pa on pa.id = x.partner_id
                     where x.visit_id = f.id and pa.linked_user_id = me and x.same_rope);

  return jsonb_build_object(
    'place_id', f.place_id,
    'date', f.date,
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'username', p.username,
                                                   'name', p.name, 'same_rope', p.same_rope)), '[]')
      from (
        -- The inviter,
        select f.user_id, pr.username, null::text as name, my_rope as same_rope
        from public.profiles pr where pr.id = f.user_id
        union all
        -- the people they named but you,
        select pa.linked_user_id, pr.username, case when pa.linked_user_id is null then pa.name end,
               my_rope and x.same_rope
        from public.visit_partners x
        join public.partners pa on pa.id = x.partner_id
        left join public.profiles pr on pr.id = pa.linked_user_id
        where x.visit_id = f.id and pa.linked_user_id is distinct from me
        union all
        -- and the others in their day they didn't name.
        select m.user_id, pr.username, null, false
        from public.visits m
        join public.profiles pr on pr.id = m.user_id
        where m.outing_id = f.outing_id and m.user_id not in (me, f.user_id)
          and not exists (select 1 from public.visit_partners x
                          join public.partners pa on pa.id = x.partner_id
                          where x.visit_id = f.id and pa.linked_user_id = m.user_id)
      ) p
    ),
    'ascents', case when my_rope then (
      select coalesce(jsonb_agg(jsonb_build_object('sector', cs.name, 'route_id', a.route_id, 'name', a.name,
                                                   'grade', a.grade, 'pitches', a.pitches, 'aid', a.aid)
                                order by a.position), '[]')
      from public.ascents a
      left join public.crag_sectors cs on cs.id = a.crag_sector_id
      where a.visit_id = f.id
    ) else '[]'::jsonb end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- import_logbook: a route's "sector" goes to save_visit as it is (a crag
-- sector); at a spot without sectors it's kept in the route's comment.
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
      -- Only an area without a description, and only one this user may edit (RLS).
      if nullif(trim(s ->> 'area_description'), '') is not null then
        update public.areas a set description = trim(s ->> 'area_description')
        from public.places pl
        where pl.id = pid and a.id = pl.area_id and a.description is null;
      end if;
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
    if not (select public.has_crag_sectors(activity) from public.places where id = pid) then
      v := jsonb_set(v, '{ascents}', coalesce((
        select jsonb_agg(
                 case when nullif(trim(a ->> 'sector'), '') is null then a - 'sector'
                      else (a - 'sector') || jsonb_build_object('comment',
                             concat_ws(' ', nullif(trim(a ->> 'comment'), ''), '(' || trim(a ->> 'sector') || ')'))
                 end
               order by ord)
        from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality as t (a, ord)), '[]'));
    end if;
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
