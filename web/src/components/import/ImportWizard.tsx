import { useEffect, useMemo, useRef, useState } from 'react';
import { askImportAssist, importLogbook, type ImportResult } from '../../lib/api';
import { errorMessage } from '../../lib/labels';
import { autoMap, loadPreset, savePreset, type SheetMapping } from '../../lib/import/automap';
import { FIELDS, type FieldId } from '../../lib/import/fields';
import { parseFile, type ParsedFile, type RawTable } from '../../lib/import/parse';
import {
  buildPayload, geocodeSpots, isReady, matchAreas, matchExisting, rematch, type AreaChoice, type ResolvedSpot,
} from '../../lib/import/resolve';
import { applyMapping, fromBackup, mergeSpots } from '../../lib/import/rows';
import type { Activity, Visibility } from '../../lib/types';
import { useI18n } from '../../i18n';
import { ErrorText, Modal } from '../Modal';
import { ColumnsStep } from './ColumnsStep';
import { SpotsStep } from './SpotsStep';

type Props = {
  onClose: () => void;
  onImported: () => void;
};

type Step = 'file' | 'columns' | 'spots' | 'confirm' | 'done';

type AssistAnswer = {
  sheets: { name: string; activity: Activity | 'unknown'; date_order: 'dmy' | 'mdy'; columns: { index: number; field: FieldId; group: number }[] }[];
};

const cellText = (v: unknown) => (v == null ? '' : String(v));

/** Imports visits from a spreadsheet, CSV or JSON file: pick, map columns, place spots, confirm. */
export function ImportWizard({ onClose, onImported }: Props) {
  const { t } = useI18n();
  const w = t.import.wizard;
  const [step, setStep] = useState<Step>('file');
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [mappings, setMappings] = useState<SheetMapping[]>([]);
  const [spots, setSpots] = useState<ResolvedSpot[]>([]);
  const [areas, setAreas] = useState<AreaChoice[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [hidePartners, setHidePartners] = useState(true);
  const [assisting, setAssisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const tables: RawTable[] = file?.kind === 'tables' ? file.tables : [];
  const drafts = useMemo(() => {
    if (!file) return null;
    if (file.kind === 'alpine-log') return fromBackup(file.data);
    const each = file.tables.map((t, i) => (mappings[i]?.include ? applyMapping(t, mappings[i]) : { spots: [], skipped: [] }));
    return { spots: mergeSpots(each.flatMap(e => e.spots)), skipped: each.flatMap(e => e.skipped) };
  }, [file, mappings]);

  async function pick(f: File) {
    setError(null);
    setProgress(w.reading);
    try {
      const parsed = await parseFile(f);
      setFile(parsed);
      if (parsed.kind === 'tables') {
        if (!parsed.tables.length) throw new Error(w.noTable);
        setMappings(parsed.tables.map(t => loadPreset(t) ?? autoMap(t)));
        setStep('columns');
        setProgress(null);
      } else {
        await resolve(fromBackup(parsed.data).spots);
      }
    } catch (e) {
      setError(w.cantRead(errorMessage(e)));
      setProgress(null);
    }
  }

  async function findPins(list: ResolvedSpot[], ctrl: AbortController) {
    // Pins from the file or set by hand stay; geocoded ones are looked up again.
    const reset = list.map(s => (s.pinSource === 'geocoded' ? { ...s, lat: null, lng: null, pinSource: null, pinLabel: '' } : s));
    const done = await geocodeSpots(reset, country, (n, total) => setProgress(w.findingPins(n, total)), ctrl.signal);
    setSpots(done);
    return done;
  }

  async function resolve(list = drafts?.spots ?? []) {
    setStep('spots');
    setError(null);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      setProgress(w.lookingForSpots);
      const matched = await matchExisting(list);
      setSpots(matched);
      setAreas([]);
      // Areas are also looked for near the pins.
      setAreas(await matchAreas(await findPins(matched, ctrl)));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(errorMessage(e));
    } finally {
      if (abort.current === ctrl) setProgress(null);
    }
  }

  async function refindPins() {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await findPins(spots, ctrl);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(errorMessage(e));
    } finally {
      if (abort.current === ctrl) setProgress(null);
    }
  }

  const patchSpot = (key: string, patch: Partial<ResolvedSpot>) =>
    setSpots(ss => ss.map(s => (s.key === key ? { ...s, ...patch } : s)));

  /** Undoes the "Mountain - route" split, and looks for the whole name among existing spots. */
  async function keepWhole(s: ResolvedSpot) {
    const whole = { ...s, name: s.splitFrom, sector: '', splitFrom: '' };
    patchSpot(s.key, whole);
    try {
      const { matches, choice } = await rematch(whole);
      patchSpot(s.key, { matches, choice });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function ask() {
    setError(null);
    setAssisting(true);
    try {
      const included = tables.map((t, i) => ({ t, i })).filter(({ i }) => mappings[i].include);
      const answer = await askImportAssist<AssistAnswer>({
        fields: FIELDS.map(f => ({ id: f.id, label: f.label })),
        sheets: included.map(({ t, i }) => ({
          name: t.name,
          headers: t.headers,
          samples: t.rows.slice(0, 5).map(r => r.map((c, col) =>
            hidePartners && mappings[i].columns[col].field === 'visit.partners' && c.v != null
              ? String(c.v).split(/[,;]/).map((_, k) => `Partner ${k + 1}`).join(', ')
              : cellText(c.v))),
        })),
      });
      setMappings(ms => ms.map((m, i) => {
        const k = included.findIndex(x => x.i === i);
        const a = k >= 0 ? answer.sheets[k] : null;
        if (!a) return m;
        return {
          ...m,
          activity: a.activity === 'unknown' ? m.activity : a.activity,
          dateOrder: a.date_order,
          columns: m.columns.map((c, col) => {
            const s = a.columns.find(x => x.index === col);
            return s ? { field: s.field, group: s.group, confidence: 0.8 } : c;
          }),
        };
      }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAssisting(false);
    }
  }

  function toSpots() {
    const unset = tables.filter((_, i) => mappings[i].include && !mappings[i].activity
      && !mappings[i].columns.some(c => c.field === 'spot.activity'));
    if (unset.length) return setError(w.chooseActivity(unset.map(x => `“${x.name}”`).join(', ')));
    if (!drafts?.spots.length) return setError(w.nothingToImport);
    tables.forEach((t, i) => { if (mappings[i].include) savePreset(t, mappings[i]); });
    void resolve();
  }

  const payload = useMemo(
    () => (step === 'confirm' && file ? buildPayload(file.fileName, spots, areas, visibility) : null),
    [step, file, spots, areas, visibility]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      setResult(await importLogbook(payload!));
      setStep('done');
      onImported();
    } catch (e) {
      setError(w.failed(errorMessage(e)));
    } finally {
      setSaving(false);
    }
  }

  const used = spots.filter(s => s.choice !== 'skip');
  const visitCount = used.reduce((n, s) => n + s.visits.length, 0);
  const notReady = spots.filter(s => !isReady(s)).length;

  const subtitle = {
    file: t.import.steps.file,
    columns: t.import.steps.columns,
    spots: t.import.steps.spots,
    confirm: t.import.steps.confirm,
    done: null,
  }[step];

  const back = (to: Step) => () => { abort.current?.abort(); setProgress(null); setError(null); setStep(to); };

  const footer = {
    file: <button className="btn btn-ghost" type="button" onClick={onClose}>{t.common.cancel}</button>,
    columns: <>
      <button className="btn btn-ghost" type="button" onClick={back('file')}>{t.common.back}</button>
      <button className="btn btn-primary" type="button" onClick={toSpots}>{w.next}</button>
    </>,
    spots: <>
      <button className="btn btn-ghost" type="button" onClick={back(file?.kind === 'tables' ? 'columns' : 'file')}>{t.common.back}</button>
      <button className="btn btn-primary" type="button" disabled={!!progress || notReady > 0 || !used.length}
              onClick={() => { setError(null); setStep('confirm'); }}>
        {notReady > 0 ? t.import.counts.spotsWithoutPin(notReady) : w.nextConfirm}
      </button>
    </>,
    confirm: <>
      <button className="btn btn-ghost" type="button" onClick={back('spots')}>{t.common.back}</button>
      <button className="btn btn-primary" type="button" disabled={saving} onClick={save}>
        {saving ? w.importing : w.importVisits(visitCount)}
      </button>
    </>,
    done: <button className="btn btn-primary" type="button" onClick={onClose}>{t.common.done}</button>,
  }[step];

  return (
    <Modal title={t.import.title} subtitle={subtitle} onClose={onClose} className="modal-wide" footer={footer}>
      {step === 'file' && (
        <div className="import-body">
          <label className="import-drop"
                 onDragOver={e => e.preventDefault()}
                 onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void pick(f); }}>
            <input type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.json,.numbers"
                   onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
            <span className="import-drop-title">{progress ?? w.dropTitle}</span>
            <span className="hint">{w.dropHint}</span>
          </label>
          <p className="hint-block">
            {w.anyLayout}
          </p>
        </div>
      )}

      {step === 'columns' && (
        <ColumnsStep
          tables={tables}
          mappings={mappings}
          onChange={(i, m) => setMappings(ms => ms.map((x, k) => (k === i ? m : x)))}
          assist={{ busy: assisting, hidePartners, onHidePartners: setHidePartners, onAsk: ask }}
        />
      )}

      {step === 'spots' && (
        <SpotsStep
          spots={spots}
          areas={areas}
          onArea={(group, use) => setAreas(as => as.map(a => (a.group === group ? { ...a, use } : a)))}
          onKeepWhole={keepWhole}
          progress={progress}
          country={country}
          onCountry={setCountry}
          onFindPins={refindPins}
          onChange={patchSpot}
        />
      )}

      {step === 'confirm' && (
        <div className="import-body">
          <dl className="log-totals">
            <div><dt>{w.totals.visits}</dt><dd className="num">{visitCount}</dd></div>
            <div><dt>{w.totals.routes}</dt><dd className="num">{payload?.visits.reduce((n, v) => n + v.ascents.length, 0) ?? 0}</dd></div>
            <div><dt>{w.totals.newSpots}</dt><dd className="num">{used.filter(s => s.choice === 'new').length}</dd></div>
            <div><dt>{w.totals.existingSpots}</dt><dd className="num">{used.filter(s => typeof s.choice === 'number').length}</dd></div>
          </dl>
          <div className="field">
            <span className="field-label">{w.whoCanSee}</span>
            <div className="chip-row">
              <label className="type-option"><input type="radio" name="importVis" checked={visibility === 'private'} onChange={() => setVisibility('private')} />{w.onlyMe}</label>
              <label className="type-option"><input type="radio" name="importVis" checked={visibility === 'public'} onChange={() => setVisibility('public')} />{w.everyone}</label>
            </div>
            <span className="hint-block">{w.notesStayPrivate}</span>
          </div>
          <p className="hint-block">
            {w.confirmNote}
            {drafts && drafts.skipped.length > 0 && w.noSpotName(drafts.skipped.length)}
          </p>
        </div>
      )}

      {step === 'done' && (
        <div className="import-body">
          {result && (
            <p className="form-info">
              {result.visits ? w.imported(result.visits) : w.nothingNew}
              {result.skipped ? w.skipped(result.skipped) : ''}
              {result.new_spots ? w.withNewSpots(result.new_spots) : ''}.
              {result.import_id != null && w.canUndo}
            </p>
          )}
        </div>
      )}

      <div className="form-error-row"><ErrorText error={error} /></div>
    </Modal>
  );
}
