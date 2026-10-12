import { useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { deleteImport, fetchLogbook, type ImportRecord } from '../lib/api';
import { downloadLogbook, type ExportFormat } from '../lib/exportLogbook';
import { errorMessage, formatDate, plural } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

const EXPORTS: { format: ExportFormat; name: string; use: string }[] = [
  { format: 'csv', name: 'Spreadsheet (CSV)', use: 'One row per route, for Excel, Numbers or Google Sheets' },
  { format: 'json', name: 'Full backup (JSON)', use: 'Every detail of every visit, for keeping or importing elsewhere' },
  { format: 'gpx', name: 'Spots for GPS (GPX)', use: 'The spots you visited as waypoints, for Garmin, Komoot, OsmAnd, Google Earth' },
];

/** Pick a format and download your whole logbook. */
export function DownloadModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: ExportFormat) {
    setError(null);
    setExporting(format);
    try {
      downloadLogbook(await fetchLogbook(userId), username, format);
    } catch (e) {
      setError(`Couldn't prepare the download: ${errorMessage(e)}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <Modal title="Download your logbook" subtitle="Every visit you logged, in the format you need." onClose={onClose}
           closeOnBackdrop footer={<button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>}>
      <div className="auth-form">
        <div className="downloads">
          {EXPORTS.map(x => (
            <button key={x.format} type="button" className="download" disabled={!!exporting} onClick={() => download(x.format)}>
              <span className="download-name">{exporting === x.format ? 'Preparing…' : x.name}</span>
              <span className="download-use">{x.use}</span>
            </button>
          ))}
        </div>
        <ErrorText error={error} />
      </div>
    </Modal>
  );
}

type ImportsProps = {
  imports: ImportRecord[];
  onStart: () => void;
  onClose: () => void;
  /** An import was undone. */
  onChanged: () => void;
};

/** Start a new import, or undo a past one. */
export function ImportsModal({ imports, onStart, onClose, onChanged }: ImportsProps) {
  const [undoing, setUndoing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function undo(imp: ImportRecord) {
    const n = imp.summary.visits ?? 0;
    if (!await confirm({
      title: 'Undo this import?',
      message: `Deletes the ${plural(n, 'visit')} imported from “${imp.file_name}”. Spots it created stay on the map.`,
      confirmLabel: 'Undo import', danger: true,
    })) return;
    setError(null);
    setUndoing(imp.id);
    try {
      await deleteImport(imp.id);
      onChanged();
    } catch (e) {
      setError(`Couldn't undo the import: ${errorMessage(e)}`);
    } finally {
      setUndoing(null);
    }
  }

  return <>
    <Modal title="Import visits" subtitle="Bring in a logbook you kept somewhere else." onClose={onClose}
           closeOnBackdrop footer={<button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>}>
      <div className="auth-form">
        <div className="downloads">
          <button type="button" className="download" onClick={onStart}>
            <span className="download-name">From a file</span>
            <span className="download-use">Excel, CSV or JSON, in any layout: you check every column before anything is saved</span>
          </button>
        </div>
        {imports.length > 0 && <>
          <h3 className="section-title">Past imports</h3>
          <div className="downloads">
            {imports.map(imp => (
              <div key={imp.id} className="import-record">
                <span>
                  <strong>{imp.file_name}</strong>
                  <span className="hint"> · {formatDate(imp.created_at.slice(0, 10))} · {plural(imp.summary.visits ?? 0, 'visit')}</span>
                </span>
                <button type="button" className="btn btn-quiet" disabled={undoing === imp.id} onClick={() => undo(imp)}>
                  {undoing === imp.id ? 'Undoing…' : 'Undo'}
                </button>
              </div>
            ))}
          </div>
        </>}
        <ErrorText error={error} />
      </div>
    </Modal>
    {confirmDialog}
  </>;
}
