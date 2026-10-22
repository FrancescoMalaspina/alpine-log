/*
 * Every database call the app makes. Permissions are enforced by row level
 * security in Postgres; these functions only shape requests and results.
 */
import type { Database, Json } from './database.types';
import { supabase } from './supabase';
import { readTrackFile, trackStats, type TrackFile } from './tracks';
import type {
  Area, Attachment, CragSector, Invitation, InvitePrefill, OutingMember, Partner, Place, PlaceFilters, PlaceInput, PlaceSuggestion, Profile, UserRef, Route, Sector, VisitDetail, VisitInput, VisitSummary,
  Tip, TipInput, TrackStats, VisitTrack, Wish, WishInput,
} from './types';
import { tr } from '../i18n';
import { USERNAME_RE, usernameHint } from './labels';

/** Storage buckets for GPX tracks and PDF guides (supabase/migrations): public, and private for tracks of private visits. */
const BUCKET = 'place-files';
const PRIVATE_BUCKET = 'visit-tracks';
const bucketOf = (a: { private: boolean }) => (a.private ? PRIVATE_BUCKET : BUCKET);

function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

type Rpc = Database['public']['Functions'];

/** Strips characters that have meaning inside PostgREST filter strings. */
const cleanSearch = (s: string) => s.replace(/[%*,()"\\]/g, ' ').trim();

// ---------------------------------------------------------------- places

const PLACE_COLUMNS = `
  id, created_by, area_id, sector_id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
  rock, exposition, description, grade, max_altitude, elevation_gain, distance_km, created_at, updated_at,
  country, province, start_locality, protection, pitches, length_m, alpine_grade, grade_obligatory, grade_obligatory_rank, aid,
  area:areas (id, name),
  sector:sectors (id, name),
  visits (count)
` as const;

/** Spots with at least one public visit. */
async function publicVisitPlaceIds(): Promise<number[]> {
  const rows = unwrap(await supabase.from('visit_overview').select('place_id').eq('visibility', 'public'));
  return [...new Set(rows.map(r => r.place_id!))];
}

export async function fetchPlaces(f: PlaceFilters): Promise<Place[]> {
  let nearIds: number[] | null = null;
  if (f.near) {
    const rows = unwrap(await supabase.rpc('places_within', {
      p_lat: f.near.lat, p_lng: f.near.lng, radius_km: f.near.km,
    }));
    nearIds = rows.map(r => r.place_id);
    if (!nearIds.length) return [];
  }
  const visitedIds = f.withPublicVisits ? await publicVisitPlaceIds() : null;
  if (visitedIds && !visitedIds.length) return [];

  let q = supabase
    .from('places')
    .select(PLACE_COLUMNS)
    .order('name');

  const s = cleanSearch(f.search);
  if (s) {
    // A spot is also found by its area's or sector's name.
    const [inAreas, inSectors] = await Promise.all([
      supabase.from('areas').select('id').ilike('name', `%${s}%`),
      supabase.from('sectors').select('id').ilike('name', `%${s}%`),
    ]);
    const areaIds = unwrap(inAreas).map(a => a.id);
    const sectorIds = unwrap(inSectors).map(x => x.id);
    q = q.or([
      `name.ilike.%${s}%`, `rock.ilike.%${s}%`, `description.ilike.%${s}%`, `grade.ilike.%${s}%`,
      ...(areaIds.length ? [`area_id.in.(${areaIds})`] : []),
      ...(sectorIds.length ? [`sector_id.in.(${sectorIds})`] : []),
    ].join(','));
  }
  if (f.activities.length) q = q.in('activity', f.activities);
  if (f.areaId) q = q.eq('area_id', f.areaId);
  if (f.rock) q = q.eq('rock', f.rock);
  if (f.exposition.length) q = q.overlaps('exposition', f.exposition);
  if (f.protection.length) q = q.in('protection', f.protection);
  if (f.maxObligatoryRank != null) q = q.lte('grade_obligatory_rank', f.maxObligatoryRank);
  if (f.country) q = q.eq('country', f.country);
  if (nearIds) q = q.in('id', nearIds);
  if (visitedIds) q = q.in('id', visitedIds);

  return unwrap(await q).map(({ visits, ...p }) => ({
    ...p,
    activity: p.activity as Place['activity'],
    exposition: p.exposition as Place['exposition'],
    protection: p.protection as Place['protection'],
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

// ---------------------------------------------------------------- suggested changes

/** Suggests the changes `input` makes to someone else's spot; replaces the user's pending suggestion there. */
export async function suggestPlaceChanges(input: PlaceInput, note: string): Promise<number> {
  return unwrap(await supabase.rpc('suggest_place_changes', { p: input, p_note: note }));
}

/** The user's latest suggestion for a spot (only authors and admins read suggestions). */
export async function fetchMyPlaceSuggestion(placeId: number, userId: string): Promise<PlaceSuggestion | null> {
  const rows = unwrap(await supabase
    .from('place_suggestions')
    .select('id, place_id, changes, note, status, created_at, reviewed_at, review_note')
    .eq('place_id', placeId)
    .eq('author_id', userId)
    .neq('status', 'withdrawn')
    .order('created_at', { ascending: false })
    .limit(1));
  return (rows[0] as PlaceSuggestion | undefined) ?? null;
}

export async function withdrawPlaceSuggestion(id: number): Promise<void> {
  const { error } = await supabase.rpc('withdraw_place_suggestion', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Admins: a pending suggestion, with what its fields hold now. */
export type PendingSuggestion = {
  id: number;
  place_id: number;
  place_name: string;
  author_name: string;
  changes: Partial<PlaceInput>;
  /** The fields when the suggestion was written. */
  base: Partial<PlaceInput>;
  /** The fields now; they differ from `base` when the spot changed since. */
  current: Partial<PlaceInput>;
  note: string | null;
  created_at: string;
};

/** Admins: pending suggestions, oldest first. */
export async function fetchPendingSuggestions(): Promise<PendingSuggestion[]> {
  return unwrap(await supabase.rpc('pending_place_suggestions')) as unknown as PendingSuggestion[];
}

/** Admins: how many suggestions wait for review. */
export async function countPendingSuggestions(): Promise<number> {
  const { count, error } = await supabase
    .from('place_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Admins: applies the chosen fields (a field brings its group, e.g. lat with lng). */
export async function approveSuggestion(id: number, fields: string[], note: string): Promise<void> {
  const { error } = await supabase.rpc('approve_place_suggestion', { p_id: id, p_fields: fields, p_note: note });
  if (error) throw new Error(error.message);
}

export async function rejectSuggestion(id: number, note: string): Promise<void> {
  const { error } = await supabase.rpc('reject_place_suggestion', { p_id: id, p_note: note });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- shared route lists

export async function fetchRoutes(placeId: number): Promise<Route[]> {
  const rows = unwrap(await supabase
    .from('routes')
    .select('id, place_id, crag_sector_id, name, grade, grade_rank, created_by, ascents (count)')
    .eq('place_id', placeId)
    .order('name'));
  return rows.map(({ ascents, ...r }) => ({ ...r, ascent_count: ascents[0]?.count ?? 0 }));
}

export async function addRoute(placeId: number, route: { name: string; grade: string; sectorId: number | null }): Promise<void> {
  const { error } = await supabase.from('routes').insert({
    place_id: placeId, crag_sector_id: route.sectorId, name: route.name.trim(), grade: route.grade.trim() || null,
  });
  if (error) {
    throw new Error(error.code === '23505' ? tr().common.errors.routeExists(route.name.trim()) : error.message);
  }
}

export async function deleteRoute(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('routes').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantRemoveRoute);
}

// ---------------------------------------------------------------- a crag's sectors

export async function fetchCragSectors(placeId: number): Promise<CragSector[]> {
  return unwrap(await supabase
    .from('crag_sectors')
    .select('id, place_id, name, description, lat, lng, created_by')
    .eq('place_id', placeId)
    .order('name'));
}

export type CragSectorInput = Pick<CragSector, 'name' | 'description' | 'lat' | 'lng'>;

const cleanSector = (s: CragSectorInput) => ({
  name: s.name.trim(), description: s.description?.trim() || null, lat: s.lat, lng: s.lng,
});
const sectorError = (e: { code?: string; message: string }, name: string) =>
  new Error(e.code === '23505' ? tr().common.errors.cragSectorExists(name.trim()) : e.message);

export async function addCragSector(placeId: number, sector: CragSectorInput): Promise<void> {
  const { error } = await supabase.from('crag_sectors').insert({ place_id: placeId, ...cleanSector(sector) });
  if (error) throw sectorError(error, sector.name);
}

export async function updateCragSector(id: number, sector: CragSectorInput): Promise<void> {
  const { data, error } = await supabase.from('crag_sectors').update(cleanSector(sector)).eq('id', id).select('id');
  if (error) throw sectorError(error, sector.name);
  if (!data.length) throw new Error(tr().common.errors.cantChangeCragSector);
}

/** Merges a crag's sector into another of the same crag: its tiri, and the routes climbed in it, are the other's. */
export async function mergeCragSectors(keepId: number, duplicateId: number): Promise<void> {
  const { error } = await supabase.rpc('merge_crag_sectors', { p_keep: keepId, p_duplicate: duplicateId });
  if (error) throw new Error(error.message);
}

/** Removes a crag's sector; its tiri and the routes climbed in it stay, in no sector. */
export async function deleteCragSector(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('crag_sectors').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantChangeCragSector);
}


export async function deletePlace(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('places').delete().eq('id', id).select('id'));
  if (!rows.length) {
    throw new Error(tr().common.errors.placeHasOthersVisits);
  }
}

/** Admins: moves everything of spot `duplicate` onto spot `keep`, then deletes it. */
export async function mergePlaces(keep: number, duplicate: number): Promise<void> {
  unwrap(await supabase.rpc('merge_places', { p_keep: keep, p_duplicate: duplicate }));
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

/** Admins: moves the sectors and spots of area `duplicate` into area `keep`, then deletes it. */
export async function mergeAreas(keep: number, duplicate: number): Promise<void> {
  unwrap(await supabase.rpc('merge_areas', { p_keep: keep, p_duplicate: duplicate }));
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

const ATTACHMENT_COLUMNS = `
  id, place_id, area_id, created_by, kind, title, url, storage_path, size_bytes, created_at, visit_id, private,
  distance_km, gain_m, loss_m, max_ele_m, min_ele_m, elapsed_s, moving_s, uphill_s, profile:profiles (username)
` as const;

type StatsColumns = { [K in keyof TrackStats]: TrackStats[K] | null };

/** A track's statistics columns as one object; null for links, PDFs and tracks not measured yet. */
export const statsOf = (r: StatsColumns): TrackStats | null =>
  r.distance_km == null ? null : {
    distance_km: r.distance_km, gain_m: r.gain_m, loss_m: r.loss_m, max_ele_m: r.max_ele_m, min_ele_m: r.min_ele_m,
    elapsed_s: r.elapsed_s, moving_s: r.moving_s, uphill_s: r.uphill_s,
  };

const attachmentQuery = () => supabase.from('attachments').select(ATTACHMENT_COLUMNS).order('created_at');

/** Attachments matching a filter, each with a URL for its file: public, or signed for an hour for a private track. */
async function queryAttachments(
  filter: (q: ReturnType<typeof attachmentQuery>) => ReturnType<typeof attachmentQuery>,
): Promise<Attachment[]> {
  const rows = unwrap(await filter(attachmentQuery()));
  const privatePaths = rows.filter(a => a.private && a.storage_path).map(a => a.storage_path!);
  const signed = new Map<string, string>();
  if (privatePaths.length) {
    const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrls(privatePaths, 3600);
    if (error) throw new Error(error.message);
    for (const d of data) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }
  return rows.map(({ profile, ...a }) => ({
    ...a,
    kind: a.kind as Attachment['kind'],
    username: profile?.username ?? null,
    stats: statsOf(a),
    file_url: !a.storage_path ? null
      : a.private ? signed.get(a.storage_path) ?? null
      : supabase.storage.from(BUCKET).getPublicUrl(a.storage_path).data.publicUrl,
  }));
}

export const fetchAttachments = (owner: AttachmentOwner) =>
  queryAttachments(q => ('placeId' in owner ? q.eq('place_id', owner.placeId) : q.eq('area_id', owner.areaId)));

const ownerColumns = (owner: AttachmentOwner) =>
  'placeId' in owner ? { place_id: owner.placeId } : { area_id: owner.areaId };

/** The uploader's folder for a file: under its spot or area, or under its visit while the track is private. */
const folderOf = (userId: string, owner: AttachmentOwner, privateVisitId?: number) =>
  `${userId}/${privateVisitId != null ? `visit-${privateVisitId}` : 'placeId' in owner ? `place-${owner.placeId}` : `area-${owner.areaId}`}`;

export async function addLink(owner: AttachmentOwner, title: string, url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url.trim())) throw new Error(tr().common.errors.linkScheme);
  unwrap(await supabase.from('attachments').insert({
    ...ownerColumns(owner), kind: 'link', title: title.trim() || null, url: url.trim(),
  }));
}

/** A GPX being saved: its statistics, and the visit it was logged with (private when the visit is). */
export type TrackUpload = { stats: TrackStats | null; visitId?: number; isPrivate?: boolean };

export async function uploadAttachment(owner: AttachmentOwner, userId: string, file: File, title: string, track?: TrackUpload): Promise<void> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'gpx' && ext !== 'pdf') throw new Error(tr().common.errors.fileTypes);
  const isPrivate = !!track?.isPrivate;
  const bucket = bucketOf({ private: isPrivate });
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${folderOf(userId, owner, isPrivate ? track!.visitId : undefined)}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: ext === 'gpx' ? 'application/gpx+xml' : 'application/pdf',
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from('attachments').insert({
    ...ownerColumns(owner), kind: ext, title: title.trim() || file.name, storage_path: path, size_bytes: file.size,
    visit_id: track?.visitId ?? null, private: isPrivate, ...track?.stats,
  });
  if (error) {
    await supabase.storage.from(bucket).remove([path]);
    throw new Error(error.message);
  }
}

/**
 * Makes a private track public, for good: its file moves to the public
 * bucket, in the spot's folder, and the row follows (publish_track).
 */
export async function publishTrack(a: VisitTrack): Promise<void> {
  const { data: file, error: downloadError } = await supabase.storage.from(PRIVATE_BUCKET).download(a.storage_path!);
  if (downloadError) throw new Error(downloadError.message);
  const path = `${folderOf(a.created_by, { placeId: a.place_id! })}/${a.storage_path!.split('/').pop()}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/gpx+xml' });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase.rpc('publish_track', { p_attachment_id: a.id, p_public_path: path });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  await supabase.storage.from(PRIVATE_BUCKET).remove([a.storage_path!]);
}

export async function deleteAttachment(a: Attachment): Promise<void> {
  const rows = unwrap(await supabase.from('attachments').delete().eq('id', a.id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantRemoveAttachment);
  if (a.storage_path) await supabase.storage.from(bucketOf(a)).remove([a.storage_path]);
}

export const attachmentUrl = (a: Attachment) => a.url ?? a.file_url!;

/** A GPX served as a file to save, named after its title: the download attribute doesn't work across origins. */
export const gpxDownloadUrl = (a: Attachment) => {
  const url = new URL(a.file_url!);
  url.searchParams.set('download', (a.title || 'track').replace(/[\\/:*?"<>|]+/g, '-').replace(/(\.gpx)?$/i, '.gpx'));
  return url.toString();
};

/** Downloads and reads a GPX attachment; null if it isn't a readable track. */
export async function fetchTrackFile(a: Attachment): Promise<TrackFile | null> {
  const res = await fetch(attachmentUrl(a));
  return res.ok ? readTrackFile(await res.text()) : null;
}

/**
 * Measures your tracks saved before their statistics were stored. Their files
 * carry no times, so only distances and heights come back. Once they're all
 * measured this is a single empty query.
 */
export async function fillMissingTrackStats(userId: string): Promise<void> {
  const unmeasured = await queryAttachments(q => q.eq('created_by', userId).eq('kind', 'gpx').is('distance_km', null));
  for (const a of unmeasured) {
    const file = await fetchTrackFile(a);
    const stats = file && trackStats(file.segments);
    if (stats) unwrap(await supabase.from('attachments').update(stats).eq('id', a.id));
  }
}

// ---------------------------------------------------------------- visits

/** One user's visits, as a logbook lists them: all of your own, someone else's that you may read (the database leaves out the rest). */
export async function fetchUserVisits(userId: string): Promise<VisitSummary[]> {
  return unwrap(await supabase
    .from('visit_overview')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })) as VisitSummary[];
}

type VisitNotes = Pick<VisitDetail, 'summary' | 'conditions' | 'approach' | 'descent'>;

/** A visit's private notes: empty unless you wrote it (visit_notes is readable only by the author). */
const notesOf = (n: VisitNotes | null): VisitNotes => ({
  summary: n?.summary ?? null, conditions: n?.conditions ?? null, approach: n?.approach ?? null, descent: n?.descent ?? null,
});

export async function fetchPlaceVisits(placeId: number): Promise<VisitDetail[]> {
  const rows = unwrap(await supabase
    .from('visits')
    .select(`
      id, user_id, place_id, date, duration_hours, visibility, rating, outing_id,
      profile:profiles (username),
      outing:outings (date_changed_by),
      notes:visit_notes (summary, conditions, approach, descent),
      ascents (id, route_id, name, grade, position, style, pitches, aid, note:ascent_notes (comment), sector:crag_sectors (id, name)),
      visit_partners (same_rope, partner:partners (name, linked_user_id)),
      attachments (id, title, private, storage_path, place_id, created_by,
                   distance_km, gain_m, loss_m, max_ele_m, min_ele_m, elapsed_s, moving_s, uphill_s)
    `)
    .eq('place_id', placeId)
    .order('date', { ascending: false, nullsFirst: false })
    .order('position', { referencedTable: 'ascents' }));

  const names = (list: { partner: { name: string } | null }[]) =>
    list.map(vp => vp.partner?.name).filter((n): n is string => !!n).sort();
  return rows.map(({ profile, outing, visit_partners, ascents, attachments, notes, ...v }) => ({
    ...v,
    ...notesOf(notes),
    date_changed_by: outing?.date_changed_by ?? null,
    visibility: v.visibility as VisitDetail['visibility'],
    username: profile?.username ?? null,
    ascents: ascents.map(({ note, ...a }) => ({ ...a, comment: note?.comment ?? null, style: a.style as VisitDetail['ascents'][number]['style'] })),
    partners: names(visit_partners.filter(vp => vp.same_rope)),
    other_partners: names(visit_partners.filter(vp => !vp.same_rope)),
    partner_links: Object.fromEntries(visit_partners.flatMap(({ partner: p }) =>
      p?.linked_user_id ? [[p.name, p.linked_user_id]] : [])),
    tracks: attachments.map(a => ({
      id: a.id, title: a.title, private: a.private, storage_path: a.storage_path, place_id: a.place_id,
      created_by: a.created_by, stats: statsOf(a),
    })),
  }));
}

/** Every visit of one user with its place, routes and partners: the full logbook, for export. */
export async function fetchLogbook(userId: string) {
  const rows = unwrap(await supabase
    .from('visits')
    .select(`
      id, date, duration_hours, visibility, rating, created_at,
      notes:visit_notes (summary, conditions, approach, descent),
      place:places (id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng, grade, max_altitude,
                    country, province, start_locality, protection, pitches, length_m, alpine_grade, grade_obligatory, aid,
                    area:areas (name), sector:sectors (name)),
      ascents (name, grade, position, style, pitches, aid, note:ascent_notes (comment), crag_sector:crag_sectors (name)),
      visit_partners (same_rope, partner:partners (name))
    `)
    .eq('user_id', userId)
    .order('date', { ascending: false, nullsFirst: false })
    .order('position', { referencedTable: 'ascents' }));
  const names = (list: { partner: { name: string } | null }[]) =>
    list.map(vp => vp.partner?.name).filter((n): n is string => !!n).sort();
  return rows.map(({ visit_partners, notes, ascents, ...v }) => ({
    ...v,
    ...notesOf(notes),
    ascents: ascents.map(({ note, ...a }) => ({ ...a, comment: note?.comment ?? null })),
    partners: names(visit_partners.filter(vp => vp.same_rope)),
    other_partners: names(visit_partners.filter(vp => !vp.same_rope)),
  }));
}
export type LogbookVisit = Awaited<ReturnType<typeof fetchLogbook>>[number];

/** Your partners, with the user each is linked to and how many visits each is on. */
export async function fetchMyPartners(userId: string): Promise<Partner[]> {
  const rows = unwrap(await supabase
    .from('partners')
    .select('id, name, linked_user_id, linked:profiles!partners_linked_user_id_fkey (username), visit_partners (count)')
    .eq('owner_id', userId)
    .order('name'));
  return rows.map(({ linked, visit_partners, ...p }) => ({
    ...p, linked_username: linked?.username ?? null, visit_count: visit_partners[0]?.count ?? 0,
  }));
}

/**
 * Links one of your partners to a registered user, or unlinks it (null). A linked partner
 * takes the username, and any other name you have for that user merges into it.
 */
export async function linkPartner(id: number, userId: string | null): Promise<void> {
  const { error } = await supabase.rpc('link_partner', { p_id: id, p_user_id: userId ?? undefined });
  if (error) throw new Error(error.message);
}

/** Renames a partner everywhere; to a name you already use, merges the two. Returns the partner that remains. */
export async function renamePartner(id: number, name: string): Promise<number> {
  return unwrap(await supabase.rpc('rename_partner', { p_id: id, p_name: name }));
}

/** Removes a partner (and the name from the visits it is on). */
export async function deletePartner(id: number): Promise<void> {
  const { error } = await supabase.from('partners').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Your partner name for a registered user, linked to them; made from their username when there is none. */
export async function partnerForUser(userId: string): Promise<string> {
  return unwrap(await supabase.rpc('partner_for_user', { p_user_id: userId }));
}

/** Every registered user's name (profiles are public). */
export async function fetchUsernames(): Promise<UserRef[]> {
  return unwrap(await supabase.from('profiles').select('id, username').order('username'));
}

export async function saveVisit(input: VisitInput): Promise<number> {
  return unwrap(await supabase.rpc('save_visit', { v: input }));
}

// ---------------------------------------------------------------- shared visits

/** Invitations and requests waiting for your answer, newest first. */
export async function fetchInvitations(): Promise<Invitation[]> {
  return unwrap(await supabase.rpc('my_invitations')) as Invitation[];
}

/** What your visit starts from when you accept an invitation: spot, date, people and, in their rope, routes. */
export async function fetchInvitePrefill(id: number): Promise<InvitePrefill> {
  return unwrap(await supabase.rpc('invite_prefill', { p_invite_id: id })) as unknown as InvitePrefill;
}

/** Accepts an invitation with a visit of yours (new, or already logged), or a request to join yours. */
export async function acceptInvitation(id: number, visitId?: number): Promise<void> {
  const { error } = await supabase.rpc('accept_invitation', { p_id: id, p_visit_id: visitId });
  if (error) throw new Error(error.message);
}

/** "Not me" to an invitation, or no to a request. */
export async function declineInvitation(id: number): Promise<void> {
  const { error } = await supabase.rpc('decline_invitation', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Asks to join someone's visit with yours: 'joined' right away when they had invited you to that day. */
export async function requestToJoin(myVisitId: number, theirVisitId: number): Promise<'joined' | 'requested'> {
  return unwrap(await supabase.rpc('request_to_join', { p_my_visit_id: myVisitId, p_their_visit_id: theirVisitId })) as 'joined' | 'requested';
}

/** Takes your visit out of its shared day; everyone else's stays. */
export async function leaveOuting(visitId: number): Promise<void> {
  const { error } = await supabase.rpc('leave_outing', { p_visit_id: visitId });
  if (error) throw new Error(error.message);
}

/** Who is in each of these shared days. */
export async function fetchOutingMembers(outingIds: number[]): Promise<OutingMember[]> {
  if (!outingIds.length) return [];
  return unwrap(await supabase.rpc('outing_members', { p_outing_ids: outingIds }));
}

/** Visits others logged at a spot on a date that you can see: the people you may have been with. */
export async function fetchSameDayVisits(placeId: number, date: string, userId: string): Promise<VisitSummary[]> {
  return unwrap(await supabase
    .from('visit_overview')
    .select('*')
    .eq('place_id', placeId)
    .eq('date', date)
    .neq('user_id', userId)) as VisitSummary[];
}

/** Deletes a visit. Its private tracks go with it (a trigger removes the rows, their files go here); public ones stay on the spot. */
export async function deleteVisit(id: number): Promise<void> {
  const privateTracks = unwrap(await supabase.from('attachments').select('storage_path').eq('visit_id', id).eq('private', true));
  const rows = unwrap(await supabase.from('visits').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantDeleteVisit);
  await removeFiles(PRIVATE_BUCKET, privateTracks.map(a => a.storage_path!));
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const escaped = username.replace(/[\\%_]/g, c => `\\${c}`);
  const rows = unwrap(await supabase.from('profiles').select('id').ilike('username', escaped).limit(1));
  return rows.length > 0;
}

// ---------------------------------------------------------------- similar names (lib/duplicates.ts)

export type SimilarPlaceRow = Rpc['similar_places']['Returns'][number];
export type SimilarAreaRow = Rpc['similar_areas']['Returns'][number];

export async function similarPlaces(queries: Json[]): Promise<SimilarPlaceRow[]> {
  return queries.length ? unwrap(await supabase.rpc('similar_places', { p: queries })) : [];
}

export async function similarAreas(names: string[]): Promise<SimilarAreaRow[]> {
  return names.length ? unwrap(await supabase.rpc('similar_areas', { names })) : [];
}

export async function areasForSpots(queries: Json[]): Promise<Rpc['areas_for_spots']['Returns']> {
  return queries.length ? unwrap(await supabase.rpc('areas_for_spots', { p: queries })) : [];
}

/** Admins: pairs of spots, and of areas, that look alike. */
export async function fetchDuplicatePairs() {
  const [places, areas] = await Promise.all([supabase.rpc('duplicate_places'), supabase.rpc('duplicate_areas')]);
  return { places: unwrap(places), areas: unwrap(areas) };
}

// ---------------------------------------------------------------- imports

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
  const files = unwrap(await supabase.from('attachments').select('storage_path, private')
    .eq('created_by', userId).not('storage_path', 'is', null));
  const photos = unwrap(await supabase.from('photos').select('place_id, storage_path, thumb_path').eq('created_by', userId));
  await removeFiles(BUCKET, files.filter(f => !f.private).map(f => f.storage_path!));
  await removeFiles(PRIVATE_BUCKET, files.filter(f => f.private).map(f => f.storage_path!));
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

// ---------------------------------------------------------------- tips

/** Tips of a spot and of its sector (or only a sector's), newest first. */
export async function fetchTips(owner: { placeId?: number; sectorId?: number | null }): Promise<Tip[]> {
  const ors = [
    owner.placeId != null ? `place_id.eq.${owner.placeId}` : null,
    owner.sectorId != null ? `sector_id.eq.${owner.sectorId}` : null,
  ].filter(Boolean);
  if (!ors.length) return [];
  const rows = unwrap(await supabase.from('spot_comments')
    .select('id, place_id, sector_id, user_id, body, topic, observed_on, created_at, updated_at, profile:profiles (username)')
    .or(ors.join(','))
    .order('created_at', { ascending: false }));
  return rows.map(({ profile, ...t }) => ({ ...t, topic: t.topic as Tip['topic'], username: profile?.username ?? null }));
}

export async function addTip(owner: { placeId: number } | { sectorId: number }, tip: TipInput): Promise<void> {
  unwrap(await supabase.from('spot_comments').insert({
    ...('placeId' in owner ? { place_id: owner.placeId } : { sector_id: owner.sectorId }),
    body: tip.body.trim(), topic: tip.topic, observed_on: tip.observed_on || null,
  }));
}

export async function updateTip(id: number, tip: TipInput): Promise<void> {
  const rows = unwrap(await supabase.from('spot_comments')
    .update({ body: tip.body.trim(), topic: tip.topic, observed_on: tip.observed_on || null })
    .eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantEditTip);
}

export async function deleteTip(id: number): Promise<void> {
  const rows = unwrap(await supabase.from('spot_comments').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error(tr().common.errors.cantDeleteTip);
}
