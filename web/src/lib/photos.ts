/*
 * Photos are shrunk in the browser before upload: a display copy (longest
 * side 2048 px) and a thumbnail (480 px), both JPEG. That keeps a phone
 * photo around 300–500 KB instead of 3–8 MB, and re-encoding drops EXIF
 * metadata such as GPS position.
 *
 * Place photos live in the public "place-photos" bucket. Visit photos live
 * in the private "visit-photos" bucket and are shown through signed URLs,
 * so they're only visible to whoever can see the visit. A visit in a shared
 * day shows the photos of every visit of the day you can see.
 *
 * A photo on a spot you may not edit waits for an admin (pending). A visit
 * photo can move to its spot: its files are copied into place-photos, and
 * the database decides the rest (supabase/migrations/20261027100000_photo_review.sql).
 * Files of photos the database drops are left for their uploader's browser
 * to remove (removeLeftoverPhotoFiles).
 */
import { tr } from '../i18n';
import { supabase } from './supabase';

/** Photos go on a spot or a visit; a visit's outingId lists those of its whole shared day. */
export type PhotoOwner = { placeId: number } | { visitId: number; outingId?: number | null };

export type Photo = {
  id: number;
  created_by: string;
  username: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  storage_path: string;
  thumb_path: string;
  url: string;
  thumbUrl: string;
  /** A spot photo waiting for an admin; only its uploader and admins see it. */
  pending: boolean;
  /** A visit photo whose copy waits on the spot. */
  moving: boolean;
};

/** A spot photo waiting for an admin, as the admins' list shows it. */
export type PendingPhoto = {
  id: number;
  place_id: number;
  place_name: string;
  username: string | null;
  caption: string | null;
  url: string;
  thumbUrl: string;
  /** Moved from a visit, rather than added to the spot. */
  from_visit: boolean;
};

const VISIT_BUCKET = 'visit-photos';
const PLACE_BUCKET = 'place-photos';
const bucketOf = (owner: PhotoOwner) => ('placeId' in owner ? PLACE_BUCKET : VISIT_BUCKET);
const publicUrl = (path: string) => supabase.storage.from(PLACE_BUCKET).getPublicUrl(path).data.publicUrl;

/** Where a new photo's two files go: the uploader's folder, then the spot's or visit's. */
function newPhotoPaths(owner: PhotoOwner, userId: string) {
  const folder = 'placeId' in owner ? `place-${owner.placeId}` : `visit-${owner.visitId}`;
  const base = `${userId}/${folder}/${crypto.randomUUID()}`;
  return { full: `${base}.jpg`, thumb: `${base}.thumb.jpg` };
}

/** Puts a photo's two files in a bucket; on failure none stays. */
async function uploadFiles(bucket: string, paths: { full: string; thumb: string }, full: Blob, thumb: Blob) {
  for (const [path, blob] of [[paths.full, full], [paths.thumb, thumb]] as const) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' });
    if (error) {
      await supabase.storage.from(bucket).remove([paths.full, paths.thumb]);
      throw new Error(error.message);
    }
  }
}
const SIGNED_URL_SECONDS = 60 * 60;

// Signed URLs already made, reused while they have a while left: a new URL for
// the same photo would make the browser download it again.
const signedUrls = new Map<string, { url: string; until: number }>();
const REUSE_MARGIN_MS = 5 * 60 * 1000;

/** URLs of private visit photo files, by path. */
async function signedUrlsFor(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const missing = paths.filter(p => (signedUrls.get(p)?.until ?? 0) < now + REUSE_MARGIN_MS);
  if (missing.length) {
    const { data, error } = await supabase.storage.from(VISIT_BUCKET).createSignedUrls(missing, SIGNED_URL_SECONDS);
    if (error) throw new Error(error.message);
    for (const s of data) if (s.path && s.signedUrl) signedUrls.set(s.path, { url: s.signedUrl, until: now + SIGNED_URL_SECONDS * 1000 });
  }
  return new Map(paths.map(p => [p, signedUrls.get(p)?.url ?? '']));
}

async function shrink(file: File, maxSide: number, quality: number) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(tr().common.errors.photoUnreadable(file.name));
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not prepare the photo.'))), 'image/jpeg', quality));
  return { blob, width, height };
}

export async function uploadPhoto(owner: PhotoOwner, userId: string, file: File, caption = ''): Promise<void> {
  const [full, thumb] = await Promise.all([shrink(file, 2048, 0.82), shrink(file, 480, 0.75)]);
  const bucket = bucketOf(owner);
  const paths = newPhotoPaths(owner, userId);
  await uploadFiles(bucket, paths, full.blob, thumb.blob);
  const { error } = await supabase.from('photos').insert({
    ...('placeId' in owner ? { place_id: owner.placeId } : { visit_id: owner.visitId }),
    storage_path: paths.full,
    thumb_path: paths.thumb,
    width: full.width,
    height: full.height,
    size_bytes: full.blob.size + thumb.blob.size,
    caption: caption.trim() || null,
  });
  if (error) {
    await supabase.storage.from(bucket).remove([paths.full, paths.thumb]);
    throw new Error(error.message);
  }
}

/** The visit, or every visit of its shared day you can see. */
async function visitsOf(owner: { visitId: number; outingId?: number | null }): Promise<number[]> {
  if (!owner.outingId) return [owner.visitId];
  const { data, error } = await supabase.from('visits').select('id').eq('outing_id', owner.outingId);
  if (error) throw new Error(error.message);
  return data.map(v => v.id);
}

export async function fetchPhotos(owner: PhotoOwner): Promise<Photo[]> {
  let q = supabase
    .from('photos')
    .select('id, created_by, caption, width, height, storage_path, thumb_path, pending, profile:profiles (username)')
    .order('created_at');
  q = 'placeId' in owner ? q.eq('place_id', owner.placeId) : q.in('visit_id', await visitsOf(owner));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (!data.length) return [];

  let urlOf: (path: string) => string;
  // Visit photos whose copy waits on the spot (you see only your own copies).
  let moving = new Set<number>();
  if ('placeId' in owner) {
    urlOf = publicUrl;
  } else {
    const byPath = await signedUrlsFor(data.flatMap(p => [p.storage_path, p.thumb_path]));
    urlOf = path => byPath.get(path) ?? '';
    const copies = await supabase.from('photos').select('moved_from').in('moved_from', data.map(p => p.id));
    if (copies.error) throw new Error(copies.error.message);
    moving = new Set(copies.data.map(c => c.moved_from!));
  }
  return data.map(({ profile, ...p }) => ({
    ...p,
    username: profile?.username ?? null,
    url: urlOf(p.storage_path),
    thumbUrl: urlOf(p.thumb_path),
    moving: moving.has(p.id),
  }));
}

/**
 * Moves a photo of your visit to the visit's spot: its files are copied there
 * and the database adds it. Returns true when it waits for an admin (the
 * photo stays in the visit until then), false when it is on the spot already.
 */
export async function movePhotoToSpot(photo: Photo, placeId: number, userId: string): Promise<boolean> {
  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from(VISIT_BUCKET).download(path);
    if (error) throw new Error(error.message);
    return data;
  };
  const [full, thumb] = await Promise.all([download(photo.storage_path), download(photo.thumb_path)]);
  const paths = newPhotoPaths({ placeId }, userId);
  await uploadFiles(PLACE_BUCKET, paths, full, thumb);
  const { data: pending, error } = await supabase.rpc('move_photo_to_spot', {
    p_photo_id: photo.id, p_path: paths.full, p_thumb_path: paths.thumb,
  });
  if (error) {
    await supabase.storage.from(PLACE_BUCKET).remove([paths.full, paths.thumb]);
    throw new Error(error.message);
  }
  if (!pending) await removeLeftoverPhotoFiles();
  return pending;
}

/** Removes the files of your photos the database dropped (moved, or turned down by an admin). */
export async function removeLeftoverPhotoFiles(): Promise<void> {
  const { data, error } = await supabase.from('leftover_photo_files').select('bucket, path');
  if (error) throw new Error(error.message);
  for (const bucket of [PLACE_BUCKET, VISIT_BUCKET]) {
    const paths = data.filter(f => f.bucket === bucket).map(f => f.path);
    if (!paths.length) continue;
    const removed = await supabase.storage.from(bucket).remove(paths);
    if (removed.error) throw new Error(removed.error.message);
    const forgot = await supabase.from('leftover_photo_files').delete().eq('bucket', bucket).in('path', paths);
    if (forgot.error) throw new Error(forgot.error.message);
  }
}

/** Spot photos waiting for an admin, oldest first (admins only). */
export async function fetchPendingPhotos(): Promise<PendingPhoto[]> {
  const { data, error } = await supabase.rpc('pending_photos');
  if (error) throw new Error(error.message);
  return data.map(p => ({
    id: p.id, place_id: p.place_id, place_name: p.place_name, username: p.username, caption: p.caption,
    from_visit: p.from_visit, url: publicUrl(p.storage_path), thumbUrl: publicUrl(p.thumb_path),
  }));
}

/** How many spot photos wait for an admin (admins see them all). */
export async function countPendingPhotos(): Promise<number> {
  const { count, error } = await supabase.from('photos').select('id', { count: 'exact', head: true }).eq('pending', true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** An admin's verdict on a spot photo waiting for review. */
export async function reviewPhoto(id: number, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc(approve ? 'approve_photo' : 'reject_photo', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Changes the caption of a photo you added (empty: none). */
export async function updatePhotoCaption(id: number, caption: string): Promise<void> {
  const { data, error } = await supabase.from('photos').update({ caption: caption.trim() || null }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error(tr().common.errors.cantEditPhoto);
}

export async function deletePhoto(owner: PhotoOwner, photo: Photo): Promise<void> {
  const { data, error } = await supabase.from('photos').delete().eq('id', photo.id).select('id');
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error(tr().common.errors.cantDeletePhoto);
  await supabase.storage.from(bucketOf(owner)).remove([photo.storage_path, photo.thumb_path]);
}
