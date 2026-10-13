import { useMemo, useState } from 'react';
import { deleteSector, setPlacesSector, updateSector } from '../lib/api';
import { useI18n } from '../i18n';
import { activityLabel, errorMessage } from '../lib/labels';
import type { Area, Place, Sector } from '../lib/types';
import { ActivityBadge } from './ActivityBadge';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';

type Props = {
  sector: Sector;
  areas: Area[];
  places: Place[];
  /** Every spot, to pick the ones of the same area to add. */
  allPlaces: Place[];
  canEditPlace: (place: Place) => boolean;
  userId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onShowOnMap: () => void;
  onOpenArea: (areaId: number) => void;
  onOpenPlace: (place: Place) => void;
  onChanged: () => void;
  onDeleted: () => void;
};

/** A sector: the crag, wall or mountain that groups spots inside an area. */
export function SectorView(props: Props) {
  const { sector, areas, places, userId, isAdmin, canEditPlace } = props;
  const { t } = useI18n();
  const s = t.spot.sectorView;
  const canEdit = !!userId && (isAdmin || sector.created_by === userId);
  const area = areas.find(a => a.id === sector.area_id) ?? null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sector.name);
  const [areaId, setAreaId] = useState(sector.area_id);
  const [description, setDescription] = useState(sector.description ?? '');
  const [altitude, setAltitude] = useState(sector.max_altitude?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function save() {
    setError(null);
    if (!name.trim()) return setError(s.needName);
    try {
      await updateSector(sector.id, {
        name, description, areaId, maxAltitude: altitude.trim() ? Math.round(Number(altitude)) : null,
      });
      setEditing(false);
      props.onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!confirm(s.confirmDelete(sector.name, places.length))) return;
    try {
      await deleteSector(sector.id);
      props.onDeleted();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removePlace(p: Place) {
    if (!confirm(s.confirmRemovePlace(p.name, sector.name))) return;
    setError(null);
    try {
      if (!(await setPlacesSector([p.id], null))) throw new Error(t.spot.areaView.cantChangePlace(p.name));
      props.onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Drawer
      title={sector.name}
      meta={<>
        {area && (
          <button type="button" className="meta-item link-btn" onClick={() => props.onOpenArea(area.id)}>
            {t.spot.placeView.inArea(area.name)}
          </button>
        )}
        <span className="meta-item">{s.meta(places.length)}</span>
        {sector.max_altitude != null && <span className="meta-item num">{sector.max_altitude} m</span>}
      </>}
      onClose={props.onClose}
      footer={<>
        {canEdit && !editing && <button className="btn btn-danger" type="button" onClick={remove}>{s.deleteSector}</button>}
        {canEdit && !editing && <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>{t.common.edit}</button>}
        <button className="btn btn-ghost" type="button" disabled={!places.length} onClick={props.onShowOnMap}>{t.spot.placeView.showOnMap}</button>
      </>}
    >
      {editing ? (
        <div className="area-edit">
          <div className="field"><label htmlFor="sectorName">{s.name}</label>
            <input id="sectorName" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="sectorArea">{s.area}</label>
            <select id="sectorArea" value={areaId ?? ''} onChange={e => setAreaId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{s.noArea}</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {areaId !== sector.area_id && places.length > 0 && <span className="hint-block">{s.spotsFollow}</span>}
          </div>
          <div className="field"><label htmlFor="sectorAltitude">{s.maxAltitude} <span className="hint">{s.maxAltitudeHint}</span></label>
            <input id="sectorAltitude" type="number" inputMode="numeric" min={-500} max={9000} value={altitude}
                   onChange={e => setAltitude(e.target.value)} /></div>
          <div className="field"><label htmlFor="sectorDescription">{s.description}</label>
            <textarea id="sectorDescription" value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div className="area-edit-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>{t.common.cancel}</button>
            <button className="btn btn-add" type="button" onClick={save}>{t.common.save}</button>
          </div>
        </div>
      ) : sector.description && <p className="place-description">{sector.description}</p>}
      <ErrorText error={error} />

      <h3 className="section-title">{s.spots}</h3>
      <div className="area-places">
        {places.map(p => (
          <div key={p.id} className="area-place-row">
            <button type="button" className="area-place" onClick={() => props.onOpenPlace(p)}>
              <span className="row-title"><ActivityBadge activity={p.activity} />{p.name}</span>
              <span className="row-meta">
                {[activityLabel(p.activity), p.grade, p.visit_count ? t.app.sidebar.visits(p.visit_count) : null].filter(Boolean).join(', ')}
              </span>
            </button>
            {canEditPlace(p) && (
              <button type="button" className="link-btn remove-place" onClick={() => removePlace(p)}
                      aria-label={s.removeFromSector(p.name, sector.name)}>{t.spot.areaView.remove}</button>
            )}
          </div>
        ))}
        {!places.length && !adding && <div className="empty">{s.noSpots}</div>}
      </div>
      {userId && (adding
        ? <AddToSector sector={sector} allPlaces={props.allPlaces} canEditPlace={canEditPlace}
                       onDone={changed => { setAdding(false); if (changed) props.onChanged(); }} />
        : <button type="button" className="btn btn-ghost add-places-btn" onClick={() => setAdding(true)}>{t.spot.areaView.addSpots}</button>)}
    </Drawer>
  );
}

/** Checklist of the area's spots outside this sector; the ones you may edit can be moved in. */
function AddToSector({ sector, allPlaces, canEditPlace, onDone }: {
  sector: Sector; allPlaces: Place[]; canEditPlace: (p: Place) => boolean; onDone: (changed: boolean) => void;
}) {
  const { t } = useI18n();
  const s = t.spot.areaView;
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPlaces
      .filter(p => p.area_id === sector.area_id && p.sector_id !== sector.id)
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!!a.sector) - Number(!!b.sector) || a.name.localeCompare(b.name));
  }, [allPlaces, sector, query]);

  const toggle = (id: number) => setPicked(ps => (ps.includes(id) ? ps.filter(x => x !== id) : [...ps, id]));

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const changed = await setPlacesSector(picked, sector.id);
      if (changed < picked.length) {
        setError(s.onlyMoved(changed, picked.length));
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
      <input type="search" placeholder={s.findSpot} aria-label={s.findSpot} value={query}
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
                  {!editable ? s.addedByOther : p.sector ? s.nowIn(p.sector.name) : ''}
                </span>
              </label>
            </li>
          );
        })}
        {!candidates.length && <li className="empty">{t.spot.sectorView.noOtherSpots}</li>}
      </ul>
      <ErrorText error={error} />
      <div className="area-edit-actions">
        <button className="btn btn-ghost" type="button" onClick={() => onDone(false)}>{t.common.cancel}</button>
        <button className="btn btn-primary" type="button" disabled={!picked.length || busy} onClick={save}>
          {picked.length ? s.addN(picked.length) : s.addSpots}
        </button>
      </div>
    </div>
  );
}
