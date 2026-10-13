import { useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { deleteImport, fetchLogbook, type ImportRecord } from '../lib/api';
import { downloadLogbook, type ExportFormat } from '../lib/exportLogbook';
import { useI18n } from '../i18n';
import { errorMessage, formatDate } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

const EXPORTS: ExportFormat[] = ['csv', 'json', 'gpx'];

/** Pick a format and download your whole logbook. */
export function DownloadModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: ExportFormat) {
    setError(null);
    setExporting(format);
    try {
      downloadLogbook(await fetchLogbook(userId), username, format);
    } catch (e) {
      setError(t.account.logbookModals.downloadError(errorMessage(e)));
    } finally {
      setExporting(null);
    }
  }

  return (
    <Modal title={t.account.logbookModals.downloadTitle} subtitle={t.account.logbookModals.downloadSubtitle} onClose={onClose}
           closeOnBackdrop footer={<button className="btn btn-ghost" type="button" onClick={onClose}>{t.common.close}</button>}>
      <div className="auth-form">
        <div className="downloads">
          {EXPORTS.map(format => (
            <button key={format} type="button" className="download" disabled={!!exporting} onClick={() => download(format)}>
              <span className="download-name">
                {exporting === format ? t.account.logbookModals.preparing : t.account.logbookModals.exports[format].name}
              </span>
              <span className="download-use">{t.account.logbookModals.exports[format].use}</span>
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
  const { t } = useI18n();
  const [undoing, setUndoing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function undo(imp: ImportRecord) {
    const n = imp.summary.visits ?? 0;
    if (!await confirm({
      title: t.account.logbookModals.undoTitle,
      message: t.account.logbookModals.undoMessage(n, imp.file_name),
      confirmLabel: t.account.logbookModals.undoConfirm, danger: true,
    })) return;
    setError(null);
    setUndoing(imp.id);
    try {
      await deleteImport(imp.id);
      onChanged();
    } catch (e) {
      setError(t.account.logbookModals.undoError(errorMessage(e)));
    } finally {
      setUndoing(null);
    }
  }

  return <>
    <Modal title={t.account.logbookModals.importTitle} subtitle={t.account.logbookModals.importSubtitle} onClose={onClose}
           closeOnBackdrop footer={<button className="btn btn-ghost" type="button" onClick={onClose}>{t.common.close}</button>}>
      <div className="auth-form">
        <div className="downloads">
          <button type="button" className="download" onClick={onStart}>
            <span className="download-name">{t.account.logbookModals.fromFile}</span>
            <span className="download-use">{t.account.logbookModals.fromFileUse}</span>
          </button>
        </div>
        {imports.length > 0 && <>
          <h3 className="section-title">{t.account.logbookModals.pastImports}</h3>
          <div className="downloads">
            {imports.map(imp => (
              <div key={imp.id} className="import-record">
                <span>
                  <strong>{imp.file_name}</strong>
                  <span className="hint"> · {formatDate(imp.created_at.slice(0, 10))} · {t.account.visits(imp.summary.visits ?? 0)}</span>
                </span>
                <button type="button" className="btn btn-quiet" disabled={undoing === imp.id} onClick={() => undo(imp)}>
                  {undoing === imp.id ? t.account.logbookModals.undoing : t.account.logbookModals.undo}
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
