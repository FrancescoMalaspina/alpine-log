import { useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { deleteWish, saveWish } from '../lib/api';
import { PRIORITY_LABELS, errorMessage, isTouchLayout, seasonLabel } from '../lib/labels';
import { SEASONS, type Partner, type Place, type Season, type Visibility, type Wish } from '../lib/types';
import { PeopleField } from './forms/PeopleField';
import { ErrorText, Modal } from './Modal';

type Props = {
  place: Place;
  /** The open wish to edit; a new one when omitted. */
  wish?: Wish;
  partners: Partner[];
  onClose: () => void;
  onSaved: (message: string) => void;
};

/** Adds a place to your wishlist, or edits / removes its open wish. */
export function WishModal({ place, wish, partners, onClose, onSaved }: Props) {
  const [priority, setPriority] = useState<Wish['priority']>(wish?.priority ?? 2);
  const [seasons, setSeasons] = useState<Season[]>(wish?.seasons ?? []);
  const [people, setPeople] = useState<string[]>(wish?.with_people ?? []);
  const [notes, setNotes] = useState(wish?.notes ?? '');
  const [visibility, setVisibility] = useState<Visibility>(wish?.visibility ?? 'private');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const toggleSeason = (s: Season) =>
    setSeasons(list => (list.includes(s) ? list.filter(x => x !== s) : SEASONS.filter(x => x === s || list.includes(x))));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await saveWish({ id: wish?.id, place_id: place.id, priority, seasons, with_people: people, notes, visibility });
      onSaved(wish ? 'Wishlist updated' : `${place.name} is on your wishlist`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!wish) return;
    if (!await confirm({ title: 'Remove from your wishlist?', message: place.name, confirmLabel: 'Remove', danger: true })) return;
    setBusy(true);
    try {
      await deleteWish(wish.id);
      onSaved(`${place.name} is off your wishlist`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return <>
    <Modal
      title={wish ? 'On your wishlist' : 'Add to wishlist'}
      subtitle={<>{place.name}{place.area && <> · {place.area.name}</>}</>}
      onClose={onClose}
      footer={<>
        {wish && <button className="btn btn-danger" type="button" onClick={remove} disabled={busy}>Remove</button>}
        <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="submit" form="wishForm" disabled={busy}>{wish ? 'Save' : 'Add to wishlist'}</button>
      </>}
    >
      <form id="wishForm" className="auth-form" onSubmit={save}>
        <div className="field">
          <span className="field-label">Priority</span>
          <div className="segmented" role="radiogroup" aria-label="Priority">
            {([1, 2, 3] as const).map(p => (
              <button key={p} type="button" role="radio" aria-checked={priority === p}
                      className={priority === p ? 'active' : ''} onClick={() => setPriority(p)}>
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Best season</span>
          <div className="chip-row">
            {SEASONS.map(s => (
              <label key={s} className="type-option small">
                <input type="checkbox" checked={seasons.includes(s)} onChange={() => toggleSeason(s)} />{seasonLabel(s)}
              </label>
            ))}
          </div>
        </div>
        <PeopleField label="Who you'd go with" partners={partners} value={people} onChange={setPeople} />
        <div className="field">
          <label htmlFor="wishNotes">Notes <span className="hint">(optional)</span></label>
          <textarea id="wishNotes" value={notes} placeholder="Which line, conditions to wait for, gear to bring…"
                    autoFocus={!wish && !isTouchLayout()} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <div className="segmented" role="radiogroup" aria-label="Who can see this wish">
            {(['private', 'public'] as const).map(vis => (
              <button key={vis} type="button" role="radio" aria-checked={visibility === vis}
                      className={visibility === vis ? 'active' : ''} onClick={() => setVisibility(vis)}>
                {vis === 'private' ? 'Private' : 'Public'}
              </button>
            ))}
          </div>
          <span className="hint-block">
            {visibility === 'private'
              ? 'Only you (and admins) can see this wish.'
              : 'Anyone can see that this place is on your wishlist, with these notes and names.'}
          </span>
        </div>
        <ErrorText error={error} />
      </form>
    </Modal>
    {confirmDialog}
  </>;
}
