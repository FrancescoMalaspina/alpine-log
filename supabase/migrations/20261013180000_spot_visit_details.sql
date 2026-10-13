-- =====================================================================
-- Spot details "as published" and what happened on each visit.
--
-- A spot holds what the topo says (pitches, length, protection, grades);
-- a route climbed on a visit can override it for that day (pitches linked
-- together, a variant's grade, aid used) and records how it went (style).
-- What a visit shows is the route's value when set, otherwise the spot's.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Spots
-- ---------------------------------------------------------------------
alter table public.places
  add column country          text check (country ~ '^[A-Z]{2}$'),      -- ISO 3166-1, filled from the pin
  add column province         text check (length(trim(province)) > 0),  -- "TO", "LC", or "Hautes-Alpes" outside Italy
  add column start_locality   text check (length(trim(start_locality)) > 0),  -- village or hut you start from
  add column protection       text check (protection in ('bolted', 'trad', 'mixed')),
  add column pitches          integer check (pitches between 1 and 200),
  add column length_m         integer check (length_m between 1 and 10000),   -- climbing length
  add column alpine_grade     text check (length(trim(alpine_grade)) > 0),    -- overall: F … ED
  add column grade_obligatory text check (length(trim(grade_obligatory)) > 0),
  add column grade_obligatory_rank integer generated always as (public.grade_rank(grade_obligatory)) stored,
  add column aid              text check (length(trim(aid)) > 0);           -- A0, A1…
create index places_country_idx on public.places (country);

grant update (country, province, start_locality, protection, pitches, length_m, alpine_grade, grade_obligatory, aid)
  on public.places to authenticated;

-- ---------------------------------------------------------------------
-- Visits and the routes climbed
-- ---------------------------------------------------------------------
alter table public.visits add column rating smallint check (rating between 1 and 5);

-- Partners in your rope, or in another rope of the same group.
alter table public.visit_partners add column same_rope boolean not null default true;

alter table public.ascents
  add column style   text check (style in ('onsight', 'flash', 'redpoint', 'toprope', 'attempt')),
  add column pitches integer check (pitches between 1 and 200),
  add column aid     text check (length(trim(aid)) > 0);

-- ---------------------------------------------------------------------
-- save_place: the new spot fields
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
    select id into v_area from public.areas where lower(name) = lower(area_name);
    if v_area is null then
      insert into public.areas (name, lat, lng)
      values (area_name, (p ->> 'lat')::double precision, (p ->> 'lng')::double precision)
      returning id into v_area;
    end if;
  end if;

  -- The sector of that name in the spot's area (any case), or a new one.
  if sector_name is not null then
    select id into v_sector from public.sectors
    where area_id is not distinct from v_area and lower(name) = lower(sector_name);
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
-- save_visit: rating, other ropes, how each route went and its overrides
--   { …, rating?, partners: [name], other_partners: [name],
--     ascents: [{ name?, grade?, place_id?, route_id?, comment?, style?, pitches?, aid? }] }
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
  -- Someone listed in both is in your rope.
  others text[] := array(
    select distinct trim(n) from jsonb_array_elements_text(coalesce(v -> 'other_partners', '[]')) n
    where trim(n) <> '' and trim(n) <> all (array(
      select trim(x) from jsonb_array_elements_text(coalesce(v -> 'partners', '[]')) x))
  );
begin
  -- See save_place: checked here instead of revoking EXECUTE.
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if vid is null then
    insert into public.visits (place_id, date, summary, approach, descent, conditions, duration_hours, visibility, rating)
    values (
      (v ->> 'place_id')::bigint,
      (v ->> 'date')::date,
      nullif(trim(v ->> 'summary'), ''),
      nullif(trim(v ->> 'approach'), ''),
      nullif(trim(v ->> 'descent'), ''),
      nullif(trim(v ->> 'conditions'), ''),
      (v ->> 'duration_hours')::numeric,
      coalesce(v ->> 'visibility', 'private'),
      (v ->> 'rating')::smallint
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
      visibility     = coalesce(v ->> 'visibility', 'private'),
      rating         = (v ->> 'rating')::smallint
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
  insert into public.ascents (visit_id, place_id, route_id, name, grade, comment, style, pitches, aid, position)
  select vid,
         nullif((a.value ->> 'place_id')::bigint, spot),
         coalesce((a.value ->> 'route_id')::bigint,
                  (select r.id from public.routes r
                   where r.place_id = coalesce((a.value ->> 'place_id')::bigint, spot)
                     and lower(r.name) = lower(trim(a.value ->> 'name')))),
         nullif(trim(a.value ->> 'name'), ''),
         nullif(trim(a.value ->> 'grade'), ''),
         nullif(trim(a.value ->> 'comment'), ''),
         nullif(a.value ->> 'style', ''),
         (a.value ->> 'pitches')::integer,
         nullif(trim(a.value ->> 'aid'), ''),
         a.ordinality - 1
  from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a;

  insert into public.partners (owner_id, name)
  select (select auth.uid()), n from unnest(names || others) n
  on conflict (owner_id, name) do nothing;

  delete from public.visit_partners where visit_id = vid;
  insert into public.visit_partners (visit_id, partner_id, same_rope)
  select vid, pa.id, pa.name = any (names) from public.partners pa
  where pa.owner_id = (select auth.uid()) and pa.name = any (names || others);

  return vid;
end;
$$;

-- ---------------------------------------------------------------------
-- visit_overview: the rating and the hardest route actually sent
-- (columns added at the end, so the view can be replaced in place)
-- ---------------------------------------------------------------------
create or replace view public.visit_overview
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
                  array_to_string(vp.partner_names, ' '), a.search_text)) as search_text,
  v.rating,
  a.max_sent_grade_rank
from public.visits v
join public.places p on p.id = v.place_id
left join public.sectors se on se.id = p.sector_id
left join public.areas ar on ar.id = p.area_id
left join public.profiles pr on pr.id = v.user_id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         max(asc_.grade_rank) filter (where asc_.style is distinct from 'attempt') as max_sent_grade_rank,
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
