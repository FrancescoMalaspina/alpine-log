-- =====================================================================
-- Spots compared with the places around them (#29).
--
-- The same route is written in many ways: "Weissmies - via normale" as one
-- name; sector "Weissmies" and spot "via normale"; the mountain as the area
-- ("Campanile Basso" › "Via Normale"); "Via normale al Weissmies".
-- Comparing the spot's name alone made every "via normale" the same spot,
-- and cut the right one off the list of five. Now:
--
-- * core_name(): a name as compared: folded, without the words that only
--   say what kind of place it is ("Falesia di Civate" = "Civate").
-- * spot_full_name(sector, name): the two as one name, the sector once
--   when the name already starts with it.
-- * similar_places() compares the spot names when the existing spot's
--   place (its sector, or its area when it has none) is one the query names
--   as sector or area, and the full names otherwise: another mountain's
--   "via normale" is only as alike as "breithorn via normale" and "castore
--   via normale". Spots of a similar area rank a little higher; the area
--   never rules one out, people group mountains differently.
-- * duplicate_places() compares spots the same way.
-- * areas_for_spots(): areas new spots may belong to that a similar name
--   can't find ("Gruppo Andolla" / "Valle di Saas"): the area where their
--   sector already is, and areas with spots near their pin.
-- =====================================================================

create function public.core_name(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(public.fold_name(t),
    '^(falesia|falesie|settore|sector|secteur|sektor|crag|klettergarten)( (di|del|dello|della|dei|degli|delle|de|des|du|d|la|le|il|lo))* ',
    ''), '');
$$;

create function public.spot_full_name(sector text, name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when public.core_name(sector) is null then coalesce(public.core_name(name), '')
    when public.core_name(name) = public.core_name(sector)
      or public.core_name(name) like public.core_name(sector) || ' %' then public.core_name(name)
    else public.core_name(sector) || ' ' || coalesce(public.core_name(name), '')
  end;
$$;

-- ---------------------------------------------------------------------
-- similar_places: existing spots that may be the one being typed or imported.
--   p = [{ key, name, sector?, area?, activity?, lat?, lng?, exclude_id? }]
-- Up to 5 per key, most similar first.
--   similarity   0–1: of the spot names when the existing spot's place is
--                one the query names, of the full names otherwise
--   same_sector  null when either spot has no sector
-- A spot is a candidate when it is similar (0.4), when its name is and its
-- sector isn't another one, or when it is the same activity within 300 m
-- and loosely similar (0.2: "Parete Sud" / "Civate – Parete Sud").
-- ---------------------------------------------------------------------
drop function public.similar_places(jsonb);

create function public.similar_places(p jsonb)
returns table (key text, place_id bigint, name text, activity text, area_name text, sector_name text,
               lat double precision, lng double precision, similarity real, same_sector boolean,
               distance_km double precision)
language sql
stable
set search_path = ''
as $$
  with q as (
    select x ->> 'key' as key,
           coalesce(public.core_name(x ->> 'name'), '') as name,
           public.spot_full_name(x ->> 'sector', x ->> 'name') as full_name,
           public.core_name(x ->> 'sector') as sector,
           public.core_name(x ->> 'area') as area,
           x ->> 'activity' as activity,
           case when x ->> 'lat' is not null and x ->> 'lng' is not null then
             extensions.st_setsrid(extensions.st_makepoint((x ->> 'lng')::float8, (x ->> 'lat')::float8), 4326)::extensions.geography
           end as here,
           (x ->> 'exclude_id')::bigint as exclude_id
    from jsonb_array_elements(p) as x
  ), spots as (
    select pl.id, pl.name, pl.activity, pl.lat, pl.lng, pl.location, a.name as area_name, s.name as sector_name,
           coalesce(public.core_name(pl.name), '') as core,
           public.spot_full_name(s.name, pl.name) as full_name,
           public.core_name(s.name) as sector,
           public.core_name(a.name) as area,
           coalesce(public.core_name(s.name), public.core_name(a.name)) as place
    from public.places pl
    left join public.areas a on a.id = pl.area_id
    left join public.sectors s on s.id = pl.sector_id
  )
  select q.key, m.id, m.name, m.activity, m.area_name, m.sector_name, m.lat, m.lng,
         m.sim, m.same_sector, extensions.st_distance(m.location, q.here) / 1000
  from q
  cross join lateral (
    select sp.*, c.sim, c.name_sim, c.same_sector,
           c.sim + case when extensions.similarity(sp.area, q.area) >= 0.6 then 0.05 else 0 end as score
    from spots sp
    cross join lateral (
      select n.name_sim, n.same_sector,
             case when sp.place in (q.sector, q.area) then greatest(n.name_sim, n.full_sim) else n.full_sim end as sim
      from (select extensions.similarity(sp.core, q.name) as name_sim,
                   extensions.similarity(sp.full_name, q.full_name) as full_sim,
                   case when sp.sector is null or q.sector is null then null else sp.sector = q.sector end as same_sector) n
    ) c
    where sp.id is distinct from q.exclude_id
      and (c.sim >= 0.4
           or (c.name_sim >= 0.4 and c.same_sector is not false)
           or (sp.activity = q.activity
               and extensions.st_dwithin(sp.location, q.here, 300)
               and greatest(c.sim, c.name_sim) >= 0.2))
    order by score desc, extensions.st_distance(sp.location, q.here) nulls last
    limit 5
  ) m
  order by q.key, m.score desc, extensions.st_distance(m.location, q.here) nulls last;
$$;

-- ---------------------------------------------------------------------
-- duplicate_places: pairs that look alike, compared as above.
-- ---------------------------------------------------------------------
drop function public.duplicate_places();

create function public.duplicate_places()
returns table (place_id bigint, other_id bigint, similarity real, same_sector boolean, distance_km double precision)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list duplicates' using errcode = '42501';
  end if;
  return query
  select p.id, s.place_id, s.similarity, s.same_sector, s.distance_km
  from public.places p
  left join public.sectors sec on sec.id = p.sector_id
  left join public.areas a on a.id = p.area_id
  cross join lateral public.similar_places(jsonb_build_array(jsonb_build_object(
    'key', p.id, 'name', p.name, 'sector', sec.name, 'area', a.name, 'activity', p.activity,
    'lat', p.lat, 'lng', p.lng, 'exclude_id', p.id))) s
  where s.place_id > p.id;
end;
$$;

-- ---------------------------------------------------------------------
-- areas_for_spots: areas a group of new spots may belong to, besides those
-- of a similar name.
--   p = [{ key, sectors: [name…], points: [{ lat, lng }…] }]
--   sector_name  a sector of the area named like one of the group's
--   distance_km  from the nearest pin to the area's nearest spot (within 25 km)
-- Up to 5 per key: areas holding one of the sectors first, then the nearest.
-- ---------------------------------------------------------------------
create function public.areas_for_spots(p jsonb)
returns table (key text, area_id bigint, name text, place_count bigint, sector_name text, distance_km double precision)
language sql
stable
set search_path = ''
as $$
  with q as (
    select x ->> 'key' as key, x from jsonb_array_elements(p) as x
  ), by_sector as (
    select q.key, s.area_id, min(s.name) as sector_name
    from q
    cross join jsonb_array_elements_text(coalesce(q.x -> 'sectors', '[]')) as qs (name)
    join public.sectors s on public.fold_name(s.name) = public.fold_name(qs.name)
    where s.area_id is not null
    group by q.key, s.area_id
  ), near as (
    select q.key, pl.area_id, min(extensions.st_distance(pl.location, pt.here)) / 1000 as distance_km
    from q
    cross join lateral (
      select extensions.st_setsrid(extensions.st_makepoint((pin ->> 'lng')::float8, (pin ->> 'lat')::float8), 4326)::extensions.geography as here
      from jsonb_array_elements(coalesce(q.x -> 'points', '[]')) as pin
    ) pt
    join public.places pl on pl.area_id is not null and extensions.st_dwithin(pl.location, pt.here, 25000)
    group by q.key, pl.area_id
  ), found as (
    select coalesce(b.key, n.key) as key, coalesce(b.area_id, n.area_id) as area_id, b.sector_name, n.distance_km,
           row_number() over (partition by coalesce(b.key, n.key)
                              order by b.sector_name is null, n.distance_km nulls last) as rank
    from by_sector b
    full join near n on n.key = b.key and n.area_id = b.area_id
  )
  select f.key, a.id, a.name, (select count(*) from public.places pl where pl.area_id = a.id), f.sector_name, f.distance_km
  from found f
  join public.areas a on a.id = f.area_id
  where f.rank <= 5
  order by f.key, f.rank;
$$;
