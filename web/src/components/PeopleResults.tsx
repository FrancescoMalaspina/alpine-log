import { useUsernames } from '../hooks/useUsernames';
import { useI18n } from '../i18n';
import { foldName } from '../lib/names';

const MAX_SHOWN = 5;

/** Registered users whose name matches the search; each opens their logbook. */
export function PeopleResults({ query, onOpenLogbook }: { query: string; onOpenLogbook: (userId: string) => void }) {
  const { t } = useI18n();
  const users = useUsernames();
  const q = foldName(query.replace(/^@/, ''));
  if (q.length < 3) return null;
  const found = users
    .filter(u => foldName(u.username).includes(q))
    // Names that start with the search first.
    .sort((a, b) => Number(foldName(b.username).startsWith(q)) - Number(foldName(a.username).startsWith(q)))
    .slice(0, MAX_SHOWN);
  if (!found.length) return null;

  return (
    <section className="row-group people-results" aria-label={t.app.people.aria}>
      <h2 className="group-head"><span>{t.app.people.head}</span><span className="group-count">{found.length}</span></h2>
      <ul className="rows">
        {found.map(u => (
          <li key={u.id} className="row-item">
            <button type="button" className="row-main" onClick={() => onOpenLogbook(u.id)}>
              <span className="row-title">@{u.username}</span>
              <span className="row-meta">{t.app.people.openLogbook}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
