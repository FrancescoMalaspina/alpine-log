-- =====================================================================
-- What you write about a visit is yours; tips are what you share.
--
-- A visit is public or private: a public one shows when you went, with
-- whom, the routes and how they went. Its notes (how it went, conditions,
-- approach, descent, each route's comment) are only ever for its author,
-- whatever the visit's visibility. What others should know goes in a tip
-- on the spot (spot_comments), which a visit can post as it is saved.
--
-- The notes move out of visits and ascents into tables only the visit's
-- author can read, so RLS hides them everywhere: on the spot, in the
-- logbook, and in visit_overview's search text.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The private notes
-- ---------------------------------------------------------------------
create function public.owns_visit(p_visit_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.visits where id = p_visit_id and user_id = (select auth.uid()));
$$;

create table public.visit_notes (
  visit_id   bigint primary key references public.visits (id) on delete cascade,
  summary    text,
  conditions text,
  approach   text,   -- "avvicinamento"
  descent    text    -- "discesa"
);

create table public.ascent_notes (
  ascent_id bigint primary key references public.ascents (id) on delete cascade,
  comment   text not null
);

alter table public.visit_notes enable row level security;
create policy "only the visit's author reads and writes its notes" on public.visit_notes
  for all to authenticated
  using (public.owns_visit(visit_id))
  with check (public.owns_visit(visit_id));

alter table public.ascent_notes enable row level security;
create policy "only the visit's author reads and writes its route comments" on public.ascent_notes
  for all to authenticated
  using (public.owns_visit((select visit_id from public.ascents where id = ascent_id)))
  with check (public.owns_visit((select visit_id from public.ascents where id = ascent_id)));

insert into public.visit_notes (visit_id, summary, conditions, approach, descent)
select id, summary, conditions, approach, descent from public.visits
where num_nonnulls(summary, conditions, approach, descent) > 0;

insert into public.ascent_notes (ascent_id, comment)
select id, comment from public.ascents where comment is not null;

-- ---------------------------------------------------------------------
-- visit_overview: the notes come from visit_notes and ascent_notes, so
-- only the author sees them, and only the author's search finds them.
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
  n.summary,
  n.conditions,
  v.duration_hours,
  v.visibility,
  coalesce(a.ascent_count, 0)                              as ascent_count,
  a.max_grade_rank,
  coalesce(a.grades, '{}')                                 as grades,
  coalesce(a.wall_names, '{}')                             as wall_names,
  coalesce(vp.partner_ids, '{}')                           as partner_ids,
  coalesce(vp.partner_names, '{}')                         as partner_names,
  lower(concat_ws(' ', p.name, se.name, ar.name, n.summary, n.conditions, pr.username,
                  array_to_string(vp.partner_names, ' '), a.search_text)) as search_text,
  v.rating,
  a.max_sent_grade_rank,
  coalesce(a.pitches_climbed, 0)                           as pitches_climbed,
  t.track_distance_km,
  t.track_gain_m
from public.visits v
join public.places p on p.id = v.place_id
left join public.sectors se on se.id = p.sector_id
left join public.areas ar on ar.id = p.area_id
left join public.profiles pr on pr.id = v.user_id
left join public.visit_notes n on n.visit_id = v.id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         max(asc_.grade_rank) filter (where asc_.style is distinct from 'attempt') as max_sent_grade_rank,
         -- A route's own pitches, else its spot's (the topo), else one at a crag, DWS or gym.
         sum(coalesce(asc_.pitches, sp.pitches,
                      case when sp.activity in ('crag', 'dws', 'indoor') then 1 end))::int as pitches_climbed,
         array_agg(asc_.grade order by asc_.position) filter (where asc_.grade is not null) as grades,
         array_agg(distinct w.name) filter (where w.name is not null) as wall_names,
         string_agg(concat_ws(' ', asc_.name, asc_.grade, w.name, an.comment), ' ') as search_text
  from public.ascents asc_
  left join public.ascent_notes an on an.ascent_id = asc_.id
  left join public.places w on w.id = asc_.place_id
  join public.places sp on sp.id = coalesce(asc_.place_id, v.place_id)
  where asc_.visit_id = v.id
) a on true
left join lateral (
  select array_agg(pa.id order by pa.name)   as partner_ids,
         array_agg(pa.name order by pa.name) as partner_names
  from public.visit_partners x
  join public.partners pa on pa.id = x.partner_id
  where x.visit_id = v.id
) vp on true
left join lateral (
  select sum(tr.distance_km)  as track_distance_km,
         sum(tr.gain_m)::int  as track_gain_m
  from public.attachments tr
  where tr.visit_id = v.id
) t on true;

alter table public.visits
  drop column summary,
  drop column conditions,
  drop column approach,
  drop column descent;
alter table public.ascents drop column comment;

-- ---------------------------------------------------------------------
-- save_visit: the notes go to visit_notes and ascent_notes, and a tip,
-- when given, is posted on the spot with the visit's date.
--   { …, summary?, conditions?, approach?, descent?,
--     ascents: [{ …, comment? }], tip?: { body, topic? } }
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
    insert into public.visits (place_id, date, duration_hours, visibility, rating)
    values (
      (v ->> 'place_id')::bigint,
      (v ->> 'date')::date,
      (v ->> 'duration_hours')::numeric,
      coalesce(v ->> 'visibility', 'private'),
      (v ->> 'rating')::smallint
    )
    returning id, place_id into vid, spot;
  else
    update public.visits set
      date           = (v ->> 'date')::date,
      duration_hours = (v ->> 'duration_hours')::numeric,
      visibility     = coalesce(v ->> 'visibility', 'private'),
      rating         = (v ->> 'rating')::smallint
    where id = vid and user_id = (select auth.uid())
    returning place_id into spot;
    if not found then
      raise exception 'You can only edit your own visits' using errcode = '42501';
    end if;
  end if;

  insert into public.visit_notes (visit_id, summary, conditions, approach, descent)
  values (
    vid,
    nullif(trim(v ->> 'summary'), ''),
    nullif(trim(v ->> 'conditions'), ''),
    nullif(trim(v ->> 'approach'), ''),
    nullif(trim(v ->> 'descent'), '')
  )
  on conflict (visit_id) do update set
    summary    = excluded.summary,
    conditions = excluded.conditions,
    approach   = excluded.approach,
    descent    = excluded.descent;

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
  insert into public.ascents (visit_id, place_id, route_id, name, grade, style, pitches, aid, position)
  select vid,
         nullif((a.value ->> 'place_id')::bigint, spot),
         coalesce((a.value ->> 'route_id')::bigint,
                  (select r.id from public.routes r
                   where r.place_id = coalesce((a.value ->> 'place_id')::bigint, spot)
                     and lower(r.name) = lower(trim(a.value ->> 'name')))),
         nullif(trim(a.value ->> 'name'), ''),
         nullif(trim(a.value ->> 'grade'), ''),
         nullif(a.value ->> 'style', ''),
         (a.value ->> 'pitches')::integer,
         nullif(trim(a.value ->> 'aid'), ''),
         a.ordinality - 1
  from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a;

  -- Each route's comment, matched to it by position.
  insert into public.ascent_notes (ascent_id, comment)
  select asc_.id, trim(a.value ->> 'comment')
  from public.ascents asc_
  join jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a on a.ordinality - 1 = asc_.position
  where asc_.visit_id = vid and nullif(trim(a.value ->> 'comment'), '') is not null;

  insert into public.partners (owner_id, name)
  select (select auth.uid()), n from unnest(names || others) n
  on conflict (owner_id, name) do nothing;

  delete from public.visit_partners where visit_id = vid;
  insert into public.visit_partners (visit_id, partner_id, same_rope)
  select vid, pa.id, pa.name = any (names) from public.partners pa
  where pa.owner_id = (select auth.uid()) and pa.name = any (names || others);

  -- A tip for everyone, on the spot, as of the visit's date.
  if nullif(trim(v -> 'tip' ->> 'body'), '') is not null then
    insert into public.spot_comments (place_id, body, topic, observed_on)
    values (spot, trim(v -> 'tip' ->> 'body'), nullif(v -> 'tip' ->> 'topic', ''), (v ->> 'date')::date);
  end if;

  return vid;
end;
$$;
