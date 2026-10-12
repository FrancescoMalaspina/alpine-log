import { useMemo, useState } from 'react';
import { reopenWish } from '../lib/api';
import { PRIORITY_LABELS, errorMessage, formatDate, seasonLabel } from '../lib/labels';
import type { Place, Wish } from '../lib/types';
import { ErrorText } from './Modal';
import { VisibilityPill } from './Sidebar';

export type WishlistActions = {
  onEditWish: (place: Place, wish: Wish) => void;
  onLogVisit: (place: Place) => void;
  onOpenPlace: (place: Place) => void;
  onOpenVisit: (place: Place, visitId: number) => void;
  onWishesChanged: () => void;
};

type Props = WishlistActions & {
  wishes: Wish[];
  placeById: Map<number, Place>;
};

/** Places you want to go to, by priority; resolved ones under "Done". */
export function WishlistSection({ wishes, placeById, ...actions }: Props) {
  const [error, setError] = useState<string | null>(null);

  // Wishes whose place still exists, open ones by priority then name.
  const [open, done] = useMemo(() => {
    const withPlace = wishes.filter(w => placeById.has(w.place_id));
    const byName = (a: Wish, b: Wish) => placeById.get(a.place_id)!.name.localeCompare(placeById.get(b.place_id)!.name);
    return [
      withPlace.filter(w => !w.done_at).sort((a, b) => a.priority - b.priority || byName(a, b)),
      withPlace.filter(w => w.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!)),
    ];
  }, [wishes, placeById]);

  async function reopen(w: Wish) {
    setError(null);
    try {
      await reopenWish(w.id);
      actions.onWishesChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="account-section">
      <h3 className="section-title">Wishlist</h3>
      <ErrorText error={error} />
      {!open.length && (
        <p className="hint-block">
          Places you want to go to. Open a spot and choose <strong>Add to wishlist</strong>; logging a visit there ticks it off.
        </p>
      )}
      {open.length > 0 && (
        <ul className="wish-list">
          {open.map(w => {
            const place = placeById.get(w.place_id)!;
            return (
              <li key={w.id} className="wish-row">
                <div className="wish-head">
                  <button type="button" className="wish-name link-btn" onClick={() => actions.onOpenPlace(place)}>{place.name}</button>
                  <span className={`wish-priority p${w.priority}`}>{PRIORITY_LABELS[w.priority]}</span>
                  <VisibilityPill visibility={w.visibility} />
                </div>
                <div className="wish-facts hint">
                  {[place.area?.name, w.seasons.map(seasonLabel).join(', '), w.with_people.length ? `with ${w.with_people.join(', ')}` : '']
                    .filter(Boolean).join(' · ')}
                </div>
                {w.notes && <p className="wish-notes">{w.notes}</p>}
                <div className="wish-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => actions.onEditWish(place, w)}>Edit</button>
                  <button type="button" className="btn btn-ghost" onClick={() => actions.onLogVisit(place)}>Log visit</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && (
        <details className="downloads-panel">
          <summary className="section-title">Done ({done.length})</summary>
          <ul className="wish-list">
            {done.map(w => {
              const place = placeById.get(w.place_id)!;
              return (
                <li key={w.id} className="wish-row done">
                  <div className="wish-head">
                    <span className="wish-name">{place.name}</span>
                    {w.done_visit_id && w.done_visit
                      ? <button type="button" className="link-btn hint" onClick={() => actions.onOpenVisit(place, w.done_visit_id!)}>
                          visited {w.done_visit.date ? formatDate(w.done_visit.date) : ''}
                        </button>
                      : <span className="hint">done {formatDate(w.done_at!.slice(0, 10))}</span>}
                  </div>
                  <div className="wish-actions">
                    <button type="button" className="btn btn-quiet" onClick={() => reopen(w)}>Reopen</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
