import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../hooks/useConfirm';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/labels';
import { deletePhoto, fetchPhotos, movePhotoToSpot, updatePhotoCaption, uploadPhoto, type Photo, type PhotoOwner } from '../lib/photos';
import { ErrorText } from './Modal';

type Props = {
  owner: PhotoOwner;
  userId: string | null;
  isAdmin: boolean;
  /** Whether this user may add photos here (any signed-in user for places, the owner for visits). */
  canAdd: boolean;
  emptyText: string;
  /** The spot the photos are on, or the visits are at: whether you may edit it decides if your photos there wait for review. */
  spot: { id: number; name: string; canEdit: boolean };
};

/** Thumbnail grid with an add button and a full-screen viewer. */
export function PhotoGallery({ owner, userId, isAdmin, canAdd, emptyText, spot }: Props) {
  const { t } = useI18n();
  const s = t.spot.photos;
  const [confirm, confirmDialog] = useConfirm();
  const [notice, setNotice] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ownerKey = JSON.stringify(owner);

  useEffect(() => {
    let cancelled = false;
    fetchPhotos(JSON.parse(ownerKey))
      .then(p => { if (!cancelled) setPhotos(p); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [ownerKey, reloadKey]);

  async function add(files: FileList | null) {
    if (!files?.length || !userId) return;
    setError(null);
    setNotice('placeId' in owner && !spot.canEdit ? s.sentForReview : null);
    const list = [...files];
    try {
      for (const [i, f] of list.entries()) {
        setProgress(list.length > 1 ? s.uploadingOf(i + 1, list.length) : s.uploading);
        await uploadPhoto(owner, userId, f);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
      setReloadKey(k => k + 1);
    }
  }

  const remove = useCallback(async (photo: Photo) => {
    setOpen(null);
    if (!await confirm({ title: s.confirmDelete, confirmLabel: t.common.delete, danger: true })) return;
    try {
      await deletePhoto(owner, photo);
      setReloadKey(k => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [owner, s, t, confirm]);

  // A visit photo goes to the spot for good; on a spot you can't edit, once an admin agrees.
  const move = useCallback(async (photo: Photo) => {
    if (!userId) return;
    setOpen(null);
    if (!await confirm({
      title: s.moveTitle(spot.name),
      message: spot.canEdit ? s.moveNow : s.moveReview,
      confirmLabel: s.move,
    })) return;
    setError(null);
    try {
      const pending = await movePhotoToSpot(photo, spot.id, userId);
      setNotice(pending ? s.movePending : s.moved);
      setReloadKey(k => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [userId, spot, s, confirm]);
  const canMove = useCallback(
    (p: Photo) => 'visitId' in owner && p.created_by === userId && !p.moving, [owner, userId]);

  const caption = useCallback(async (photo: Photo, text: string) => {
    try {
      await updatePhotoCaption(photo.id, text);
      setReloadKey(k => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  return (
    <div className="photos">
      {photos && photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="photo-thumb" onClick={() => setOpen(i)} aria-label={p.caption ?? s.photoN(i + 1)}>
                <img src={p.thumbUrl} alt={p.caption ?? ''} loading="lazy" width={160} height={120} />
              </button>
              {(p.pending || p.moving) && <span className="photo-badge">{p.pending ? s.waitingReview : s.onItsWay}</span>}
              {p.caption && <span className="photo-caption">{p.caption}</span>}
            </li>
          ))}
        </ul>
      )}
      {photos && !photos.length && <div className="empty">{emptyText}</div>}
      {canAdd && userId && (
        <label className={`btn btn-ghost add-photos${progress ? ' busy' : ''}`}>
          <input ref={input} type="file" accept="image/*" multiple disabled={!!progress}
                 onChange={e => add(e.target.files)} />
          {progress ?? s.addPhotos}
        </label>
      )}
      {notice && <p className="hint" role="status">{notice}</p>}
      <ErrorText error={error} />
      {open != null && photos?.[open] && (
        <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)}
                  canDelete={p => p.created_by === userId || isAdmin} onDelete={remove}
                  canEdit={p => p.created_by === userId} onCaption={caption}
                  canMove={canMove} onMove={move} />
      )}
      {confirmDialog}
    </div>
  );
}

function Lightbox({ photos, index, onIndex, onClose, canDelete, onDelete, canEdit, onCaption, canMove, onMove }: {
  photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void;
  canDelete: (p: Photo) => boolean; onDelete: (p: Photo) => void;
  canEdit: (p: Photo) => boolean; onCaption: (p: Photo, caption: string) => void;
  canMove: (p: Photo) => boolean; onMove: (p: Photo) => void;
}) {
  const { t } = useI18n();
  const s = t.spot.photos;
  const photo = photos[index];
  const many = photos.length > 1;
  const step = useCallback((d: number) => onIndex((index + d + photos.length) % photos.length), [index, photos.length, onIndex]);
  const closeBtn = useRef<HTMLButtonElement>(null);
  // The caption being written, for the photo it belongs to.
  const [draft, setDraft] = useState<{ id: number; text: string } | null>(null);
  const editing = draft?.id === photo.id ? draft.text : null;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Typing a caption: Escape stops writing it, arrows move in the text.
      if ((e.target as HTMLElement).tagName === 'INPUT') {
        if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); }
        return;
      }
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); opener?.focus?.(); };
  }, [onClose, step]);

  // Portalled to <body>: inside the side panel it would sit under the header and map controls.
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={s.photo}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <img src={photo.url} alt={photo.caption ?? ''} width={photo.width ?? undefined} height={photo.height ?? undefined} />
      <div className="lightbox-bar">
        <span className="lightbox-info">
          {many && <span className="num">{index + 1} / {photos.length}</span>}
          {editing == null && photo.caption && <span>{photo.caption}</span>}
          {photo.username && <span>{s.by(photo.username)}</span>}
        </span>
        {editing != null ? (
          <form className="lightbox-caption" onSubmit={e => { e.preventDefault(); onCaption(photo, editing); setDraft(null); }}>
            <input value={editing} autoFocus maxLength={500} aria-label={s.caption}
                   onChange={e => setDraft({ id: photo.id, text: e.target.value })} />
            <button type="submit">{t.common.save}</button>
          </form>
        ) : canEdit(photo) && (
          <button type="button" onClick={() => setDraft({ id: photo.id, text: photo.caption ?? '' })}>
            {photo.caption ? s.editCaption : s.addCaption}
          </button>
        )}
        {canMove(photo) && <button type="button" onClick={() => onMove(photo)}>{s.moveToSpot}</button>}
        {canDelete(photo) && <button type="button" onClick={() => onDelete(photo)}>{t.common.delete}</button>}
        <button ref={closeBtn} type="button" onClick={onClose}>{t.common.close}</button>
      </div>
      {many && <>
        <button type="button" className="lightbox-nav prev" aria-label={s.previous} onClick={() => step(-1)}>‹</button>
        <button type="button" className="lightbox-nav next" aria-label={s.next} onClick={() => step(1)}>›</button>
      </>}
    </div>,
    document.body,
  );
}
