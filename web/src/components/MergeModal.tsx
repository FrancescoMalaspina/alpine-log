import { useState } from 'react';
import { useI18n } from '../i18n';
import { useConfirm } from '../hooks/useConfirm';
import { useLookup } from '../hooks/useLookup';
import { mergeAreas, mergePlaces } from '../lib/api';
import { findSimilarAreas, findSimilarSpots } from '../lib/duplicates';
import { activityLabel, errorMessage, spotTitle } from '../lib/labels';
import type { Area, Place } from '../lib/types';
import { Combobox, type ComboOption } from './forms/Combobox';
import { ErrorText, Modal } from './Modal';

export type MergeTarget = { kind: 'place' | 'area'; duplicate: number; keep?: number };

type Props = MergeTarget & {
  places: Place[];
  areas: Area[];
  onClose: () => void;
  onMerged: (kind: MergeTarget['kind'], keep: number) => void;
};

type Item = { id: number; label: string; hint: string };

/**
 * Admins: merge a spot (or area) into another. Everything of the duplicate
 * moves to the one kept, which then also takes the details it lacked.
 */
export function MergeModal({ kind, duplicate, keep: initialKeep, places, areas, onClose, onMerged }: Props) {
  const { t } = useI18n();
  const s = t.spot.merge;
  const [pair, setPair] = useState({ duplicate, keep: initialKeep ?? null as number | null });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const isPlace = kind === 'place';
  const items: Item[] = isPlace
    ? places.map(p => ({
      id: p.id,
      label: spotTitle(p.name, p.sector?.name),
      hint: [p.area?.name, activityLabel(p.activity), s.visits(p.visit_count)].filter(Boolean).join(' · '),
    }))
    : areas.map(a => ({ id: a.id, label: a.name, hint: t.spot.similar.spots(a.place_count) }));
  const itemOf = (id: number | null) => items.find(i => i.id === id) ?? null;
  const dup = itemOf(pair.duplicate);
  const kept = itemOf(pair.keep);

  // The likeliest ones to keep instead: those that look like the duplicate.
  const similar = useLookup(`${kind}-${pair.duplicate}`, async () => {
    if (isPlace) {
      const p = places.find(x => x.id === pair.duplicate)!;
      const found = await findSimilarSpots([{
        key: 'dup', name: p.name, activity: p.activity, sector: p.sector?.name, lat: p.lat, lng: p.lng, excludeId: p.id,
      }]);
      return found.get('dup')!.map(m => m.place_id);
    }
    const a = areas.find(x => x.id === pair.duplicate)!;
    return (await findSimilarAreas([a.name])).get(a.name.trim())?.map(m => m.area_id).filter(id => id !== a.id) ?? [];
  }, 0);
  const suggested = (similar ?? []).map(itemOf).filter((i): i is Item => !!i);

  const options: ComboOption[] = items.filter(i => i.id !== pair.duplicate).map(i => ({ key: i.id, label: i.label, hint: i.hint }));

  async function merge() {
    if (!dup || !kept) return;
    const what = isPlace ? places.find(p => p.id === dup.id)! : null;
    const ok = await confirm({
      title: s.confirmTitle(dup.label, kept.label),
      message: isPlace ? s.confirmPlace(dup.label, kept.label, what?.visit_count ?? 0) : s.confirmArea(dup.label, kept.label),
      confirmLabel: s.merge,
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await (isPlace ? mergePlaces(kept.id, dup.id) : mergeAreas(kept.id, dup.id));
      onMerged(kind, kept.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (!dup) return null;
  return (
    <Modal
      title={isPlace ? s.titlePlace(dup.label) : s.titleArea(dup.label)}
      subtitle={isPlace ? s.subtitlePlace : s.subtitleArea}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn btn-primary" type="button" disabled={!kept || busy} onClick={merge}>
          {kept ? s.mergeInto(kept.label) : s.merge}
        </button>
      </>}
    >
      <div className="merge-body">
        {suggested.length > 0 && (
          <fieldset className="merge-choices">
            <legend>{isPlace ? s.similarPlaces : s.similarAreas}</legend>
            {suggested.map(i => (
              <label key={i.id} className="merge-choice">
                <input type="radio" name="mergeKeep" checked={pair.keep === i.id} onChange={() => setPair(p => ({ ...p, keep: i.id }))} />
                <span>{i.label} <span className="hint">{i.hint}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="field">
          <label htmlFor="mergeSearch">{isPlace ? s.searchPlace : s.searchArea}</label>
          <Combobox id="mergeSearch" value={search} onChange={setSearch} options={options}
                    onPick={o => setPair(p => ({ ...p, keep: Number(o.key) }))} />
        </div>
        {kept && (
          <p className="merge-summary">
            {s.summary(dup.label, kept.label)}{' '}
            <button type="button" className="btn-link" onClick={() => setPair({ duplicate: kept.id, keep: dup.id })}>
              {s.swap(dup.label)}
            </button>
          </p>
        )}
        <ErrorText error={error} />
      </div>
      {confirmDialog}
    </Modal>
  );
}
