-- =====================================================================
-- Wishlist and account management (issue #6).
--
-- * wishlist: places a user wants to go to, with priority, seasons, who
--   they'd go with and notes. Private unless marked public, like visits.
--   An item is resolved by a visit (complete_wish) and can be reopened;
--   a place has at most one open item per user.
-- * delete_user: a user deletes their own account, or an admin deletes
--   anyone's. Shared spots, areas and routes survive without an owner
--   (their created_by is "on delete set null"); everything else cascades.
--   Storage files are removed by the browser first (see web/src/lib/api.ts).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Wishlist
-- ---------------------------------------------------------------------
create table public.wishlist (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id      bigint not null references public.places (id) on delete cascade,
  priority      smallint not null default 2 check (priority between 1 and 3),   -- 1 = high
  seasons       text[] not null default '{}'
                check (seasons <@ array['winter', 'spring', 'summer', 'autumn']),
  with_people   text[] not null default '{}',
  notes         text,
  visibility    text not null default 'private' check (visibility in ('private', 'public')),
  done_at       timestamptz,
  done_visit_id bigint references public.visits (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index wishlist_user_id_idx on public.wishlist (user_id);
create index wishlist_place_id_idx on public.wishlist (place_id);
create index wishlist_done_visit_id_idx on public.wishlist (done_visit_id);
create unique index wishlist_one_open_per_place on public.wishlist (user_id, place_id) where done_at is null;

alter table public.wishlist enable row level security;
create policy "read own, public, or everything as admin" on public.wishlist
  for select using (
    visibility = 'public'
    or user_id = (select auth.uid())
    or public.is_admin()
  );
create policy "users add to their own wishlist" on public.wishlist
  for insert to authenticated
  with check (user_id = (select auth.uid()) and done_at is null and done_visit_id is null);
create policy "users edit their own wishlist" on public.wishlist
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner or admin removes a wish" on public.wishlist
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Resolving goes through complete_wish / reopen_wish, which check the visit.
revoke update on public.wishlist from anon, authenticated;
grant update (priority, seasons, with_people, notes, visibility) on public.wishlist to authenticated;

create function public.complete_wish(p_wish_id bigint, p_visit_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wishlist w set done_at = now(), done_visit_id = p_visit_id
  from public.visits v
  where w.id = p_wish_id
    and w.user_id = (select auth.uid())
    and v.id = p_visit_id
    and v.user_id = w.user_id
    and v.place_id = w.place_id;
  if not found then
    raise exception 'That visit can''t resolve this wish' using errcode = '42501';
  end if;
end;
$$;

create function public.reopen_wish(p_wish_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wishlist set done_at = null, done_visit_id = null
  where id = p_wish_id and user_id = (select auth.uid());
  if not found then
    raise exception 'You can only reopen your own wishes' using errcode = '42501';
  end if;
exception
  when unique_violation then
    raise exception 'This place is already on your wishlist' using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------
create function public.delete_user(p_user_id uuid, p_check_only boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text := (select role from public.profiles where id = p_user_id);
begin
  if (select auth.uid()) is null
     or (p_user_id <> (select auth.uid()) and not public.is_admin()) then
    raise exception 'You can only delete your own account' using errcode = '42501';
  end if;
  if target_role is null then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  if target_role = 'admin'
     and (select count(*) from public.profiles where role = 'admin') = 1 then
    raise exception 'The last admin can''t be deleted: make someone else admin first' using errcode = '42501';
  end if;
  if p_check_only then
    return;
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke execute on function public.complete_wish(bigint, bigint) from public, anon;
revoke execute on function public.reopen_wish(bigint) from public, anon;
revoke execute on function public.delete_user(uuid, boolean) from public, anon;
grant execute on function public.complete_wish(bigint, bigint) to authenticated;
grant execute on function public.reopen_wish(bigint) to authenticated;
grant execute on function public.delete_user(uuid, boolean) to authenticated;
