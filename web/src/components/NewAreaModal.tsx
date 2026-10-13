import { useState } from 'react';
import { useI18n } from '../i18n';
import { createArea } from '../lib/api';
import { errorMessage, isTouchLayout } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

type Props = {
  onClose: () => void;
  onCreated: (areaId: number) => void;
};

/** Creates an empty area; spots are added to it from its panel. */
export function NewAreaModal({ onClose, onCreated }: Props) {
  const { t } = useI18n();
  const s = t.spot.newArea;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!name.trim()) return setError(s.needName);
    setBusy(true);
    try {
      onCreated(await createArea(name, description));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={s.title}
      subtitle={s.subtitle}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn btn-primary" type="submit" form="newAreaForm" disabled={busy}>{s.create}</button>
      </>}
    >
      <form id="newAreaForm" className="auth-form" onSubmit={save}>
        <div className="field">
          <label htmlFor="newAreaName">{s.name}</label>
          <input id="newAreaName" required autoFocus={!isTouchLayout()} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="newAreaDescription">{s.description} <span className="hint">{s.optional}</span></label>
          <textarea id="newAreaDescription" value={description} placeholder={s.placeholder}
                    onChange={e => setDescription(e.target.value)} />
        </div>
        <ErrorText error={error} />
      </form>
    </Modal>
  );
}
