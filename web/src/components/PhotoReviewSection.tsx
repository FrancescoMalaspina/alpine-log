import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/labels';
import { fetchPendingPhotos, reviewPhoto, type PendingPhoto } from '../lib/photos';
import { ErrorText } from './Modal';

type Props = {
  onOpenPlace: (placeId: number) => void;
  /** After a verdict, so the spot's photos reload. */
  onChanged: () => void;
};

/** Admins: photos people added to spots they can't edit, or moved there from a visit, to approve or reject. */
export function PhotoReviewSection({ onOpenPlace, onChanged }: Props) {
  const { t } = useI18n();
  const s = t.spot.photoReview;
  const [pending, setPending] = useState<PendingPhoto[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPendingPhotos()
      .then(p => { if (!cancelled) setPending(p); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  async function review(photo: PendingPhoto, approve: boolean) {
    setBusy(photo.id);
    setError(null);
    try {
      await reviewPhoto(photo.id, approve);
      setPending(list => list?.filter(x => x.id !== photo.id) ?? null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="suggestions-section" aria-labelledby="photoReviewTitle">
      <h3 id="photoReviewTitle" className="section-title">
        {s.title} {pending && <span className="tab-count">{pending.length}</span>}
      </h3>
      <p className="hint-block">{s.hint}</p>
      <ErrorText error={error} />
      {pending?.length === 0 && <p className="hint">{s.none}</p>}
      {pending && pending.length > 0 && (
        <ul className="photo-review-list">
          {pending.map(p => (
            <li key={p.id} className="suggestion-card photo-review">
              <a href={p.url} target="_blank" rel="noreferrer" className="photo-thumb">
                <img src={p.thumbUrl} alt={p.caption ?? ''} loading="lazy" width={160} height={120} />
              </a>
              <div className="photo-review-about">
                <button type="button" className="link-btn suggestion-spot" onClick={() => onOpenPlace(p.place_id)}>{p.place_name}</button>
                <span className="hint">{s.by(p.username ?? '?', p.from_visit)}</span>
                {p.caption && <span>{p.caption}</span>}
                <div className="suggestion-actions">
                  <button type="button" className="btn btn-ghost" disabled={busy === p.id} onClick={() => review(p, false)}>{s.reject}</button>
                  <button type="button" className="btn btn-primary" disabled={busy === p.id} onClick={() => review(p, true)}>{s.approve}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
