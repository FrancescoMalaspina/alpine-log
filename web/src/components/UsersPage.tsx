import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { deleteUser, fetchUsers, renameUser, setUserRole, type UserRow } from '../lib/api';
import { useI18n, type Dict } from '../i18n';
import { errorMessage, formatDate, timeAgo } from '../lib/labels';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorText } from './Modal';

type SortKey = 'username' | 'email' | 'created_at' | 'last_active_at' | 'visits' | 'last_visit' | 'spots_added';
type Sort = { key: SortKey; desc: boolean };

const COLUMNS: { key: SortKey; num?: boolean }[] = [
  { key: 'username' },
  { key: 'email' },
  { key: 'created_at', num: true },
  { key: 'last_active_at' },
  { key: 'visits', num: true },
  { key: 'last_visit', num: true },
  { key: 'spots_added', num: true },
];

type SortLabel = keyof Dict['account']['users']['sorts'];
const SORTS: { label: SortLabel; sort: Sort }[] = [
  { label: 'active', sort: { key: 'last_active_at', desc: true } },
  { label: 'newest', sort: { key: 'created_at', desc: true } },
  { label: 'oldest', sort: { key: 'created_at', desc: false } },
  { label: 'visits', sort: { key: 'visits', desc: true } },
  { label: 'lastVisit', sort: { key: 'last_visit', desc: true } },
  { label: 'spots', sort: { key: 'spots_added', desc: true } },
  { label: 'name', sort: { key: 'username', desc: false } },
];

type Role = 'all' | 'admin' | 'user';
type Activity = 'any' | '7' | '30' | 'idle' | 'never';
type Logged = 'any' | 'some' | 'none' | 'public';
const NO_FILTERS = { role: 'all' as Role, activity: 'any' as Activity, logged: 'any' as Logged };

function compare(a: UserRow, b: UserRow, key: SortKey) {
  if (key === 'visits' || key === 'spots_added') return a[key] - b[key];
  if (key === 'username' || key === 'email') return a[key].localeCompare(b[key]);
  return (a[key] ?? '').localeCompare(b[key] ?? '');
}

/**
 * Admins only: everyone who signed up, with when they were last active and
 * how much they logged. Promote, demote, rename or delete from here; role
 * changes apply on that person's next page load.
 */
export function UsersPage({ myId, onClose, onOpenLogbook, children }: {
  myId: string; onClose: () => void; onOpenLogbook: (userId: string) => void; children?: ReactNode;
}) {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  // "Last active" is relative to when the list was loaded.
  const [loadedAt, setLoadedAt] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(SORTS[0].sort);
  const [filters, setFilters] = useState(NO_FILTERS);
  const filtered = filters.role !== 'all' || filters.activity !== 'any' || filters.logged !== 'any' || !!search.trim();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then(rows => { if (!cancelled) { setUsers(rows); setLoadedAt(Date.now()); } })
      .catch(err => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const daysAgo = (n: number) => new Date(loadedAt - n * 864e5).toISOString();
    const rows = (users ?? []).filter(u => {
      if (q && !u.username.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (filters.role !== 'all' && u.role !== filters.role) return false;
      const seen = u.last_active_at;
      if (filters.activity === '7' && !(seen && seen > daysAgo(7))) return false;
      if (filters.activity === '30' && !(seen && seen > daysAgo(30))) return false;
      if (filters.activity === 'idle' && !(seen && seen <= daysAgo(30))) return false;
      if (filters.activity === 'never' && seen) return false;
      if (filters.logged === 'some' && !u.visits) return false;
      if (filters.logged === 'none' && u.visits) return false;
      if (filters.logged === 'public' && !u.public_visits) return false;
      return true;
    });
    // Empty values (never active, no visit) always sort last.
    return rows.sort((a, b) => {
      const ea = a[sort.key] == null, eb = b[sort.key] == null;
      if (ea !== eb) return ea ? 1 : -1;
      return (sort.desc ? -1 : 1) * compare(a, b, sort.key);
    });
  }, [users, search, sort, filters, loadedAt]);

  const totals = useMemo(() => {
    const monthAgo = new Date(loadedAt - 30 * 864e5).toISOString();
    return {
      users: users?.length ?? 0,
      active: users?.filter(u => u.last_active_at && u.last_active_at > monthAgo).length ?? 0,
      visits: users?.reduce((n, u) => n + u.visits, 0) ?? 0,
    };
  }, [users, loadedAt]);

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
      title: t.account.users.removeAdminTitle(u.username),
      message: t.account.users.removeAdminMessage,
      confirmLabel: t.account.users.removeAdmin, danger: true,
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

  const sortBy = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'username' && key !== 'email' }));
  const sortIndex = SORTS.findIndex(o => o.sort.key === sort.key && o.sort.desc === sort.desc);

  return (
    <section className="page" aria-labelledby="usersTitle">
      <div className="page-head">
        <button type="button" className="btn btn-quiet page-back" onClick={onClose}>{t.common.back}</button>
        <h2 id="usersTitle" className="page-title">{t.account.users.title}</h2>
        {users && (
          <p className="page-meta">
            {t.account.users.meta(totals.users, totals.active, totals.visits)}
          </p>
        )}
      </div>

      <div className="page-body">
        <div className="users-toolbar">
          <input type="search" className="users-search" placeholder={t.account.users.search} aria-label={t.account.users.searchLabel}
                 value={search} onChange={e => setSearch(e.target.value)} />
          <label className="users-filter">
            <span>{t.account.users.role}</span>
            <select value={filters.role} onChange={e => setFilters({ ...filters, role: e.target.value as Role })}>
              <option value="all">{t.account.users.everyone}</option>
              <option value="admin">{t.account.users.admins}</option>
              <option value="user">{t.account.users.usersOpt}</option>
            </select>
          </label>
          <label className="users-filter">
            <span>{t.account.users.active}</span>
            <select value={filters.activity} onChange={e => setFilters({ ...filters, activity: e.target.value as Activity })}>
              <option value="any">{t.account.users.anyTime}</option>
              <option value="7">{t.account.users.last7}</option>
              <option value="30">{t.account.users.last30}</option>
              <option value="idle">{t.account.users.idle}</option>
              <option value="never">{t.common.never}</option>
            </select>
          </label>
          <label className="users-filter">
            <span>{t.account.users.logged}</span>
            <select value={filters.logged} onChange={e => setFilters({ ...filters, logged: e.target.value as Logged })}>
              <option value="any">{t.account.users.anything}</option>
              <option value="some">{t.account.users.someVisits}</option>
              <option value="none">{t.account.users.noVisits}</option>
              <option value="public">{t.account.users.publicVisits}</option>
            </select>
          </label>
          <label className="users-filter">
            <span>{t.account.users.sort}</span>
            <select value={sortIndex} onChange={e => setSort(SORTS[+e.target.value].sort)}>
              {sortIndex < 0 && <option value={-1}>{t.account.users.byColumn}</option>}
              {SORTS.map((o, i) => <option key={o.label} value={i}>{t.account.users.sorts[o.label]}</option>)}
            </select>
          </label>
          {users && (
            <span className="users-count">
              {filtered ? t.account.users.count(shown.length, users.length) : t.account.users.users(users.length)}
              {filtered && (
                <button type="button" className="link-btn" onClick={() => { setFilters(NO_FILTERS); setSearch(''); }}>{t.account.users.clear}</button>
              )}
            </span>
          )}
        </div>
        <ErrorText error={error} />
        {!users ? (
          !error && <p className="hint-block">{t.common.loading}</p>
        ) : !shown.length ? (
          <p className="hint-block">{t.account.users.noMatch}</p>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  {COLUMNS.map(c => (
                    <th key={c.key} scope="col" className={c.num ? 'num' : undefined}
                        aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                      <button type="button" className="sort-btn" onClick={() => sortBy(c.key)}>
                        {t.account.users.columns[c.key]}{sort.key === c.key && <span aria-hidden="true">{sort.desc ? ' ↓' : ' ↑'}</span>}
                      </button>
                    </th>
                  ))}
                  <th scope="col"><span className="visually-hidden">{t.account.users.actions}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(u => {
                  const me = u.id === myId;
                  return (
                    <tr key={u.id}>
                      <td data-label={t.account.users.columns.username} className="user-cell">
                        {renaming?.id === u.id ? (
                          <form className="user-rename" onSubmit={saveRename}>
                            <input aria-label={t.account.users.newUsername(u.username)} value={renaming.name} autoFocus
                                   onChange={e => setRenaming({ id: u.id, name: e.target.value })} />
                            <button type="submit" className="btn btn-primary" disabled={busyId === u.id}>{t.common.save}</button>
                            <button type="button" className="btn btn-quiet" onClick={() => setRenaming(null)}>{t.common.cancel}</button>
                          </form>
                        ) : (
                          <span className="user-name">
                            <button type="button" className="link-btn" onClick={() => onOpenLogbook(u.id)}>{u.username}</button>{u.role === 'admin' && <span className="admin-badge">{t.common.admin}</span>}
                            {me && <span className="hint">{t.common.you}</span>}
                          </span>
                        )}
                      </td>
                      <td data-label={t.account.users.columns.email} className="user-email" title={u.email}>{u.email}</td>
                      <td data-label={t.account.users.columns.created_at} className="num">{formatDate(u.created_at.slice(0, 10))}</td>
                      <td data-label={t.account.users.columns.last_active_at} title={u.last_active_at ? new Date(u.last_active_at).toLocaleString() : undefined}>
                        {u.last_active_at ? timeAgo(u.last_active_at, loadedAt) : <span className="hint">{t.common.never}</span>}
                      </td>
                      <td data-label={t.account.users.columns.visits} className="num">
                        {u.visits}{u.public_visits > 0 && <span className="hint"> {t.account.users.publicCount(u.public_visits)}</span>}
                      </td>
                      <td data-label={t.account.users.columns.last_visit} className="num">{u.last_visit ? formatDate(u.last_visit) : <span className="hint">–</span>}</td>
                      <td data-label={t.account.users.columns.spots_added} className="num">{u.spots_added}</td>
                      <td className="user-actions-cell">
                        {!me && renaming?.id !== u.id && (
                          <div className="user-actions">
                            <button type="button" className="btn btn-quiet" disabled={busyId !== null}
                                    onClick={() => setRenaming({ id: u.id, name: u.username })}>{t.account.users.rename}</button>
                            <button type="button" className="btn btn-quiet" disabled={busyId !== null} onClick={() => toggleRole(u)}>
                              {u.role === 'admin' ? t.account.users.removeAdmin : t.account.users.makeAdmin}
                            </button>
                            <button type="button" className="btn btn-quiet user-delete" disabled={busyId !== null}
                                    onClick={() => setDeleting(u)}>{t.common.delete}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {children}
      </div>

      {confirmDialog}
      {deleting && (
        <ConfirmDialog
          title={t.account.users.deleteTitle(deleting.username)}
          message={t.account.users.deleteMessage(deleting.visits, deleting.email)}
          confirmLabel={t.account.users.deleteConfirm}
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
