-- =====================================================================
-- A spot that changes sector takes its routes' walls along (#38).
--
-- A route can be logged on another wall of the visit's crag: another spot
-- of the visit spot's sector (ascents.place_id). That was checked only when
-- the route was saved, so a spot moved to another sector left routes on
-- walls that were no longer of the visit's crag, and saving them again
-- (editing the visit, or joining its shared day with its routes) failed.
--
-- * When a spot's sector changes (an edit, an approved suggestion, a merged
--   or deleted sector), routes whose wall and visit spot are no longer in
--   one sector lose the wall, as merge_places already does: the route's
--   name and grade stay, and it counts as climbed at the visit's spot (its
--   link to the spot's route list follows when that spot has the route).
-- * The routes left that way so far are repaired the same way.
-- * The check's errors are sentences people can read.
-- =====================================================================

-- Routes at spot p_spot, or on it as a wall, whose wall is no longer in
-- their visit spot's sector: the wall goes, the route stays at the visit's spot.
create function private.drop_stray_walls(p_spot bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ascents a
  set place_id = null,
      route_id = private.route_twin(v.place_id, a.route_id)
  from public.visits v
  where v.id = a.visit_id
    and a.place_id is not null and a.place_id <> v.place_id
    and p_spot in (a.place_id, v.place_id)
    and not private.same_sector(v.place_id, a.place_id);
end;
$$;

create function public.places_sector_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.drop_stray_walls(new.id);
  return null;
end;
$$;

create trigger places_drop_stray_walls after update of sector_id on public.places
  for each row when (old.sector_id is distinct from new.sector_id)
  execute function public.places_sector_changed();

-- ---------------------------------------------------------------------
-- The check, with readable errors
-- ---------------------------------------------------------------------
create or replace function public.check_ascent_spot()
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
    raise exception 'A route can only be on another wall of the same crag: "%" isn''t in this spot''s sector',
      (select name from public.places where id = new.place_id) using errcode = '23514';
  end if;
  if new.route_id is not null
     and not exists (select 1 from public.routes where id = new.route_id and place_id = spot) then
    raise exception 'That route isn''t on "%"', (select name from public.places where id = spot) using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- The routes left on stray walls so far
-- ---------------------------------------------------------------------
select private.drop_stray_walls(v.place_id)
from (
  select distinct v.place_id
  from public.ascents a
  join public.visits v on v.id = a.visit_id
  where a.place_id is not null and a.place_id <> v.place_id
    and not private.same_sector(v.place_id, a.place_id)
) v;
