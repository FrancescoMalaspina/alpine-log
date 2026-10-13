-- =====================================================================
-- visit_overview: pitches climbed on each visit, for the logbook statistics.
-- Each route counts its own pitches (when linked or split differently from
-- the topo), else its spot's pitches, else one at a crag, DWS or gym; routes
-- of other activities without a pitch count add nothing.
-- =====================================================================

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
  a.max_sent_grade_rank,
  coalesce(a.pitches_climbed, 0)                           as pitches_climbed
from public.visits v
join public.places p on p.id = v.place_id
left join public.sectors se on se.id = p.sector_id
left join public.areas ar on ar.id = p.area_id
left join public.profiles pr on pr.id = v.user_id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         max(asc_.grade_rank) filter (where asc_.style is distinct from 'attempt') as max_sent_grade_rank,
         -- A route's own pitches, else its spot's (the topo), else one at a crag, DWS or gym.
         sum(coalesce(asc_.pitches, sp.pitches,
                      case when sp.activity in ('crag', 'dws', 'indoor') then 1 end))::int as pitches_climbed,
         array_agg(asc_.grade order by asc_.position) filter (where asc_.grade is not null) as grades,
         array_agg(distinct w.name) filter (where w.name is not null) as wall_names,
         string_agg(concat_ws(' ', asc_.name, asc_.grade, w.name, asc_.comment), ' ') as search_text
  from public.ascents asc_
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
) vp on true;
