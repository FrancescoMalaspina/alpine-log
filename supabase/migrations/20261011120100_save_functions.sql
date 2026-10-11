-- =====================================================================
-- Atomic save functions called by the web app.
--
-- Both run as the caller (security invoker), so every statement inside is
-- still checked by row level security — they only bundle the multi-table
-- writes of one form into a single transaction.
-- =====================================================================

-- Creates or updates a place with its sectors and multipitch routes.
--   { id?, name, types[], lat, lng, parking_lat?, parking_lng?, rock?,
--     exposition[], description?, link?,
--     sectors: [{ id?, name }], mp_routes: [{ name?, lat?, lng? }] }
-- Sectors are matched by id so ascents (possibly other users') that point
-- at a sector keep pointing at it after a rename.
create function public.save_place(p jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  pid bigint := (p ->> 'id')::bigint;
  keep_ids bigint[];
begin
  -- Checked here rather than by revoking EXECUTE from anon: a permission-denied
  -- function call segfaults some Supabase Postgres builds (seen on 17.6.1.x).
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if pid is null then
    insert into public.places (name, types, lat, lng, parking_lat, parking_lng, rock, exposition, description, link)
    values (
      p ->> 'name',
      array(select jsonb_array_elements_text(p -> 'types')),
      (p ->> 'lat')::double precision,
      (p ->> 'lng')::double precision,
      (p ->> 'parking_lat')::double precision,
      (p ->> 'parking_lng')::double precision,
      nullif(trim(p ->> 'rock'), ''),
      array(select jsonb_array_elements_text(coalesce(p -> 'exposition', '[]'))),
      nullif(trim(p ->> 'description'), ''),
      nullif(trim(p ->> 'link'), '')
    )
    returning id into pid;
  else
    update public.places set
      name        = p ->> 'name',
      types       = array(select jsonb_array_elements_text(p -> 'types')),
      lat         = (p ->> 'lat')::double precision,
      lng         = (p ->> 'lng')::double precision,
      parking_lat = (p ->> 'parking_lat')::double precision,
      parking_lng = (p ->> 'parking_lng')::double precision,
      rock        = nullif(trim(p ->> 'rock'), ''),
      exposition  = array(select jsonb_array_elements_text(coalesce(p -> 'exposition', '[]'))),
      description = nullif(trim(p ->> 'description'), ''),
      link        = nullif(trim(p ->> 'link'), '')
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

  -- Multipitch routes have no dependants: replace them wholesale.
  delete from public.mp_routes where place_id = pid;
  insert into public.mp_routes (place_id, name, lat, lng, position)
  select pid,
         nullif(trim(r.value ->> 'name'), ''),
         (r.value ->> 'lat')::double precision,
         (r.value ->> 'lng')::double precision,
         r.ordinality - 1
  from jsonb_array_elements(coalesce(p -> 'mp_routes', '[]')) with ordinality r;

  return pid;
end;
$$;

-- Creates or updates one of the caller's visits with its ascents and partners.
--   { id?, place_id, date?, summary?, approach?, descent?, visibility,
--     partners: [name, ...], ascents: [{ name?, grade?, sector_id?, comment? }] }
-- Partner names the caller hasn't used before are added to their list.
create function public.save_visit(v jsonb)
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
  -- Checked here rather than by revoking EXECUTE from anon: a permission-denied
  -- function call segfaults some Supabase Postgres builds (seen on 17.6.1.x).
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if vid is null then
    insert into public.visits (place_id, date, summary, approach, descent, visibility)
    values (
      (v ->> 'place_id')::bigint,
      (v ->> 'date')::date,
      nullif(trim(v ->> 'summary'), ''),
      nullif(trim(v ->> 'approach'), ''),
      nullif(trim(v ->> 'descent'), ''),
      coalesce(v ->> 'visibility', 'private')
    )
    returning id into vid;
  else
    update public.visits set
      date       = (v ->> 'date')::date,
      summary    = nullif(trim(v ->> 'summary'), ''),
      approach   = nullif(trim(v ->> 'approach'), ''),
      descent    = nullif(trim(v ->> 'descent'), ''),
      visibility = coalesce(v ->> 'visibility', 'private')
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

