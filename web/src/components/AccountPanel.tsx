import { useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { deleteUser, renameUser, reopenWish } from '../lib/api';
import { PRIORITY_LABELS, errorMessage, formatDate, seasonLabel } from '../lib/labels';
import type { Place, Wish } from '../lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';
import { UsersSection } from './UsersSection';
import { VisibilityPill } from './Sidebar';

type Props = {
  userId: string;
  wishes: Wish[];
  placeById: Map<number, Place>;
  onClose: () => void;
  onEditWish: (place: Place, wish: Wish) => void;
  onLogVisit: (place: Place) => void;
  onOpenPlace: (place: Place) => void;
  onOpenVisit: (place: Place, visitId: number) => void;
  onWishesChanged: () => void;
  onDeleted: () => void;
};

/** Your profile, your wishlist, and (for admins) everyone's accounts. */
export function AccountPanel(props: Props) {
  const { userId, wishes, placeById } = props;
  const { session, profile, isAdmin, refreshProfile } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ busy: boolean; error: string | null; saved: boolean }>(
    { busy: false, error: null, saved: false });
  const [deleting, setDeleting] = useState(false);
  const [wishError, setWishError] = useState<string | null>(null);

  const name = username ?? profile?.username ?? '';
  const changed = !!profile && name.trim() !== profile.username;

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    setRenameState({ busy: true, error: null, saved: false });
    try {
      await renameUser(userId, name);
      refreshProfile();
      setUsername(null);
      setRenameState({ busy: false, error: null, saved: true });
    } catch (err) {
      setRenameState({ busy: false, error: errorMessage(err), saved: false });
    }
  }

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
    setWishError(null);
    try {
      await reopenWish(w.id);
      props.onWishesChanged();
    } catch (err) {
      setWishError(errorMessage(err));
    }
  }

  return (
    <Drawer title="Account" meta={profile && <span className="meta-item">{profile.username}</span>} onClose={props.onClose}>
      <section className="account-section">
        <h3 className="section-title">Profile</h3>
        <form className="account-profile" onSubmit={rename}>
          <div className="field">
            <label htmlFor="accountEmail">Email</label>
            <input id="accountEmail" value={session?.user.email ?? ''} readOnly />
          </div>
          <div className="field">
            <label htmlFor="accountUsername">Username</label>
            <div className="field-inline">
              <input id="accountUsername" value={name} autoComplete="username"
                     onChange={e => { setUsername(e.target.value); setRenameState(s => ({ ...s, saved: false })); }} />
              <button type="submit" className="btn btn-primary" disabled={!changed || renameState.busy}>Save</button>
            </div>
            {renameState.saved && <span className="hint-block" role="status">Username saved.</span>}
          </div>
          <ErrorText error={renameState.error} />
        </form>
      </section>

      <section className="account-section">
        <h3 className="section-title">Wishlist</h3>
        <ErrorText error={wishError} />
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
                    <button type="button" className="wish-name link-btn" onClick={() => props.onOpenPlace(place)}>{place.name}</button>
                    <span className={`wish-priority p${w.priority}`}>{PRIORITY_LABELS[w.priority]}</span>
                    <VisibilityPill visibility={w.visibility} />
                  </div>
                  <div className="wish-facts hint">
                    {[place.area?.name, w.seasons.map(seasonLabel).join(', '), w.with_people.length ? `with ${w.with_people.join(', ')}` : '']
                      .filter(Boolean).join(' · ')}
                  </div>
                  {w.notes && <p className="wish-notes">{w.notes}</p>}
                  <div className="wish-actions">
                    <button type="button" className="btn btn-quiet" onClick={() => props.onEditWish(place, w)}>Edit</button>
                    <button type="button" className="btn btn-ghost" onClick={() => props.onLogVisit(place)}>Log visit</button>
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
                        ? <button type="button" className="link-btn hint" onClick={() => props.onOpenVisit(place, w.done_visit_id!)}>
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

      {isAdmin && <UsersSection myId={userId} />}

      <section className="account-section danger-zone">
        <h3 className="section-title">Delete account</h3>
        <p className="hint-block">
          Deletes your visits, photos, attachments, imports and wishlist. Spots, areas and routes you added stay for everyone.
        </p>
        <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>Delete my account…</button>
      </section>

      {deleting && profile && (
        <ConfirmDialog
          title="Delete your account?"
          message={<>
            <p>Your visits, photos, attachments, imports and wishlist are deleted for good, and you can no longer sign in
              as <strong>{session?.user.email}</strong>.</p>
            <p>Spots, areas and routes you added stay on the map, without an owner.</p>
          </>}
          confirmLabel="Delete my account"
          danger
          requireText={profile.username}
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteUser(userId);
            props.onDeleted();
          }}
        />
      )}
    </Drawer>
  );
}
