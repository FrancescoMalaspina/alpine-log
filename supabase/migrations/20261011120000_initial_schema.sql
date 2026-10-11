-- =====================================================================
-- Climbing Log — initial schema
--
-- Places (and their sectors / multipitch routes) are a shared catalog:
-- everyone can read them, any signed-in user can add one, only the
-- creator or an admin can change it.
-- Visits belong to one user and are private unless marked public.
-- Admins can read everything.
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Profiles (one per auth user, created by trigger on sign-up)
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null
             check (username ~ '^[A-Za-z0-9_.-]{3,30}$'),
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(wanted,
             substr(regexp_replace(split_part(new.email, '@', 1), '[^A-Za-z0-9_.-]', '', 'g'), 1, 24)
             || '_' || substr(new.id::text, 1, 4))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Grades: a sortable rank shared by French (6b+) and UIAA (VI-) notation.
-- rank = French number*6 + letter(a=0,b=2,c=4) + plus(1)
-- Keep in sync with web/src/lib/grades.ts.
-- ---------------------------------------------------------------------
create function public.grade_rank(grade text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  g text := upper(trim(coalesce(grade, '')));
  m text[];
  uiaa text;
begin
  if g = '' then
    return null;
  end if;

  -- French: 6b+, 5c, 7a, 5+
  m := regexp_match(g, '^([1-9])([ABC])?(\+)?');
  if m is not null then
    return m[1]::int * 6
         + coalesce(position(m[2] in 'ABC') - 1, 0) * 2
         + case when m[3] is null then 0 else 1 end;
  end if;

  -- UIAA: IV+, VI-, "VI A0/V" (first grade wins)
  m := regexp_match(g, '^(IX|VIII|VII|VI|V|IV|III|II|I)([+-])?');
  if m is null then
    return null;
  end if;
  uiaa := m[1] || coalesce(m[2], '');
  return case uiaa
    when 'I' then 6     when 'II' then 12   when 'III' then 18
    when 'III+' then 20 when 'IV-' then 22  when 'IV' then 24   -- 4a
    when 'IV+' then 26  when 'V-' then 28   when 'V' then 30    -- 4b, 4c, 5a
    when 'V+' then 32   when 'VI-' then 34  when 'VI' then 36   -- 5b, 5c, 6a
    when 'VI+' then 37  when 'VII-' then 38 when 'VII' then 39  -- 6a+, 6b, 6b+
    when 'VII+' then 40 when 'VIII-' then 41 when 'VIII' then 42 -- 6c, 6c+, 7a
    when 'VIII+' then 44 when 'IX-' then 45 when 'IX' then 46
    when 'IX+' then 47
    else null
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Shared catalog: places, sectors, multipitch routes
-- ---------------------------------------------------------------------
create table public.places (
  id          bigint generated always as identity primary key,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  name        text not null check (length(trim(name)) > 0),
  types       text[] not null default '{crag}'
              check (cardinality(types) > 0 and types <@ array['crag', 'multipitch']),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  parking_lat double precision check (parking_lat between -90 and 90),
  parking_lng double precision check (parking_lng between -180 and 180),
  rock        text,
  exposition  text[] not null default '{}'
              check (exposition <@ array['Nord', 'Sud', 'Est', 'Ovest']),
  description text,
  link        text,
  location    extensions.geography(point, 4326)
              generated always as (
                extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
              ) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((parking_lat is null) = (parking_lng is null))
);
create index places_location_idx on public.places using gist (location);
create index places_created_by_idx on public.places (created_by);

create table public.sectors (
  id       bigint generated always as identity primary key,
  place_id bigint not null references public.places (id) on delete cascade,
  name     text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  unique (place_id, name)
);

create table public.mp_routes (
  id       bigint generated always as identity primary key,
  place_id bigint not null references public.places (id) on delete cascade,
  name     text,
  lat      double precision check (lat between -90 and 90),
  lng      double precision check (lng between -180 and 180),
  position integer not null default 0,
  check ((lat is null) = (lng is null))
);
create index mp_routes_place_id_idx on public.mp_routes (place_id);

-- ---------------------------------------------------------------------
-- Personal log: visits, ascents, climbing partners
-- ---------------------------------------------------------------------
create table public.visits (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id   bigint not null references public.places (id) on delete cascade,
  date       date,
  summary    text,
  approach   text,   -- "avvicinamento", multipitch only
  descent    text,   -- "discesa", multipitch only
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visits_user_id_idx on public.visits (user_id);
create index visits_place_id_idx on public.visits (place_id);
create index visits_date_idx on public.visits (date desc);

create table public.ascents (
  id         bigint generated always as identity primary key,
  visit_id   bigint not null references public.visits (id) on delete cascade,
  sector_id  bigint references public.sectors (id) on delete set null,
  name       text,
  grade      text,
  grade_rank integer generated always as (public.grade_rank(grade)) stored,
  comment    text,
  position   integer not null default 0
);
create index ascents_visit_id_idx on public.ascents (visit_id);
create index ascents_sector_id_idx on public.ascents (sector_id);

create table public.partners (
  id             bigint generated always as identity primary key,
  owner_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  linked_user_id uuid references public.profiles (id) on delete set null,
  unique (owner_id, name)
);

create table public.visit_partners (
  visit_id   bigint not null references public.visits (id) on delete cascade,
  partner_id bigint not null references public.partners (id) on delete cascade,
  primary key (visit_id, partner_id)
);
create index visit_partners_partner_id_idx on public.visit_partners (partner_id);

-- An ascent's sector must belong to the place of its visit.
create function public.check_ascent_sector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sector_id is not null and not exists (
    select 1 from public.sectors s
    join public.visits v on v.place_id = s.place_id
    where s.id = new.sector_id and v.id = new.visit_id
  ) then
    raise exception 'sector % does not belong to the place of visit %', new.sector_id, new.visit_id;
  end if;
  return new;
end;
$$;

create trigger ascents_check_sector before insert or update on public.ascents
  for each row execute function public.check_ascent_sector();

-- ---------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();
create trigger visits_touch before update on public.visits
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Permission helpers (security definer so they see rows RLS would hide)
-- ---------------------------------------------------------------------
create function public.can_edit_place(p_place_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.places
    where id = p_place_id and created_by = (select auth.uid())
  );
$$;

-- Deleting a place cascades to every visit there, including other users'
-- private ones the creator can't see — so only admins may delete a place
-- that has someone else's visits.
create function public.can_delete_place(p_place_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or (
    exists (select 1 from public.places
            where id = p_place_id and created_by = (select auth.uid()))
    and not exists (select 1 from public.visits
                    where place_id = p_place_id and user_id <> (select auth.uid()))
  );
$$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.places         enable row level security;
alter table public.sectors        enable row level security;
alter table public.mp_routes      enable row level security;
alter table public.visits         enable row level security;
alter table public.ascents        enable row level security;
alter table public.partners       enable row level security;
alter table public.visit_partners enable row level security;

-- profiles: usernames are public; users may rename themselves but never
-- change their role (column-level grant below).
create policy "profiles are readable by everyone" on public.profiles
  for select using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "admins update any profile" on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username) on public.profiles to authenticated;

-- places
create policy "places are readable by everyone" on public.places
  for select using (true);
create policy "signed-in users add places" on public.places
  for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "creator or admin updates a place" on public.places
  for update to authenticated
  using (public.can_edit_place(id)) with check (public.can_edit_place(id));
create policy "creator or admin deletes a place" on public.places
  for delete to authenticated
  using (public.can_delete_place(id));

-- Column-level grants: nobody can reassign a place's creator through the API.
revoke update on public.places from anon, authenticated;
grant update (name, types, lat, lng, parking_lat, parking_lng, rock, exposition, description, link)
  on public.places to authenticated;

-- sectors / mp_routes follow their place
create policy "sectors are readable by everyone" on public.sectors
  for select using (true);
create policy "place editors manage sectors" on public.sectors
  for all to authenticated
  using (public.can_edit_place(place_id)) with check (public.can_edit_place(place_id));

create policy "mp routes are readable by everyone" on public.mp_routes
  for select using (true);
create policy "place editors manage mp routes" on public.mp_routes
  for all to authenticated
  using (public.can_edit_place(place_id)) with check (public.can_edit_place(place_id));

-- visits
create policy "read own, public, or everything as admin" on public.visits
  for select using (
    visibility = 'public'
    or user_id = (select auth.uid())
    or public.is_admin()
  );
create policy "users log their own visits" on public.visits
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "users edit their own visits" on public.visits
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner or admin deletes a visit" on public.visits
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ascents follow their visit (the subquery is itself filtered by visits RLS)
create policy "ascents readable with their visit" on public.ascents
  for select using (exists (select 1 from public.visits v where v.id = visit_id));
create policy "visit owner manages ascents" on public.ascents
  for all to authenticated
  using (exists (select 1 from public.visits v
                 where v.id = visit_id and v.user_id = (select auth.uid())))
  with check (exists (select 1 from public.visits v
                      where v.id = visit_id and v.user_id = (select auth.uid())));

-- partners: your own list, plus names attached to visits you can read
-- partners <-> visit_partners policies would reference each other and
-- recurse, so the visit check lives in a security definer function.
create function public.partner_on_readable_visit(p_partner_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.visit_partners vp
    join public.visits v on v.id = vp.visit_id
    where vp.partner_id = p_partner_id
      and (v.visibility = 'public' or v.user_id = (select auth.uid()) or public.is_admin())
  );
$$;

create policy "own partners or partners on readable visits" on public.partners
  for select using (
    owner_id = (select auth.uid())
    or public.is_admin()
    or public.partner_on_readable_visit(id)
  );
create policy "users manage their own partners" on public.partners
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "visit partners readable with their visit" on public.visit_partners
  for select using (exists (select 1 from public.visits v where v.id = visit_id));
create policy "visit owner links own partners" on public.visit_partners
  for insert to authenticated
  with check (
    exists (select 1 from public.visits v
            where v.id = visit_id and v.user_id = (select auth.uid()))
    and exists (select 1 from public.partners p
                where p.id = partner_id and p.owner_id = (select auth.uid()))
  );
create policy "visit owner unlinks partners" on public.visit_partners
  for delete to authenticated
  using (exists (select 1 from public.visits v
                 where v.id = visit_id and v.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- Query helpers
-- ---------------------------------------------------------------------

-- One row per visit with everything a list card or filter needs.
-- security_invoker: the caller's RLS applies to every table joined here.
create view public.visit_overview
with (security_invoker = true)
as
select
  v.id,
  v.user_id,
  pr.username,
  v.place_id,
  p.name                                                   as place_name,
  p.types                                                  as place_types,
  v.date,
  v.summary,
  v.visibility,
  coalesce(a.ascent_count, 0)                              as ascent_count,
  a.max_grade_rank,
  coalesce(a.grades, '{}')                                 as grades,
  coalesce(a.sector_names, '{}')                           as sector_names,
  coalesce(vp.partner_ids, '{}')                           as partner_ids,
  coalesce(vp.partner_names, '{}')                         as partner_names,
  lower(concat_ws(' ', p.name, v.summary, pr.username,
                  array_to_string(vp.partner_names, ' '), a.search_text)) as search_text
from public.visits v
join public.places p on p.id = v.place_id
left join public.profiles pr on pr.id = v.user_id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         array_agg(asc_.grade order by asc_.position) filter (where asc_.grade is not null) as grades,
         array_agg(distinct s.name) filter (where s.name is not null) as sector_names,
         string_agg(concat_ws(' ', asc_.name, asc_.grade, s.name, asc_.comment), ' ') as search_text
  from public.ascents asc_
  left join public.sectors s on s.id = asc_.sector_id
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

-- Places within radius_km of a point, nearest first.
create function public.places_within(p_lat double precision, p_lng double precision, radius_km double precision)
returns table (place_id bigint, distance_km double precision)
language sql
stable
set search_path = ''
as $$
  select p.id,
         extensions.st_distance(
           p.location,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
         ) / 1000
  from public.places p
  where extensions.st_dwithin(
          p.location,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          radius_km * 1000)
  order by 2;
$$;
