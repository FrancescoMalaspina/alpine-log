import { useState } from 'react';
import { useI18n } from '../i18n';
import { acceptInvitation, declineInvitation } from '../lib/api';
import { errorMessage, formatDate } from '../lib/labels';
import type { Invitation, Place } from '../lib/types';
import { ErrorText } from './Modal';

type Props = {
  invitations: Invitation[];
  placeById: Map<number, Place>;
  /** "Add to my logbook": the visit form, filled in from the invitation. */
  onAdd: (invitation: Invitation) => void;
  /** After an answer, so invitations and visits reload. */
  onChanged: () => void;
};

/** Invitations to someone's day ("Anna added you") and requests to join yours ("Bob says he was with you"). */
export function InvitationsSection({ invitations, placeById, onAdd, onChanged }: Props) {
  const { t } = useI18n();
  if (!invitations.length) return null;
  return (
    <section className="invitations" aria-labelledby="invitationsTitle">
      <h3 id="invitationsTitle" className="section-title">
        {t.account.invitations.title} <span className="tab-count">{invitations.length}</span>
      </h3>
      {invitations.map(x => (
        <InvitationCard key={x.id} invitation={x} spot={placeById.get(x.place_id)?.name ?? ''} onAdd={onAdd} onChanged={onChanged} />
      ))}
    </section>
  );
}

function InvitationCard({ invitation: x, spot, onAdd, onChanged }: {
  invitation: Invitation; spot: string; onAdd: (invitation: Invitation) => void; onChanged: () => void;
}) {
  const { t } = useI18n();
  const s = t.account.invitations;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invite = x.kind === 'invite';

  async function answer(send: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await send();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  // An invitation adds a new visit, or links the one you logged there that day; a request joins yours.
  const accept = !invite ? () => answer(() => acceptInvitation(x.id))
    : x.my_visit_id ? () => answer(() => acceptInvitation(x.id, x.my_visit_id!))
    : () => onAdd(x);

  return (
    <article className="invitation-card">
      <p className="invitation-text">{(invite ? s.invited : s.requested)(x.from_username, spot, formatDate(x.date))}</p>
      {invite && x.my_visit_id && <p className="hint">{s.linkHint}</p>}
      <div className="invitation-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => answer(() => declineInvitation(x.id))}>
          {invite ? s.notMe : s.decline}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={accept}>
          {!invite ? s.accept : x.my_visit_id ? s.link : s.add}
        </button>
      </div>
      <ErrorText error={error} />
    </article>
  );
}
