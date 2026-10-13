import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { formatCoords } from '../../lib/coords';
import { reverseGeocode } from '../../lib/geocode';
import { ACTIVITIES, errorMessage, formatDate, formatHours } from '../../lib/labels';
import {
  readTrackFile, summarize, trackVisit, trimTrack, usefulTrackName, TRACK_ACCEPT, type TrackPoint3,
} from '../../lib/tracks';
import type { Activity } from '../../lib/types';
import { ErrorText } from '../Modal';
import { TRACK_ACTIVITIES, type PlaceValues, type TrackDraft } from './placeForm';

type Field = 'name' | 'sectorName' | 'coords' | 'parking' | 'start' | 'altitude' | 'gain' | 'distance' | 'startLocality';

type Props = {
  activity: Activity;
  draft: TrackDraft | null;
  onDraft: (draft: TrackDraft | null) => void;
  /** The spot being written, to fill in from the track; left out when logging a visit to an existing spot. */
  fields?: { values: PlaceValues; onChange: (patch: Partial<PlaceValues>) => void };
  /** A visit is logged with the track: it takes the track's date and duration. */
  withVisit?: boolean;
};

/**
 * Load a track recorded by another app. On ski tours, hikes, trail runs and
 * alpine climbs it's the outing: the summit (or the start) as the pin, the
 * start as the parking, altitude, gain and distance. On climbing spots it's the
 * approach: the start as the parking, the end as the pin and the attacco.
 * Only ticked fields are filled; empty fields are ticked to begin with.
 */
export function TrackLoader({ activity, draft, onDraft, fields, withVisit }: Props) {
  const { t } = useI18n();
  const s = t.spot.trackLoader;
  const pf = t.spot.placeFields;
  const v = fields?.values;
  const f = ACTIVITIES[activity];
  const approach = !TRACK_ACTIVITIES.includes(activity);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Partial<Record<Field, boolean>>>({});
  const [place, setPlace] = useState<{ locality: string | null; summit: string | null }>({ locality: null, summit: null });

  const segments = useMemo(
    () => (draft ? trimTrack(draft.file.segments, draft.trimStartM, draft.trimEndM) : []),
    [draft],
  );
  const summary = useMemo(() => summarize(segments), [segments]);
  const full = useMemo(() => (draft ? summarize(draft.file.segments) : null), [draft]);
  const pinAt = summary && (approach ? summary.end : activity === 'trail' ? summary.start : summary.highest ?? summary.start);

  // The village at the start and the peak or hut at the summit, for the name and starting point.
  const startKey = summary && v ? `${summary.start.lat.toFixed(4)},${summary.start.lng.toFixed(4)}` : '';
  const pinKey = pinAt && v && !approach ? `${pinAt.lat.toFixed(4)},${pinAt.lng.toFixed(4)}` : '';
  useEffect(() => {
    if (!summary || !pinAt || !startKey) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      Promise.all([
        reverseGeocode(summary.start, ctrl.signal).then(r => r.locality).catch(() => null),
        !pinKey || pinAt === summary.start ? Promise.resolve(null) : reverseGeocode(pinAt, ctrl.signal).then(r => r.summit).catch(() => null),
      ]).then(([locality, summit]) => { if (!ctrl.signal.aborted) setPlace({ locality, summit }); });
    }, 500);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the points move
  }, [startKey, pinKey]);

  async function load(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const parsed = readTrackFile(await file.text());
      if (!parsed) throw new Error(s.unreadable);
      setTicked({});
      setPlace({ locality: null, summit: null });
      onDraft({ fileName: file.name, file: parsed, trimStartM: 0, trimEndM: 0, save: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const fileInput = (label: string) => (
    <label className="btn btn-ghost track-load">
      {label}
      <input type="file" accept={TRACK_ACCEPT} hidden onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );

  const title = approach ? s.approachTitle : fields ? s.title : s.visitTitle;
  if (!draft) {
    return (
      <div className="track-loader field full">
        <span className="field-label">{title}</span>
        <span className="hint-block">{approach ? s.approachHint(!!fields) : s.hint}</span>
        {fileInput(s.load)}
        <ErrorText error={error} />
      </div>
    );
  }

  const trackName = usefulTrackName(draft.file.name);
  const startAt = summary && formatCoords(summary.start.lat, summary.start.lng);
  const endAt = summary && formatCoords(summary.end.lat, summary.end.lng);
  const proposals: { field: Field; label: string; value: string }[] = !summary || !v ? [] : approach ? [
    { field: 'parking' as const, label: s.parkingStart, value: startAt! },
    { field: 'coords' as const, label: s.pinEnd, value: endAt! },
    { field: 'start' as const, label: s.attaccoEnd, value: endAt! },
    { field: 'startLocality' as const, label: pf.startLocality, value: place.locality ?? '' },
  ].filter(p => p.value) : [
    { field: 'name' as const, label: pf.name, value: trackName ?? (activity === 'alpine' ? '' : place.summit ?? '') },
    ...(activity === 'alpine' ? [{ field: 'sectorName' as const, label: s.sectorMountain, value: place.summit ?? '' }] : []),
    { field: 'coords' as const, label: activity === 'trail' ? s.pinStart : s.pinSummit, value: formatCoords(pinAt!.lat, pinAt!.lng) },
    { field: 'parking' as const, label: s.parkingStart, value: startAt! },
    { field: 'startLocality' as const, label: pf.startLocality, value: place.locality ?? '' },
    ...(f.altitude && summary.maxEleM != null ? [{ field: 'altitude' as const, label: pf.maxAltitude, value: String(Math.round(summary.maxEleM)) }] : []),
    ...(f.altitude && summary.gainM != null ? [{ field: 'gain' as const, label: pf.elevationGain, value: String(Math.round(summary.gainM)) }] : []),
    ...(f.distance ? [{ field: 'distance' as const, label: pf.distance, value: summary.distanceKm.toFixed(1) }] : []),
  ].filter(p => p.value);
  const isTicked = (p: { field: Field }) => ticked[p.field] ?? !v![p.field].trim();
  const pending = proposals.filter(p => v![p.field] !== p.value);

  const apply = () => {
    const patch: Partial<PlaceValues> = {};
    for (const p of pending) if (isTicked(p)) patch[p.field] = p.value;
    fields!.onChange(patch);
    setTicked({});
  };
  const setTrim = (key: 'trimStartM' | 'trimEndM', raw: string) =>
    onDraft({ ...draft, [key]: Math.max(0, Number(raw) || 0) });

  // An approach track's times are the walk in, not the visit.
  const visit = full && !approach ? trackVisit(full) : null;
  const stats = summary && [
    `${summary.distanceKm.toFixed(1)} km`,
    summary.gainM != null ? `+${Math.round(summary.gainM)} m` : null,
    summary.maxEleM != null ? `max ${Math.round(summary.maxEleM)} m` : null,
    visit?.hours ? formatHours(visit.hours) : null,
    visit ? s.recorded(formatDate(visit.date)) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="track-loader field full">
      <div className="track-head">
        <span className="field-label">{title}</span>
        <span className="track-file">{draft.fileName}</span>
        <button type="button" className="link-btn" onClick={() => onDraft(null)}>{s.remove}</button>
      </div>
      <TrackPreview full={draft.file.segments} kept={segments} pin={pinAt} />
      {stats && <div className="hint-block num">{stats}</div>}

      <div className="track-trim">
        <label>{s.trimStart}
          <input type="number" inputMode="numeric" min={0} step={50} value={draft.trimStartM || ''} placeholder="0"
                 onChange={e => setTrim('trimStartM', e.target.value)} /> {s.metres}
        </label>
        <label>{s.trimEnd}
          <input type="number" inputMode="numeric" min={0} step={50} value={draft.trimEndM || ''} placeholder="0"
                 onChange={e => setTrim('trimEndM', e.target.value)} /> {s.metres}
        </label>
        <span className="hint">{s.trimHint}</span>
      </div>
      {!summary && <ErrorText error={s.trimmedAll} />}

      {v && proposals.length > 0 && (
        <div className="track-proposals">
          <span className="field-label">{s.fillIn}</span>
          <span className="hint-block">{s.fillInHint}</span>
          <ul>
            {proposals.map(p => {
              const done = v[p.field] === p.value;
              return (
                <li key={p.field} className={done ? 'done' : ''}>
                  <label>
                    <input type="checkbox" checked={done || isTicked(p)} disabled={done}
                           onChange={e => setTicked(x => ({ ...x, [p.field]: e.target.checked }))} />
                    <span className="track-proposal-label">{p.label}</span>
                    <span className="track-proposal-value num">{p.value}</span>
                    {!done && v[p.field].trim() && <span className="hint">({s.now(v[p.field])})</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-ghost" disabled={!pending.some(isTicked)} onClick={apply}>{s.apply}</button>
        </div>
      )}

      {withVisit && visit && (
        <div className="hint-block">{s.visitFromTrack(formatDate(visit.date), visit.hours ? formatHours(visit.hours) : null)}</div>
      )}
      <label className="field-inline">
        <input type="checkbox" checked={draft.save} onChange={e => onDraft({ ...draft, save: e.target.checked })} />
        {s.save}
      </label>
      <span className="hint-block">{s.saveHint}</span>
      <div>{fileInput(s.loadAnother)}</div>
      <ErrorText error={error} />
    </div>
  );
}

/** The track's shape, the trimmed-off parts faded, with the start and the pin marked. */
function TrackPreview({ full, kept, pin }: { full: TrackPoint3[][]; kept: TrackPoint3[][]; pin: TrackPoint3 | null }) {
  const all = full.flat();
  const lat0 = all.reduce((a, p) => a + p.lat, 0) / all.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = (p: TrackPoint3) => [p.lng * k, -p.lat] as const;
  const xs = all.map(p => p.lng * k);
  const ys = all.map(p => -p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(maxX - minX, maxY - minY) || 0.001;
  const pad = size * 0.06;
  const r = size * 0.022;
  const line = (seg: TrackPoint3[]) => seg.map(p => xy(p).join(',')).join(' ');
  const start = kept[0]?.[0];
  return (
    <svg className="track-preview" viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`}
         role="img" aria-hidden="true">
      {full.map((seg, i) => <polyline key={`f${i}`} className="track-off" points={line(seg)} vectorEffect="non-scaling-stroke" />)}
      {kept.map((seg, i) => <polyline key={`k${i}`} className="track-on" points={line(seg)} vectorEffect="non-scaling-stroke" />)}
      {start && <circle className="track-start" cx={xy(start)[0]} cy={xy(start)[1]} r={r} />}
      {pin && pin !== start && <circle className="track-pin" cx={xy(pin)[0]} cy={xy(pin)[1]} r={r} />}
    </svg>
  );
}
