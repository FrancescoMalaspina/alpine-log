import { useI18n } from '../../i18n';
import type { LatLng } from '../../lib/coords';
import { findSimilarAreas, findSimilarSpots, likelyMatch } from '../../lib/duplicates';
import { activityLabel, spotTitle } from '../../lib/labels';
import type { Activity } from '../../lib/types';
import { useLookup } from '../../hooks/useLookup';

const SHOWN = 3;
/** Names shorter than this match too much to be worth asking about. */
const MIN_LENGTH = 3;

/** "Did you mean…" under a new area's name: existing areas spelled differently. */
export function SimilarAreas({ name, onPick }: { name: string; onPick: (name: string) => void }) {
  const s = useI18n().t.spot.similar;
  const typed = name.trim();
  const found = useLookup(typed.length >= MIN_LENGTH ? typed : null, () => findSimilarAreas([typed]));
  const areas = found?.get(typed)?.slice(0, SHOWN) ?? [];
  if (!areas.length) return null;
  return (
    <div className="similar" role="status">
      <span>{s.didYouMean}</span>
      {areas.map(a => (
        <button key={a.area_id} type="button" className="btn-link" onClick={() => onPick(a.name)}>
          {a.name} <span className="hint">({s.spots(a.place_count)})</span>
        </button>
      ))}
    </div>
  );
}

type SpotProps = {
  name: string;
  activity: Activity;
  sector: string;
  pin: LatLng | null;
  /** What to offer next to each existing spot: open it, or log the visit there. */
  action: { label: string; onPick: (placeId: number) => void };
};

/** Existing spots like the one being added. Never blocks saving: two spots may well share a name. */
export function SimilarSpots({ name, activity, sector, pin, action }: SpotProps) {
  const s = useI18n().t.spot.similar;
  const query = { key: 'typed', name: name.trim(), activity, sector, lat: pin?.lat, lng: pin?.lng };
  // A pin moved by a few metres needn't ask again.
  const key = query.name.length >= MIN_LENGTH
    ? JSON.stringify([query.name, activity, sector, pin?.lat.toFixed(3), pin?.lng.toFixed(3)])
    : null;
  const found = useLookup(key, () => findSimilarSpots([query]));
  const spots = found?.get('typed')?.slice(0, SHOWN) ?? [];
  if (!spots.length) return null;
  const likely = !!likelyMatch(query, spots);
  return (
    <div className={`similar similar-spots${likely ? ' likely' : ''}`} role="status">
      <span>{likely ? s.looksLikeExisting : s.alreadyOnMap}</span>
      <ul>
        {spots.map(m => (
          <li key={m.place_id}>
            <span>
              <strong>{spotTitle(m.name, m.sector_name)}</strong>
              <span className="hint">
                {[m.area_name, activityLabel(m.activity), m.distance_km != null && s.km(m.distance_km)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button type="button" className="btn-link" onClick={() => action.onPick(m.place_id)}>{action.label}</button>
          </li>
        ))}
      </ul>
      <span className="hint">{s.newIsFine}</span>
    </div>
  );
}
