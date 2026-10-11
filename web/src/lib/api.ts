/*
 * Every database call the app makes. Permissions are enforced by row level
 * security in Postgres; these functions only shape requests and results.
 */
import { supabase } from './supabase';
import type {
  Area, Attachment, Partner, Place, PlaceFilters, PlaceInput, VisitDetail, VisitFilters, VisitInput, VisitSummary,
} from './types';

/** Public storage bucket for GPX tracks and PDF guides (supabase/migrations). */
const BUCKET = 'place-files';

function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

/** Strips characters that have meaning inside PostgREST filter strings. */
const cleanSearch = (s: string) => s.replace(/[%*,()"\\]/g, ' ').trim();

// ---------------------------------------------------------------- places

const PLACE_COLUMNS = `
  id, created_by, area_id, name, types, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
  rock, exposition, description, grade, max_altitude, elevation_gain, created_at, updated_at,
  area:areas (id, name),
  sectors (id, name, position),
  visits (count)
` as const;

export async function fetchPlaces(f: PlaceFilters): Promise<Place[]> {
  let nearIds: number[] | null = null;
  if (f.near) {
    const rows = unwrap(await supabase.rpc('places_within', {
      p_lat: f.near.lat, p_lng: f.near.lng, radius_km: f.near.km,
    }));
    nearIds = rows.map(r => r.place_id);
    if (!nearIds.length) return [];
  }

  let q = supabase
    .from('places')
    .select(PLACE_COLUMNS)
    .order('name')
    .order('position', { referencedTable: 'sectors' });

  const s = cleanSearch(f.search);
  if (s) q = q.or(`name.ilike.%${s}%,rock.ilike.%${s}%,description.ilike.%${s}%,grade.ilike.%${s}%`);
  if (f.types.length) q = q.overlaps('types', f.types);
  if (f.areaId) q = q.eq('area_id', f.areaId);
  if (f.rock) q = q.eq('rock', f.rock);
  if (f.exposition.length) q = q.overlaps('exposition', f.exposition);
  if (nearIds) q = q.in('id', nearIds);

  return unwrap(await q).map(({ visits, ...p }) => ({
    ...p,
    types: p.types as Place['types'],
    exposition: p.exposition as Place['exposition'],
    visit_count: visits[0]?.count ?? 0,
  }));
}

/** Distinct rock types, for the filter dropdown and the place form. */
export async function fetchRocks(): Promise<string[]> {
  const rows = unwrap(await supabase.from('places').select('rock').not('rock', 'is', null));
  return [...new Set(rows.map(r => r.rock!))].sort((a, b) => a.localeCompare(b));
}

export async function savePlace(input: PlaceInput): Promise<number> {
  return unwrap(await supabase.rpc('save_place', { p: input }));
}

export async function fetchSectors(placeId: number): Promise<{ id: number; name: string }[]> {
  return unwrap(await supabase.from('sectors').select('id, name').eq('place_id', placeId));
}

export async function deletePlace(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('places').delete().eq('id', id).select('id'));
  if (!rows.length) {
    throw new Error('This place has visits logged by other people, so only an admin can delete it.');
  }
}

// ---------------------------------------------------------------- areas

export async function fetchAreas(): Promise<Area[]> {
  const rows = unwrap(await supabase
    .from('areas')
    .select('id, created_by, name, description, lat, lng, places (count)')
    .order('name'));
  return rows.map(({ places, ...a }) => ({ ...a, place_count: places[0]?.count ?? 0 }));
}

export async function createArea(name: string, description: string): Promise<number> {
  const { data, error } = await supabase.from('areas')
    .insert({ name: name.trim(), description: description.trim() || null })
    .select('id').single();
  if (error) {
    throw new Error(error.code === '23505' ? `There is already an area called "${name.trim()}".` : error.message);
  }
  return data.id;
}

/** Moves places into an area (or out of any area with null). Returns how many changed. */
export async function setPlacesArea(placeIds: number[], areaId: number | null): Promise<number> {
  if (!placeIds.length) return 0;
  const rows = unwrap(await supabase.from('places').update({ area_id: areaId }).in('id', placeIds).select('id'));
  return rows.length;
}

export async function updateArea(id: number, patch: { name: string; description: string }): Promise<void> {
  const { data: rows, error } = await supabase.from('areas')
    .update({ name: patch.name.trim(), description: patch.description.trim() || null })
    .eq('id', id).select('id');
  if (error) {
    throw new Error(error.code === '23505' ? `There is already an area called "${patch.name.trim()}".` : error.message);
  }
  if (!rows.length) throw new Error('Only the creator of this area or an admin can change it.');
}

export async function deleteArea(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('areas').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error('Only the creator of this area or an admin can delete it.');
}

// ---------------------------------------------------------------- attachments

export type AttachmentOwner = { placeId: number } | { areaId: number };

export async function fetchAttachments(owner: AttachmentOwner): Promise<Attachment[]> {
  let q = supabase
    .from('attachments')
    .select('id, place_id, area_id, created_by, kind, title, url, storage_path, size_bytes, created_at, profile:profiles (username)')
    .order('created_at');
  q = 'placeId' in owner ? q.eq('place_id', owner.placeId) : q.eq('area_id', owner.areaId);
  return unwrap(await q).map(({ profile, ...a }) => ({
    ...a,
    kind: a.kind as Attachment['kind'],
    username: profile?.username ?? null,
  }));
}

const ownerColumns = (owner: AttachmentOwner) =>
  'placeId' in owner ? { place_id: owner.placeId } : { area_id: owner.areaId };

export async function addLink(owner: AttachmentOwner, title: string, url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url.trim())) throw new Error('Links must start with http:// or https://');
  unwrap(await supabase.from('attachments').insert({
    ...ownerColumns(owner), kind: 'link', title: title.trim() || null, url: url.trim(),
  }));
}

export async function uploadAttachment(owner: AttachmentOwner, userId: string, file: File, title: string): Promise<void> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'gpx' && ext !== 'pdf') throw new Error('Only .gpx and .pdf files can be uploaded.');
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const folder = 'placeId' in owner ? `place-${owner.placeId}` : `area-${owner.areaId}`;
  const path = `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: ext === 'gpx' ? 'application/gpx+xml' : 'application/pdf',
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from('attachments').insert({
    ...ownerColumns(owner), kind: ext, title: title.trim() || file.name, storage_path: path, size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

export async function deleteAttachment(a: Attachment): Promise<void> {
  const rows = unwrap(await supabase.from('attachments').delete().eq('id', a.id).select('id'));
  if (!rows.length) throw new Error('Only the person who added this (or an admin) can remove it.');
  if (a.storage_path) await supabase.storage.from(BUCKET).remove([a.storage_path]);
}

export const attachmentUrl = (a: Attachment) =>
  a.url ?? supabase.storage.from(BUCKET).getPublicUrl(a.storage_path!).data.publicUrl;

// ---------------------------------------------------------------- visits

export async function fetchVisits(f: VisitFilters, userId: string | null): Promise<VisitSummary[]> {
  if (f.scope === 'mine' && !userId) return [];
  let q = supabase
    .from('visit_overview')
    .select('*')
    .order('date', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  if (f.scope === 'mine') q = q.eq('user_id', userId!);
  if (f.scope === 'public') q = q.eq('visibility', 'public');
  if (f.partnerId) q = q.contains('partner_ids', [f.partnerId]);
  if (f.areaId) q = q.eq('area_id', f.areaId);
  if (f.from) q = q.gte('date', f.from);
  if (f.to) q = q.lte('date', f.to);
  if (f.minGradeRank != null) q = q.gte('max_grade_rank', f.minGradeRank);
  if (f.placeType) q = q.contains('place_types', [f.placeType]);
  const s = cleanSearch(f.search).toLowerCase();
  if (s) q = q.ilike('search_text', `%${s}%`);

  return unwrap(await q) as VisitSummary[];
}

export async function fetchPlaceVisits(placeId: number): Promise<VisitDetail[]> {
  const rows = unwrap(await supabase
    .from('visits')
    .select(`
      id, user_id, place_id, date, summary, approach, descent, conditions, duration_hours, visibility,
      profile:profiles (username),
      ascents (id, name, grade, comment, position, sector:sectors (id, name)),
      visit_partners (partner:partners (name))
    `)
    .eq('place_id', placeId)
    .order('date', { ascending: false, nullsFirst: false })
    .order('position', { referencedTable: 'ascents' }));

  return rows.map(({ profile, visit_partners, ...v }) => ({
    ...v,
    visibility: v.visibility as VisitDetail['visibility'],
    username: profile?.username ?? null,
    partners: visit_partners.map(vp => vp.partner?.name).filter((n): n is string => !!n).sort(),
  }));
}

/** Every visit of one user with its place, routes and partners: the full logbook, for export. */
export async function fetchLogbook(userId: string) {
  const rows = unwrap(await supabase
    .from('visits')
    .select(`
      id, date, summary, approach, descent, conditions, duration_hours, visibility, created_at,
      place:places (id, name, types, lat, lng, parking_lat, parking_lng, start_lat, start_lng, grade, max_altitude,
                    area:areas (name)),
      ascents (name, grade, comment, position, sector:sectors (name)),
      visit_partners (partner:partners (name))
    `)
    .eq('user_id', userId)
    .order('date', { ascending: false, nullsFirst: false })
    .order('position', { referencedTable: 'ascents' }));
  return rows.map(({ visit_partners, ...v }) => ({
    ...v,
    partners: visit_partners.map(vp => vp.partner?.name).filter((n): n is string => !!n).sort(),
  }));
}
export type LogbookVisit = Awaited<ReturnType<typeof fetchLogbook>>[number];

export async function fetchMyPartners(userId: string): Promise<Partner[]> {
  return unwrap(await supabase.from('partners').select('id, name').eq('owner_id', userId).order('name'));
}

export async function saveVisit(input: VisitInput): Promise<number> {
  return unwrap(await supabase.rpc('save_visit', { v: input }));
}

export async function deleteVisit(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('visits').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error("You can't delete this visit.");
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const escaped = username.replace(/[\\%_]/g, c => `\\${c}`);
  const rows = unwrap(await supabase.from('profiles').select('id').ilike('username', escaped).limit(1));
  return rows.length > 0;
}
