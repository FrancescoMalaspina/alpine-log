import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { deleteUser, fetchUsers, renameUser, setUserRole, type UserRow } from '../lib/api';
import { errorMessage } from '../lib/labels';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorText } from './Modal';

/**
 * Admins promote, demote, rename and delete users. Role changes apply on that
 * person's next page load. Your own row only links to the sections above.
 */
export function UsersSection({ myId }: { myId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then(rows => { if (!cancelled) setUsers(rows); })
      .catch(err => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!users || !q) return users;
    return users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  const patch = (id: string, p: Partial<UserRow>) =>
    setUsers(rows => rows && rows.map(r => (r.id === id ? { ...r, ...p } : r)));

  async function run(id: string, action: () => Promise<void>) {
    setError(null);
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRole(u: UserRow) {
    const role = u.role === 'admin' ? 'user' : 'admin';
    if (role === 'user' && !await confirm({
      title: `Remove admin rights from ${u.username}?`,
      message: 'They keep their account and everything they added, but can no longer edit other people’s spots or see private visits.',
      confirmLabel: 'Remove admin', danger: true,
    })) return;
    await run(u.id, async () => { await setUserRole(u.id, role); patch(u.id, { role }); });
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    const { id, name } = renaming;
    await run(id, async () => {
      await renameUser(id, name);
      patch(id, { username: name.trim() });
      setRenaming(null);
    });
  }

  return (
    <section className="account-section">
      <h3 className="section-title">Users</h3>
      <input type="search" className="users-search" placeholder="Search by username or email" aria-label="Search users"
             value={search} onChange={e => setSearch(e.target.value)} />
      <ErrorText error={error} />
      {!shown ? (
        !error && <p className="hint-block">Loading…</p>
      ) : !shown.length ? (
        <p className="hint-block">No users match.</p>
      ) : (
        <ul className="user-list">
          {shown.map(u => {
            const me = u.id === myId;
            const busy = busyId === u.id;
            return (
              <li key={u.id}>
                {renaming?.id === u.id ? (
                  <form className="user-rename" onSubmit={saveRename}>
                    <input aria-label={`New username for ${u.username}`} value={renaming.name} autoFocus
                           onChange={e => setRenaming({ id: u.id, name: e.target.value })} />
                    <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
                    <button type="button" className="btn btn-quiet" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <div className="user-who">
                    <span className="user-name">
                      {u.username}{u.role === 'admin' && <span className="admin-badge">admin</span>}
                      {me && <span className="hint">(you)</span>}
                    </span>
                    <span className="user-email">{u.email}</span>
                  </div>
                )}
                {!me && renaming?.id !== u.id && (
                  <div className="user-actions">
                    <button type="button" className="btn btn-quiet" disabled={busyId !== null}
                            onClick={() => setRenaming({ id: u.id, name: u.username })}>Rename</button>
                    <button type="button" className="btn btn-ghost" disabled={busyId !== null} onClick={() => toggleRole(u)}>
                      {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                    </button>
                    <button type="button" className="btn btn-quiet user-delete" disabled={busyId !== null}
                            onClick={() => setDeleting(u)}>Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirmDialog}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.username}'s account?`}
          message={<>
            <p>Their visits, photos, attachments, imports and wishlist are deleted for good, and they can no longer sign in
              as <strong>{deleting.email}</strong>.</p>
            <p>Spots, areas and routes they added stay on the map, without an owner.</p>
          </>}
          confirmLabel="Delete account"
          danger
          requireText={deleting.username}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteUser(deleting.id);
            setUsers(rows => rows && rows.filter(r => r.id !== deleting.id));
            setDeleting(null);
          }}
        />
      )}
    </section>
  );
}
