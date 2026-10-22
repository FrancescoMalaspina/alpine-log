import { useI18n } from '../i18n';
import { formatDate, formatHours } from '../lib/labels';
import { ActivityBadge } from './ActivityBadge';
import type { VisitSummary } from '../lib/types';

export function VisitRow({ visit: v, mine, onClick, onOpenUser }: {
  visit: VisitSummary; mine: boolean; onClick: () => void;
  /** Someone else's visit: opens its author's logbook. */
  onOpenUser?: (userId: string) => void;
}) {
  const { t } = useI18n();
  const facts = [
    v.partner_names.length ? t.app.sidebar.withPeople(v.partner_names.join(', ')) : null,
    v.duration_hours != null ? formatHours(v.duration_hours) : null,
    v.grades.length ? v.grades.join(', ') : null,
    v.crag_sector_names.length ? v.crag_sector_names.join(', ') : null,
  ].filter(Boolean);
  return (
    <li className="row-item">
      <button type="button" className="row-main" onClick={onClick}>
        <span className="row-kicker">
          {v.date ? <time dateTime={v.date}>{formatDate(v.date)}</time> : t.app.sidebar.noDate}
          {!mine && v.username && <span>{t.app.sidebar.by(v.username)}</span>}
          <VisibilityPill visibility={v.visibility} />
        </span>
        <span className="row-title">
          <ActivityBadge activity={v.place_activity} />{v.sector_name ? `${v.sector_name} › ` : ''}{v.place_name}
        </span>
        {v.area_name && <span className="row-meta">{v.area_name}</span>}
        {facts.length > 0 && <span className="row-meta">{facts.join('; ')}</span>}
        {v.summary && <span className="row-summary">{v.summary}</span>}
      </button>
      {!mine && v.username && onOpenUser && (
        <div className="row-actions">
          <button type="button" onClick={() => onOpenUser(v.user_id)}>{t.account.myLog.title(v.username)}</button>
        </div>
      )}
    </li>
  );
}

export function VisibilityPill({ visibility }: { visibility: 'private' | 'public' }) {
  const { t } = useI18n();
  return visibility === 'public'
    ? <span className="vis-pill public" title={t.app.sidebar.publicTitle}>{t.common.public}</span>
    : <span className="vis-pill private" title={t.app.sidebar.privateTitle}>{t.common.private}</span>;
}
