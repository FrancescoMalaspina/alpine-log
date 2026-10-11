-- Creates a placeholder account and moves one user's logbook (visits and
-- climbing-partner list) to it, so it can later be handed to the real person
-- with scripts/transfer-account-data.sql.
--
-- The placeholder can't sign in: no password, an undeliverable .invalid
-- address, and banned. Places, areas and attachments stay with their creator.
--
-- Edit the two values below, then:
--   supabase db query --linked -f scripts/move-visits-to-stub.sql
do $$
declare
  from_username text := 'FraM';
  stub_username text := 'vale-pending';
  from_id uuid := (select id from public.profiles where username = from_username);
  stub_id uuid := gen_random_uuid();
  moved_visits int;
  moved_partners int;
begin
  if from_id is null then
    raise exception 'No user called %', from_username;
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(stub_username)) then
    raise exception 'Username % is already taken', stub_username;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, banned_until,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', stub_id, 'authenticated', 'authenticated',
          stub_username || '@placeholder.invalid', '', 'infinity',
          '{"provider":"email","providers":["email"]}', jsonb_build_object('username', stub_username),
          now(), now(), '', '', '', '');
  -- (the on_auth_user_created trigger creates the profile)

  update public.visits set user_id = stub_id where user_id = from_id;
  get diagnostics moved_visits = row_count;
  update public.partners set owner_id = stub_id where owner_id = from_id;
  get diagnostics moved_partners = row_count;

  raise notice 'Created % and moved % visits and % partners from %',
    stub_username, moved_visits, moved_partners, from_username;
end;
$$;
