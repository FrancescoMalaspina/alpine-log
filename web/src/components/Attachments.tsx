import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { addLink, attachmentUrl, deleteAttachment, fetchAttachments, gpxDownloadUrl, uploadAttachment, type AttachmentOwner } from '../lib/api';
import type { TrackLayer } from '../lib/gpx';
import { errorMessage, formatBytes } from '../lib/labels';
import { readTrackFile } from '../lib/tracks';
import { trackStatsParts } from '../lib/trackStats';
import type { Activity, Attachment } from '../lib/types';
import { TRACK_ACTIVITIES } from './forms/placeForm';
import { saveTrackAt } from './forms/save';
import { ErrorText } from './Modal';
import { VisibilityPill } from './VisitRow';

type Props = {
  owner: AttachmentOwner;
  userId: string | null;
  isAdmin: boolean;
  /** The spot's activity: on ski tours, hikes, trail runs and alpine climbs a track is the outing itself, not the approach. */
  activity?: Activity;
  /** The GPX tracks drawn on the map, with their colours, to switch them on and off. */
  tracks?: TrackLayer[];
  onToggleTrack?: (id: number) => void;
  /** Called after anything is added or removed. */
  onChange?: () => void;
};

const ICONS: Record<Attachment['kind'], string> = { gpx: 'GPX', pdf: 'PDF', link: 'URL' };

export function Attachments({ owner, userId, isAdmin, activity, tracks, onToggleTrack, onChange }: Props) {
  const { t } = useI18n();
  const s = t.spot.attachments;
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
    if (!confirm(s.confirmRemove(a.title ?? a.url ?? ''))) return;
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
      <h3 className="section-title">{activity && TRACK_ACTIVITIES.includes(activity) ? s.tracks : s.approachTracks}</h3>
      {items && !gpx.length && <div className="empty">{s.noGpx}</div>}
      {gpx.map(a => {
        const layer = tracks?.find(l => l.id === a.id);
        return (
          <Item key={a.id} a={a} canDelete={a.created_by === userId || isAdmin} onDelete={() => remove(a)}
                detail={a.stats ? trackStatsParts(a.stats, activity).join(', ') : undefined} layer={layer}
                onToggle={layer && onToggleTrack ? () => onToggleTrack(a.id) : undefined} />
        );
      })}

      <h3 className="section-title">{s.guides}</h3>
      {items && !guides.length && <div className="empty">{s.noGuides}</div>}
      {guides.map(a => (
        <Item key={a.id} a={a} canDelete={a.created_by === userId || isAdmin} onDelete={() => remove(a)} />
      ))}

      <ErrorText error={error} />
      {userId && <AddAttachment owner={owner} userId={userId} onAdded={changed} />}
    </div>
  );
}

function Item({ a, canDelete, onDelete, detail, layer, onToggle }: {
  a: Attachment; canDelete: boolean; onDelete: () => void; detail?: string;
  /** A GPX's track on the map: its colour and whether it's drawn. */
  layer?: TrackLayer; onToggle?: () => void;
}) {
  const { t } = useI18n();
  const meta = [
    detail,
    a.kind === 'link' ? new URL(a.url!).hostname.replace(/^www\./, '') : a.size_bytes && formatBytes(a.size_bytes),
    a.username && t.spot.attachments.by(a.username),
  ].filter(Boolean).join(', ');
  const label = <>
    <span className="attachment-title">{a.title || a.url}</span>
    {meta && <span className="attachment-meta">{meta}</span>}
    {a.private && <VisibilityPill visibility="private" />}
  </>;
  return (
    <div className="attachment">
      {onToggle && (
        <input type="checkbox" className="track-toggle" checked={layer!.shown} onChange={onToggle}
               style={{ accentColor: layer!.color }} aria-label={t.spot.attachments.showOnMap(a.title ?? '')} />
      )}
      <span className={`attachment-icon ${a.kind}`} aria-hidden="true"
            style={layer ? { background: layer.color } : undefined}>{ICONS[a.kind]}</span>
      {a.kind === 'gpx' && a.file_url
        ? <a href={gpxDownloadUrl(a)} title={t.spot.attachments.download}>{label}</a>
        : <a href={attachmentUrl(a)} target="_blank" rel="noopener noreferrer">{label}</a>}
      {canDelete && <button type="button" aria-label={t.spot.attachments.removeNamed(a.title ?? t.spot.attachments.attachment)} onClick={onDelete}>×</button>}
    </div>
  );
}

function AddAttachment({ owner, userId, onAdded }: { owner: AttachmentOwner; userId: string; onAdded: () => void }) {
  const { t } = useI18n();
  const s = t.spot.attachments;
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
        if (!file) throw new Error(s.pickFile);
        if (file.name.toLowerCase().endsWith('.gpx')) {
          const track = readTrackFile(await file.text());
          if (!track) throw new Error(s.noTrack);
          // Saved like any other track: measured, without times, named after the title if there is one.
          const fileName = title.trim() ? `${title.trim()}.gpx` : file.name;
          await saveTrackAt(owner, userId, { fileName, file: track, trimStartM: 0, trimEndM: 0, save: true }, file.name);
        } else {
          await uploadAttachment(owner, userId, file, title);
        }
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
        <button type="button" className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}>{s.pasteLink}</button>
        <button type="button" className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>{s.uploadFile}</button>
      </div>
      {mode === 'link' ? (
        <input type="url" required placeholder="https://www.thecrag.com/…" value={url} aria-label={s.link} spellCheck={false}
               onChange={e => setUrl(e.target.value)} />
      ) : (
        <input key={fileKey} type="file" required accept=".gpx,.pdf,application/pdf,application/gpx+xml" aria-label={s.file}
               onChange={e => setFile(e.target.files?.[0] ?? null)} />
      )}
      <div className="add-attachment-row">
        <input type="text" placeholder={s.titleOptional} value={title} aria-label={s.title} onChange={e => setTitle(e.target.value)} />
        <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? s.adding : mode === 'link' ? s.addLink : s.upload}</button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}
