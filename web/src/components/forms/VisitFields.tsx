import { useI18n } from '../../i18n';
import { TipTopicPicker } from '../Tips';
import { PeopleField } from './PeopleField';
import { ACTIVITIES, gradeSuggestions, styleLabel } from '../../lib/labels';
import { ASCENT_STYLES, type Activity, type AscentStyle, type Partner, type Route } from '../../lib/types';
import { ascentRow, type AscentRow, type VisitValues } from './visitForm';

type Props = {
  values: VisitValues;
  onChange: (patch: Partial<VisitValues>) => void;
  partners: Partner[];
  /** The spot's activity, which decides the extra fields and grade hints. */
  activity: Activity;
  /**
   * The other spots of the spot's sector (the crag's other walls): a route can
   * be logged on one of them, so a day across walls stays one visit.
   */
  walls: { id: number; name: string }[];
  /** The visit's own spot, the first choice of the wall dropdown. */
  spotName: string;
  /** The spot's shared route list, offered while typing route names. */
  routes?: Route[];
  /** The spot's topo values, shown as what your climb overrides. */
  spotDetails?: { grade: string | null; pitches: number | null; aid: string | null };
};

/** Every field of a visit. Used by "Log a visit" and by "Add a spot" with a visit. */
export function VisitFields({ values: v, onChange, partners, activity, walls, spotName, routes = [], spotDetails }: Props) {
  const { t } = useI18n();
  const s = t.spot.visitFields;
  const f = ACTIVITIES[activity];
  const updateAscent = (key: number, patch: Partial<AscentRow>) =>
    onChange({ ascents: v.ascents.map(a => (a.key === key ? { ...a, ...patch } : a)) });
  // Typing (or picking) a route from the spot's list fills in its grade.
  const setRouteName = (row: AscentRow, name: string) => {
    const listed = !row.wallId && routes.find(r => r.name.toLowerCase() === name.trim().toLowerCase());
    updateAscent(row.key, listed ? { name, grade: row.grade || listed.grade || '' } : { name });
  };
  // At a route-type spot, the first row is your climb of that route; any others are other routes that day.
  const first = f.isRoute ? v.ascents[0] : undefined;
  const others = f.isRoute ? v.ascents.slice(1) : v.ascents;
  const topo = (value: string | null | undefined) => (value ? s.asTopo(value) : '');
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
      <details className="other-ropes" open={v.otherPeople.length > 0 || undefined}>
        <summary>{s.otherRopes(v.otherPeople.length)}</summary>
        <PeopleField label={s.otherRopesLabel} partners={partners} value={v.otherPeople}
                     onChange={otherPeople => onChange({ otherPeople })} />
      </details>

      <div className="visit-row">
        <div className="rating-field" role="radiogroup" aria-label={s.rating}>
          <span className="field-label">{s.rating}</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" role="radio" aria-checked={v.rating === n} aria-label={s.stars(n)}
                    className={`star${v.rating != null && n <= v.rating ? ' on' : ''}`}
                    onClick={() => onChange({ rating: v.rating === n ? null : n })}>★</button>
          ))}
        </div>
        {f.conditions && (
          <label className="duration-field">
            <input type="number" inputMode="decimal" min={0.5} max={999} step={0.5} placeholder="h"
                   aria-label={s.durationHours} value={v.duration} onChange={e => onChange({ duration: e.target.value })} />
            <span>{s.hoursUnit}</span>
          </label>
        )}
      </div>

      {f.routes && <>
      {f.isRoute && first && <>
        <span className="field-label">{s.yourClimb}</span>
        <span className="hint-block">{s.yourClimbHint}</span>
        <div className="your-climb">
          {first.name.trim() !== '' && (
            <label className="your-climb-wide"><span>{s.routeName}</span>
              <input type="text" value={first.name} placeholder={spotName} onChange={e => updateAscent(first.key, { name: e.target.value })} />
            </label>
          )}
          <label><span>{s.style}</span>
            <select value={first.style ?? ''} onChange={e => updateAscent(first.key, { style: (e.target.value || null) as AscentStyle | null })}>
              <option value="">–</option>
              {ASCENT_STYLES.map(st => <option key={st} value={st}>{styleLabel(st)}</option>)}
            </select>
          </label>
          <label><span>{s.yourGrade}</span>
            <input type="text" className="num" value={first.grade} list="visitGradeOptions"
                   placeholder={topo(spotDetails?.grade)} onChange={e => updateAscent(first.key, { grade: e.target.value })} />
          </label>
          {f.pitches && <>
            <label><span>{s.pitchesDone}</span>
              <input type="number" inputMode="numeric" min={1} max={200} value={first.pitches}
                     placeholder={topo(spotDetails?.pitches?.toString())} onChange={e => updateAscent(first.key, { pitches: e.target.value })} />
            </label>
            <label><span>{s.aidUsed}</span>
              <input type="text" value={first.aid} placeholder={topo(spotDetails?.aid)}
                     onChange={e => updateAscent(first.key, { aid: e.target.value })} />
            </label>
          </>}
          <label className="your-climb-wide"><span>{s.comment}</span>
            <input type="text" value={first.comment} placeholder={s.yourClimbComment}
                   onChange={e => updateAscent(first.key, { comment: e.target.value })} />
          </label>
        </div>
        {others.length > 0 && <span className="field-label">{s.otherRoutes}</span>}
      </>}
      {!f.isRoute && <span className="field-label">{s.routes}</span>}
      <div className="routes-list">
        {others.map(a => (
          <div key={a.key} className="route-item">
          <div className="route-row">
            <input type="text" className="route-name" placeholder={s.routeName} aria-label={s.routeName} value={a.name}
                   list={routes.length ? 'spotRouteOptions' : undefined} onChange={e => setRouteName(a, e.target.value)} />
            <input type="text" className="route-grade num" placeholder={s.grade} aria-label={s.grade} value={a.grade}
                   list="visitGradeOptions" onChange={e => updateAscent(a.key, { grade: e.target.value })} />
            {walls.length > 0 && (
              <select className="route-sector" value={a.wallId} aria-label={s.wall}
                      onChange={e => updateAscent(a.key, { wallId: e.target.value })}>
                <option value="">{spotName}</option>
                {walls.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <input type="text" className="route-comment" placeholder={s.comment} aria-label={s.comment} value={a.comment}
                   onChange={e => updateAscent(a.key, { comment: e.target.value })} />
            <button type="button" aria-label={s.removeRoute}
                    onClick={() => onChange({ ascents: v.ascents.filter(x => x.key !== a.key) })}>×</button>
          </div>
          <div className="route-extra">
            <select className="route-style" value={a.style ?? ''} aria-label={s.style}
                    onChange={e => updateAscent(a.key, { style: (e.target.value || null) as AscentStyle | null })}>
              <option value="">{s.styleUnset}</option>
              {ASCENT_STYLES.map(st => <option key={st} value={st}>{styleLabel(st)}</option>)}
            </select>
            {f.pitches && <>
              <label className="route-override">
                <span>{s.pitches}</span>
                <input type="number" inputMode="numeric" min={1} max={200} value={a.pitches}
                       placeholder={spotDetails?.pitches?.toString() ?? ''} aria-label={s.pitchesOverride}
                       onChange={e => updateAscent(a.key, { pitches: e.target.value })} />
              </label>
              <label className="route-override">
                <span>{s.aid}</span>
                <input type="text" value={a.aid} placeholder={spotDetails?.aid ?? ''} aria-label={s.aidOverride}
                       onChange={e => updateAscent(a.key, { aid: e.target.value })} />
              </label>
            </>}
          </div>
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
      {f.routeList && unlisted && (
        <label className="switch small">
          <input type="checkbox" checked={v.addRoutes} onChange={e => onChange({ addRoutes: e.target.checked })} />
          {s.addToSharedList}
        </label>
      )}
      </>}

      <fieldset className="visit-section">
        <legend>{s.notesTitle}</legend>
        <span className="hint-block">{s.notesHint}</span>
        <textarea className="visit-summary" placeholder={s.summaryPlaceholder} aria-label={s.summary} value={v.summary}
                  onChange={e => onChange({ summary: e.target.value })} />
        {f.conditions && (
          <input type="text" placeholder={s.conditionsPlaceholder} aria-label={s.conditions} value={v.conditions}
                 onChange={e => onChange({ conditions: e.target.value })} />
        )}
        {f.approach && (
          <div className="visit-approach">
            <textarea placeholder={s.approachPlaceholder} aria-label={s.approach} value={v.approach}
                      onChange={e => onChange({ approach: e.target.value })} />
            <textarea placeholder={s.descentPlaceholder} aria-label={s.descent} value={v.descent}
                      onChange={e => onChange({ descent: e.target.value })} />
          </div>
        )}
      </fieldset>

      <fieldset className="visit-section">
        <legend>{s.tipTitle}</legend>
        <span className="hint-block">{s.tipHint}</span>
        <textarea maxLength={2000} placeholder={t.spot.tips.placeholder} aria-label={s.tipTitle} value={v.tip}
                  onChange={e => onChange({ tip: e.target.value })} />
        <TipTopicPicker name="visit-tip-topic" value={v.tipTopic} onChange={tipTopic => onChange({ tipTopic })} />
      </fieldset>
    </div>
  );
}
