import { useMemo, useState } from 'react';
import { deleteArea, setPlacesArea, updateArea } from '../lib/api';
import { activityLabel, errorMessage, plural } from '../lib/labels';
import type { Area, Place } from '../lib/types';
import { ActivityBadge } from './ActivityBadge';
import { Attachments } from './Attachments';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';

type Props = {
  area: Area;
  places: Place[];
  /** Every spot, to pick the ones to add. */
  allPlaces: Place[];
  canEditPlace: (place: Place) => boolean;
  userId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onShowOnMap: () => void;
  onOpenPlace: (place: Place) => void;
  onChanged: () => void;
  onDeleted: () => void;
};

export function AreaView({ area, places, allPlaces, canEditPlace, userId, isAdmin, onClose, onShowOnMap, onOpenPlace, onChanged, onDeleted }: Props) {
  const canEdit = !!userId && (isAdmin || area.created_by === userId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  const [description, setDescription] = useState(area.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function removePlace(p: Place) {
    if (!confirm(`Take "${p.name}" out of ${area.name}? The spot itself stays.`)) return;
    setError(null);
    try {
      if (!(await setPlacesArea([p.id], null))) throw new Error(`You can't change "${p.name}": only its creator or an admin can.`);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError('An area needs a name.');
    try {
      await updateArea(area.id, { name, description });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!confirm(`Delete the area "${area.name}"? Its ${plural(places.length, 'spot')} stay, just without an area.`)) return;
    try {
      await deleteArea(area.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Drawer
      title={area.name}
      meta={<span className="meta-item">Area with {plural(places.length, 'spot')}</span>}
      onClose={onClose}
      footer={<>
        {canEdit && !editing && <button className="btn btn-danger" type="button" onClick={remove}>Delete area</button>}
        {canEdit && !editing && <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>Edit</button>}
        <button className="btn btn-ghost" type="button" disabled={!places.length} onClick={onShowOnMap}>Show on map</button>
      </>}
    >
      {editing ? (
        <div className="area-edit">
          <div className="field"><label htmlFor="areaName">Name</label>
            <input id="areaName" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="areaDescription">Description</label>
            <textarea id="areaDescription" value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div className="area-edit-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-add" type="button" onClick={save}>Save</button>
          </div>
        </div>
      ) : area.description && <p className="place-description">{area.description}</p>}
      <ErrorText error={error} />

      <h3 className="section-title">Spots</h3>
      <div className="area-places">
        {places.map(p => (
          <div key={p.id} className="area-place-row">
            <button type="button" className="area-place" onClick={() => onOpenPlace(p)}>
              <span className="row-title"><ActivityBadge activity={p.activity} />{p.name}</span>
              <span className="row-meta">{[activityLabel(p.activity), p.grade].filter(Boolean).join(', ')}</span>
            </button>
            {canEditPlace(p) && (
              <button type="button" className="link-btn remove-place" onClick={() => removePlace(p)}
                      aria-label={`Remove ${p.name} from ${area.name}`}>Remove</button>
            )}
          </div>
        ))}
        {!places.length && !adding && <div className="empty">No spots in this area yet.</div>}
      </div>
      {userId && (adding
        ? <AddPlaces area={area} allPlaces={allPlaces} canEditPlace={canEditPlace}
                     onDone={changed => { setAdding(false); if (changed) onChanged(); }} />
        : <button type="button" className="btn btn-ghost add-places-btn" onClick={() => setAdding(true)}>Add spots</button>)}

      <Attachments owner={{ areaId: area.id }} userId={userId} isAdmin={isAdmin} />
    </Drawer>
  );
}

/** Checklist of spots outside this area; the ones you may edit can be moved in. */
function AddPlaces({ area, allPlaces, canEditPlace, onDone }: {
  area: Area; allPlaces: Place[]; canEditPlace: (p: Place) => boolean; onDone: (changed: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPlaces
      .filter(p => p.area_id !== area.id)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.area?.name.toLowerCase().includes(q))
      // Spots without an area first: they're the likely ones to add.
      .sort((a, b) => Number(!!a.area) - Number(!!b.area) || a.name.localeCompare(b.name));
  }, [allPlaces, area.id, query]);

  const toggle = (id: number) => setPicked(ps => (ps.includes(id) ? ps.filter(x => x !== id) : [...ps, id]));

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const changed = await setPlacesArea(picked, area.id);
      if (changed < picked.length) {
        setError(`Only ${changed} of ${picked.length} could be moved: you can only change spots you created.`);
        setBusy(false);
        return;
      }
      onDone(true);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="add-places">
      <input type="search" placeholder="Find a spot" aria-label="Find a spot" value={query}
             onChange={e => setQuery(e.target.value)} />
      <ul className="add-places-list">
        {candidates.map(p => {
          const editable = canEditPlace(p);
          return (
            <li key={p.id}>
              <label className={editable ? '' : 'disabled'}>
                <input type="checkbox" checked={picked.includes(p.id)} disabled={!editable} onChange={() => toggle(p.id)} />
                <ActivityBadge activity={p.activity} />
                <span className="add-places-name">{p.name}</span>
                <span className="add-places-meta">
                  {!editable ? 'added by someone else' : p.area ? `now in ${p.area.name}` : ''}
                </span>
              </label>
            </li>
          );
        })}
        {!candidates.length && <li className="empty">No other spots match.</li>}
      </ul>
      <ErrorText error={error} />
      <div className="area-edit-actions">
        <button className="btn btn-ghost" type="button" onClick={() => onDone(false)}>Cancel</button>
        <button className="btn btn-primary" type="button" disabled={!picked.length || busy} onClick={save}>
          {picked.length ? `Add ${plural(picked.length, 'spot')}` : 'Add spots'}
        </button>
      </div>
    </div>
  );
}
