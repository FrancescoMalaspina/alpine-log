import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { LatLng } from '../lib/coords';
import { searchLocations, type Location } from '../lib/geocode';

type Props = {
  query: string;
  getMapCenter: () => LatLng;
  onPick: (location: Location) => void;
};

/** Mountains, huts, villages… matching the search, from OpenStreetMap. */
export function LocationResults({ query, getMapCenter, onPick }: Props) {
  const { t } = useI18n();
  const [found, setFound] = useState<{ query: string; results: Location[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const q = query.trim();
  // Read when a search starts; changes to it alone shouldn't start one.
  const center = useRef(getMapCenter);
  useEffect(() => { center.current = getMapCenter; }, [getMapCenter]);

  useEffect(() => {
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchLocations(q, center.current(), ctrl.signal)
        .then(results => { setFound({ query: q, results }); setFailed(null); })
        .catch(e => { if (!ctrl.signal.aborted) setFailed(q + String(e)); });
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  if (q.length < 3) return null;
  const results = found?.query === q ? found.results : null;

  return (
    <section className="row-group location-results" aria-label={t.app.locations.aria}>
      <h2 className="group-head">
        <span>{t.app.locations.head}</span>
        <span className="group-count">{results ? results.length : '…'}</span>
      </h2>
      {failed?.startsWith(q) && <div className="list-empty">{t.app.locations.unreachable}</div>}
      {results && !results.length && <div className="list-empty">{t.app.locations.none(q)}</div>}
      {results && results.length > 0 && (
        <ul className="rows">
          {results.map(r => (
            <li key={r.id} className="row-item">
              <button type="button" className="row-main" onClick={() => onPick(r)}>
                <span className="row-title"><span className="location-dot" aria-hidden="true" />{r.name}</span>
                {r.detail && <span className="row-meta">{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="attribution">{t.app.locations.attribution}</p>
    </section>
  );
}
