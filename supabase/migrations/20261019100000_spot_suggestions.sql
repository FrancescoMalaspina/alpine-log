-- =====================================================================
-- Suggested changes to spots (#19).
--
-- A spot's creator and the admins edit it directly, as before. Anyone else
-- suggests changes, and an admin approves them (all, or some fields) or
-- rejects them. Until then the spot doesn't change: a suggestion lives in
-- its own table, and nothing that reads spots needs to know about it.
--
-- * A suggestion holds only the fields it changes, and what they were when
--   it was written ("base"), so the review shows what changed since.
-- * Fields that only make sense together travel together: a pin's lat and
--   lng, and area with sector (a sector is found by name in its area).
-- * Area and sector are names: one that doesn't exist yet is created when
--   the suggestion is approved, not when it is written.
-- * One pending suggestion per person and spot; suggesting again replaces it.
-- * Authors read their own suggestions, admins read them all. Writes go
--   through the functions below.
--
-- save_place, suggest_place_changes and approve_place_suggestion write a
-- spot the same way, through private.write_place.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A spot as a payload
-- ---------------------------------------------------------------------

-- The spot's own fields that save_place sets (besides area and sector).
create function private.spot_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['name', 'activity', 'lat', 'lng', 'parking_lat', 'parking_lng', 'start_lat', 'start_lng',
               'rock', 'exposition', 'description', 'grade', 'max_altitude', 'elevation_gain', 'distance_km',
               'country', 'province', 'start_locality', 'protection', 'pitches', 'length_m',
               'alpine_grade', 'grade_obligatory', 'aid'];
$$;

-- Fields that change together share a group: a suggestion or an approval
-- takes the whole group.
create function private.spot_field_group(k text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when k in ('lat', 'lng') then 'pin'
    when k in ('parking_lat', 'parking_lng') then 'parking'
    when k in ('start_lat', 'start_lng') then 'start'
    when k in ('area_name', 'sector_name') then 'place'
    else k
  end;
$$;

-- A save_place payload as stored: typed like the spot's columns, text
-- trimmed, blanks null, country upper-cased, no exposition an empty list;
-- area and sector by name.
create function private.clean_place(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with trimmed as (
    select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string'
                                               then to_jsonb(nullif(trim(value #>> '{}'), ''))
                                               else value end), '{}') as t
    from jsonb_each(p)
  ), typed as (
    select to_jsonb(jsonb_populate_record(null::public.places, t)) as r, t from trimmed
  )
  select jsonb_build_object('area_name', t -> 'area_name', 'sector_name', t -> 'sector_name')
         || (select jsonb_object_agg(k, case k when 'country' then to_jsonb(upper(r ->> k))
                                               when 'exposition' then coalesce(nullif(r -> k, 'null'), '[]')
                                               else r -> k end)
             from unnest(private.spot_fields()) k)
  from typed;
$$;

-- Spot p_id as a clean payload (null when there is no such spot).
create function private.place_payload(p_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('area_name', a.name, 'sector_name', s.name)
         || (select jsonb_object_agg(k, to_jsonb(p) -> k) from unnest(private.spot_fields()) k)
  from public.places p
  left join public.areas a on a.id = p.area_id
  left join public.sectors s on s.id = p.sector_id
  where p.id = p_id;
$$;

-- Writes a clean payload to spot p_id, or to a new spot when p_id is null.
-- The area is found by name or created; the sector the same way, in it.
-- Callers check who may write.
create function private.write_place(p_id bigint, c jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  pid bigint := p_id;
  v_area bigint;
  v_sector bigint;
  n int;
begin
  if c ->> 'area_name' is not null then
    select id into v_area from public.areas
    where public.fold_name(name) = public.fold_name(c ->> 'area_name')
    order by id limit 1;
    if v_area is null then
      insert into public.areas (name, lat, lng)
      values (c ->> 'area_name', (c ->> 'lat')::double precision, (c ->> 'lng')::double precision)
      returning id into v_area;
    end if;
  end if;

  if c ->> 'sector_name' is not null then
    select id into v_sector from public.sectors
    where area_id is not distinct from v_area and public.fold_name(name) = public.fold_name(c ->> 'sector_name')
    order by id limit 1;
    if v_sector is null then
      insert into public.sectors (area_id, name) values (v_area, c ->> 'sector_name') returning id into v_sector;
    end if;
  end if;

  if pid is null then
    insert into public.places (area_id, sector_id, name, activity, lat, lng) values (
      v_area, v_sector, c ->> 'name', c ->> 'activity', (c ->> 'lat')::double precision, (c ->> 'lng')::double precision)
    returning id into pid;
  end if;

  execute format('update public.places t set area_id = $1, sector_id = $2, %s
                  from jsonb_populate_record(null::public.places, $3) r where t.id = $4',
                 (select string_agg(format('%1$I = r.%1$I', k), ', ') from unnest(private.spot_fields()) k))
  using v_area, v_sector, c, pid;
  get diagnostics n = row_count;   -- EXECUTE doesn't set FOUND
  if n = 0 then
    raise exception 'Spot not found' using errcode = 'P0002';
  end if;

  return pid;
end;
$$;

-- ---------------------------------------------------------------------
-- save_place: the creator or an admin edits; anyone signed in adds
-- ---------------------------------------------------------------------
create or replace function public.save_place(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid bigint := (p ->> 'id')::bigint;
begin
  -- Checked here rather than by revoking EXECUTE from anon: a permission-denied
  -- function call segfaults some Supabase Postgres builds (seen on 17.6.1.x).
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if pid is not null and not public.can_edit_place(pid) then
    raise exception 'You can only edit spots you created' using errcode = '42501';
  end if;
  return private.write_place(pid, private.clean_place(p));
end;
$$;

-- ---------------------------------------------------------------------
-- Suggestions
-- ---------------------------------------------------------------------
create table public.place_suggestions (
  id          bigint generated always as identity primary key,
  place_id    bigint not null references public.places (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  changes     jsonb not null check (jsonb_typeof(changes) = 'object' and changes <> '{}'),
  base        jsonb not null check (jsonb_typeof(base) = 'object'),
  note        text check (length(note) <= 2000),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  accepted    text[],    -- the fields an approval took
  created_at  timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (length(review_note) <= 2000)
);
create index place_suggestions_place_id_idx on public.place_suggestions (place_id);
create index place_suggestions_author_id_idx on public.place_suggestions (author_id);
create index place_suggestions_pending_idx on public.place_suggestions (created_at) where status = 'pending';
create unique index place_suggestions_one_pending_idx on public.place_suggestions (place_id, author_id)
  where status = 'pending';

alter table public.place_suggestions enable row level security;
create policy "authors read their suggestions, admins read all" on public.place_suggestions
  for select to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

revoke insert, update, delete on public.place_suggestions from anon, authenticated;

-- Suggests the changes payload p (as for save_place, with the spot's id)
-- makes to the spot. Returns the suggestion's id.
create function public.suggest_place_changes(p jsonb, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid bigint := (p ->> 'id')::bigint;
  cur jsonb := private.place_payload(pid);
  c jsonb := private.clean_place(p);
  changed text[];
  v_changes jsonb;
  sid bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if cur is null then
    raise exception 'Spot not found' using errcode = 'P0002';
  end if;
  if public.can_edit_place(pid) then
    raise exception 'You can edit this spot directly' using errcode = '22023';
  end if;

  -- The groups with a field that differs; area and sector the way
  -- write_place finds them.
  select array_agg(distinct private.spot_field_group(n.key)) into changed
  from jsonb_each(c) n
  where case when n.key in ('area_name', 'sector_name')
             then public.fold_name(n.value #>> '{}') is distinct from public.fold_name(cur ->> n.key)
             else n.value is distinct from cur -> n.key end;
  if changed is null then
    raise exception 'Nothing to suggest: the spot already looks like this' using errcode = '22023';
  end if;

  select jsonb_object_agg(n.key, n.value) into v_changes
  from jsonb_each(c) n where private.spot_field_group(n.key) = any (changed);

  -- Fails here, not at approval, when the spot would break a rule (an
  -- unknown activity, a country that isn't a code…). The savepoint undoes it.
  begin
    perform private.write_place(pid, cur || v_changes);
    raise exception using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then
    null;
  end;

  insert into public.place_suggestions (place_id, changes, base, note)
  values (pid, v_changes,
          (select jsonb_object_agg(k, cur -> k) from jsonb_object_keys(v_changes) k),
          nullif(trim(p_note), ''))
  on conflict (place_id, author_id) where status = 'pending' do update
    set changes = excluded.changes, base = excluded.base, note = excluded.note, created_at = now()
  returning id into sid;
  return sid;
end;
$$;

-- The author takes back a pending suggestion.
create function public.withdraw_place_suggestion(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.place_suggestions set status = 'withdrawn'
  where id = p_id and status = 'pending' and author_id = (select auth.uid());
  if not found then
    raise exception 'No pending suggestion of yours with that id' using errcode = 'P0002';
  end if;
end;
$$;

-- An admin's pending suggestion p_id, locked for review.
create function private.pending_suggestion(p_id bigint)
returns public.place_suggestions
language plpgsql
set search_path = ''
as $$
declare
  s public.place_suggestions;
begin
  if not public.is_admin() then
    raise exception 'Only admins review suggestions' using errcode = '42501';
  end if;
  select * into s from public.place_suggestions where id = p_id for update;
  if s.id is null or s.status <> 'pending' then
    raise exception 'No pending suggestion with that id' using errcode = 'P0002';
  end if;
  return s;
end;
$$;

-- Applies the fields p_fields of suggestion p_id to its spot (all of them
-- when null; a field brings its group). Returns the fields applied.
create function public.approve_place_suggestion(p_id bigint, p_fields text[] default null, p_note text default null)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.place_suggestions := private.pending_suggestion(p_id);
  v_accepted text[];
begin
  select array_agg(k order by k) into v_accepted
  from jsonb_object_keys(s.changes) k
  where p_fields is null
     or private.spot_field_group(k) in (select private.spot_field_group(f) from unnest(p_fields) f);
  if v_accepted is null then
    raise exception 'Choose at least one of the suggested fields, or reject the suggestion' using errcode = '22023';
  end if;

  perform private.write_place(s.place_id, private.place_payload(s.place_id)
                                          || (select jsonb_object_agg(k, s.changes -> k) from unnest(v_accepted) k));

  update public.place_suggestions set
    status = 'approved', accepted = v_accepted,
    reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_id;
  return v_accepted;
end;
$$;

create function public.reject_place_suggestion(p_id bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.pending_suggestion(p_id);
  update public.place_suggestions set
    status = 'rejected',
    reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_id;
end;
$$;

-- The admins' queue: pending suggestions, oldest first, with what the
-- changed fields hold now (it differs from "base" when the spot changed since).
create function public.pending_place_suggestions()
returns table (id bigint, place_id bigint, place_name text, author_id uuid, author_name text,
               changes jsonb, base jsonb, current jsonb, note text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins review suggestions' using errcode = '42501';
  end if;
  return query
  select s.id, s.place_id, p.name, s.author_id, u.username, s.changes, s.base,
         (select jsonb_object_agg(k, private.place_payload(s.place_id) -> k) from jsonb_object_keys(s.changes) k),
         s.note, s.created_at
  from public.place_suggestions s
  join public.places p on p.id = s.place_id
  join public.profiles u on u.id = s.author_id
  where s.status = 'pending'
  order by s.created_at;
end;
$$;

-- ---------------------------------------------------------------------
-- merge_places: as before, and the duplicate's suggestions move too (5b)
-- ---------------------------------------------------------------------
create or replace function public.merge_places(p_keep bigint, p_duplicate bigint)
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

  -- 5b. Suggested changes. Someone with a pending suggestion on both keeps
  --     the one on the kept spot.
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

  -- 7. The duplicate, with the routes it shared with the kept spot.
  delete from public.places where id = p_duplicate;

  return jsonb_build_object('visits', n_visits, 'routes', n_routes, 'photos', n_photos, 'files', n_files);
end;
$$;
