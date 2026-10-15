-- =====================================================================
-- Mountain biking is an activity of its own (issue #28), tracked like
-- trail running: the track is the ride itself.
-- =====================================================================

alter table public.places drop constraint places_activity_check;
alter table public.places add constraint places_activity_check
  check (activity in ('crag', 'boulder', 'multipitch', 'alpine', 'ice', 'ski', 'trail', 'mtb', 'hike', 'dws', 'indoor'));
