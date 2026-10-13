-- =====================================================================
-- Each user's interface language (issue #7), so it follows them across
-- devices. Null until they pick one: the app then uses the browser's.
-- =====================================================================

alter table public.profiles
  add column language text check (language in ('en', 'it'));

-- Users may change their own language, like their username.
grant update (language) on public.profiles to authenticated;
