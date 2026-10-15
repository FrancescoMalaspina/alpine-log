import { useEffect, useState } from 'react';
import { useUsernames } from '../hooks/useUsernames';
import { useI18n } from '../i18n';
import { deletePartner, fetchMyPartners, linkPartner, renamePartner } from '../lib/api';
import { errorMessage } from '../lib/labels';
import { sameName } from '../lib/names';
import type { Partner, UserRef } from '../lib/types';
import { ErrorText } from './Modal';

type Props = {
  userId: string;
  onOpenLogbook: (userId: string) => void;
  /** Partners were renamed, merged, linked or removed. */
  onChanged: () => void;
};

/** The names you put on your visits: rename or merge them, and link them to registered users. */
export function PartnersSection({ userId, onOpenLogbook, onChanged }: Props) {
  const { t } = useI18n();
  const s = t.account.partners;
  const users = useUsernames().filter(u => u.id !== userId);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyPartners(userId)
      .then(p => { if (!cancelled) setPartners(p); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  /** Runs a change, then reloads the list here and in the app. */
  async function change(run: () => Promise<unknown>) {
    setError(null);
    try {
      await run();
      setReloadKey(k => k + 1);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="account-section">
      <h3 className="section-title">{s.title}</h3>
      <p className="hint-block">{s.hint}</p>
      <ErrorText error={error} />
      {partners?.length === 0 && <p className="hint">{s.none}</p>}
      {partners && partners.length > 0 && (
        <ul className="partner-list">
          {partners.map(p => (
            <PartnerRow key={p.id} partner={p} partners={partners} users={users} onOpenLogbook={onOpenLogbook} onChange={change} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PartnerRow({ partner: p, partners, users, onOpenLogbook, onChange }: {
  partner: Partner; partners: Partner[]; users: UserRef[];
  onOpenLogbook: (userId: string) => void; onChange: (run: () => Promise<unknown>) => void;
}) {
  const { t } = useI18n();
  const s = t.account.partners;
  const [renaming, setRenaming] = useState<string | null>(null);
  const likely = !p.linked_user_id ? users.find(u => sameName(u.username, p.name)) : undefined;

  function rename(e: React.FormEvent) {
    e.preventDefault();
    const name = renaming?.trim() ?? '';
    if (!name || name === p.name) return setRenaming(null);
    const other = partners.find(x => x.id !== p.id && x.name === name);
    if (other && !confirm(s.confirmMerge(p.name, name))) return;
    setRenaming(null);
    onChange(() => renamePartner(p.id, name));
  }

  return (
    <li className="partner-row">
      {renaming != null ? (
        <form className="partner-rename" onSubmit={rename}>
          <input value={renaming} autoFocus aria-label={s.newName(p.name)} onChange={e => setRenaming(e.target.value)} />
          <button type="submit" className="btn btn-primary">{t.common.save}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>{t.common.cancel}</button>
        </form>
      ) : (
        <span className="partner-name">
          <b>{p.name}</b> <span className="hint">{s.visits(p.visit_count)}</span>
        </span>
      )}
      <span className="partner-link">
        {p.linked_user_id ? <>
          <button type="button" className="link-btn" onClick={() => onOpenLogbook(p.linked_user_id!)}>@{p.linked_username}</button>
          <button type="button" className="link-btn" onClick={() => onChange(() => linkPartner(p.id, null))}>{s.unlink}</button>
        </> : <>
          {likely && (
            <button type="button" className="link-btn" onClick={() => onChange(() => linkPartner(p.id, likely.id))}>
              {s.isThis(likely.username)}
            </button>
          )}
          <select value="" aria-label={s.linkTo(p.name)}
                  onChange={e => { const id = e.target.value; if (id) onChange(() => linkPartner(p.id, id)); }}>
            <option value="">{s.linkToUser}</option>
            {users.map(u => <option key={u.id} value={u.id}>@{u.username}</option>)}
          </select>
        </>}
      </span>
      {renaming == null && (
        <span className="tip-actions">
          <button type="button" className="link-btn" onClick={() => setRenaming(p.name)}>{s.rename}</button>
          {p.visit_count === 0 && (
            <button type="button" className="link-btn danger" onClick={() => onChange(() => deletePartner(p.id))}>{t.common.delete}</button>
          )}
        </span>
      )}
    </li>
  );
}
