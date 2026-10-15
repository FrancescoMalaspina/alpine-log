-- =====================================================================
-- Partners linked to registered users (#4).
--
-- Partners are the names each user types on their visits ("Luca", "Anna").
-- A name can now point to a registered user (partners.linked_user_id,
-- there since the first schema and unused until now): on visits others can
-- read, the name leads to that user's logbook, and the user finds the
-- visit under "Tagged in". Linking is the visit owner's choice, like the
-- name itself; the linked user isn't asked.
--
-- * rename_partner(): renames one of your partners everywhere (visits,
--   wishes); to a name you already use, it merges the two.
-- * partner_for_user(): your partner name for a registered user, linked,
--   created when there is none; for picking someone in the visit form.
-- =====================================================================

alter table public.partners add constraint partners_not_self check (linked_user_id <> owner_id);
create index partners_linked_user_id_idx on public.partners (linked_user_id) where linked_user_id is not null;

-- Renames your partner p_id to p_name. When you already have a partner of
-- that name the two become one: its visits (in the same rope if either
-- was), wishes and link. Returns the partner that remains.
create function public.rename_partner(p_id bigint, p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_name text := trim(p_name);
  old public.partners;
  keep bigint;
begin
  select * into old from public.partners where id = p_id and owner_id = me;
  if old.id is null then
    raise exception 'No partner of yours with that id' using errcode = 'P0002';
  end if;
  if new_name is null or new_name = '' then
    raise exception 'A partner needs a name' using errcode = '22023';
  end if;

  update public.wishlist set with_people = array(select distinct unnest(array_replace(with_people, old.name, new_name)))
  where user_id = me and old.name = any (with_people);

  select id into keep from public.partners where owner_id = me and name = new_name and id <> p_id;
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
  update public.partners set linked_user_id = coalesce(linked_user_id, old.linked_user_id) where id = keep;
  delete from public.partners where id = p_id;
  return keep;
end;
$$;

-- Your partner name for registered user p_user_id: the one linked to them,
-- else an unlinked one called like their username (now linked), else a new
-- one. Returns the name, as visits list partners by name.
create function public.partner_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  uname text := (select username from public.profiles where id = p_user_id);
  found_name text;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_user_id = me then
    raise exception 'That''s you' using errcode = '22023';
  end if;
  if uname is null then
    raise exception 'No such user' using errcode = 'P0002';
  end if;

  select name into found_name from public.partners
  where owner_id = me and linked_user_id = p_user_id order by id limit 1;
  if found_name is not null then
    return found_name;
  end if;

  update public.partners set linked_user_id = p_user_id
  where owner_id = me and name = uname and linked_user_id is null
  returning name into found_name;
  if found_name is not null then
    return found_name;
  end if;

  -- "uname" may be someone else you know by the same name.
  found_name := case when exists (select 1 from public.partners where owner_id = me and name = uname)
                     then '@' || uname else uname end;
  insert into public.partners (owner_id, name, linked_user_id) values (me, found_name, p_user_id);
  return found_name;
end;
$$;
