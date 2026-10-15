-- =====================================================================
-- Private means private, admins included.
--
-- Admins keep every power they had (edit and delete spots, areas and
-- sectors, remove tips, photos, files, visits and wishes, merge
-- duplicates, manage users), but they no longer read what other people
-- keep private: private visits (and with them their routes, partners and
-- photos), partner lists, private wishes and private tracks.
-- =====================================================================

drop policy "read own, public, or everything as admin" on public.visits;
create policy "read own or public visits" on public.visits
  for select using (visibility = 'public' or user_id = (select auth.uid()));

drop policy "read own, public, or everything as admin" on public.wishlist;
create policy "read own or public wishes" on public.wishlist
  for select using (visibility = 'public' or user_id = (select auth.uid()));

create or replace function public.partner_on_readable_visit(p_partner_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.visit_partners vp
    join public.visits v on v.id = vp.visit_id
    where vp.partner_id = p_partner_id
      and (v.visibility = 'public' or v.user_id = (select auth.uid()))
  );
$$;

drop policy "own partners or partners on readable visits" on public.partners;
create policy "own partners or partners on readable visits" on public.partners
  for select using (
    owner_id = (select auth.uid())
    or public.partner_on_readable_visit(id)
  );

drop policy "everyone reads attachments, uploaders their private tracks" on public.attachments;
create policy "everyone reads attachments, uploaders their private tracks" on public.attachments
  for select using (not private or created_by = (select auth.uid()));

drop policy "uploader or admin reads private tracks" on storage.objects;
create policy "uploader reads private tracks" on storage.objects
  for select to authenticated
  using (bucket_id = 'visit-tracks' and (storage.foldername(name))[1] = (select auth.uid())::text);
