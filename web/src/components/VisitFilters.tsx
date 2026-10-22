import { useI18n } from '../i18n';
import { GRADE_OPTIONS } from '../lib/grades';
import { EMPTY_VISIT_FILTERS, type Area, type Partner, type VisitFilters } from '../lib/types';
import { AreaSelect } from './AreaSelect';

/**
 * A logbook's filters, under its search. The activity has its own chips in the
 * logbook; partners are yours, so they're offered only in your own logbook.
 */
export function VisitFiltersPanel({ f, onChange, partners, areas }: {
  f: VisitFilters; onChange: (f: VisitFilters) => void; partners: Partner[]; areas: Area[];
}) {
  const { t } = useI18n();
  return (
    <div className="filters">
      <div className="filter-row-2">
        <div className="filter-group">
          <label className="filter-label" htmlFor="visitAreaFilter">{t.app.sidebar.area}</label>
          <AreaSelect id="visitAreaFilter" value={f.areaId} areas={areas} onChange={areaId => onChange({ ...f, areaId })} />
        </div>
        {partners.length > 0 && (
          <div className="filter-group">
            <label className="filter-label" htmlFor="partnerFilter">{t.app.sidebar.climbedWith}</label>
            <select id="partnerFilter" value={f.partnerId ?? ''}
                    onChange={e => onChange({ ...f, partnerId: e.target.value ? +e.target.value : null })}>
              <option value="">{t.app.sidebar.anyone}</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="filter-group">
        <span className="filter-label">{t.app.sidebar.date}</span>
        <div className="date-row">
          <input type="date" value={f.from} aria-label={t.app.sidebar.fromDate} onChange={e => onChange({ ...f, from: e.target.value })} />
          <span>{t.app.sidebar.to}</span>
          <input type="date" value={f.to} aria-label={t.app.sidebar.toDate} onChange={e => onChange({ ...f, to: e.target.value })} />
        </div>
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="gradeFilter">{t.app.sidebar.hardestGrade}</label>
        <select id="gradeFilter" value={f.minGradeRank ?? ''}
                onChange={e => onChange({ ...f, minGradeRank: e.target.value ? +e.target.value : null })}>
          <option value="">{t.app.sidebar.anyGrade}</option>
          {GRADE_OPTIONS.map(g => <option key={g.label} value={g.rank}>{g.label}</option>)}
        </select>
      </div>
      <button type="button" className="link-btn clear-all"
              onClick={() => onChange({ ...EMPTY_VISIT_FILTERS, search: f.search, activity: f.activity })}>
        {t.app.sidebar.clearFilters}
      </button>
    </div>
  );
}
