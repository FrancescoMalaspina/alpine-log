-- One-off cleanup of the hosted crags after 20261025100000_crag_sectors (#11).
-- The conversion turned each sector holding crags into a crag; some were the
-- same crag twice, and one had its names the wrong way round.
--
--   supabase db query --linked -f scripts/crag-cleanup-2026-10.sql
--
-- Spots are named by id, as on the hosted database; each is checked first,
-- and the whole script stops (changing nothing) if one isn't what's expected.
begin;

do $cleanup$
declare
  expected constant jsonb := '{"1": "Scala dei sogni", "37": "Muro del Butch", "39": "Falesia di Civate",
                              "90": "Civate", "8": "Falesia calusco d''adda", "92": "Calusco d''Adda"}';
  k text;
begin
  for k in select jsonb_object_keys(expected) loop
    if not exists (select 1 from public.places where id = k::bigint and name = expected ->> k) then
      raise exception 'Spot % is not "%": nothing changed', k, expected ->> k;
    end if;
  end loop;

  -- Muro del Butch: Scala dei sogni is one of its sectors. Spot 1, filed under it,
  -- becomes that sector of the crag, and Vale's routes on its other walls (left
  -- without them by 20261024100000_stray_walls) are back in their sectors.
  update public.crag_sectors set name = 'Scala dei sogni' where place_id = 1 and name = 'Muro del Butch';
  perform private.merge_places(37, 1);
  update public.ascents set crag_sector_id = (select id from public.crag_sectors where place_id = 37 and name = 'Muretto del Gio')
  where id in (3, 6);  -- Al guanaco, Fratelli d'arte
  update public.ascents set crag_sector_id = (select id from public.crag_sectors where place_id = 37 and name = 'Muro del Butch')
  where id in (8, 9);  -- two unnamed 6a+, 23 May 2026

  -- Civate is Falesia di Civate.
  perform private.merge_places(39, 90);

  -- Calusco d'Adda: one crag, the one with more visits, by its name.
  perform private.merge_places(8, 92);
  update public.places set name = 'Calusco d''Adda' where id = 8;
end
$cleanup$;

commit;
