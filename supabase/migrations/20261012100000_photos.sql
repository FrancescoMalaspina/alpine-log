-- =====================================================================
-- Photos, on a place (shared catalog, public) or on a visit (follows the
-- visit's visibility).
--
-- The browser resizes each photo before upload and stores two files:
-- a display copy and a thumbnail. Re-encoding drops EXIF metadata, so GPS
-- position and camera details never leave the phone.
--
-- Buckets:
--   place-photos  public                     <uploader uid>/place-<id>/<uuid>[.thumb].jpg
--   visit-photos  private, signed URLs only  <uploader uid>/visit-<id>/<uuid>[.thumb].jpg
-- =====================================================================

create table public.photos (
  id           bigint generated always as identity primary key,
  place_id     bigint references public.places (id) on delete cascade,
  visit_id     bigint references public.visits (id) on delete cascade,
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  thumb_path   text not null unique,
  width        integer,
  height       integer,
  size_bytes   bigint,
  caption      text,
  created_at   timestamptz not null default now(),
  check (num_nonnulls(place_id, visit_id) = 1)
);
create index photos_place_id_idx on public.photos (place_id);
create index photos_visit_id_idx on public.photos (visit_id);

alter table public.photos enable row level security;

-- Visit photos are readable exactly when the visit is (the subquery is
-- filtered by the visits RLS policy).
create policy "place photos are public, visit photos follow their visit" on public.photos
  for select using (
    place_id is not null
    or exists (select 1 from public.visits v where v.id = visit_id)
  );
create policy "signed-in users add photos to places and to their own visits" on public.photos
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and split_part(thumb_path, '/', 1) = (select auth.uid())::text
    and (
      place_id is not null
      or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = (select auth.uid()))
    )
  );
create policy "uploader edits a caption" on public.photos
  for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "uploader or admin deletes a photo" on public.photos
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_admin());

revoke update on public.photos from anon, authenticated;
grant update (caption) on public.photos to authenticated;

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('place-photos', 'place-photos', true, 10 * 1024 * 1024, array['image/jpeg', 'image/webp', 'image/png']),
  ('visit-photos', 'visit-photos', false, 10 * 1024 * 1024, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "place photos are readable by everyone" on storage.objects
  for select using (bucket_id = 'place-photos');

-- A private visit photo can be fetched (signed URL) only by someone who can
-- read its photos row, i.e. who can read the visit.
create policy "visit photos are readable with their visit" on storage.objects
  for select using (
    bucket_id = 'visit-photos'
    and exists (
      select 1 from public.photos p
      where p.visit_id is not null and (p.storage_path = name or p.thumb_path = name)
    )
  );

create policy "users upload photos into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('place-photos', 'visit-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'webp', 'png')
  );

-- Removing needs SELECT as well as DELETE on the object; the uploader always
-- has their own folder.
create policy "uploader reads own visit photo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "uploader or admin deletes photo files" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('place-photos', 'visit-photos')
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );
