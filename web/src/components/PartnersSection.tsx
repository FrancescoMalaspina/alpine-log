import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { useUsernames } from '../hooks/useUsernames';
import { useI18n } from '../i18n';
import { canMergePartners, deletePartner, fetchMyPartners, linkPartner, mergePartners, partnerKeptByMerge, renamePartner } from '../lib/api';
import { errorMessage } from '../lib/labels';
import { foldName, sameName } from '../lib/names';
import type { ConfirmOptions } from './ConfirmDialog';
import type { Partner, UserRef } from '../lib/types';
import { Collapsible } from './Collapsible';
import { Combobox, type ComboOption } from './forms/Combobox';
import { ErrorText } from './Modal';

/** From this many partners on, a search box narrows the list. */
const SEARCH_FROM = 8;

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
  const usernames = useUsernames();
  const users = useMemo(() => usernames.filter(u => u.id !== userId), [usernames, userId]);
  const userOptions = useMemo(() => users.map(u => ({ key: u.id, label: `@${u.username}` })), [users]);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirm, confirmDialog] = useConfirm();

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

  const q = foldName(search.replace(/^@/, ''));
  const shown = (partners ?? []).filter(p => !q || foldName(`${p.name} ${p.linked_username ?? ''}`).includes(q));

  return (
    <section className="account-section">
      <Collapsible id="account.partners" title={partners?.length ? `${s.title} (${partners.length})` : s.title}>
        <p className="hint-block">{s.hint}</p>
        <ErrorText error={error} />
        {partners?.length === 0 && <p className="hint">{s.none}</p>}
        {partners && partners.length >= SEARCH_FROM && (
          <input type="search" className="partner-search" value={search} placeholder={s.search} aria-label={s.search}
                 spellCheck={false} onChange={e => setSearch(e.target.value)} />
        )}
        {partners && partners.length > 0 && (
          <ul className="partner-list">
            {shown.map(p => (
              <PartnerRow key={p.id} partner={p} partners={partners} users={users} userOptions={userOptions}
                          onOpenLogbook={onOpenLogbook} onChange={change} confirm={confirm} />
            ))}
          </ul>
        )}
      </Collapsible>
      {confirmDialog}
    </section>
  );
}

function PartnerRow({ partner: p, partners, users, userOptions, onOpenLogbook, onChange, confirm }: {
  partner: Partner; partners: Partner[]; users: UserRef[]; userOptions: ComboOption[];
  onOpenLogbook: (userId: string) => void; onChange: (run: () => Promise<unknown>) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const s = t.account.partners;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mergeSearch, setMergeSearch] = useState('');
  const likely = !p.linked_user_id ? users.find(u => sameName(u.username, p.name)) : undefined;
  const mergeOptions = partners
    .filter(x => x.id !== p.id && canMergePartners(p, x))
    .map(x => ({ key: x.id, label: x.name, hint: x.linked_username && x.linked_username !== x.name ? `@${x.linked_username}` : undefined }));

  /** Asks before two names become one, saying which one stays. */
  const confirmMerge = (other: Partner) => confirm({
    title: s.mergeTitle,
    message: s.confirmMerge(p.name, other.name, partnerKeptByMerge(p, other).name),
    confirmLabel: s.merge,
  });

  // The name becomes their username; another name you have for them merges into it.
  async function link(user: UserRef) {
    const other = partners.find(x => x.id !== p.id && x.linked_user_id === user.id);
    if (other && !await confirm({ title: s.mergeTitle, message: s.confirmMergeLinked(p.name, other.name, user.username), confirmLabel: s.merge })) return;
    setSearch('');
    onChange(() => linkPartner(p.id, user.id));
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const name = renaming?.trim() ?? '';
    if (!name || name === p.name) return setRenaming(null);
    const other = partners.find(x => x.id !== p.id && x.name === name);
    if (other && !await confirmMerge(other)) return;
    setRenaming(null);
    onChange(() => renamePartner(p.id, name));
  }

  async function merge(option: ComboOption) {
    const other = partners.find(x => x.id === option.key);
    if (!other || !await confirmMerge(other)) return;
    setMergeSearch('');
    onChange(() => mergePartners(p, other));
  }

  return (
    <li>
      <details className="partner-row">
        <summary className="partner-name">
          <b>{p.name}</b>
          {p.linked_username && p.linked_username !== p.name && <span className="hint"> @{p.linked_username}</span>}
          {p.linked_user_id && p.linked_username === p.name && <span className="hint"> {s.registered}</span>}
          <span className="hint"> · {s.visits(p.visit_count)}</span>
        </summary>
        <div className="partner-actions">
          {renaming != null ? (
            <form className="partner-rename" onSubmit={rename}>
              <input value={renaming} autoFocus aria-label={s.newName(p.name)} onChange={e => setRenaming(e.target.value)} />
              <button type="submit" className="btn btn-primary">{t.common.save}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>{t.common.cancel}</button>
            </form>
          ) : (
            <span className="tip-actions">
              {p.linked_user_id && (
                <button type="button" className="link-btn" onClick={() => onOpenLogbook(p.linked_user_id!)}>{s.openLogbook}</button>
              )}
              {/* A linked name is their username. */}
              {!p.linked_user_id && <button type="button" className="link-btn" onClick={() => setRenaming(p.name)}>{s.rename}</button>}
              {p.linked_user_id && (
                <button type="button" className="link-btn" onClick={() => onChange(() => linkPartner(p.id, null))}>{s.unlink}</button>
              )}
              {p.visit_count === 0 && (
                <button type="button" className="link-btn danger" onClick={() => onChange(() => deletePartner(p.id))}>{t.common.delete}</button>
              )}
            </span>
          )}
          {!p.linked_user_id && (
            <span className="partner-link">
              {likely && (
                <button type="button" className="link-btn" onClick={() => link(likely)}>
                  {s.isThis(likely.username)}
                </button>
              )}
              <label className="visually-hidden" htmlFor={`link-${p.id}`}>{s.linkTo(p.name)}</label>
              <Combobox id={`link-${p.id}`} value={search} placeholder={s.linkToUser} options={userOptions}
                        onChange={setSearch} onPick={o => { const u = users.find(x => x.id === o.key); if (u) link(u); }} />
            </span>
          )}
          {mergeOptions.length > 0 && (
            <span className="partner-link">
              <label className="visually-hidden" htmlFor={`merge-${p.id}`}>{s.mergeWith(p.name)}</label>
              <Combobox id={`merge-${p.id}`} value={mergeSearch} placeholder={s.mergeWithPlaceholder} options={mergeOptions}
                        onChange={setMergeSearch} onPick={merge} />
            </span>
          )}
          {p.linked_user_id && partners.some(x => x.id !== p.id && x.linked_user_id) && <p className="hint">{s.linkedMergeHint}</p>}
        </div>
      </details>
    </li>
  );
}
