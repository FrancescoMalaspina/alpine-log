-- =====================================================================
-- Two sectors of a crag become one (#11).
--
-- Renaming a sector to the name of another sector of the same crag merges
-- them: the tiri of one join the other's (a tiro of the same name there is
-- the one its logged routes name), the routes climbed in it are in the
-- other, and its position and description fill what the other lacks.
--
-- * merge_crag_sectors(): for whoever may change the merged-away sector
--   (who added it, the crag's editors, admins).
-- * private.move_tiri() is the one rule for moving tiri, used here and by
--   merge_places, which now merges two crags' sectors with
--   private.merge_crag_sectors().
-- =====================================================================

-- Moves the tiri of crag p_from_place in sector p_from_sector (null: in none)
-- to crag p_to_place, sector p_to_sector (null: none). A tiro of the same
-- folded name already there takes the logged routes of the one that goes.
-- Returns how many tiri moved. The visits of the routes logged on them must
-- be at p_to_place already.
create function private.move_tiri(p_from_place bigint, p_from_sector bigint, p_to_place bigint, p_to_sector bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  create temp table moving_tiro on commit drop as
  select r.id,
         (select k.id from public.routes k
          where k.place_id = p_to_place and k.crag_sector_id is not distinct from p_to_sector and k.id <> r.id
            and public.fold_name(k.name) = public.fold_name(r.name)
          order by k.id limit 1) as twin
  from public.routes r
  where r.place_id = p_from_place and r.crag_sector_id is not distinct from p_from_sector;

  -- Routes logged on a tiro that has a twin name the twin, in its sector (both
  -- at once: ascents_check_spot checks them together).
  update public.ascents a set route_id = m.twin,
         crag_sector_id = case when p_from_sector is null then a.crag_sector_id else p_to_sector end
  from moving_tiro m where a.route_id = m.id and m.twin is not null;
  delete from public.routes where id in (select id from moving_tiro where twin is not null);
  update public.routes set place_id = p_to_place, crag_sector_id = p_to_sector
  where id in (select id from moving_tiro where twin is null);
  get diagnostics n = row_count;
  drop table moving_tiro;
  return n;
end;
$$;

-- Merges crag sector p_duplicate into p_keep (of the same crag, or of the crag
-- it is being merged into): its tiri, the routes climbed in it, and the
-- position and description p_keep lacks. Returns how many tiri moved.
create function private.merge_crag_sectors(p_keep bigint, p_duplicate bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.crag_sectors;
  d public.crag_sectors;
  n int;
begin
  select * into k from public.crag_sectors where id = p_keep;
  select * into d from public.crag_sectors where id = p_duplicate;
  n := private.move_tiri(d.place_id, d.id, k.place_id, k.id);
  update public.ascents set crag_sector_id = k.id where crag_sector_id = d.id;
  update public.crag_sectors set
    description = private.join_texts(k.description, d.description),
    lat         = coalesce(k.lat, d.lat),
    lng         = case when k.lat is null then d.lng else k.lng end
  where id = k.id;
  delete from public.crag_sectors where id = d.id;
  return n;
end;
$$;

revoke execute on function private.move_tiri(bigint, bigint, bigint, bigint) from public;
revoke execute on function private.merge_crag_sectors(bigint, bigint) from public;

-- Merges sector p_duplicate of a crag into its sector p_keep. Returns p_keep.
create function public.merge_crag_sectors(p_keep bigint, p_duplicate bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.crag_sectors;
begin
  select * into d from public.crag_sectors where id = p_duplicate;
  if d.id is null or not exists (select 1 from public.crag_sectors where id = p_keep and place_id = d.place_id) then
    raise exception 'No such sectors of one crag' using errcode = 'P0002';
  end if;
  if p_keep = p_duplicate then
    raise exception 'A sector cannot be merged into itself' using errcode = '22023';
  end if;
  if not (d.created_by = (select auth.uid()) or public.can_edit_place(d.place_id)) then
    raise exception 'Only who added this sector, or who can edit the crag, can merge it' using errcode = '42501';
  end if;
  perform private.merge_crag_sectors(p_keep, p_duplicate);
  return p_keep;
end;
$$;

-- ---------------------------------------------------------------------
-- merge_places: step 3 with the helpers above.
-- ---------------------------------------------------------------------
create or replace function private.merge_places(p_keep bigint, p_duplicate bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_visits int;
  n_routes int := 0;
  n_photos int;
  n_files int;
  sector public.crag_sectors;
  twin bigint;
  n int;
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

  -- 3. Crag sectors and tiri. A sector of the same folded name the kept spot
  --    has takes the duplicate's; the others move with their tiri. Then the
  --    tiri in no sector.
  for sector in select * from public.crag_sectors where place_id = p_duplicate loop
    select id into twin from public.crag_sectors
    where place_id = p_keep and public.fold_name(name) = public.fold_name(sector.name);
    if twin is null then
      update public.crag_sectors set place_id = p_keep where id = sector.id;
      update public.routes set place_id = p_keep where crag_sector_id = sector.id;
      get diagnostics n = row_count;
    else
      n := private.merge_crag_sectors(twin, sector.id);
    end if;
    n_routes := n_routes + n;
  end loop;
  n_routes := n_routes + private.move_tiri(p_duplicate, null, p_keep, null);

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
