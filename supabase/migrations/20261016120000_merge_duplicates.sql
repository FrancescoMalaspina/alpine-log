-- =====================================================================
-- Merging duplicate spots and areas (admins).
--
-- Deleting a duplicate took every visit logged there with it. Merging moves
-- everything onto the spot or area that is kept, then deletes the other:
--
-- * merge_places(keep, duplicate): visits, routes (a route of the same
--   folded name becomes the kept one), routes climbed from it as a "wall",
--   photos, files, tips and wishlists. Blank details of the kept spot are
--   filled from the duplicate; descriptions are put together.
-- * merge_areas(keep, duplicate): sectors (one of the same folded name is
--   merged into the kept one), spots, files.
-- * duplicate_places() and duplicate_areas(): pairs that look alike, for
--   the admins' list (the same similarity as when adding a spot).
--
-- Storage paths keep the duplicate's id (place-<id>/…); only rows move.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Two texts as one: the first, the second, or both when they differ.
create function private.join_texts(a text, b text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when a is null then b
    when b is null or public.fold_name(a) = public.fold_name(b) then a
    else a || E'\n\n' || b
  end;
$$;

-- Two spots of the same sector.
create function private.same_sector(a bigint, b bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.places x, public.places y
    where x.id = a and y.id = b and x.sector_id = y.sector_id
  );
$$;

-- The route of spot p_place named like route p_route of another spot (null when none).
create function private.route_twin(p_place bigint, p_route bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select k.id
  from public.routes r
  join public.routes k on k.place_id = p_place and public.fold_name(k.name) = public.fold_name(r.name)
  where r.id = p_route and r.place_id <> p_place
  order by k.id
  limit 1;
$$;

-- Merges sector p_duplicate into p_keep: its spots and tips move, then it is deleted.
create function private.merge_sectors(p_keep bigint, p_duplicate bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.sectors k set
    description  = private.join_texts(k.description, d.description),
    max_altitude = coalesce(k.max_altitude, d.max_altitude)
  from public.sectors d
  where k.id = p_keep and d.id = p_duplicate;

  -- The spots' area follows their new sector (trigger places_area_from_sector).
  update public.places set sector_id = p_keep where sector_id = p_duplicate;
  update public.spot_comments set sector_id = p_keep where sector_id = p_duplicate;
  delete from public.sectors where id = p_duplicate;
end;
$$;

-- ---------------------------------------------------------------------
-- merge_places
-- ---------------------------------------------------------------------
create function public.merge_places(p_keep bigint, p_duplicate bigint)
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

  -- 2. Everyone's visits.
  update public.visits set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_visits = row_count;

  -- 3. Routes the kept spot hasn't got move to it. The others stay behind
  --    until step 4 points what was climbed on them at the kept spot's twin.
  update public.routes set place_id = p_keep
  where place_id = p_duplicate and private.route_twin(p_keep, id) is null;
  get diagnostics n_routes = row_count;

  -- 4. Routes climbed: the wall each was climbed on ("another spot of the
  --    visit's sector") and the route, worked out together because the
  --    ascents_check_spot trigger checks them as a pair.
  with climbed as (
    select a.id, a.place_id as old_wall, a.route_id as old_route, v.place_id as visit_spot,
           case
             when a.place_id is null then null
             -- The duplicate, or the kept spot, is now the visit's own spot.
             when a.place_id in (p_keep, p_duplicate) and v.place_id = p_keep then null
             -- The duplicate as a wall: the kept spot, if it is in the visit's sector.
             when a.place_id = p_duplicate then
               case when private.same_sector(v.place_id, p_keep) then p_keep end
             -- A wall of the duplicate's sector, from a visit moved to a spot in another one.
             when v.place_id = p_keep and not private.same_sector(p_keep, a.place_id) then null
             else a.place_id
           end as wall
    from public.ascents a
    join public.visits v on v.id = a.visit_id
    where a.place_id in (p_keep, p_duplicate)
       or (v.place_id = p_keep and a.place_id is not null)
       or a.route_id in (select id from public.routes where place_id in (p_keep, p_duplicate))
  ), settled as (
    select id, old_wall, old_route, wall,
           case
             when coalesce(wall, visit_spot) = p_keep then coalesce(private.route_twin(p_keep, old_route), old_route)
             when wall is not distinct from old_wall then old_route
             else null   -- its wall is gone; the route's name stays on the ascent
           end as route
    from climbed
  )
  update public.ascents a set place_id = s.wall, route_id = s.route
  from settled s
  where a.id = s.id and (s.wall, s.route) is distinct from (s.old_wall, s.old_route);

  -- 5. What hangs off the spot itself.
  update public.photos set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_photos = row_count;
  update public.attachments set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_files = row_count;
  update public.spot_comments set place_id = p_keep where place_id = p_duplicate;

  -- 6. Wishlists: one open wish per person and spot.
  delete from public.wishlist d
  where d.place_id = p_duplicate and d.done_at is null
    and exists (select 1 from public.wishlist k where k.user_id = d.user_id and k.place_id = p_keep and k.done_at is null);
  update public.wishlist set place_id = p_keep where place_id = p_duplicate;

  -- 7. The duplicate, with the routes it shared with the kept spot.
  delete from public.places where id = p_duplicate;

  return jsonb_build_object('visits', n_visits, 'routes', n_routes, 'photos', n_photos, 'files', n_files);
end;
$$;

-- ---------------------------------------------------------------------
-- merge_areas
-- ---------------------------------------------------------------------
create function public.merge_areas(p_keep bigint, p_duplicate bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  twin bigint;
  n_spots int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can merge areas' using errcode = '42501';
  end if;
  if p_keep = p_duplicate then
    raise exception 'An area cannot be merged into itself' using errcode = '22023';
  end if;
  if (select count(*) from public.areas where id in (p_keep, p_duplicate)) <> 2 then
    raise exception 'Area not found' using errcode = 'P0002';
  end if;

  select count(*) into n_spots from public.places where area_id = p_duplicate;

  update public.areas k set
    description = private.join_texts(k.description, d.description),
    lat         = coalesce(k.lat, d.lat),
    lng         = case when k.lat is null then d.lng else k.lng end
  from public.areas d
  where k.id = p_keep and d.id = p_duplicate;

  -- A sector named like one of the kept area is merged into it; the others
  -- move, and their spots with them (trigger sectors_area_to_places).
  for s in select id, name from public.sectors where area_id = p_duplicate loop
    select id into twin from public.sectors
    where area_id = p_keep and public.fold_name(name) = public.fold_name(s.name)
    order by id limit 1;
    if twin is null then
      update public.sectors set area_id = p_keep where id = s.id;
    else
      perform private.merge_sectors(twin, s.id);
    end if;
  end loop;

  update public.places set area_id = p_keep where area_id = p_duplicate;
  update public.attachments set area_id = p_keep where area_id = p_duplicate;
  delete from public.areas where id = p_duplicate;

  return jsonb_build_object('spots', n_spots);
end;
$$;

-- ---------------------------------------------------------------------
-- Pairs that look alike, for the admins' list
-- ---------------------------------------------------------------------
create function public.duplicate_places()
returns table (place_id bigint, other_id bigint, similarity real, distance_km double precision)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list duplicates' using errcode = '42501';
  end if;
  return query
  select p.id, s.place_id, s.similarity, s.distance_km
  from public.places p
  cross join lateral public.similar_places(jsonb_build_array(jsonb_build_object(
    'key', p.id, 'name', p.name, 'activity', p.activity, 'lat', p.lat, 'lng', p.lng, 'exclude_id', p.id))) s
  where s.place_id > p.id;
end;
$$;

create function public.duplicate_areas()
returns table (area_id bigint, other_id bigint, similarity real)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list duplicates' using errcode = '42501';
  end if;
  return query
  select a.id, s.area_id, s.similarity
  from public.areas a
  cross join lateral public.similar_areas(array[a.name]) s
  where s.area_id > a.id;
end;
$$;
