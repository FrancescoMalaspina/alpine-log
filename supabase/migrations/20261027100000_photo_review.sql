-- =====================================================================
-- Spot photos are reviewed, and a visit photo can move to its spot (#32).
--
-- Who may edit a spot (can_edit_place: who created it, admins) adds photos
-- to it straight away. Anyone else's spot photos wait for an admin: until
-- then only they and the admins see them.
--
-- A photo of your visit can move to the visit's spot, never back. The
-- browser copies its files into place-photos first, then
-- move_photo_to_spot() adds the copy to the spot. When the copy needs no
-- review, the visit photo goes at once; otherwise it stays in the visit
-- until an admin approves the copy (then it goes) or rejects it (then the
-- copy goes).
--
-- SQL can't delete storage files, and an admin can't read private visit
-- photos. So whatever drops a photo here leaves its files in
-- leftover_photo_files, and the uploader's browser removes them (at once
-- after a move of their own, otherwise the next time they sign in).
-- =====================================================================

alter table public.photos
  add column pending boolean not null default false,
  -- The visit photo a spot photo was copied from, while that one is still there.
  add column moved_from bigint references public.photos (id) on delete set null;
create unique index photos_moved_from_key on public.photos (moved_from);
create index photos_pending_idx on public.photos (place_id) where pending;

comment on column public.photos.pending is 'A spot photo waiting for an admin; seen only by its uploader and admins.';

-- Uploads name what they add; pending and moved_from are this file's to set.
revoke insert on public.photos from anon, authenticated;
grant insert (place_id, visit_id, storage_path, thumb_path, width, height, size_bytes, caption)
  on public.photos to authenticated;

-- Whether a new spot photo waits for review is decided here, not by the client.
create function private.photo_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.pending := new.place_id is not null and not public.can_edit_place(new.place_id);
  return new;
end;
$$;
revoke execute on function private.photo_review() from public;

create trigger photo_review before insert on public.photos
  for each row execute function private.photo_review();

drop policy "place photos are public, visit photos follow their visit" on public.photos;
create policy "reviewed spot photos are public, visit photos follow the visit" on public.photos
  for select using (
    (place_id is not null and (not pending or created_by = (select auth.uid()) or public.is_admin()))
    or exists (select 1 from public.visits v where v.id = visit_id)
  );

-- Listing the public bucket shows only files of photos you can see (and your own),
-- so a photo waiting for review can't be found there.
drop policy "place photos are readable by everyone" on storage.objects;
create policy "spot photo files are readable with their photo" on storage.objects
  for select using (
    bucket_id = 'place-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.photos p
        where p.place_id is not null and (p.storage_path = name or p.thumb_path = name)
      )
    )
  );

-- ---------------------------------------------------------------------
-- Files left behind, for their uploader's browser to remove
-- ---------------------------------------------------------------------
create table public.leftover_photo_files (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  bucket   text not null check (bucket in ('place-photos', 'visit-photos')),
  path     text not null,
  primary key (bucket, path)
);
alter table public.leftover_photo_files enable row level security;
create policy "uploader sees their leftover files" on public.leftover_photo_files
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "uploader forgets their leftover files" on public.leftover_photo_files
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke insert, update on public.leftover_photo_files from anon, authenticated;

-- Deletes a photo row and leaves its files to its uploader.
create function private.drop_photo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ph public.photos;
begin
  delete from public.photos where id = p_id returning * into ph;
  if ph.id is null then
    return;
  end if;
  insert into public.leftover_photo_files (owner_id, bucket, path)
  select ph.created_by, case when ph.place_id is not null then 'place-photos' else 'visit-photos' end, f
  from unnest(array[ph.storage_path, ph.thumb_path]) f
  on conflict do nothing;
end;
$$;
revoke execute on function private.drop_photo(bigint) from public;

-- A reviewed spot photo copied from a visit photo: the visit photo goes.
create function private.finish_photo_move(p_copy bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  original bigint;
begin
  select moved_from into original from public.photos where id = p_copy and not pending;
  if original is not null then
    perform private.drop_photo(original);
  end if;
end;
$$;
revoke execute on function private.finish_photo_move(bigint) from public;

-- ---------------------------------------------------------------------
-- Moving a visit photo to the visit's spot
-- ---------------------------------------------------------------------
-- p_path and p_thumb_path are the copies the browser put in place-photos.
-- Returns whether the spot photo waits for review.
create function public.move_photo_to_spot(p_photo_id bigint, p_path text, p_thumb_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ph public.photos;
  spot bigint;
  copy public.photos;
begin
  -- Checked here rather than by revoking EXECUTE, which crashes some Postgres builds.
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into ph from public.photos where id = p_photo_id and visit_id is not null and created_by = me;
  if ph.id is null then
    raise exception 'You can only move photos you added to a visit' using errcode = '42501';
  end if;
  if exists (select 1 from public.photos where moved_from = ph.id) then
    raise exception 'This photo is already on its way to the spot' using errcode = '23505';
  end if;
  if split_part(p_path, '/', 1) <> me::text or split_part(p_thumb_path, '/', 1) <> me::text
     or (select count(*) from storage.objects o
         where o.bucket_id = 'place-photos' and o.name in (p_path, p_thumb_path)) <> 2 then
    raise exception 'The spot''s copy of the photo is missing' using errcode = '22023';
  end if;
  select place_id into spot from public.visits where id = ph.visit_id;

  insert into public.photos (place_id, created_by, storage_path, thumb_path, width, height, size_bytes, caption, moved_from)
  values (spot, me, p_path, p_thumb_path, ph.width, ph.height, ph.size_bytes, ph.caption, ph.id)
  returning * into copy;
  perform private.finish_photo_move(copy.id);
  return copy.pending;
end;
$$;

-- ---------------------------------------------------------------------
-- Review, by admins
-- ---------------------------------------------------------------------
create function private.pending_photo(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins review photos' using errcode = '42501';
  end if;
  perform 1 from public.photos where id = p_id and pending for update;
  if not found then
    raise exception 'That photo is not waiting for review' using errcode = 'P0002';
  end if;
  return p_id;
end;
$$;
revoke execute on function private.pending_photo(bigint) from public;

create function public.approve_photo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Checked once, before the update: in its WHERE it would run for every row.
  photo bigint := private.pending_photo(p_id);
begin
  update public.photos set pending = false where id = photo;
  perform private.finish_photo_move(photo);
end;
$$;

create function public.reject_photo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.drop_photo(private.pending_photo(p_id));
end;
$$;

-- The admins' queue, oldest first.
create function public.pending_photos()
returns table (
  id bigint, place_id bigint, place_name text, created_by uuid, username text,
  storage_path text, thumb_path text, caption text, from_visit boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins review photos' using errcode = '42501';
  end if;
  return query
  select ph.id, ph.place_id, pl.name, ph.created_by, pr.username, ph.storage_path, ph.thumb_path, ph.caption,
         ph.moved_from is not null, ph.created_at
  from public.photos ph
  join public.places pl on pl.id = ph.place_id
  left join public.profiles pr on pr.id = ph.created_by
  where ph.pending
  order by ph.created_at;
end;
$$;
