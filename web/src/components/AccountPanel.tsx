import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n';
import { deleteUser, renameUser } from '../lib/api';
import { errorMessage } from '../lib/labels';
import { ConfirmDialog } from './ConfirmDialog';
import { Drawer } from './Drawer';
import { ErrorText } from './Modal';

type Props = {
  userId: string;
  onClose: () => void;
  /** Admins only: the full-page list of users. */
  onOpenUsers: () => void;
  onDeleted: () => void;
};

/** Your profile and account; admins also reach the Users page from here. */
export function AccountPanel(props: Props) {
  const { userId } = props;
  const { t } = useI18n();
  const { session, profile, isAdmin, refreshProfile } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ busy: boolean; error: string | null; saved: boolean }>(
    { busy: false, error: null, saved: false });
  const [deleting, setDeleting] = useState(false);

  const name = username ?? profile?.username ?? '';
  const changed = !!profile && name.trim() !== profile.username;

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    setRenameState({ busy: true, error: null, saved: false });
    try {
      await renameUser(userId, name);
      refreshProfile();
      setUsername(null);
      setRenameState({ busy: false, error: null, saved: true });
    } catch (err) {
      setRenameState({ busy: false, error: errorMessage(err), saved: false });
    }
  }

  return (
    <Drawer title={t.account.accountPanel.title} meta={profile && <span className="meta-item">{profile.username}</span>} onClose={props.onClose}>
      <section className="account-section">
        <h3 className="section-title">{t.account.accountPanel.profile}</h3>
        <form className="account-profile" onSubmit={rename}>
          <div className="field">
            <label htmlFor="accountEmail">{t.account.accountPanel.email}</label>
            <input id="accountEmail" value={session?.user.email ?? ''} readOnly />
          </div>
          <div className="field">
            <label htmlFor="accountUsername">{t.account.accountPanel.username}</label>
            <div className="field-inline">
              <input id="accountUsername" value={name} autoComplete="username"
                     onChange={e => { setUsername(e.target.value); setRenameState(s => ({ ...s, saved: false })); }} />
              <button type="submit" className="btn btn-primary" disabled={!changed || renameState.busy}>{t.common.save}</button>
            </div>
            {renameState.saved && <span className="hint-block" role="status">{t.account.accountPanel.usernameSaved}</span>}
          </div>
          <ErrorText error={renameState.error} />
        </form>
      </section>

      {isAdmin && (
        <section className="account-section">
          <h3 className="section-title">{t.account.accountPanel.users}</h3>
          <p className="hint-block">{t.account.accountPanel.usersHint}</p>
          <button type="button" className="btn btn-ghost account-users-btn" onClick={props.onOpenUsers}>{t.account.accountPanel.manageUsers}</button>
        </section>
      )}

      <section className="account-section danger-zone">
        <h3 className="section-title">{t.account.accountPanel.deleteTitle}</h3>
        <p className="hint-block">
          {t.account.accountPanel.deleteHint}
        </p>
        <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>{t.account.accountPanel.deleteButton}</button>
      </section>

      {deleting && profile && (
        <ConfirmDialog
          title={t.account.accountPanel.deleteQuestion}
          message={t.account.accountPanel.deleteMessage(session?.user.email ?? '')}
          confirmLabel={t.account.accountPanel.deleteConfirm}
          danger
          requireText={profile.username}
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteUser(userId);
            props.onDeleted();
          }}
        />
      )}
    </Drawer>
  );
}
