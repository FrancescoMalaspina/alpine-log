-- =====================================================================
-- Similar names: one way to compare spot, area and sector names.
--
-- * fold_name() is how two names are compared everywhere: accents, case,
--   punctuation and extra spaces don't count ("Valsàssina" = "valsassina",
--   "Corna Rossa - Parete" = "corna rossa parete"). The app has the same
--   rules in web/src/lib/names.ts (foldName); keep the two in step.
-- * save_place() reuses an area or sector whose folded name is the same.
-- * similar_places() and similar_areas() find what someone typing a new
--   spot or area (or importing a file) may mean instead. They replace
--   match_places().
-- =====================================================================

create extension if not exists unaccent with schema extensions;

create function public.fold_name(t text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select trim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, t)),
    '[^[:alnum:]#]+', ' ', 'g'));
$$;

-- Trigram indexes on the folded names (the similarity search below).
drop index public.places_name_trgm_idx;
drop index public.areas_name_trgm_idx;
create index places_name_trgm_idx on public.places using gin (public.fold_name(name) extensions.gin_trgm_ops);
create index areas_name_trgm_idx on public.areas using gin (public.fold_name(name) extensions.gin_trgm_ops);
create index sectors_name_fold_idx on public.sectors (area_id, public.fold_name(name));

-- ---------------------------------------------------------------------
-- save_place: an area or sector is the same one when its folded name is
-- (the oldest wins while older duplicates still exist).
-- ---------------------------------------------------------------------
create or replace function public.save_place(p jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  pid bigint := (p ->> 'id')::bigint;
  v_area bigint;
  v_sector bigint;
  area_name text := nullif(trim(p ->> 'area_name'), '');
  sector_name text := nullif(trim(p ->> 'sector_name'), '');
begin
  -- Checked here rather than by revoking EXECUTE from anon: a permission-denied
  -- function call segfaults some Supabase Postgres builds (seen on 17.6.1.x).
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if area_name is not null then
    select id into v_area from public.areas
    where public.fold_name(name) = public.fold_name(area_name)
    order by id limit 1;
    if v_area is null then
      insert into public.areas (name, lat, lng)
      values (area_name, (p ->> 'lat')::double precision, (p ->> 'lng')::double precision)
      returning id into v_area;
    end if;
  end if;

  -- The sector of that name in the spot's area, or a new one.
  if sector_name is not null then
    select id into v_sector from public.sectors
    where area_id is not distinct from v_area and public.fold_name(name) = public.fold_name(sector_name)
    order by id limit 1;
    if v_sector is null then
      insert into public.sectors (area_id, name) values (v_area, sector_name) returning id into v_sector;
    end if;
  end if;

  if pid is null then
    insert into public.places (area_id, sector_id, name, activity, lat, lng) values (
      v_area, v_sector, p ->> 'name', p ->> 'activity', (p ->> 'lat')::double precision, (p ->> 'lng')::double precision)
    returning id into pid;
  end if;

  update public.places set
    area_id          = v_area,
    sector_id        = v_sector,
    name             = p ->> 'name',
    activity         = p ->> 'activity',
    lat              = (p ->> 'lat')::double precision,
    lng              = (p ->> 'lng')::double precision,
    parking_lat      = (p ->> 'parking_lat')::double precision,
    parking_lng      = (p ->> 'parking_lng')::double precision,
    start_lat        = (p ->> 'start_lat')::double precision,
    start_lng        = (p ->> 'start_lng')::double precision,
    rock             = nullif(trim(p ->> 'rock'), ''),
    exposition       = array(select jsonb_array_elements_text(coalesce(p -> 'exposition', '[]'))),
    description      = nullif(trim(p ->> 'description'), ''),
    grade            = nullif(trim(p ->> 'grade'), ''),
    max_altitude     = (p ->> 'max_altitude')::integer,
    elevation_gain   = (p ->> 'elevation_gain')::integer,
    distance_km      = (p ->> 'distance_km')::numeric,
    country          = upper(nullif(trim(p ->> 'country'), '')),
    province         = nullif(trim(p ->> 'province'), ''),
    start_locality   = nullif(trim(p ->> 'start_locality'), ''),
    protection       = nullif(p ->> 'protection', ''),
    pitches          = (p ->> 'pitches')::integer,
    length_m         = (p ->> 'length_m')::integer,
    alpine_grade     = nullif(trim(p ->> 'alpine_grade'), ''),
    grade_obligatory = nullif(trim(p ->> 'grade_obligatory'), ''),
    aid              = nullif(trim(p ->> 'aid'), '')
  where id = pid;
  if not found then
    raise exception 'You can only edit spots you created' using errcode = '42501';
  end if;

  return pid;
end;
$$;

-- ---------------------------------------------------------------------
-- similar_places: existing spots that may be the one being typed or imported.
--   p = [{ key, name, activity?, lat?, lng?, exclude_id? }]
-- Up to 5 per key, most similar first. A spot is a candidate when its name
-- is similar (0.4), or when it is the same activity within 300 m and the
-- name is at least loosely similar (0.2: "Parete Sud" / "Civate – Parete Sud").
-- distance_km is null when the key has no point.
-- ---------------------------------------------------------------------
drop function public.match_places(text[], real);

create function public.similar_places(p jsonb)
returns table (key text, place_id bigint, name text, activity text, area_name text, sector_name text,
               lat double precision, lng double precision, similarity real, distance_km double precision)
language sql
stable
set search_path = ''
as $$
  with q as (
    select x ->> 'key' as key,
           public.fold_name(x ->> 'name') as folded,
           x ->> 'activity' as activity,
           case when x ->> 'lat' is not null and x ->> 'lng' is not null then
             extensions.st_setsrid(extensions.st_makepoint((x ->> 'lng')::float8, (x ->> 'lat')::float8), 4326)::extensions.geography
           end as here,
           (x ->> 'exclude_id')::bigint as exclude_id
    from jsonb_array_elements(p) as x
  )
  select q.key, m.id, m.name, m.activity, a.name, s.name, m.lat, m.lng, m.sim,
         extensions.st_distance(m.location, q.here) / 1000
  from q
  cross join lateral (
    select pl.*, extensions.similarity(public.fold_name(pl.name), q.folded) as sim
    from public.places pl
    where pl.id is distinct from q.exclude_id
      and (extensions.similarity(public.fold_name(pl.name), q.folded) >= 0.4
           or (pl.activity = q.activity
               and extensions.st_dwithin(pl.location, q.here, 300)
               and extensions.similarity(public.fold_name(pl.name), q.folded) >= 0.2))
    order by sim desc, extensions.st_distance(pl.location, q.here) nulls last
    limit 5
  ) m
  left join public.areas a on a.id = m.area_id
  left join public.sectors s on s.id = m.sector_id
  order by q.key, m.sim desc;
$$;

-- ---------------------------------------------------------------------
-- similar_areas: existing areas that may be the one being typed or imported,
-- up to 5 per name, most similar first (1 when the folded names are equal).
-- ---------------------------------------------------------------------
create function public.similar_areas(names text[])
returns table (query text, area_id bigint, name text, similarity real, place_count bigint)
language sql
stable
set search_path = ''
as $$
  select q.name, m.id, m.name, m.sim,
         (select count(*) from public.places pl where pl.area_id = m.id)
  from unnest(names) as q (name)
  cross join lateral (
    select a.id, a.name, extensions.similarity(public.fold_name(a.name), public.fold_name(q.name)) as sim
    from public.areas a
    where extensions.similarity(public.fold_name(a.name), public.fold_name(q.name)) >= 0.4
    order by sim desc
    limit 5
  ) m
  order by q.name, m.sim desc;
$$;
