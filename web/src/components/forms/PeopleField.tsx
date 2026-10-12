import { useState } from 'react';
import type { Partner } from '../../lib/types';

type Props = {
  label: string;
  /** Your climbing partners, offered as chips. */
  partners: Partner[];
  value: string[];
  onChange: (names: string[]) => void;
};

/** Pick people from your partners, or add a new name. */
export function PeopleField({ label, partners, value, onChange }: Props) {
  const [newPerson, setNewPerson] = useState('');
  const knownNames = [...new Set([...partners.map(p => p.name), ...value])].sort((a, b) => a.localeCompare(b));
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter(x => x !== n) : [...value, n]);
  const add = () => {
    const n = newPerson.trim();
    if (n && !value.includes(n)) onChange([...value, n]);
    setNewPerson('');
  };

  return (
    <div className="visit-with-group">
      <span className="field-label">{label}</span>
      <div className="person-chip-list">
        {knownNames.map(n => (
          <label key={n} className="person-chip">
            <input type="checkbox" checked={value.includes(n)} onChange={() => toggle(n)} />{n}
          </label>
        ))}
      </div>
      <div className="add-person-row">
        <input type="text" placeholder="Add someone new" aria-label="Add someone new" value={newPerson}
               onChange={e => setNewPerson(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add}>Add</button>
      </div>
    </div>
  );
}
