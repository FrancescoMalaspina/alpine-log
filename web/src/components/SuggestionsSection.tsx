import { useEffect, useState } from 'react';
import { useI18n, type Dict } from '../i18n';
import { approveSuggestion, fetchPendingSuggestions, rejectSuggestion, type PendingSuggestion } from '../lib/api';
import { formatCoords } from '../lib/coords';
import { activityLabel, errorMessage, formatDate, protectionLabel } from '../lib/labels';
import type { Activity, PlaceInput, Protection } from '../lib/types';
import { ErrorText } from './Modal';

type Fields = Partial<PlaceInput>;
type Labels = Dict['spot']['placeFields'];

/**
 * The rows of a suggestion, in the form's order. Fields in one row are approved together,
 * as the server does (private.spot_field_group).
 */
const ROWS: { keys: (keyof PlaceInput)[]; label: (s: Labels) => string; show?: (f: Fields) => string }[] = [
  { keys: ['name'], label: s => s.name },
  { keys: ['activity'], label: s => s.activity, show: f => (f.activity ? activityLabel(f.activity as Activity) : '') },
  { keys: ['area_name', 'sector_name'], label: s => `${s.area} › ${s.sector}`,
    show: f => [f.area_name, f.sector_name].filter(Boolean).join(' › ') },
  { keys: ['lat', 'lng'], label: s => s.mapPin, show: f => formatCoords(f.lat, f.lng) },
  { keys: ['parking_lat', 'parking_lng'], label: s => s.parking, show: f => formatCoords(f.parking_lat, f.parking_lng) },
  { keys: ['start_lat', 'start_lng'], label: s => s.start, show: f => formatCoords(f.start_lat, f.start_lng) },
  { keys: ['grade'], label: s => s.grade },
  { keys: ['grade_obligatory'], label: s => s.gradeObligatory },
  { keys: ['alpine_grade'], label: s => s.alpineGrade },
  { keys: ['aid'], label: s => s.aid },
  { keys: ['pitches'], label: s => s.pitches },
  { keys: ['length_m'], label: s => s.length },
  { keys: ['protection'], label: s => s.protection, show: f => (f.protection ? protectionLabel(f.protection as Protection) : '') },
  { keys: ['rock'], label: s => s.rock },
  { keys: ['exposition'], label: s => s.faces, show: f => (f.exposition ?? []).join(', ') },
  { keys: ['max_altitude'], label: s => s.maxAltitude },
  { keys: ['elevation_gain'], label: s => s.elevationGain },
  { keys: ['distance_km'], label: s => s.distance },
  { keys: ['country'], label: s => s.country },
  { keys: ['province'], label: s => s.province },
  { keys: ['start_locality'], label: s => s.startLocality },
  { keys: ['description'], label: s => s.description },
];

type Row = (typeof ROWS)[number];
const showRow = (row: Row, f: Fields) => (row.show ? row.show(f) : String(f[row.keys[0]] ?? '')) || '—';
const sameIn = (row: Row, a: Fields, b: Fields) => row.keys.every(k => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

type Props = {
  onOpenPlace: (placeId: number) => void;
  /** After an approval, so the spots reload. */
  onChanged: () => void;
};

/** Admins: changes people suggested to spots they didn't add, to approve (all or some fields) or reject. */
export function SuggestionsSection({ onOpenPlace, onChanged }: Props) {
  const { t } = useI18n();
  const s = t.spot.review;
  const [pending, setPending] = useState<PendingSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPendingSuggestions()
      .then(r => { if (!cancelled) setPending(r); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  const done = (id: number, approved: boolean) => {
    setPending(list => list?.filter(x => x.id !== id) ?? null);
    if (approved) onChanged();
  };

  return (
    <section className="suggestions-section" aria-labelledby="suggestionsTitle">
      <h3 id="suggestionsTitle" className="section-title">
        {s.title} {pending && <span className="tab-count">{pending.length}</span>}
      </h3>
      <p className="hint-block">{s.hint}</p>
      <ErrorText error={error} />
      {pending?.length === 0 && <p className="hint">{s.none}</p>}
      {pending?.map(x => <SuggestionCard key={x.id} suggestion={x} onOpenPlace={onOpenPlace} onDone={done} />)}
    </section>
  );
}

function SuggestionCard({ suggestion: x, onOpenPlace, onDone }: {
  suggestion: PendingSuggestion; onOpenPlace: (placeId: number) => void; onDone: (id: number, approved: boolean) => void;
}) {
  const { t } = useI18n();
  const s = t.spot.review;
  const rows = ROWS.filter(r => r.keys.some(k => k in x.changes));
  const [chosen, setChosen] = useState(() => new Set(rows));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (row: Row) => setChosen(set => {
    const next = new Set(set);
    if (!next.delete(row)) next.add(row);
    return next;
  });

  async function review(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (approve) await approveSuggestion(x.id, [...chosen].map(r => r.keys[0]), note);
      else await rejectSuggestion(x.id, note);
      onDone(x.id, approve);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <article className="suggestion-card">
      <header className="suggestion-head">
        <button type="button" className="link-btn suggestion-spot" onClick={() => onOpenPlace(x.place_id)}>{x.place_name}</button>
        <span className="hint">{s.by(x.author_name, formatDate(x.created_at.slice(0, 10)))}</span>
      </header>
      {x.note && <p className="suggestion-note">{x.note}</p>}
      <table className="suggestion-fields">
        <thead>
          <tr><th scope="col"><span className="visually-hidden">{s.take}</span></th><th scope="col">{s.field}</th><th scope="col">{s.now}</th><th scope="col">{s.suggested}</th></tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const label = row.label(t.spot.placeFields);
            return (
              <tr key={label}>
                <td><input type="checkbox" checked={chosen.has(row)} onChange={() => toggle(row)} aria-label={s.takeField(label)} /></td>
                <th scope="row">{label}</th>
                <td className="suggestion-now">
                  {showRow(row, x.current)}
                  {!sameIn(row, x.base, x.current) && <span className="suggestion-changed">{s.changedSince(showRow(row, x.base))}</span>}
                </td>
                <td className="suggestion-new">{showRow(row, x.changes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="suggestion-actions">
        <input type="text" value={note} maxLength={2000} placeholder={s.notePlaceholder} aria-label={s.notePlaceholder}
               onChange={e => setNote(e.target.value)} />
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => review(false)}>{s.reject}</button>
        <button type="button" className="btn btn-primary" disabled={busy || chosen.size === 0} onClick={() => review(true)}>
          {chosen.size === rows.length ? s.approve : s.approveSome(chosen.size)}
        </button>
      </div>
      <ErrorText error={error} />
    </article>
  );
}
