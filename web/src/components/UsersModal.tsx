import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { fetchUsers, setUserRole, type UserRow } from '../lib/api';
import { errorMessage, isTouchLayout } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

/** Admins promote or demote users. Changes apply on the user's next page load. */
export function UsersModal({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function toggle(u: UserRow) {
    const role = u.role === 'admin' ? 'user' : 'admin';
    if (role === 'user' && !window.confirm(`Remove admin rights from ${u.username}?`)) return;
    setError(null);
    setBusyId(u.id);
    try {
      await setUserRole(u.id, role);
      setUsers(rows => rows && rows.map(r => (r.id === u.id ? { ...r, role } : r)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      title="Users"
      subtitle="Admins can edit or delete any spot, area or attachment, and see every visit. A change applies the next time that person loads the app."
      onClose={onClose}
      closeOnBackdrop
      footer={<button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>}
    >
      <div className="auth-form">
        <div className="field">
          <label htmlFor="usersSearch">Search</label>
          <input id="usersSearch" type="search" placeholder="Username or email" autoFocus={!isTouchLayout()}
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ErrorText error={error} />
        {!shown ? (
          !error && <p className="hint-block">Loading…</p>
        ) : !shown.length ? (
          <p className="hint-block">No users match.</p>
        ) : (
          <ul className="user-list">
            {shown.map(u => (
              <li key={u.id}>
                <div className="user-who">
                  <span className="user-name">
                    {u.username}{u.role === 'admin' && <span className="admin-badge">admin</span>}
                  </span>
                  <span className="user-email">{u.email}</span>
                </div>
                <button type="button" className="btn btn-ghost"
                        disabled={u.id === myId || busyId !== null}
                        title={u.id === myId ? "You can't remove your own admin role" : undefined}
                        onClick={() => toggle(u)}>
                  {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
