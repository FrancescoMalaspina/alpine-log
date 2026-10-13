/*
 * Photos are shrunk in the browser before upload: a display copy (longest
 * side 2048 px) and a thumbnail (480 px), both JPEG. That keeps a phone
 * photo around 300–500 KB instead of 3–8 MB, and re-encoding drops EXIF
 * metadata such as GPS position.
 *
 * Place photos live in the public "place-photos" bucket. Visit photos live
 * in the private "visit-photos" bucket and are shown through signed URLs,
 * so they're only visible to whoever can see the visit.
 */
import { tr } from '../i18n';
import { supabase } from './supabase';

export type PhotoOwner = { placeId: number } | { visitId: number };

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
};

const bucketOf = (owner: PhotoOwner) => ('placeId' in owner ? 'place-photos' : 'visit-photos');
const SIGNED_URL_SECONDS = 60 * 60;

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
  const folder = 'placeId' in owner ? `place-${owner.placeId}` : `visit-${owner.visitId}`;
  const base = `${userId}/${folder}/${crypto.randomUUID()}`;
  const paths = { full: `${base}.jpg`, thumb: `${base}.thumb.jpg` };

  for (const [path, blob] of [[paths.full, full.blob], [paths.thumb, thumb.blob]] as const) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' });
    if (error) {
      await supabase.storage.from(bucket).remove([paths.full, paths.thumb]);
      throw new Error(error.message);
    }
  }
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

export async function fetchPhotos(owner: PhotoOwner): Promise<Photo[]> {
  let q = supabase
    .from('photos')
    .select('id, created_by, caption, width, height, storage_path, thumb_path, profile:profiles (username)')
    .order('created_at');
  q = 'placeId' in owner ? q.eq('place_id', owner.placeId) : q.eq('visit_id', owner.visitId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (!data.length) return [];

  const bucket = supabase.storage.from(bucketOf(owner));
  let urlOf: (path: string) => string;
  if ('placeId' in owner) {
    urlOf = path => bucket.getPublicUrl(path).data.publicUrl;
  } else {
    const paths = data.flatMap(p => [p.storage_path, p.thumb_path]);
    const { data: signed, error: signError } = await bucket.createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (signError) throw new Error(signError.message);
    const byPath = new Map(signed.map(s => [s.path, s.signedUrl]));
    urlOf = path => byPath.get(path) ?? '';
  }
  return data.map(({ profile, ...p }) => ({
    ...p,
    username: profile?.username ?? null,
    url: urlOf(p.storage_path),
    thumbUrl: urlOf(p.thumb_path),
  }));
}

export async function deletePhoto(owner: PhotoOwner, photo: Photo): Promise<void> {
  const { data, error } = await supabase.from('photos').delete().eq('id', photo.id).select('id');
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error(tr().common.errors.cantDeletePhoto);
  await supabase.storage.from(bucketOf(owner)).remove([photo.storage_path, photo.thumb_path]);
}
