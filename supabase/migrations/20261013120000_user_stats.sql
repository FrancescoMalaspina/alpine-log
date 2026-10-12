-- =====================================================================
-- list_users() also returns when each user was last active and how much
-- they logged, for the admins' Users page.
--
-- "Last active" is the latest of their last sign-in and their sessions'
-- token refreshes (an open tab refreshes its token about once an hour).
-- =====================================================================

drop function public.list_users();

create function public.list_users()
returns table (
  id             uuid,
  username       text,
  email          text,
  role           text,
  created_at     timestamptz,
  last_active_at timestamptz,
  visits         bigint,
  public_visits  bigint,
  last_visit     date,
  spots_added    bigint
)
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
    select p.id, p.username, u.email::text, p.role, p.created_at,
           greatest(u.last_sign_in_at,
                    (select max(greatest(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = u.id)),
           (select count(*) from public.visits v where v.user_id = p.id),
           (select count(*) from public.visits v where v.user_id = p.id and v.visibility = 'public'),
           (select max(v.date) from public.visits v where v.user_id = p.id),
           (select count(*) from public.places pl where pl.created_by = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by lower(p.username);
end;
$$;

revoke execute on function public.list_users() from public, anon;
grant execute on function public.list_users() to authenticated;
