import { useEffect, useState } from 'react';
import { addLink, attachmentUrl, deleteAttachment, fetchAttachments, uploadAttachment, type AttachmentOwner } from '../lib/api';
import { parseGpx, type Track } from '../lib/gpx';
import { errorMessage, formatBytes } from '../lib/labels';
import type { Attachment } from '../lib/types';
import { ErrorText } from './Modal';

type Props = {
  owner: AttachmentOwner;
  userId: string | null;
  isAdmin: boolean;
  /** Parsed GPX tracks keyed by attachment id, to show distance and gain. */
  tracks?: Map<number, Track>;
  /** Called after anything is added or removed. */
  onChange?: () => void;
};

const ICONS: Record<Attachment['kind'], string> = { gpx: '〰', pdf: '📄', link: '↗' };

export function Attachments({ owner, userId, isAdmin, tracks, onChange }: Props) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ownerKey = JSON.stringify(owner);

  useEffect(() => {
    let cancelled = false;
    fetchAttachments(JSON.parse(ownerKey))
      .then(a => { if (!cancelled) setItems(a); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [ownerKey, reloadKey]);

  const changed = () => {
    setReloadKey(k => k + 1);
    onChange?.();
  };

  async function remove(a: Attachment) {
    if (!confirm(`Remove "${a.title ?? a.url}"?`)) return;
    try {
      await deleteAttachment(a);
      changed();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const gpx = items?.filter(a => a.kind === 'gpx') ?? [];
  const guides = items?.filter(a => a.kind !== 'gpx') ?? [];

  return (
    <div className="attachments">
      <h4>Approach tracks (GPX)</h4>
      {items && !gpx.length && <div className="empty">No GPX yet.</div>}
      {gpx.map(a => (
        <Item key={a.id} a={a} canDelete={a.created_by === userId || isAdmin} onDelete={() => remove(a)}
              detail={trackSummary(tracks?.get(a.id))} />
      ))}

      <h4>Guides & links</h4>
      {items && !guides.length && <div className="empty">No guides yet.</div>}
      {guides.map(a => (
        <Item key={a.id} a={a} canDelete={a.created_by === userId || isAdmin} onDelete={() => remove(a)} />
      ))}

      <ErrorText error={error} />
      {userId && <AddAttachment owner={owner} userId={userId} onAdded={changed} />}
    </div>
  );
}

function trackSummary(t: Track | undefined) {
  if (!t) return undefined;
  return [
    `${t.distanceKm.toFixed(1)} km`,
    t.gainM != null && `+${Math.round(t.gainM)} m`,
    t.maxEleM != null && `max ${Math.round(t.maxEleM)} m`,
  ].filter(Boolean).join(' · ');
}

function Item({ a, canDelete, onDelete, detail }:
  { a: Attachment; canDelete: boolean; onDelete: () => void; detail?: string }) {
  const meta = [
    detail,
    a.kind === 'link' ? new URL(a.url!).hostname.replace(/^www\./, '') : a.size_bytes && formatBytes(a.size_bytes),
    a.username && `by ${a.username}`,
  ].filter(Boolean).join(' · ');
  return (
    <div className="attachment">
      <span className={`attachment-icon ${a.kind}`} aria-hidden="true">{ICONS[a.kind]}</span>
      <a href={attachmentUrl(a)} target="_blank" rel="noopener noreferrer"
         download={a.kind === 'gpx' ? a.title ?? undefined : undefined}>
        <span className="attachment-title">{a.title || a.url}</span>
        {meta && <span className="attachment-meta">{meta}</span>}
      </a>
      {canDelete && <button type="button" aria-label={`Remove ${a.title ?? 'attachment'}`} onClick={onDelete}>×</button>}
    </div>
  );
}

function AddAttachment({ owner, userId, onAdded }: { owner: AttachmentOwner; userId: string; onAdded: () => void }) {
  const [mode, setMode] = useState<'link' | 'file'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'link') {
        await addLink(owner, title, url);
        setUrl('');
      } else {
        if (!file) throw new Error('Pick a .gpx or .pdf file first.');
        if (file.name.toLowerCase().endsWith('.gpx')) {
          if (!parseGpx(await file.text())) throw new Error("That GPX file doesn't contain a track.");
        }
        await uploadAttachment(owner, userId, file, title);
        setFile(null);
        setFileKey(k => k + 1);
      }
      setTitle('');
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-attachment" onSubmit={submit}>
      <div className="segmented small">
        <button type="button" className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}>Paste a link</button>
        <button type="button" className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>Upload GPX / PDF</button>
      </div>
      {mode === 'link' ? (
        <input type="url" required placeholder="https://www.thecrag.com/…" value={url} aria-label="Link"
               onChange={e => setUrl(e.target.value)} />
      ) : (
        <input key={fileKey} type="file" required accept=".gpx,.pdf,application/pdf,application/gpx+xml" aria-label="File"
               onChange={e => setFile(e.target.files?.[0] ?? null)} />
      )}
      <div className="add-attachment-row">
        <input type="text" placeholder="Title (optional)" value={title} aria-label="Title" onChange={e => setTitle(e.target.value)} />
        <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}
