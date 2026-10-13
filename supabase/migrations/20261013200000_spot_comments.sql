-- =====================================================================
-- Tips: dated comments under a spot for other climbers (conditions, gear,
-- where to park, other approaches…). Public, like the spot catalog.
--
-- A tip is on one spot, or on a sector ("post to all spots in this sector"):
-- then it shows under every spot of the sector, stored once, so editing or
-- deleting it changes it everywhere.
-- =====================================================================

create table public.spot_comments (
  id          bigint generated always as identity primary key,
  place_id    bigint references public.places (id) on delete cascade,
  sector_id   bigint references public.sectors (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 2000),
  topic       text check (topic in ('conditions', 'gear', 'parking', 'approach', 'descent', 'other')),
  observed_on date,      -- "conditions as of", when written after the day
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(place_id, sector_id) = 1)
);
create index spot_comments_place_id_idx on public.spot_comments (place_id);
create index spot_comments_sector_id_idx on public.spot_comments (sector_id);
create index spot_comments_user_id_idx on public.spot_comments (user_id);

create trigger spot_comments_touch before update on public.spot_comments
  for each row execute function public.touch_updated_at();

alter table public.spot_comments enable row level security;
create policy "tips are readable by everyone" on public.spot_comments
  for select using (true);
create policy "signed-in users post tips" on public.spot_comments
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "authors edit their tips" on public.spot_comments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "author or admin removes a tip" on public.spot_comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

revoke update on public.spot_comments from anon, authenticated;
grant update (body, topic, observed_on) on public.spot_comments to authenticated;
