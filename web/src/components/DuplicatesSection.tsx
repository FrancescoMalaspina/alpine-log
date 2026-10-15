import { useState } from 'react';
import { useI18n } from '../i18n';
import { findDuplicatePairs, type DuplicatePair } from '../lib/duplicates';
import { activityLabel, errorMessage, spotTitle } from '../lib/labels';
import type { Area, Place } from '../lib/types';
import type { MergeTarget } from './MergeModal';
import { ErrorText } from './Modal';

type Props = {
  places: Place[];
  areas: Area[];
  onMerge: (target: MergeTarget) => void;
};

type Pairs = Awaited<ReturnType<typeof findDuplicatePairs>>;

/** Admins: spots and areas that look alike, to merge. Loaded on demand (it compares every spot with every other). */
export function DuplicatesSection({ places, areas, onMerge }: Props) {
  const { t } = useI18n();
  const s = t.spot.merge;
  const [pairs, setPairs] = useState<Pairs | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setPairs(await findDuplicatePairs(places, areas));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Pairs already merged drop out as the spots and areas reload.
  const placeIds = new Set(places.map(p => p.id));
  const areaIds = new Set(areas.map(a => a.id));
  const placeLine = (p: Place) =>
    <>{spotTitle(p.name, p.sector?.name)} <span className="hint">{[p.area?.name, activityLabel(p.activity), s.visits(p.visit_count)].filter(Boolean).join(' · ')}</span></>;
  const areaLine = (a: Area) => <>{a.name} <span className="hint">{t.spot.similar.spots(a.place_count)}</span></>;

  function list<T extends { id: number }>(title: string, kind: MergeTarget['kind'], all: DuplicatePair<T>[], line: (x: T) => React.ReactNode) {
    const ids = kind === 'place' ? placeIds : areaIds;
    const current = all.filter(p => ids.has(p.a.id) && ids.has(p.b.id));
    const rows = showAll ? current : current.filter(p => p.likely);
    return (
      <div className="duplicates-group">
        <h4>{title} <span className="hint">{s.counts(rows.length, current.length)}</span></h4>
        {rows.length === 0 ? <p className="hint">{s.none}</p> : (
          <ul className="duplicates">
            {rows.map(p => (
              <li key={`${p.a.id}-${p.b.id}`} className={p.likely ? 'likely' : undefined}>
                <div className="duplicate-pair">
                  <span>{line(p.a)}</span>
                  <span>{line(p.b)}</span>
                  <span className="hint">{s.alike(Math.round(p.similarity * 100), p.distance_km)}</span>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => onMerge({ kind, duplicate: p.b.id, keep: p.a.id })}>
                  {s.mergeEllipsis}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <section className="duplicates-section" aria-labelledby="duplicatesTitle">
      <h3 id="duplicatesTitle" className="section-title">{s.duplicatesTitle}</h3>
      <p className="hint-block">{s.duplicatesHint}</p>
      <div className="duplicates-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={load}>
          {busy ? s.looking : pairs ? s.lookAgain : s.look}
        </button>
        {pairs && (
          <label className="switch">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            {s.showAll}
          </label>
        )}
      </div>
      <ErrorText error={error} />
      {pairs && <>
        {list(s.spotsTitle, 'place', pairs.places, placeLine)}
        {list(s.areasTitle, 'area', pairs.areas, areaLine)}
      </>}
    </section>
  );
}
