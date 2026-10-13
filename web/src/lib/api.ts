/*
 * Every database call the app makes. Permissions are enforced by row level
 * security in Postgres; these functions only shape requests and results.
 */
import type { Json } from './database.types';
import { supabase } from './supabase';
import type {
  Area, Attachment, Partner, Place, PlaceFilters, PlaceInput, Profile, Route, Sector, VisitDetail, VisitFilters, VisitInput, VisitSummary,
  Wish, WishInput,
} from './types';
import { tr } from '../i18n';
import { USERNAME_RE, usernameHint } from './labels';

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
  id, created_by, area_id, sector_id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
  rock, exposition, description, grade, max_altitude, elevation_gain, distance_km, created_at, updated_at,
  area:areas (id, name),
  sector:sectors (id, name),
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
    .order('name');

  const s = cleanSearch(f.search);
  if (s) q = q.or(`name.ilike.%${s}%,rock.ilike.%${s}%,description.ilike.%${s}%,grade.ilike.%${s}%`);
  if (f.activities.length) q = q.in('activity', f.activities);
  if (f.areaId) q = q.eq('area_id', f.areaId);
  if (f.rock) q = q.eq('rock', f.rock);
  if (f.exposition.length) q = q.overlaps('exposition', f.exposition);
  if (nearIds) q = q.in('id', nearIds);

  return unwrap(await q).map(({ visits, ...p }) => ({
    ...p,
    activity: p.activity as Place['activity'],
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

// ---------------------------------------------------------------- shared route lists

export async function fetchRoutes(placeId: number): Promise<Route[]> {
  const rows = unwrap(await supabase
    .from('routes')
    .select('id, place_id, name, grade, grade_rank, created_by, ascents (count)')
    .eq('place_id', placeId)
    .order('name'));
  return rows.map(({ ascents, ...r }) => ({ ...r, ascent_count: ascents[0]?.count ?? 0 }));
}

export async function addRoute(placeId: number, route: { name: string; grade: string }): Promise<void> {
  const { error } = await supabase.from('routes').insert({
    place_id: placeId, name: route.name.trim(), grade: route.grade.trim() || null,
  });
  if (error) {
    throw new Error(error.code === '23505' ? tr().common.errors.routeExists(route.name.trim()) : error.message);
  }
}

export async function deleteRoute(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('routes').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantRemoveRoute);
}


export async function deletePlace(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('places').delete().eq('id', id).select('id'));
  if (!rows.length) {
    throw new Error(tr().common.errors.placeHasOthersVisits);
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
    throw new Error(error.code === '23505' ? tr().common.errors.areaExists(name.trim()) : error.message);
  }
  return data.id;
}

/**
 * Moves places into an area (or out of any area with null). Returns how many
 * changed. They leave their sector, which belongs to the area they left.
 */
export async function setPlacesArea(placeIds: number[], areaId: number | null): Promise<number> {
  if (!placeIds.length) return 0;
  const rows = unwrap(await supabase.from('places').update({ area_id: areaId, sector_id: null }).in('id', placeIds).select('id'));
  return rows.length;
}

export async function updateArea(id: number, patch: { name: string; description: string }): Promise<void> {
  const { data: rows, error } = await supabase.from('areas')
    .update({ name: patch.name.trim(), description: patch.description.trim() || null })
    .eq('id', id).select('id');
  if (error) {
    throw new Error(error.code === '23505' ? tr().common.errors.areaExists(patch.name.trim()) : error.message);
  }
  if (!rows.length) throw new Error(tr().common.errors.cantChangeArea);
}

export async function deleteArea(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('areas').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantDeleteArea);
}

// ---------------------------------------------------------------- sectors

export async function fetchSectors(): Promise<Sector[]> {
  const rows = unwrap(await supabase
    .from('sectors')
    .select('id, area_id, name, description, max_altitude, created_by, places (count)')
    .order('name'));
  return rows.map(({ places, ...s }) => ({ ...s, place_count: places[0]?.count ?? 0 }));
}

export async function updateSector(id: number, patch: { name: string; description: string; areaId: number | null; maxAltitude: number | null }): Promise<void> {
  const { data: rows, error } = await supabase.from('sectors')
    .update({ name: patch.name.trim(), description: patch.description.trim() || null, area_id: patch.areaId, max_altitude: patch.maxAltitude })
    .eq('id', id).select('id');
  if (error) {
    throw new Error(error.code === '23505' ? tr().common.errors.sectorExists(patch.name.trim()) : error.message);
  }
  if (!rows.length) throw new Error(tr().common.errors.cantChangeSector);
}

export async function deleteSector(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('sectors').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantDeleteSector);
}

/** Puts spots in a sector (or takes them out with null). Returns how many changed. */
export async function setPlacesSector(placeIds: number[], sectorId: number | null): Promise<number> {
  if (!placeIds.length) return 0;
  const rows = unwrap(await supabase.from('places').update({ sector_id: sectorId }).in('id', placeIds).select('id'));
  return rows.length;
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
  if (!/^https?:\/\//i.test(url.trim())) throw new Error(tr().common.errors.linkScheme);
  unwrap(await supabase.from('attachments').insert({
    ...ownerColumns(owner), kind: 'link', title: title.trim() || null, url: url.trim(),
  }));
}

export async function uploadAttachment(owner: AttachmentOwner, userId: string, file: File, title: string): Promise<void> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'gpx' && ext !== 'pdf') throw new Error(tr().common.errors.fileTypes);
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
  if (!rows.length) throw new Error(tr().common.errors.cantRemoveAttachment);
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
  if (f.activity) q = q.eq('place_activity', f.activity);
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
      ascents (id, route_id, name, grade, comment, position, place:places (id, name)),
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
      place:places (id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng, grade, max_altitude,
                    area:areas (name), sector:sectors (name)),
      ascents (name, grade, comment, position, wall:places (name)),
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
  if (!rows.length) throw new Error(tr().common.errors.cantDeleteVisit);
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const escaped = username.replace(/[\\%_]/g, c => `\\${c}`);
  const rows = unwrap(await supabase.from('profiles').select('id').ilike('username', escaped).limit(1));
  return rows.length > 0;
}

// ---------------------------------------------------------------- imports

/** An existing spot whose name looks like an imported one. */
export type PlaceMatch = {
  query: string;
  place_id: number;
  name: string;
  activity: string;
  area_name: string | null;
  lat: number;
  lng: number;
  similarity: number;
  distance_km?: number | null;
};

export async function matchPlaces(names: string[]): Promise<PlaceMatch[]> {
  if (!names.length) return [];
  return unwrap(await supabase.rpc('match_places', { names }));
}

export type ImportResult = { import_id: number | null; visits: number; skipped: number; new_spots: number };

/** Writes a whole import in one transaction. */
export async function importLogbook(payload: object): Promise<ImportResult> {
  return unwrap(await supabase.rpc('import_logbook', { p: payload as Json })) as ImportResult;
}

export type ImportRecord = { id: number; file_name: string; created_at: string; summary: Record<string, number> };

export async function fetchImports(): Promise<ImportRecord[]> {
  const rows = unwrap(await supabase.from('imports').select('id, file_name, created_at, summary').order('created_at', { ascending: false }));
  return rows.map(r => ({ ...r, summary: (r.summary ?? {}) as Record<string, number> }));
}

/** Undoes an import: deletes the visits it added (the spots stay). */
export async function deleteImport(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('imports').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantUndoImport);
}

/** Asks the import-assist Edge Function (Gemini) to map a file's columns. */
export async function askImportAssist<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('import-assist', { body });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 429) throw new Error(tr().common.errors.aiBusy);
    throw new Error(tr().common.errors.aiFailed(error.message));
  }
  return data as T;
}

// ---------------------------------------------------------------- users (admins only)

export type UserRow = {
  id: string; username: string; email: string; role: Profile['role']; created_at: string;
  last_active_at: string | null; visits: number; public_visits: number; last_visit: string | null; spots_added: number;
};

export async function fetchUsers(): Promise<UserRow[]> {
  return unwrap(await supabase.rpc('list_users')) as UserRow[];
}

export async function setUserRole(userId: string, role: Profile['role']): Promise<void> {
  unwrap(await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role }));
}

// ---------------------------------------------------------------- account

/** Renames yourself, or anyone when you are an admin. */
export async function renameUser(userId: string, username: string): Promise<void> {
  const name = username.trim();
  if (!USERNAME_RE.test(name)) throw new Error(usernameHint());
  const escaped = name.replace(/[\\%_]/g, c => `\\${c}`);
  const taken = unwrap(await supabase.from('profiles').select('id').ilike('username', escaped).neq('id', userId).limit(1));
  if (taken.length) throw new Error(tr().common.errors.usernameTaken(name));
  const rows = unwrap(await supabase.from('profiles').update({ username: name }).eq('id', userId).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantRename);
}

const removeFiles = async (bucket: string, paths: string[]) => {
  for (let i = 0; i < paths.length; i += 500) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
};

/**
 * Deletes an account: your own, or anyone's as an admin. Storage files can't be
 * removed from SQL, so they go first, once the database has agreed to the delete.
 * Spots, areas and routes the user added stay, without an owner.
 */
export async function deleteUser(userId: string): Promise<void> {
  unwrap(await supabase.rpc('delete_user', { p_user_id: userId, p_check_only: true }));
  const files = unwrap(await supabase.from('attachments').select('storage_path')
    .eq('created_by', userId).not('storage_path', 'is', null));
  const photos = unwrap(await supabase.from('photos').select('place_id, storage_path, thumb_path').eq('created_by', userId));
  await removeFiles('place-files', files.map(f => f.storage_path!));
  await removeFiles('place-photos', photos.filter(p => p.place_id != null).flatMap(p => [p.storage_path, p.thumb_path]));
  await removeFiles('visit-photos', photos.filter(p => p.place_id == null).flatMap(p => [p.storage_path, p.thumb_path]));
  unwrap(await supabase.rpc('delete_user', { p_user_id: userId }));
}

// ---------------------------------------------------------------- wishlist

const WISH_COLUMNS = `
  id, user_id, place_id, priority, seasons, with_people, notes, visibility, done_at, done_visit_id, created_at,
  done_visit:visits!wishlist_done_visit_id_fkey (date)
` as const;

/** Your wishlist: open items and resolved ones. */
export async function fetchMyWishes(userId: string): Promise<Wish[]> {
  return unwrap(await supabase.from('wishlist').select(WISH_COLUMNS).eq('user_id', userId)
    .order('created_at', { ascending: false })) as Wish[];
}

/** Usernames with this place on their public, open wishlist. */
export async function fetchPlaceWishers(placeId: number): Promise<string[]> {
  const rows = unwrap(await supabase.from('wishlist').select('profile:profiles (username)')
    .eq('place_id', placeId).eq('visibility', 'public').is('done_at', null));
  return rows.map(r => r.profile?.username).filter((n): n is string => !!n);
}

export async function saveWish(w: WishInput): Promise<void> {
  const fields = {
    priority: w.priority, seasons: w.seasons, with_people: w.with_people,
    notes: w.notes?.trim() || null, visibility: w.visibility,
  };
  if (w.id) {
    const rows = unwrap(await supabase.from('wishlist').update(fields).eq('id', w.id).select('id'));
    if (!rows.length) throw new Error(tr().common.errors.cantEditWish);
  } else {
    const { error } = await supabase.from('wishlist').insert({ ...fields, place_id: w.place_id });
    if (error?.code === '23505') throw new Error(tr().common.errors.alreadyWished);
    if (error) throw new Error(error.message);
  }
}

export async function deleteWish(id: number): Promise<void> {
  unwrap(await supabase.from('wishlist').delete().eq('id', id));
}

export async function completeWish(wishId: number, visitId: number): Promise<void> {
  unwrap(await supabase.rpc('complete_wish', { p_wish_id: wishId, p_visit_id: visitId }));
}

export async function reopenWish(id: number): Promise<void> {
  unwrap(await supabase.rpc('reopen_wish', { p_wish_id: id }));
}
