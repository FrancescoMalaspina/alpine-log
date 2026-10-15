import { useEffect, useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { useI18n } from '../i18n';
import { addTip, deleteTip, fetchTips, updateTip } from '../lib/api';
import { errorMessage, formatDate, localToday } from '../lib/labels';
import { TIP_TOPICS, type Tip, type TipInput, type TipTopic } from '../lib/types';
import { ErrorText } from './Modal';

type Props = {
  /** A spot: its own tips and its sector's. Without placeId: only the sector's. */
  placeId?: number;
  sector: { id: number; name: string } | null;
  userId: string | null;
  isAdmin: boolean;
  reloadKey: number;
  /** Called with the tips each time they load, e.g. for a count on the tab. */
  onLoaded?: (tips: Tip[]) => void;
};

/**
 * Dated tips for other climbers: conditions, gear, where to park… On a spot,
 * a tip can be posted to the whole sector, then it shows under each of its spots.
 */
export function Tips({ placeId, sector, userId, isAdmin, reloadKey, onLoaded }: Props) {
  const { t } = useI18n();
  const s = t.spot.tips;
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [topic, setTopic] = useState<TipTopic | null>(null);
  const [mine, setMine] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const sectorOnly = placeId == null;

  useEffect(() => {
    let cancelled = false;
    fetchTips({ placeId, sectorId: sector?.id ?? null })
      .then(rows => { if (!cancelled) { setTips(rows); onLoaded?.(rows); } })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLoaded is a notification, not an input
  }, [placeId, sector?.id, reloadKey, mine]);

  async function post(tip: TipInput, toSector: boolean) {
    await addTip(toSector || sectorOnly ? { sectorId: sector!.id } : { placeId: placeId! }, tip);
    setMine(n => n + 1);
  }

  async function save(id: number, tip: TipInput) {
    await updateTip(id, tip);
    setEditing(null);
    setMine(n => n + 1);
  }

  async function remove(tip: Tip) {
    if (!await confirm({ title: s.confirmDelete, message: tip.body.slice(0, 140), confirmLabel: t.common.delete, danger: true })) return;
    setError(null);
    try {
      await deleteTip(tip.id);
      setMine(n => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const shown = (tips ?? []).filter(x => !topic || x.topic === topic);
  const usedTopics = TIP_TOPICS.filter(x => tips?.some(tip => tip.topic === x));

  return (
    <section className="tips">
      {userId ? (
        <TipForm key={`new-${mine}`} canPostToSector={!sectorOnly && !!sector} sectorName={sector?.name}
                 onSubmit={post} submitLabel={sectorOnly ? s.postToSector : s.post} />
      ) : <p className="hint-block">{s.signInToPost}</p>}

      {usedTopics.length > 1 && (
        <div className="chip-row" role="group" aria-label={s.filterByTopic}>
          <label className="type-option small">
            <input type="radio" name="tipTopic" checked={!topic} onChange={() => setTopic(null)} />{s.all}
          </label>
          {usedTopics.map(x => (
            <label key={x} className="type-option small">
              <input type="radio" name="tipTopic" checked={topic === x} onChange={() => setTopic(x)} />{s.topics[x]}
            </label>
          ))}
        </div>
      )}
      <ErrorText error={error} />
      {tips && !tips.length && <div className="empty">{sectorOnly ? s.noneSector : s.none}</div>}
      <ul className="tip-list">
        {shown.map(tip => (
          <li key={tip.id} className="tip">
            {editing === tip.id ? (
              <TipForm initial={tip} canPostToSector={false} onSubmit={tipInput => save(tip.id, tipInput)}
                       submitLabel={t.common.save} onCancel={() => setEditing(null)} />
            ) : <>
              <div className="tip-meta">
                {tip.topic && <span className="tip-topic">{s.topics[tip.topic]}</span>}
                {tip.sector_id && !sectorOnly && <span className="tip-scope">{s.forSector(sector?.name ?? '')}</span>}
                <span>{tip.username ?? s.someone}</span>
                <time dateTime={tip.created_at}>{formatDate(tip.created_at.slice(0, 10))}</time>
                {tip.observed_on && <span className="hint">{s.observedOn(formatDate(tip.observed_on))}</span>}
              </div>
              <p className="tip-body">{tip.body}</p>
              {(tip.user_id === userId || isAdmin) && (
                <div className="tip-actions">
                  {tip.user_id === userId && (
                    <button type="button" className="link-btn" onClick={() => setEditing(tip.id)}>{t.common.edit}</button>
                  )}
                  <button type="button" className="link-btn danger" onClick={() => remove(tip)}>{t.common.delete}</button>
                </div>
              )}
            </>}
          </li>
        ))}
      </ul>
      {confirmDialog}
    </section>
  );
}

function TipForm({ initial, canPostToSector, sectorName, onSubmit, submitLabel, onCancel }: {
  initial?: Tip; canPostToSector: boolean; sectorName?: string;
  onSubmit: (tip: TipInput, toSector: boolean) => Promise<void>; submitLabel: string; onCancel?: () => void;
}) {
  const { t } = useI18n();
  const s = t.spot.tips;
  const [body, setBody] = useState(initial?.body ?? '');
  const [topic, setTopic] = useState<TipTopic | null>(initial?.topic ?? null);
  const [observedOn, setObservedOn] = useState(initial?.observed_on ?? '');
  const [toSector, setToSector] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ body, topic, observed_on: observedOn || null }, toSector);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="tip-form" onSubmit={submit}>
      <textarea value={body} maxLength={2000} required placeholder={s.placeholder} aria-label={s.tip}
                onChange={e => setBody(e.target.value)} />
      <TipTopicPicker name={`topic-${initial?.id ?? 'new'}`} value={topic} onChange={setTopic} />
      <div className="tip-form-row">
        <label className="field-inline">
          <span className="hint">{s.observedOnLabel}</span>
          <input type="date" value={observedOn} max={localToday()} onChange={e => setObservedOn(e.target.value)} />
        </label>
        {canPostToSector && (
          <label className="field-inline">
            <input type="checkbox" checked={toSector} onChange={e => setToSector(e.target.checked)} />
            {s.toAllSpots(sectorName ?? '')}
          </label>
        )}
      </div>
      <ErrorText error={error} />
      <div className="tip-form-row">
        {onCancel && <button type="button" className="btn btn-quiet" onClick={onCancel}>{t.common.cancel}</button>}
        <button type="submit" className="btn btn-ghost" disabled={busy || !body.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}

/** A tip's topic as chips; clicking the chosen one again clears it. */
export function TipTopicPicker({ name, value, onChange }: {
  name: string; value: TipTopic | null; onChange: (topic: TipTopic | null) => void;
}) {
  const { t } = useI18n();
  const s = t.spot.tips;
  return (
    <div className="chip-row" role="radiogroup" aria-label={s.topic}>
      {TIP_TOPICS.map(x => (
        <label key={x} className="type-option small">
          <input type="radio" name={name} checked={value === x}
                 onClick={() => { if (value === x) onChange(null); }} onChange={() => onChange(x)} />
          {s.topics[x]}
        </label>
      ))}
    </div>
  );
}
