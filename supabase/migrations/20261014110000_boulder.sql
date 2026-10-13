-- =====================================================================
-- Bouldering is an activity of its own (issue #2), not a crag.
--
-- * places.activity accepts 'boulder'.
-- * Crag spots named as boulder fields ("Blocchi …", "… boulder"), or in a
--   sector named so ("Val di Mello (blocchi)"), become boulder spots.
-- * Problems aren't pitches: visit_overview's pitches_climbed keeps counting
--   one per route only at crags, DWS and gyms.
-- =====================================================================

alter table public.places drop constraint places_activity_check;
alter table public.places add constraint places_activity_check
  check (activity in ('crag', 'boulder', 'multipitch', 'alpine', 'ice', 'ski', 'trail', 'hike', 'dws', 'indoor'));

update public.places p
set activity = 'boulder'
where p.activity = 'crag'
  and (p.name ~* '\m(blocchi|boulder|bouldering)\M'
       or exists (select 1 from public.sectors s
                  where s.id = p.sector_id and s.name ~* '\m(blocchi|boulder|bouldering)\M'));
