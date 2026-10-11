import { useState } from 'react';
import { createArea } from '../lib/api';
import { errorMessage, isTouchLayout } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

type Props = {
  onClose: () => void;
  onCreated: (areaId: number) => void;
};

/** Creates an empty macroarea; places are added to it from its panel. */
export function NewAreaModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Give the area a name.');
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
      title="New area"
      subtitle="A macroarea groups crags and routes, like Albard, Grignetta or Valsassina. You'll add places to it next."
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="submit" form="newAreaForm" disabled={busy}>Create area</button>
      </>}
    >
      <form id="newAreaForm" className="auth-form" onSubmit={save}>
        <div className="field">
          <label htmlFor="newAreaName">Name</label>
          <input id="newAreaName" required autoFocus={!isTouchLayout()} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="newAreaDescription">Description <span className="hint">(optional)</span></label>
          <textarea id="newAreaDescription" value={description} placeholder="Where it is, rock, best season…"
                    onChange={e => setDescription(e.target.value)} />
        </div>
        <ErrorText error={error} />
      </form>
    </Modal>
  );
}
