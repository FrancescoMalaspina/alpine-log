import { useState } from 'react';
import { ACTIVITIES, gradeSuggestions } from '../../lib/labels';
import type { Activity, Partner, Route } from '../../lib/types';
import { ascentRow, type AscentRow, type VisitValues } from './visitForm';

type Props = {
  values: VisitValues;
  onChange: (patch: Partial<VisitValues>) => void;
  partners: Partner[];
  /** The spot's activity, which decides the extra fields and grade hints. */
  activity: Activity;
  /** Sectors the routes can be filed under: key is an id or "name:<name>". */
  sectors: { key: string; label: string }[];
  /** The spot's shared route list, offered while typing route names. */
  routes?: Route[];
};

/** Every field of a visit. Used by "Log a visit" and by "Add a spot" with a visit. */
export function VisitFields({ values: v, onChange, partners, activity, sectors, routes = [] }: Props) {
  const [newPerson, setNewPerson] = useState('');
  const f = ACTIVITIES[activity];
  const knownNames = [...new Set([...partners.map(p => p.name), ...v.withPeople])].sort((a, b) => a.localeCompare(b));
  const togglePerson = (n: string) =>
    onChange({ withPeople: v.withPeople.includes(n) ? v.withPeople.filter(x => x !== n) : [...v.withPeople, n] });
  const addPerson = () => {
    const n = newPerson.trim();
    if (n && !v.withPeople.includes(n)) onChange({ withPeople: [...v.withPeople, n] });
    setNewPerson('');
  };
  const updateAscent = (key: number, patch: Partial<AscentRow>) =>
    onChange({ ascents: v.ascents.map(a => (a.key === key ? { ...a, ...patch } : a)) });
  // Typing (or picking) a route from the spot's list fills in its grade and sector.
  const setRouteName = (row: AscentRow, name: string) => {
    const listed = routes.find(r => r.name.toLowerCase() === name.trim().toLowerCase());
    updateAscent(row.key, listed
      ? { name, grade: row.grade || listed.grade || '', sectorKey: row.sectorKey || (listed.sector_id ? String(listed.sector_id) : '') }
      : { name });
  };
  const unlisted = v.ascents.some(a => a.name.trim() && !routes.some(r => r.name.toLowerCase() === a.name.trim().toLowerCase()));

  return (
    <div className="visit-block">
      <div className="visit-row">
        <label className="field-inline">
          <span className="field-label">Date</span>
          <input type="date" className="visit-date" value={v.date} onChange={e => onChange({ date: e.target.value })} />
        </label>
        <div className="segmented" role="radiogroup" aria-label="Who can see this visit">
          {(['private', 'public'] as const).map(vis => (
            <button key={vis} type="button" role="radio" aria-checked={v.visibility === vis}
                    className={v.visibility === vis ? 'active' : ''} onClick={() => onChange({ visibility: vis })}>
              {vis === 'private' ? 'Private' : 'Public'}
            </button>
          ))}
        </div>
      </div>
      <div className="hint-block">
        {v.visibility === 'private'
          ? 'Only you (and admins) can see this visit.'
          : 'Anyone, even without an account, can see this visit and the names of who you were with.'}
      </div>

      <div className="visit-with-group">
        <span className="field-label">Who you were with</span>
        <div className="person-chip-list">
          {knownNames.map(n => (
            <label key={n} className="person-chip">
              <input type="checkbox" checked={v.withPeople.includes(n)} onChange={() => togglePerson(n)} />{n}
            </label>
          ))}
        </div>
        <div className="add-person-row">
          <input type="text" placeholder="Add someone new" aria-label="Add someone new" value={newPerson}
                 onChange={e => setNewPerson(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }} />
          <button type="button" onClick={addPerson}>Add</button>
        </div>
      </div>

      <textarea className="visit-summary" placeholder="How did it go? (optional)" aria-label="Summary" value={v.summary}
                onChange={e => onChange({ summary: e.target.value })} />
      {f.conditions && (
        <div className="visit-row">
          <input type="text" className="visit-conditions" placeholder="Conditions: snow, ice, weather (optional)"
                 aria-label="Conditions" value={v.conditions} onChange={e => onChange({ conditions: e.target.value })} />
          <label className="duration-field">
            <input type="number" inputMode="decimal" min={0.5} max={999} step={0.5} placeholder="h"
                   aria-label="Duration in hours" value={v.duration} onChange={e => onChange({ duration: e.target.value })} />
            <span>hours</span>
          </label>
        </div>
      )}
      {f.approach && (
        <div className="visit-approach">
          <textarea placeholder="Avvicinamento: how to reach the start (optional)" aria-label="Approach" value={v.approach}
                    onChange={e => onChange({ approach: e.target.value })} />
          <textarea placeholder="Discesa: how to get down (optional)" aria-label="Descent" value={v.descent}
                    onChange={e => onChange({ descent: e.target.value })} />
        </div>
      )}

      {f.routes && <>
      <span className="field-label">{f.isRoute ? 'The route' : 'Routes'}</span>
      <div className="routes-list">
        {v.ascents.map(a => (
          <div key={a.key} className="route-row">
            <input type="text" className="route-name" placeholder="Route name" aria-label="Route name" value={a.name}
                   list={routes.length ? 'spotRouteOptions' : undefined} onChange={e => setRouteName(a, e.target.value)} />
            <input type="text" className="route-grade num" placeholder="Grade" aria-label="Grade" value={a.grade}
                   list="visitGradeOptions" onChange={e => updateAscent(a.key, { grade: e.target.value })} />
            {sectors.length > 0 && (
              <select className="route-sector" value={a.sectorKey} aria-label="Sector"
                      onChange={e => updateAscent(a.key, { sectorKey: e.target.value })}>
                <option value="">No sector</option>
                {sectors.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            )}
            <input type="text" className="route-comment" placeholder="Comment" aria-label="Comment" value={a.comment}
                   onChange={e => updateAscent(a.key, { comment: e.target.value })} />
            <button type="button" aria-label="Remove route"
                    onClick={() => onChange({ ascents: v.ascents.filter(x => x.key !== a.key) })}>×</button>
          </div>
        ))}
      </div>
      <datalist id="visitGradeOptions">{gradeSuggestions(activity).map(g => <option key={g} value={g} />)}</datalist>
      {routes.length > 0 && (
        <datalist id="spotRouteOptions">
          {routes.map(r => <option key={r.id} value={r.name}>{r.grade ?? ''}</option>)}
        </datalist>
      )}
      <button type="button" className="btn-add-route" onClick={() => onChange({ ascents: [...v.ascents, ascentRow()] })}>
        {f.isRoute ? 'Add another route' : 'Add a route'}
      </button>
      {f.sectors && unlisted && (
        <label className="switch small">
          <input type="checkbox" checked={v.addRoutes} onChange={e => onChange({ addRoutes: e.target.checked })} />
          Add new route names to this spot's shared list
        </label>
      )}
      </>}
    </div>
  );
}
