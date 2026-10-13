import { useI18n } from '../../i18n';
import { PeopleField } from './PeopleField';
import { ACTIVITIES, gradeSuggestions } from '../../lib/labels';
import type { Activity, Partner, Route } from '../../lib/types';
import { ascentRow, type AscentRow, type VisitValues } from './visitForm';

type Props = {
  values: VisitValues;
  onChange: (patch: Partial<VisitValues>) => void;
  partners: Partner[];
  /** The spot's activity, which decides the extra fields and grade hints. */
  activity: Activity;
  /** Sectors the routes can be filed under: key is an id or "name:<name>". */
  sectors: { key: string; label: string }[];
  /** The spot's shared route list, offered while typing route names. */
  routes?: Route[];
};

/** Every field of a visit. Used by "Log a visit" and by "Add a spot" with a visit. */
export function VisitFields({ values: v, onChange, partners, activity, sectors, routes = [] }: Props) {
  const { t } = useI18n();
  const s = t.spot.visitFields;
  const f = ACTIVITIES[activity];
  const updateAscent = (key: number, patch: Partial<AscentRow>) =>
    onChange({ ascents: v.ascents.map(a => (a.key === key ? { ...a, ...patch } : a)) });
  // Typing (or picking) a route from the spot's list fills in its grade and sector.
  const setRouteName = (row: AscentRow, name: string) => {
    const listed = routes.find(r => r.name.toLowerCase() === name.trim().toLowerCase());
    updateAscent(row.key, listed
      ? { name, grade: row.grade || listed.grade || '', sectorKey: row.sectorKey || (listed.sector_id ? String(listed.sector_id) : '') }
      : { name });
  };
  const unlisted = v.ascents.some(a => a.name.trim() && !routes.some(r => r.name.toLowerCase() === a.name.trim().toLowerCase()));

  return (
    <div className="visit-block">
      <div className="visit-row">
        <label className="field-inline">
          <span className="field-label">{s.date}</span>
          <input type="date" className="visit-date" value={v.date} onChange={e => onChange({ date: e.target.value })} />
        </label>
        <div className="segmented" role="radiogroup" aria-label={s.whoCanSee}>
          {(['private', 'public'] as const).map(vis => (
            <button key={vis} type="button" role="radio" aria-checked={v.visibility === vis}
                    className={v.visibility === vis ? 'active' : ''} onClick={() => onChange({ visibility: vis })}>
              {vis === 'private' ? t.common.private : t.common.public}
            </button>
          ))}
        </div>
      </div>
      <div className="hint-block">
        {v.visibility === 'private'
          ? s.privateHint
          : s.publicHint}
      </div>

      <PeopleField label={s.withLabel} partners={partners} value={v.withPeople}
                   onChange={withPeople => onChange({ withPeople })} />

      <textarea className="visit-summary" placeholder={s.summaryPlaceholder} aria-label={s.summary} value={v.summary}
                onChange={e => onChange({ summary: e.target.value })} />
      {f.conditions && (
        <div className="visit-row">
          <input type="text" className="visit-conditions" placeholder={s.conditionsPlaceholder}
                 aria-label={s.conditions} value={v.conditions} onChange={e => onChange({ conditions: e.target.value })} />
          <label className="duration-field">
            <input type="number" inputMode="decimal" min={0.5} max={999} step={0.5} placeholder="h"
                   aria-label={s.durationHours} value={v.duration} onChange={e => onChange({ duration: e.target.value })} />
            <span>{s.hoursUnit}</span>
          </label>
        </div>
      )}
      {f.approach && (
        <div className="visit-approach">
          <textarea placeholder={s.approachPlaceholder} aria-label={s.approach} value={v.approach}
                    onChange={e => onChange({ approach: e.target.value })} />
          <textarea placeholder={s.descentPlaceholder} aria-label={s.descent} value={v.descent}
                    onChange={e => onChange({ descent: e.target.value })} />
        </div>
      )}

      {f.routes && <>
      <span className="field-label">{f.isRoute ? s.theRoute : s.routes}</span>
      {f.isRoute && <span className="hint-block">{s.routeIsSpot}</span>}
      <div className="routes-list">
        {v.ascents.map(a => (
          <div key={a.key} className="route-row">
            <input type="text" className="route-name" placeholder={s.routeName} aria-label={s.routeName} value={a.name}
                   list={routes.length ? 'spotRouteOptions' : undefined} onChange={e => setRouteName(a, e.target.value)} />
            <input type="text" className="route-grade num" placeholder={s.grade} aria-label={s.grade} value={a.grade}
                   list="visitGradeOptions" onChange={e => updateAscent(a.key, { grade: e.target.value })} />
            {sectors.length > 0 && (
              <select className="route-sector" value={a.sectorKey} aria-label={s.sector}
                      onChange={e => updateAscent(a.key, { sectorKey: e.target.value })}>
                <option value="">{s.noSector}</option>
                {sectors.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            )}
            <input type="text" className="route-comment" placeholder={s.comment} aria-label={s.comment} value={a.comment}
                   onChange={e => updateAscent(a.key, { comment: e.target.value })} />
            <button type="button" aria-label={s.removeRoute}
                    onClick={() => onChange({ ascents: v.ascents.filter(x => x.key !== a.key) })}>×</button>
          </div>
        ))}
      </div>
      <datalist id="visitGradeOptions">{gradeSuggestions(activity).map(g => <option key={g} value={g} />)}</datalist>
      {routes.length > 0 && (
        <datalist id="spotRouteOptions">
          {routes.map(r => <option key={r.id} value={r.name}>{r.grade ?? ''}</option>)}
        </datalist>
      )}
      <button type="button" className="btn-add-route" onClick={() => onChange({ ascents: [...v.ascents, ascentRow()] })}>
        {f.isRoute ? s.addAnotherRoute : s.addRoute}
      </button>
      {f.sectors && unlisted && (
        <label className="switch small">
          <input type="checkbox" checked={v.addRoutes} onChange={e => onChange({ addRoutes: e.target.checked })} />
          {s.addToSharedList}
        </label>
      )}
      </>}
    </div>
  );
}
