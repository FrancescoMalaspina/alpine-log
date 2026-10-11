import { useState } from 'react';
import { deleteArea, updateArea } from '../lib/api';
import { errorMessage, plural, typesLabel } from '../lib/labels';
import type { Area, Place } from '../lib/types';
import { ActivityBadge } from './ActivityBadge';
import { Attachments } from './Attachments';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';

type Props = {
  area: Area;
  places: Place[];
  userId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onShowOnMap: () => void;
  onOpenPlace: (place: Place) => void;
  onChanged: () => void;
  onDeleted: () => void;
};

export function AreaView({ area, places, userId, isAdmin, onClose, onShowOnMap, onOpenPlace, onChanged, onDeleted }: Props) {
  const canEdit = !!userId && (isAdmin || area.created_by === userId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  const [description, setDescription] = useState(area.description ?? '');
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm(`Delete the area "${area.name}"? Its ${plural(places.length, 'place')} stay, just without an area.`)) return;
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
      meta={<span className="meta-item">Macroarea with {plural(places.length, 'place')}</span>}
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

      <h3 className="section-title">Places</h3>
      <div className="area-places">
        {places.map(p => (
          <button key={p.id} type="button" className="area-place" onClick={() => onOpenPlace(p)}>
            <span className="row-title"><ActivityBadge types={p.types} />{p.name}</span>
            <span className="row-meta">{[typesLabel(p.types), p.grade].filter(Boolean).join(', ')}</span>
          </button>
        ))}
        {!places.length && <div className="empty">No places in this area yet. Pick it in a place's form.</div>}
      </div>

      <Attachments owner={{ areaId: area.id }} userId={userId} isAdmin={isAdmin} />
    </Drawer>
  );
}
