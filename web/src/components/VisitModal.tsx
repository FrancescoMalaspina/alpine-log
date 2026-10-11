import { useState } from 'react';
import { saveVisit } from '../lib/api';
import { errorMessage, gradeSuggestions, isRouteLike, localToday } from '../lib/labels';
import type { Partner, Place, VisitDetail, Visibility } from '../lib/types';
import { ErrorText, Modal } from './Modal';

type Props = {
  place: Place;
  visit?: VisitDetail;
  partners: Partner[];
  onClose: () => void;
  onSaved: (visitId: number) => void;
};

type AscentRow = { key: number; name: string; grade: string; sectorId: string; comment: string };

let nextKey = 1;
const emptyAscent = (): AscentRow => ({ key: nextKey++, name: '', grade: '', sectorId: '', comment: '' });

export function VisitModal({ place, visit, partners, onClose, onSaved }: Props) {
  const routeLike = isRouteLike(place.types);
  const hasSectors = place.sectors.length > 0;
  const [date, setDate] = useState(visit ? visit.date ?? '' : localToday());
  const [visibility, setVisibility] = useState<Visibility>(visit?.visibility ?? 'private');
  const [withPeople, setWithPeople] = useState<string[]>(visit?.partners ?? []);
  const [newPerson, setNewPerson] = useState('');
  const [summary, setSummary] = useState(visit?.summary ?? '');
  const [approach, setApproach] = useState(visit?.approach ?? '');
  const [descent, setDescent] = useState(visit?.descent ?? '');
  const [conditions, setConditions] = useState(visit?.conditions ?? '');
  const [duration, setDuration] = useState(visit?.duration_hours?.toString() ?? '');
  const [ascents, setAscents] = useState<AscentRow[]>(() => visit?.ascents.length
    ? visit.ascents.map(a => ({
      key: nextKey++, name: a.name ?? '', grade: a.grade ?? '', sectorId: a.sector ? String(a.sector.id) : '', comment: a.comment ?? '',
    }))
    : [emptyAscent()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const close = () => {
    if (!dirty || confirm('Discard this visit? What you typed will be lost.')) onClose();
  };

  const knownNames = [...new Set([...partners.map(p => p.name), ...withPeople])].sort((a, b) => a.localeCompare(b));
  const togglePerson = (n: string) => setWithPeople(ws => (ws.includes(n) ? ws.filter(x => x !== n) : [...ws, n]));
  const addPerson = () => {
    const n = newPerson.trim();
    if (n && !withPeople.includes(n)) setWithPeople(ws => [...ws, n]);
    setNewPerson('');
  };
  const updateAscent = (key: number, patch: Partial<AscentRow>) =>
    setAscents(as => as.map(a => (a.key === key ? { ...a, ...patch } : a)));

  async function save() {
    setError(null);
    const filled = ascents.filter(a => a.name.trim() || a.grade.trim() || a.comment.trim() || a.sectorId);
    if (!date && !summary.trim() && !withPeople.length && !filled.length) {
      return setError('Fill in at least a date, who you were with, or a route first.');
    }
    setBusy(true);
    try {
      const id = await saveVisit({
        id: visit?.id,
        place_id: place.id,
        date: date || null,
        summary,
        approach: routeLike ? approach : '',
        descent: routeLike ? descent : '',
        conditions: routeLike ? conditions : '',
        duration_hours: routeLike && duration.trim() ? Number(duration) : null,
        visibility,
        partners: withPeople,
        ascents: filled.map(a => ({
          name: a.name, grade: a.grade, comment: a.comment, sector_id: a.sectorId ? +a.sectorId : null,
        })),
      });
      onSaved(id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={visit ? 'Edit visit' : 'Add a visit'}
      subtitle={<>
        {visit ? 'Editing a visit to' : 'Log a visit to'} <b>{place.name}</b>.
        {place.types.includes('crag') && !hasSectors && ' No sectors defined for this place yet.'}
      </>}
      onClose={close}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={close}>Cancel</button>
        <button className="btn btn-add" type="button" disabled={busy} onClick={save}>Save visit</button>
      </>}
    >
      <div className="visit-modal-body" onChange={() => setDirty(true)}>
        <div className="visit-block">
          <div className="visit-row">
            <input type="date" className="visit-date" aria-label="Date" value={date} onChange={e => setDate(e.target.value)} />
            <div className="segmented" role="radiogroup" aria-label="Who can see this visit">
              {(['private', 'public'] as const).map(v => (
                <button key={v} type="button" role="radio" aria-checked={visibility === v}
                        className={visibility === v ? 'active' : ''} onClick={() => setVisibility(v)}>
                  {v === 'private' ? 'Private' : 'Public'}
                </button>
              ))}
            </div>
          </div>
          <div className="hint-block">
            {visibility === 'private'
              ? 'Only you (and admins) can see this visit.'
              : 'Anyone, even without an account, can see this visit and the names of who you climbed with.'}
          </div>

          <div className="visit-with-group">
            <span className="filter-label">Climbed with</span>
            <div className="person-chip-list">
              {knownNames.map(n => (
                <label key={n} className="person-chip">
                  <input type="checkbox" checked={withPeople.includes(n)} onChange={() => togglePerson(n)} />{n}
                </label>
              ))}
            </div>
            <div className="add-person-row">
              <input type="text" placeholder="+ add someone new" value={newPerson}
                     onChange={e => setNewPerson(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }} />
              <button type="button" onClick={addPerson}>Add</button>
            </div>
          </div>

          <textarea className="visit-summary" placeholder="Summary of the visit (optional)" value={summary}
                    onChange={e => setSummary(e.target.value)} />
          {routeLike && (
            <div className="visit-row">
              <input type="text" className="visit-conditions" placeholder="Conditions — snow, ice, weather (optional)"
                     aria-label="Conditions" value={conditions} onChange={e => setConditions(e.target.value)} />
              <label className="duration-field">
                <input type="number" inputMode="decimal" min={0.5} max={999} step={0.5} placeholder="h"
                       aria-label="Duration in hours" value={duration} onChange={e => setDuration(e.target.value)} />
                <span>hours</span>
              </label>
            </div>
          )}
          {routeLike && (
            <div className="visit-approach">
              <textarea placeholder="Avvicinamento — how to reach the start (optional)" value={approach}
                        onChange={e => setApproach(e.target.value)} />
              <textarea placeholder="Discesa — how to get down (optional)" value={descent}
                        onChange={e => setDescent(e.target.value)} />
            </div>
          )}

          <div className="routes-list">
            {ascents.map(a => (
              <div key={a.key} className="route-row">
                <input type="text" className="route-name" placeholder="Route name" value={a.name}
                       onChange={e => updateAscent(a.key, { name: e.target.value })} />
                <input type="text" className="route-grade mono" placeholder="Grade" value={a.grade} list="visitGradeOptions"
                       onChange={e => updateAscent(a.key, { grade: e.target.value })} />
                {hasSectors && (
                  <select className="route-sector" value={a.sectorId} aria-label="Sector"
                          onChange={e => updateAscent(a.key, { sectorId: e.target.value })}>
                    <option value="">— sector —</option>
                    {place.sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                <input type="text" className="route-comment" placeholder="Comment" value={a.comment}
                       onChange={e => updateAscent(a.key, { comment: e.target.value })} />
                <button type="button" aria-label="Remove route"
                        onClick={() => setAscents(as => as.filter(x => x.key !== a.key))}>×</button>
              </div>
            ))}
          </div>
          <datalist id="visitGradeOptions">{gradeSuggestions(place.types).map(g => <option key={g} value={g} />)}</datalist>
          <button type="button" className="btn-add-route" onClick={() => setAscents(as => [...as, emptyAscent()])}>
            + Add route
          </button>
        </div>
        <ErrorText error={error} />
      </div>
    </Modal>
  );
}
