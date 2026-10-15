import { useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { useUsernames } from '../../hooks/useUsernames';
import { useI18n } from '../../i18n';
import { partnerForUser } from '../../lib/api';
import { errorMessage } from '../../lib/labels';
import { foldName } from '../../lib/names';
import type { Partner, UserRef } from '../../lib/types';
import { ErrorText } from '../Modal';

type Props = {
  label: string;
  /** Your climbing partners, offered as chips. */
  partners: Partner[];
  value: string[];
  onChange: (names: string[]) => void;
};

/** Registered users offered while typing a name. */
const MAX_USERS = 5;

/** Pick people from your partners, add a new name, or pick a registered user (linked to your name for them). */
export function PeopleField({ label, partners, value, onChange }: Props) {
  const { t } = useI18n();
  const myId = useAuth().session?.user.id;
  const users = useUsernames();
  const [newPerson, setNewPerson] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Users picked here, until the partner list reloads with them.
  const [picked, setPicked] = useState<{ name: string; user: UserRef }[]>([]);
  const knownNames = [...new Set([...partners.map(p => p.name), ...value])].sort((a, b) => a.localeCompare(b));
  const linkedTo = new Map([
    ...partners.filter(p => p.linked_username).map(p => [p.name, p.linked_username!] as const),
    ...picked.map(x => [x.name, x.user.username] as const),
  ]);
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter(x => x !== n) : [...value, n]);
  const addName = (n: string) => { if (!value.includes(n)) onChange([...value, n]); };
  const add = () => {
    const n = newPerson.trim();
    if (n) addName(n);
    setNewPerson('');
  };

  const typed = foldName(newPerson.trim());
  const linkedIds = new Set([...partners.map(p => p.linked_user_id), ...picked.map(x => x.user.id)]);
  const offered = typed
    ? users.filter(u => u.id !== myId && !linkedIds.has(u.id) && foldName(u.username).includes(typed)).slice(0, MAX_USERS)
    : [];

  async function pickUser(u: UserRef) {
    setError(null);
    try {
      const name = await partnerForUser(u.id);
      setPicked(list => [...list, { name, user: u }]);
      addName(name);
      setNewPerson('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="visit-with-group">
      <span className="field-label">{label}</span>
      <div className="person-chip-list">
        {knownNames.map(n => (
          <label key={n} className="person-chip" title={linkedTo.has(n) ? `@${linkedTo.get(n)}` : undefined}>
            <input type="checkbox" checked={value.includes(n)} onChange={() => toggle(n)} />{n}
            {linkedTo.has(n) && <span className="person-chip-linked" aria-label={`@${linkedTo.get(n)}`}>@</span>}
          </label>
        ))}
      </div>
      <div className="add-person-row">
        <input type="text" placeholder={t.spot.peopleField.addSomeone} aria-label={t.spot.peopleField.addSomeone} value={newPerson}
               onChange={e => setNewPerson(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add}>{t.common.add}</button>
      </div>
      {offered.length > 0 && (
        <div className="person-users" role="group" aria-label={t.spot.peopleField.registered}>
          <span className="hint">{t.spot.peopleField.registered}</span>
          {offered.map(u => (
            <button key={u.id} type="button" className="person-chip" onClick={() => pickUser(u)}>@{u.username}</button>
          ))}
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
