-- =====================================================================
-- Logbook import from spreadsheets / CSV / JSON.
--
-- * The browser parses the file, maps its columns and resolves every spot
--   (an existing one, or a new one with a confirmed pin). import_logbook()
--   then writes everything in one transaction through save_place/save_visit.
-- * Each import is recorded in "imports"; its visits point to it, so an import
--   can be undone by deleting it (spots it created stay: they are shared).
-- * match_places() suggests existing spots for imported names (pg_trgm).
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

create index places_name_trgm_idx on public.places using gin (lower(name) extensions.gin_trgm_ops);
create index areas_name_trgm_idx on public.areas using gin (lower(name) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Imports
-- ---------------------------------------------------------------------
create table public.imports (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  file_name  text not null,
  summary    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index imports_user_id_idx on public.imports (user_id);

alter table public.imports enable row level security;
create policy "users see their own imports" on public.imports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users record their own imports" on public.imports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users undo their own imports" on public.imports
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "users update their own imports" on public.imports
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.imports from anon, authenticated;
grant update (summary) on public.imports to authenticated;

alter table public.visits add column import_id bigint references public.imports (id) on delete cascade;
create index visits_import_id_idx on public.visits (import_id);

-- ---------------------------------------------------------------------
-- match_places: existing spots whose name looks like each given name
-- ---------------------------------------------------------------------
create function public.match_places(names text[], min_similarity real default 0.4)
returns table (query text, place_id bigint, name text, activity text, area_name text,
               lat double precision, lng double precision, similarity real)
language sql
stable
set search_path = ''
as $$
  select q.name, p.id, p.name, p.activity, a.name, p.lat, p.lng,
         extensions.similarity(lower(p.name), lower(q.name)) as sim
  from unnest(names) as q (name)
  cross join lateral (
    select * from public.places pl
    where extensions.similarity(lower(pl.name), lower(q.name)) >= min_similarity
    order by extensions.similarity(lower(pl.name), lower(q.name)) desc
    limit 5
  ) p
  left join public.areas a on a.id = p.area_id
  order by q.name, sim desc;
$$;

-- ---------------------------------------------------------------------
-- import_logbook
--   { file_name, summary?,
--     spots: [{ key, place_id? | place: <save_place payload>, links?: [{title, url}] }],
--     visits: [{ spot: key, <save_visit payload without place_id>,
--               ascents: [{ …, sector: <sector name> }] }] }
-- Returns { import_id, visits, skipped, new_spots }. A visit at the same spot
-- and date as one the user already has is skipped, so importing the same file
-- twice adds nothing; an import that added no visit leaves no record
-- (import_id is then null).
-- ---------------------------------------------------------------------
create function public.import_logbook(p jsonb)
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
    -- Routes name their sector; the spot's sector of that name (any case) files them.
    v := jsonb_set(v, '{ascents}', coalesce((
      select jsonb_agg((a - 'sector') || jsonb_build_object('sector_id', (
               select sec.id from public.sectors sec
               where sec.place_id = pid and lower(sec.name) = lower(trim(a ->> 'sector'))))
             order by ord)
      from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality as t (a, ord)), '[]'));
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
