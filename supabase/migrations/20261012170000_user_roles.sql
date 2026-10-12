-- =====================================================================
-- Admins manage roles from the app.
--
-- profiles.role stays out of the column grant (a grant can't tell "my row"
-- from "anyone's row", so it would let users promote themselves). Instead
-- admins go through these two functions, which check is_admin() first.
-- An admin can't demote themselves, so there is always at least one admin.
-- =====================================================================

-- Every account with its sign-up email (auth.users is not exposed to the API).
create function public.list_users()
returns table (id uuid, username text, email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can list users' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, u.email::text, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by lower(p.username);
end;
$$;

create function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change roles' using errcode = '42501';
  end if;
  if p_role not in ('user', 'admin') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;
  if p_user_id = (select auth.uid()) and p_role <> 'admin' then
    raise exception 'you can''t remove your own admin role' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.list_users() from public, anon;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.list_users() to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
