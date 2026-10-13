-- =====================================================================
-- Import with sectors.
--
-- * match_places() also returns each match's sector, so an imported
--   "Breithorn › via normale" isn't taken for another mountain's via normale.
-- * import_logbook() fills an area's empty description from the file
--   (a mountain range such as "Alpi Graie – Gran Paradiso").
-- =====================================================================

drop function public.match_places(text[], real);

create function public.match_places(names text[], min_similarity real default 0.4)
returns table (query text, place_id bigint, name text, activity text, area_name text,
               lat double precision, lng double precision, similarity real, sector_name text)
language sql
stable
set search_path = ''
as $$
  select q.name, p.id, p.name, p.activity, a.name, p.lat, p.lng,
         extensions.similarity(lower(p.name), lower(q.name)) as sim, s.name
  from unnest(names) as q (name)
  cross join lateral (
    select * from public.places pl
    where extensions.similarity(lower(pl.name), lower(q.name)) >= min_similarity
    order by extensions.similarity(lower(pl.name), lower(q.name)) desc
    limit 5
  ) p
  left join public.areas a on a.id = p.area_id
  left join public.sectors s on s.id = p.sector_id
  order by q.name, sim desc;
$$;

-- import_logbook: spots may carry area_description (used when the area has none)
create or replace function public.import_logbook(p jsonb)
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
      -- Only an area without a description, and only one this user may edit (RLS).
      if nullif(trim(s ->> 'area_description'), '') is not null then
        update public.areas a set description = trim(s ->> 'area_description')
        from public.places pl
        where pl.id = pid and a.id = pl.area_id and a.description is null;
      end if;
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
    v := jsonb_set(v, '{ascents}', coalesce((
      select jsonb_agg(
               case
                 when nullif(trim(a ->> 'sector'), '') is null then a - 'sector'
                 when wall.id is not null then (a - 'sector') || jsonb_build_object('place_id', wall.id)
                 else (a - 'sector') || jsonb_build_object('comment',
                        concat_ws(' ', nullif(trim(a ->> 'comment'), ''), '(' || trim(a ->> 'sector') || ')'))
               end
             order by ord)
      from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality as t (a, ord)
      left join lateral (
        select w.id from public.places w, public.places me
        where me.id = pid and me.sector_id is not null and w.sector_id = me.sector_id
          and lower(w.name) = lower(trim(a ->> 'sector'))
        limit 1
      ) wall on true), '[]'));
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
