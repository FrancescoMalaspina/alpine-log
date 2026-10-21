-- =====================================================================
-- A partner on the app is called by their username (#34).
--
-- Linking one of your partner names to a registered user renames it to
-- their username, so the same person reads the same on your visits, in a
-- shared day and in invitations.
--
-- * One name per registered user: linking a second name to someone already
--   linked merges the two (their visits and wishes become one).
-- * The name follows the account: when someone changes their username,
--   every partner name linked to them changes with it.
-- * When you already call someone else by that username, the linked name
--   is "@username" (as partner_for_user already did).
-- * Links change only through link_partner; names linked so far are
--   merged and renamed the same way.
-- =====================================================================

-- ---------------------------------------------------------------------
-- rename_partner, for any owner: link_partner and the username trigger
-- rename names on behalf of their owner.
-- ---------------------------------------------------------------------

-- Renames p_owner's partner p_id to p_name. When they already have a
-- partner of that name the two become one: its visits (in the same rope if
-- either was), wishes and link. Returns the partner that remains.
create function private.rename_partner(p_owner uuid, p_id bigint, p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_name text := trim(p_name);
  old public.partners;
  keep bigint;
begin
  select * into old from public.partners where id = p_id and owner_id = p_owner;
  if old.id is null then
    raise exception 'No partner of yours with that id' using errcode = 'P0002';
  end if;
  if new_name is null or new_name = '' then
    raise exception 'A partner needs a name' using errcode = '22023';
  end if;
  if new_name = old.name then
    return p_id;
  end if;

  update public.wishlist set with_people = array(select distinct unnest(array_replace(with_people, old.name, new_name)))
  where user_id = p_owner and old.name = any (with_people);

  select id into keep from public.partners where owner_id = p_owner and name = new_name and id <> p_id;
  if keep is null then
    update public.partners set name = new_name where id = p_id;
    return p_id;
  end if;

  update public.visit_partners k set same_rope = k.same_rope or d.same_rope
  from public.visit_partners d
  where k.partner_id = keep and d.partner_id = p_id and d.visit_id = k.visit_id;
  delete from public.visit_partners d
  where d.partner_id = p_id
    and exists (select 1 from public.visit_partners k where k.partner_id = keep and k.visit_id = d.visit_id);
  update public.visit_partners set partner_id = keep where partner_id = p_id;
  -- The link moves first: two names can't be linked to one user.
  delete from public.partners where id = p_id;
  update public.partners set linked_user_id = coalesce(linked_user_id, old.linked_user_id) where id = keep;
  return keep;
end;
$$;

create or replace function public.rename_partner(p_id bigint, p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.rename_partner((select auth.uid()), p_id, p_name);
end;
$$;

-- ---------------------------------------------------------------------
-- Linking
-- ---------------------------------------------------------------------

-- What p_owner calls the registered user named p_username: the username,
-- or "@username" when another of their names (p_id aside) already is it.
create function private.partner_name_for(p_owner uuid, p_id bigint, p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.partners where owner_id = p_owner and name = p_username and id <> p_id)
              then '@' || p_username else p_username end;
$$;

-- Links p_owner's partner p_id to p_user: any other name of theirs for
-- that user merges into it, and it takes the username. Returns the partner.
create function private.link_partner(p_owner uuid, p_id bigint, p_user uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  other bigint;
begin
  for other in select id from public.partners
               where owner_id = p_owner and linked_user_id = p_user and id <> p_id
  loop
    perform private.rename_partner(p_owner, other, (select name from public.partners where id = p_id));
  end loop;
  update public.partners set linked_user_id = p_user where id = p_id;
  return private.rename_partner(p_owner, p_id,
    private.partner_name_for(p_owner, p_id, (select username from public.profiles where id = p_user)));
end;
$$;

-- Links your partner p_id to registered user p_user_id (merging any other
-- name you have for them), or unlinks it (null). Returns the partner.
create function public.link_partner(p_id bigint, p_user_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.partners where id = p_id and owner_id = me) then
    raise exception 'No partner of yours with that id' using errcode = 'P0002';
  end if;
  if p_user_id is null then
    update public.partners set linked_user_id = null where id = p_id;
    return p_id;
  end if;
  if p_user_id = me then
    raise exception 'That''s you' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'No such user' using errcode = 'P0002';
  end if;
  return private.link_partner(me, p_id, p_user_id);
end;
$$;

-- Links change through link_partner, names through rename_partner.
revoke update on public.partners from anon, authenticated;

-- ---------------------------------------------------------------------
-- The name follows the account
-- ---------------------------------------------------------------------
create function public.partner_names_follow_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.partners;
begin
  for p in select * from public.partners
           where linked_user_id = new.id and name in (old.username, '@' || old.username)
  loop
    perform private.rename_partner(p.owner_id, p.id, private.partner_name_for(p.owner_id, p.id, new.username));
  end loop;
  return null;
end;
$$;

create trigger profiles_rename_partners after update of username on public.profiles
  for each row when (old.username is distinct from new.username)
  execute function public.partner_names_follow_username();

-- ---------------------------------------------------------------------
-- The names linked so far: one per user, called by the username.
-- ---------------------------------------------------------------------
select private.link_partner(owner_id, min(id), linked_user_id)
from public.partners
where linked_user_id is not null
group by owner_id, linked_user_id;

create unique index partners_owner_linked_user_key on public.partners (owner_id, linked_user_id)
  where linked_user_id is not null;
