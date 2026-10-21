-- =====================================================================
-- Shared visits: "together with …" (#33).
--
-- The day is shared, your climbing is yours. People who went out together
-- each keep their own visit (routes, notes, rating, public or private,
-- track), and an outing ties those visits into one day: the spot, the
-- date and who was there.
--
-- * Naming someone linked to a registered user on your visit invites them
--   (it used to tag them silently, #4). Nothing reaches their logbook until
--   they accept: with a new visit filled in from yours, or by linking the
--   one they already logged. "Not me" declines, and the same visit never
--   invites them again.
-- * Logging a visit where someone logged a public one the same day, you can
--   ask to join it; its author accepts or declines.
-- * Anyone in the day changes its date for everyone: a visit in a day
--   always has the day's spot and date.
-- * Leaving the day, or deleting your visit, keeps everyone else's; a day
--   down to one visit is a solo visit again.
-- * Outings, invitations and visits.outing_id are written only by the
--   functions below.
-- * The tags made so far become pending invitations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Outings: a day out, the visits in it
-- ---------------------------------------------------------------------
create table public.outings (
  id              bigint generated always as identity primary key,
  place_id        bigint not null references public.places (id) on delete cascade,
  date            date not null,
  date_changed_by uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index outings_place_id_idx on public.outings (place_id);

alter table public.visits add column outing_id bigint references public.outings (id) on delete set null;
create unique index visits_outing_user_key on public.visits (outing_id, user_id) where outing_id is not null;

alter table public.outings enable row level security;
create policy "outings readable with one of their visits" on public.outings
  for select using (exists (select 1 from public.visits v where v.outing_id = outings.id));
revoke insert, update, delete on public.outings from anon, authenticated;

-- Visits are written by save_visit, as their author; outing_id only by the
-- functions below.
revoke insert, update on public.visits from anon, authenticated;
grant insert (user_id, place_id, date, duration_hours, visibility, rating) on public.visits to authenticated;
grant update (date, duration_hours, visibility, rating, import_id) on public.visits to authenticated;

-- A visit in a day has the day's spot and date.
create function public.check_visit_outing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.outing_id is not null and not exists (
    select 1 from public.outings o
    where o.id = new.outing_id and o.place_id = new.place_id and o.date = new.date
  ) then
    raise exception 'A visit in a shared day has its spot and date' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger visits_check_outing before insert or update of outing_id, place_id, date on public.visits
  for each row execute function public.check_visit_outing();

-- A day down to one visit is a solo visit again.
create function public.dissolve_lone_outing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.outing_id is not distinct from old.outing_id then
    return null;
  end if;
  if old.outing_id is not null
     and (select count(*) from public.visits where outing_id = old.outing_id) < 2 then
    -- The visit left in it, if any, loses its outing_id with it.
    delete from public.outings where id = old.outing_id;
  end if;
  return null;
end;
$$;

create trigger visits_dissolve_outing after update of outing_id or delete on public.visits
  for each row execute function public.dissolve_lone_outing();

-- ---------------------------------------------------------------------
-- Invitations ("Anna added you") and requests ("Bob says he was with you")
-- ---------------------------------------------------------------------
-- An invitation goes from a visit to someone it names. A request goes from
-- someone's visit to the author of the visit they ask to join (to_visit_id).
-- to_user_id answers either.
create table public.outing_invites (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('invite', 'request')),
  from_visit_id bigint not null references public.visits (id) on delete cascade,
  to_user_id    uuid not null references public.profiles (id) on delete cascade,
  to_visit_id   bigint references public.visits (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  answered_at   timestamptz,
  unique (from_visit_id, to_user_id),
  check ((kind = 'request') = (to_visit_id is not null))
);
create index outing_invites_to_user_id_idx on public.outing_invites (to_user_id) where status = 'pending';
create index outing_invites_to_visit_id_idx on public.outing_invites (to_visit_id);

alter table public.outing_invites enable row level security;
create policy "sender and recipient read an invitation" on public.outing_invites
  for select to authenticated
  using (to_user_id = (select auth.uid()) or public.owns_visit(from_visit_id));
revoke insert, update, delete on public.outing_invites from anon, authenticated;

-- ---------------------------------------------------------------------
-- Helpers. save_visit runs as its caller, so RLS applies, and calls the
-- two that write other people's rows: sync_invites and set_outing_date.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema private from public;
grant usage on schema private to authenticated;

-- Invites the registered people named on visit p_visit_id who aren't in its
-- day yet, once; withdraws what's pending for people no longer named.
create function private.sync_invites(p_visit_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.visits;
begin
  select * into v from public.visits where id = p_visit_id;
  -- No user when the migration below turns the old tags into invitations.
  if v.id is null or ((select auth.uid()) is not null and v.user_id <> (select auth.uid())) then
    raise exception 'You can only invite people to your own visits' using errcode = '42501';
  end if;

  delete from public.outing_invites i
  where i.from_visit_id = v.id and i.kind = 'invite' and i.status = 'pending'
    and not exists (select 1 from public.visit_partners x
                    join public.partners pa on pa.id = x.partner_id
                    where x.visit_id = v.id and pa.linked_user_id = i.to_user_id);

  if v.date is null then
    return;
  end if;

  insert into public.outing_invites (kind, from_visit_id, to_user_id)
  select distinct 'invite', v.id, pa.linked_user_id
  from public.visit_partners x
  join public.partners pa on pa.id = x.partner_id
  where x.visit_id = v.id and pa.linked_user_id is not null
    -- Already in the day, or invited to it by someone else in it.
    and not exists (select 1 from public.visits m where m.outing_id = v.outing_id and m.user_id = pa.linked_user_id)
    and not exists (select 1 from public.outing_invites i
                    join public.visits f on f.id = i.from_visit_id
                    where i.to_user_id = pa.linked_user_id and i.status = 'pending' and f.outing_id = v.outing_id)
  on conflict (from_visit_id, to_user_id) do nothing;
end;
$$;

-- Moves day p_outing, and every visit in it, to p_date.
create function private.set_outing_date(p_outing bigint, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.visits where outing_id = p_outing and user_id = (select auth.uid())) then
    raise exception 'Only the people in a shared day change its date' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'A shared visit needs a date' using errcode = '22023';
  end if;
  update public.outings set date = p_date, date_changed_by = (select auth.uid()) where id = p_outing;
  update public.visits set date = p_date where outing_id = p_outing;
end;
$$;

revoke execute on function private.sync_invites(bigint) from public;
revoke execute on function private.set_outing_date(bigint, date) from public;
grant execute on function private.sync_invites(bigint) to authenticated;
grant execute on function private.set_outing_date(bigint, date) to authenticated;

-- Puts visits p_a and p_b in one day: a new one, the one either is in, or
-- both their days made one. They must be at the same spot on the same
-- date. Invitations between people now in the day count as accepted.
-- Returns the day.
create function private.join_visits(p_a bigint, p_b bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.visits;
  b public.visits;
  day bigint;
begin
  select * into a from public.visits where id = p_a;
  select * into b from public.visits where id = p_b;
  if a.id is null or b.id is null then
    raise exception 'No such visit' using errcode = 'P0002';
  end if;
  if a.place_id <> b.place_id or a.date is null or a.date <> b.date then
    raise exception 'The two visits must be at the same spot on the same day' using errcode = '22023';
  end if;
  if exists (select 1 from public.visits x
             where x.id in (a.id, b.id) or x.outing_id in (a.outing_id, b.outing_id)
             group by x.user_id having count(*) > 1) then
    raise exception 'Someone would have two visits in the same day' using errcode = '23505';
  end if;

  day := coalesce(a.outing_id, b.outing_id);
  if day is null then
    insert into public.outings (place_id, date) values (a.place_id, a.date) returning id into day;
  end if;
  update public.visits set outing_id = day
  where (id in (a.id, b.id) or outing_id in (a.outing_id, b.outing_id)) and outing_id is distinct from day;

  update public.outing_invites i set status = 'accepted', answered_at = now()
  where i.status = 'pending'
    and exists (select 1 from public.visits f where f.id = i.from_visit_id and f.outing_id = day)
    and exists (select 1 from public.visits m where m.outing_id = day and m.user_id = i.to_user_id);
  return day;
end;
$$;

-- ---------------------------------------------------------------------
-- Your invitations and requests
-- ---------------------------------------------------------------------

-- The invitations and requests waiting for your answer. my_visit_id is
-- your visit they would join: for an invitation, one you already logged
-- at that spot on that day, if any.
create function public.my_invitations()
returns table (
  id            bigint,
  kind          text,
  from_user_id  uuid,
  from_username text,
  from_visit_id bigint,
  place_id      bigint,
  date          date,
  my_visit_id   bigint,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.kind, f.user_id, pr.username, f.id, f.place_id, f.date,
         case when i.kind = 'request' then i.to_visit_id
              else (select m.id from public.visits m
                    where m.user_id = i.to_user_id and m.place_id = f.place_id and m.date = f.date
                    order by m.id limit 1)
         end,
         i.created_at
  from public.outing_invites i
  join public.visits f on f.id = i.from_visit_id
  join public.profiles pr on pr.id = f.user_id
  where i.to_user_id = (select auth.uid()) and i.status = 'pending' and f.date is not null
  order by i.created_at desc;
$$;

-- What a visit of yours starts from when you accept invitation p_invite_id:
-- the spot, the date, the people (same_rope: in your rope) and, when you
-- were in the inviter's rope, the routes. Never their notes.
create function public.invite_prefill(p_invite_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  f public.visits;
  my_rope boolean;
begin
  select v.* into f from public.outing_invites i
  join public.visits v on v.id = i.from_visit_id
  where i.id = p_invite_id and i.kind = 'invite' and i.status = 'pending' and i.to_user_id = me;
  if f.id is null then
    raise exception 'No pending invitation of yours with that id' using errcode = 'P0002';
  end if;

  my_rope := exists (select 1 from public.visit_partners x
                     join public.partners pa on pa.id = x.partner_id
                     where x.visit_id = f.id and pa.linked_user_id = me and x.same_rope);

  return jsonb_build_object(
    'place_id', f.place_id,
    'date', f.date,
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'username', p.username,
                                                   'name', p.name, 'same_rope', p.same_rope)), '[]')
      from (
        -- The inviter,
        select f.user_id, pr.username, null::text as name, my_rope as same_rope
        from public.profiles pr where pr.id = f.user_id
        union all
        -- the people they named but you,
        select pa.linked_user_id, pr.username, case when pa.linked_user_id is null then pa.name end,
               my_rope and x.same_rope
        from public.visit_partners x
        join public.partners pa on pa.id = x.partner_id
        left join public.profiles pr on pr.id = pa.linked_user_id
        where x.visit_id = f.id and pa.linked_user_id is distinct from me
        union all
        -- and the others in their day they didn't name.
        select m.user_id, pr.username, null, false
        from public.visits m
        join public.profiles pr on pr.id = m.user_id
        where m.outing_id = f.outing_id and m.user_id not in (me, f.user_id)
          and not exists (select 1 from public.visit_partners x
                          join public.partners pa on pa.id = x.partner_id
                          where x.visit_id = f.id and pa.linked_user_id = m.user_id)
      ) p
    ),
    'ascents', case when my_rope then (
      select coalesce(jsonb_agg(jsonb_build_object('place_id', a.place_id, 'route_id', a.route_id, 'name', a.name,
                                                   'grade', a.grade, 'pitches', a.pitches, 'aid', a.aid)
                                order by a.position), '[]')
      from public.ascents a where a.visit_id = f.id
    ) else '[]'::jsonb end
  );
end;
$$;

-- Accepts invitation or request p_id: your visit p_visit_id joins the
-- inviter's day; for a request, the asker's visit joins yours. Returns the day.
create function public.accept_invitation(p_id bigint, p_visit_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.outing_invites;
begin
  select * into i from public.outing_invites
  where id = p_id and status = 'pending' and to_user_id = (select auth.uid())
  for update;
  if i.id is null then
    raise exception 'No pending invitation of yours with that id' using errcode = 'P0002';
  end if;
  if i.kind = 'request' then
    return private.join_visits(i.to_visit_id, i.from_visit_id);
  end if;
  if not exists (select 1 from public.visits where id = p_visit_id and user_id = (select auth.uid())) then
    raise exception 'You can only add a visit of yours' using errcode = '42501';
  end if;
  return private.join_visits(i.from_visit_id, p_visit_id);
end;
$$;

-- "Not me" to an invitation, or no to a request.
create function public.decline_invitation(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.outing_invites set status = 'declined', answered_at = now()
  where id = p_id and status = 'pending' and to_user_id = (select auth.uid());
  if not found then
    raise exception 'No pending invitation of yours with that id' using errcode = 'P0002';
  end if;
end;
$$;

-- Asks to join visit p_their_visit_id (one you can read) with your visit
-- p_my_visit_id, at the same spot on the same day. When they already
-- invited you to that day, you join it right away. Returns 'joined' or
-- 'requested'.
create function public.request_to_join(p_my_visit_id bigint, p_their_visit_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine public.visits;
  theirs public.visits;
begin
  select * into mine from public.visits where id = p_my_visit_id and user_id = me;
  if mine.id is null then
    raise exception 'You can only ask with a visit of yours' using errcode = '42501';
  end if;
  select * into theirs from public.visits where id = p_their_visit_id and (visibility = 'public' or user_id = me);
  if theirs.id is null then
    raise exception 'No such visit' using errcode = 'P0002';
  end if;
  if theirs.user_id = me then
    raise exception 'That''s your own visit' using errcode = '22023';
  end if;
  if mine.place_id <> theirs.place_id or mine.date is null or mine.date <> theirs.date then
    raise exception 'The two visits must be at the same spot on the same day' using errcode = '22023';
  end if;
  if mine.outing_id = theirs.outing_id then
    return 'joined';
  end if;

  if exists (select 1 from public.outing_invites i
             join public.visits f on f.id = i.from_visit_id
             where i.kind = 'invite' and i.status = 'pending' and i.to_user_id = me
               and (f.id = theirs.id or f.outing_id = theirs.outing_id)) then
    perform private.join_visits(theirs.id, mine.id);
    return 'joined';
  end if;

  -- Having named them on your visit too, the request replaces the invitation.
  insert into public.outing_invites (kind, from_visit_id, to_user_id, to_visit_id)
  values ('request', mine.id, theirs.user_id, theirs.id)
  on conflict (from_visit_id, to_user_id) do update
    set kind = 'request', to_visit_id = excluded.to_visit_id
    where outing_invites.status = 'pending';
  return 'requested';
end;
$$;

-- Takes your visit p_visit_id out of its day. Everyone else's stays.
create function public.leave_outing(p_visit_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.visits set outing_id = null
  where id = p_visit_id and user_id = (select auth.uid()) and outing_id is not null;
  if not found then
    raise exception 'No shared visit of yours with that id' using errcode = 'P0002';
  end if;
end;
$$;

-- Who is in each of days p_outing_ids that you can see (one of its visits
-- is public, or yours). visit_id is null for a visit you can't read.
create function public.outing_members(p_outing_ids bigint[])
returns table (outing_id bigint, user_id uuid, username text, visit_id bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.outing_id, v.user_id, pr.username,
         case when v.visibility = 'public' or v.user_id = (select auth.uid()) then v.id end
  from public.visits v
  join public.profiles pr on pr.id = v.user_id
  where v.outing_id = any (p_outing_ids)
    and exists (select 1 from public.visits r
                where r.outing_id = v.outing_id and (r.visibility = 'public' or r.user_id = (select auth.uid())))
  order by v.outing_id, lower(pr.username);
$$;

-- ---------------------------------------------------------------------
-- save_visit: as before, and
-- * a new date on a visit in a day moves the whole day;
-- * the registered people it names are invited (sync_invites).
-- ---------------------------------------------------------------------
create or replace function public.save_visit(v jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  vid bigint := (v ->> 'id')::bigint;
  spot bigint;
  names text[] := array(
    select distinct trim(n) from jsonb_array_elements_text(coalesce(v -> 'partners', '[]')) n
    where trim(n) <> ''
  );
  -- Someone listed in both is in your rope.
  others text[] := array(
    select distinct trim(n) from jsonb_array_elements_text(coalesce(v -> 'other_partners', '[]')) n
    where trim(n) <> '' and trim(n) <> all (array(
      select trim(x) from jsonb_array_elements_text(coalesce(v -> 'partners', '[]')) x))
  );
  day bigint;
  old_date date;
begin
  -- See save_place: checked here instead of revoking EXECUTE.
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if vid is null then
    insert into public.visits (place_id, date, duration_hours, visibility, rating)
    values (
      (v ->> 'place_id')::bigint,
      (v ->> 'date')::date,
      (v ->> 'duration_hours')::numeric,
      coalesce(v ->> 'visibility', 'private'),
      (v ->> 'rating')::smallint
    )
    returning id, place_id into vid, spot;
  else
    select outing_id, date into day, old_date from public.visits
    where id = vid and user_id = (select auth.uid());
    if day is not null and (v ->> 'date')::date is distinct from old_date then
      perform private.set_outing_date(day, (v ->> 'date')::date);
    end if;

    update public.visits set
      date           = (v ->> 'date')::date,
      duration_hours = (v ->> 'duration_hours')::numeric,
      visibility     = coalesce(v ->> 'visibility', 'private'),
      rating         = (v ->> 'rating')::smallint
    where id = vid and user_id = (select auth.uid())
    returning place_id into spot;
    if not found then
      raise exception 'You can only edit your own visits' using errcode = '42501';
    end if;
  end if;

  insert into public.visit_notes (visit_id, summary, conditions, approach, descent)
  values (
    vid,
    nullif(trim(v ->> 'summary'), ''),
    nullif(trim(v ->> 'conditions'), ''),
    nullif(trim(v ->> 'approach'), ''),
    nullif(trim(v ->> 'descent'), '')
  )
  on conflict (visit_id) do update set
    summary    = excluded.summary,
    conditions = excluded.conditions,
    approach   = excluded.approach,
    descent    = excluded.descent;

  -- Contribute the visit's new route names to each spot's shared list.
  if coalesce((v ->> 'add_routes')::boolean, false) then
    insert into public.routes (place_id, name, grade)
    select distinct on (coalesce((a ->> 'place_id')::bigint, spot), lower(trim(a ->> 'name')))
           coalesce((a ->> 'place_id')::bigint, spot), trim(a ->> 'name'), nullif(trim(a ->> 'grade'), '')
    from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) a
    where nullif(trim(a ->> 'name'), '') is not null
    on conflict (place_id, lower(name)) do nothing;
  end if;

  delete from public.ascents where visit_id = vid;
  insert into public.ascents (visit_id, place_id, route_id, name, grade, style, pitches, aid, position)
  select vid,
         nullif((a.value ->> 'place_id')::bigint, spot),
         coalesce((a.value ->> 'route_id')::bigint,
                  (select r.id from public.routes r
                   where r.place_id = coalesce((a.value ->> 'place_id')::bigint, spot)
                     and lower(r.name) = lower(trim(a.value ->> 'name')))),
         nullif(trim(a.value ->> 'name'), ''),
         nullif(trim(a.value ->> 'grade'), ''),
         nullif(a.value ->> 'style', ''),
         (a.value ->> 'pitches')::integer,
         nullif(trim(a.value ->> 'aid'), ''),
         a.ordinality - 1
  from jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a;

  -- Each route's comment, matched to it by position.
  insert into public.ascent_notes (ascent_id, comment)
  select asc_.id, trim(a.value ->> 'comment')
  from public.ascents asc_
  join jsonb_array_elements(coalesce(v -> 'ascents', '[]')) with ordinality a on a.ordinality - 1 = asc_.position
  where asc_.visit_id = vid and nullif(trim(a.value ->> 'comment'), '') is not null;

  insert into public.partners (owner_id, name)
  select (select auth.uid()), n from unnest(names || others) n
  on conflict (owner_id, name) do nothing;

  delete from public.visit_partners where visit_id = vid;
  insert into public.visit_partners (visit_id, partner_id, same_rope)
  select vid, pa.id, pa.name = any (names) from public.partners pa
  where pa.owner_id = (select auth.uid()) and pa.name = any (names || others);

  perform private.sync_invites(vid);

  -- A tip for everyone, on the spot, as of the visit's date.
  if nullif(trim(v -> 'tip' ->> 'body'), '') is not null then
    insert into public.spot_comments (place_id, body, topic, observed_on)
    values (spot, trim(v -> 'tip' ->> 'body'), nullif(v -> 'tip' ->> 'topic', ''), (v ->> 'date')::date);
  end if;

  return vid;
end;
$$;

-- ---------------------------------------------------------------------
-- visit_overview: as before, with the visit's day (outing_id) at the end.
-- ---------------------------------------------------------------------
create or replace view public.visit_overview
with (security_invoker = true)
as
select
  v.id,
  v.user_id,
  pr.username,
  v.place_id,
  p.name                                                   as place_name,
  p.activity                                               as place_activity,
  p.area_id,
  ar.name                                                  as area_name,
  p.sector_id,
  se.name                                                  as sector_name,
  v.date,
  n.summary,
  n.conditions,
  v.duration_hours,
  v.visibility,
  coalesce(a.ascent_count, 0)                              as ascent_count,
  a.max_grade_rank,
  coalesce(a.grades, '{}')                                 as grades,
  coalesce(a.wall_names, '{}')                             as wall_names,
  coalesce(vp.partner_ids, '{}')                           as partner_ids,
  coalesce(vp.partner_names, '{}')                         as partner_names,
  lower(concat_ws(' ', p.name, se.name, ar.name, n.summary, n.conditions, pr.username,
                  array_to_string(vp.partner_names, ' '), a.search_text)) as search_text,
  v.rating,
  a.max_sent_grade_rank,
  coalesce(a.pitches_climbed, 0)                           as pitches_climbed,
  t.track_distance_km,
  t.track_gain_m,
  v.outing_id
from public.visits v
join public.places p on p.id = v.place_id
left join public.sectors se on se.id = p.sector_id
left join public.areas ar on ar.id = p.area_id
left join public.profiles pr on pr.id = v.user_id
left join public.visit_notes n on n.visit_id = v.id
left join lateral (
  select count(*)::int                                       as ascent_count,
         max(asc_.grade_rank)                                as max_grade_rank,
         max(asc_.grade_rank) filter (where asc_.style is distinct from 'attempt') as max_sent_grade_rank,
         -- A route's own pitches, else its spot's (the topo), else one at a crag, DWS or gym.
         sum(coalesce(asc_.pitches, sp.pitches,
                      case when sp.activity in ('crag', 'dws', 'indoor') then 1 end))::int as pitches_climbed,
         array_agg(asc_.grade order by asc_.position) filter (where asc_.grade is not null) as grades,
         array_agg(distinct w.name) filter (where w.name is not null) as wall_names,
         string_agg(concat_ws(' ', asc_.name, asc_.grade, w.name, an.comment), ' ') as search_text
  from public.ascents asc_
  left join public.ascent_notes an on an.ascent_id = asc_.id
  left join public.places w on w.id = asc_.place_id
  join public.places sp on sp.id = coalesce(asc_.place_id, v.place_id)
  where asc_.visit_id = v.id
) a on true
left join lateral (
  select array_agg(pa.id order by pa.name)   as partner_ids,
         array_agg(pa.name order by pa.name) as partner_names
  from public.visit_partners x
  join public.partners pa on pa.id = x.partner_id
  where x.visit_id = v.id
) vp on true
left join lateral (
  select sum(tr.distance_km)  as track_distance_km,
         sum(tr.gain_m)::int  as track_gain_m
  from public.attachments tr
  where tr.visit_id = v.id
) t on true;

-- ---------------------------------------------------------------------
-- merge_places: as before, and the duplicate's days move with its visits
-- (2, days first: a visit in a day has the day's spot)
-- ---------------------------------------------------------------------
create or replace function public.merge_places(p_keep bigint, p_duplicate bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_visits int;
  n_routes int;
  n_photos int;
  n_files int;
begin
  -- Checked here rather than by revoking EXECUTE from anon: a permission-denied
  -- function call segfaults some Supabase Postgres builds (seen on 17.6.1.x).
  if not public.is_admin() then
    raise exception 'Only admins can merge spots' using errcode = '42501';
  end if;
  if p_keep = p_duplicate then
    raise exception 'A spot cannot be merged into itself' using errcode = '22023';
  end if;
  if (select count(*) from public.places where id in (p_keep, p_duplicate)) <> 2 then
    raise exception 'Spot not found' using errcode = 'P0002';
  end if;

  -- 1. Details the kept spot lacks come from the duplicate. Its sector only
  --    when it is in the kept spot's area (a sector sets the spot's area).
  update public.places k set
    area_id          = coalesce(k.area_id, d.area_id),
    sector_id        = case when k.sector_id is null and (k.area_id is null or k.area_id = d.area_id)
                            then d.sector_id else k.sector_id end,
    parking_lat      = coalesce(k.parking_lat, d.parking_lat),
    parking_lng      = case when k.parking_lat is null then d.parking_lng else k.parking_lng end,
    start_lat        = coalesce(k.start_lat, d.start_lat),
    start_lng        = case when k.start_lat is null then d.start_lng else k.start_lng end,
    rock             = coalesce(k.rock, d.rock),
    exposition       = case when cardinality(k.exposition) = 0 then d.exposition else k.exposition end,
    description      = private.join_texts(k.description, d.description),
    grade            = coalesce(k.grade, d.grade),
    max_altitude     = coalesce(k.max_altitude, d.max_altitude),
    elevation_gain   = coalesce(k.elevation_gain, d.elevation_gain),
    distance_km      = coalesce(k.distance_km, d.distance_km),
    country          = coalesce(k.country, d.country),
    province         = coalesce(k.province, d.province),
    start_locality   = coalesce(k.start_locality, d.start_locality),
    protection       = coalesce(k.protection, d.protection),
    pitches          = coalesce(k.pitches, d.pitches),
    length_m         = coalesce(k.length_m, d.length_m),
    alpine_grade     = coalesce(k.alpine_grade, d.alpine_grade),
    grade_obligatory = coalesce(k.grade_obligatory, d.grade_obligatory),
    aid              = coalesce(k.aid, d.aid)
  from public.places d
  where k.id = p_keep and d.id = p_duplicate;

  -- 2. Everyone's days and visits.
  update public.outings set place_id = p_keep where place_id = p_duplicate;
  update public.visits set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_visits = row_count;

  -- 3. Routes the kept spot hasn't got move to it. The others stay behind
  --    until step 4 points what was climbed on them at the kept spot's twin.
  update public.routes set place_id = p_keep
  where place_id = p_duplicate and private.route_twin(p_keep, id) is null;
  get diagnostics n_routes = row_count;

  -- 4. Routes climbed: the wall each was climbed on ("another spot of the
  --    visit's sector") and the route, worked out together because the
  --    ascents_check_spot trigger checks them as a pair.
  with climbed as (
    select a.id, a.place_id as old_wall, a.route_id as old_route, v.place_id as visit_spot,
           case
             when a.place_id is null then null
             -- The duplicate, or the kept spot, is now the visit's own spot.
             when a.place_id in (p_keep, p_duplicate) and v.place_id = p_keep then null
             -- The duplicate as a wall: the kept spot, if it is in the visit's sector.
             when a.place_id = p_duplicate then
               case when private.same_sector(v.place_id, p_keep) then p_keep end
             -- A wall of the duplicate's sector, from a visit moved to a spot in another one.
             when v.place_id = p_keep and not private.same_sector(p_keep, a.place_id) then null
             else a.place_id
           end as wall
    from public.ascents a
    join public.visits v on v.id = a.visit_id
    where a.place_id in (p_keep, p_duplicate)
       or (v.place_id = p_keep and a.place_id is not null)
       or a.route_id in (select id from public.routes where place_id in (p_keep, p_duplicate))
  ), settled as (
    select id, old_wall, old_route, wall,
           case
             when coalesce(wall, visit_spot) = p_keep then coalesce(private.route_twin(p_keep, old_route), old_route)
             when wall is not distinct from old_wall then old_route
             else null   -- its wall is gone; the route's name stays on the ascent
           end as route
    from climbed
  )
  update public.ascents a set place_id = s.wall, route_id = s.route
  from settled s
  where a.id = s.id and (s.wall, s.route) is distinct from (s.old_wall, s.old_route);

  -- 5. What hangs off the spot itself.
  update public.photos set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_photos = row_count;
  update public.attachments set place_id = p_keep where place_id = p_duplicate;
  get diagnostics n_files = row_count;
  update public.spot_comments set place_id = p_keep where place_id = p_duplicate;

  -- 5b. Suggested changes. Someone with a pending suggestion on both keeps
  --     the one on the kept spot.
  update public.place_suggestions d set status = 'withdrawn'
  where d.place_id = p_duplicate and d.status = 'pending'
    and exists (select 1 from public.place_suggestions k
                where k.place_id = p_keep and k.author_id = d.author_id and k.status = 'pending');
  update public.place_suggestions set place_id = p_keep where place_id = p_duplicate;

  -- 6. Wishlists: one open wish per person and spot.
  delete from public.wishlist d
  where d.place_id = p_duplicate and d.done_at is null
    and exists (select 1 from public.wishlist k where k.user_id = d.user_id and k.place_id = p_keep and k.done_at is null);
  update public.wishlist set place_id = p_keep where place_id = p_duplicate;

  -- 7. The duplicate, with the routes it shared with the kept spot.
  delete from public.places where id = p_duplicate;

  return jsonb_build_object('visits', n_visits, 'routes', n_routes, 'photos', n_photos, 'files', n_files);
end;
$$;

-- ---------------------------------------------------------------------
-- The tags made so far (#4) become invitations.
-- ---------------------------------------------------------------------
select private.sync_invites(v.id)
from public.visits v
where exists (select 1 from public.visit_partners x
              join public.partners pa on pa.id = x.partner_id
              where x.visit_id = v.id and pa.linked_user_id is not null);
