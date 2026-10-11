-- Hands everything owned by one account to another, then deletes the first.
-- Use it when someone signs up whose visits were logged under a placeholder
-- (see scripts/move-visits-to-stub.sql).
--
-- Moves visits, the climbing-partner list, and anything the placeholder created
-- (places, areas, attachments). Partners with the same name are merged.
-- Edit the two usernames below, then:
--   supabase db query --linked -f scripts/transfer-account-data.sql
do $$
declare
  from_username text := 'vale-pending';
  to_username text := 'CHANGE-ME';   -- the username Vale signed up with
  from_id uuid := (select id from public.profiles where username = from_username);
  to_id uuid := (select id from public.profiles where username = to_username);
  moved_visits int;
begin
  if from_id is null then raise exception 'No user called %', from_username; end if;
  if to_id is null then raise exception 'No user called %', to_username; end if;
  if from_id = to_id then raise exception 'Same account'; end if;

  -- Partners: merge same-named ones into the target's list, move the rest.
  update public.visit_partners vp set partner_id = keep.id
  from public.partners old
  join public.partners keep on keep.owner_id = to_id and keep.name = old.name
  where vp.partner_id = old.id and old.owner_id = from_id
    and not exists (select 1 from public.visit_partners x where x.visit_id = vp.visit_id and x.partner_id = keep.id);
  delete from public.partners old
  using public.partners keep
  where old.owner_id = from_id and keep.owner_id = to_id and keep.name = old.name;
  update public.partners set owner_id = to_id where owner_id = from_id;

  update public.visits set user_id = to_id where user_id = from_id;
  get diagnostics moved_visits = row_count;
  update public.places set created_by = to_id where created_by = from_id;
  update public.areas set created_by = to_id where created_by = from_id;
  update public.attachments set created_by = to_id where created_by = from_id;

  delete from auth.users where id = from_id;   -- cascades to the profile
  raise notice 'Moved % visits from % to % and deleted %', moved_visits, from_username, to_username, from_username;
end;
$$;
