-- =====================================================================
-- Tracks on visits, and their statistics (issue #13).
--
-- * A track logged with a visit stays on its spot and is also linked to the
--   visit (attachments.visit_id), so each visit shows its own numbers.
-- * The track of a private visit is private: only its uploader (and admins)
--   see it, and its file sits in the private bucket visit-tracks, fetched
--   with signed URLs. When the visit is made public the track moves to the
--   public place-files bucket (publish_track) and stays public for good, even
--   if the visit goes private again.
-- * The browser computes the statistics when it saves a track and stores
--   them on the row: no need to download every file to show or add them up.
--   Saved files carry no timestamps, so there is no start time here either.
--
-- Buckets:
--   place-files   public                     <uploader uid>/place-<id>/<uuid>-<name>.gpx
--   visit-tracks  private, signed URLs only  <uploader uid>/visit-<id>/<uuid>-<name>.gpx
-- =====================================================================

alter table public.attachments
  add column visit_id    bigint references public.visits (id) on delete set null,
  add column private     boolean not null default false,
  add column distance_km numeric(7, 2) check (distance_km >= 0),
  add column gain_m      integer check (gain_m >= 0),
  add column loss_m      integer check (loss_m >= 0),
  add column max_ele_m   integer,
  add column min_ele_m   integer,
  add column elapsed_s   integer check (elapsed_s >= 0),
  add column moving_s    integer check (moving_s >= 0),
  add column uphill_s    integer check (uphill_s >= 0),
  add constraint attachments_visit_track check (visit_id is null or kind = 'gpx'),
  add constraint attachments_private_track check (not private or visit_id is not null);
create index attachments_visit_id_idx on public.attachments (visit_id);

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
drop policy "attachments are readable by everyone" on public.attachments;
create policy "everyone reads attachments, uploaders their private tracks" on public.attachments
  for select using (not private or created_by = (select auth.uid()) or public.is_admin());

-- A track goes on a visit only if it's your visit at the same spot.
drop policy "signed-in users attach links and files" on public.attachments;
create policy "signed-in users attach links and files" on public.attachments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (storage_path is null or split_part(storage_path, '/', 1) = (select auth.uid())::text)
    and (
      visit_id is null
      or exists (select 1 from public.visits v
                 where v.id = visit_id and v.user_id = (select auth.uid()) and v.place_id = attachments.place_id)
    )
  );

-- The uploader fills in the statistics of tracks saved before they were stored.
grant update (distance_km, gain_m, loss_m, max_ele_m, min_ele_m, elapsed_s, moving_s, uphill_s)
  on public.attachments to authenticated;

-- ---------------------------------------------------------------------
-- Storage: private tracks, readable by their uploader and admins
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('visit-tracks', 'visit-tracks', false, 20 * 1024 * 1024)
on conflict (id) do nothing;

create policy "uploader or admin reads private tracks" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'visit-tracks'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );
create policy "users upload private tracks into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'visit-tracks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) = 'gpx'
  );
create policy "uploader or admin deletes private tracks" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'visit-tracks'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

-- ---------------------------------------------------------------------
-- Making a private track public, once the browser has copied its file
-- into place-files. There is no way back.
-- ---------------------------------------------------------------------
create function public.publish_track(p_attachment_id bigint, p_public_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if split_part(p_public_path, '/', 1) <> (select auth.uid())::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'place-files' and o.name = p_public_path) then
    raise exception 'The public copy of the track is missing' using errcode = '22023';
  end if;
  update public.attachments set private = false, storage_path = p_public_path
  where id = p_attachment_id and private and created_by = (select auth.uid());
  if not found then
    raise exception 'You can only publish your own private tracks' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.publish_track(bigint, text) from public, anon;
grant execute on function public.publish_track(bigint, text) to authenticated;

-- A private track goes with its visit; a public one stays on the spot.
create function public.delete_private_tracks_of_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.attachments where visit_id = old.id and private;
  return old;
end;
$$;

create trigger visits_delete_private_tracks before delete on public.visits
  for each row execute function public.delete_private_tracks_of_visit();

-- ---------------------------------------------------------------------
-- Data: link the tracks already logged with a visit. The visit form saves
-- the visit and then its track, a moment apart; tracks added from the spot
-- form (e.g. from a guide) have no such visit and stay on the spot only.
-- ---------------------------------------------------------------------
update public.attachments a
set visit_id = m.visit_id
from (
  select distinct on (t.id) t.id, v.id as visit_id
  from public.attachments t
  join public.visits v on v.place_id = t.place_id and v.user_id = t.created_by
  where t.kind = 'gpx' and t.visit_id is null
    and t.created_at between v.created_at and v.created_at + interval '2 minutes'
  order by t.id, t.created_at - v.created_at
) m
where a.id = m.id;

-- ---------------------------------------------------------------------
-- visit_overview: the totals of each visit's tracks, for the logbook.
-- Only tracks the reader can see count (security_invoker).
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
  a.max_sent_grade_rank,
  coalesce(a.pitches_climbed, 0)                           as pitches_climbed,
  t.track_distance_km,
  t.track_gain_m
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
) vp on true
left join lateral (
  select sum(tr.distance_km)  as track_distance_km,
         sum(tr.gain_m)::int  as track_gain_m
  from public.attachments tr
  where tr.visit_id = v.id
) t on true;
