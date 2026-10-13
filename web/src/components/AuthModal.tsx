import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n';
import { errorMessage, isTouchLayout } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

type Tab = 'signin' | 'signup' | 'reset';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (tab === 'signin') {
        await auth.signIn(email, password);
        onClose();
      } else if (tab === 'signup') {
        const mustConfirm = await auth.signUp(email, password, username.trim());
        if (mustConfirm) setInfo(t.app.auth.confirmSent(email));
        else onClose();
      } else {
        await auth.sendPasswordReset(email);
        setInfo(t.app.auth.resetSent(email));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t.app.auth.titles[tab]}
      subtitle={tab === 'signup'
        ? t.app.auth.signupSubtitle
        : tab === 'reset' ? t.app.auth.resetSubtitle : undefined}
      onClose={onClose}
      closeOnBackdrop
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onClose}>{t.common.close}</button>
        <button className="btn btn-add" type="submit" form="authForm" disabled={busy}>
          {tab === 'signin' ? t.app.auth.signIn : tab === 'signup' ? t.app.auth.signUp : t.app.auth.sendReset}
        </button>
      </>}
    >
      <form id="authForm" className="auth-form" onSubmit={submit}>
        <div className="list-mode-tabs auth-tabs">
          {(['signin', 'signup'] as const).map(k => (
            <button key={k} type="button" className={`list-mode-tab${tab === k ? ' active' : ''}`}
                    onClick={() => { setTab(k); setError(null); setInfo(null); }}>
              {k === 'signin' ? t.app.auth.signIn : t.app.auth.signUp}
            </button>
          ))}
        </div>
        {tab === 'signup' && (
          <div className="field">
            <label htmlFor="authUsername">{t.app.auth.username}</label>
            <input id="authUsername" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} minLength={3} maxLength={30}
                   pattern="[A-Za-z0-9_.\-]{3,30}" title={t.app.auth.usernameTitle}
                   onChange={e => setUsername(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="authEmail">{t.app.auth.email}</label>
          <input id="authEmail" name="email" type="email" required autoComplete="email" autoFocus={!isTouchLayout()}
                 spellCheck={false} value={email}
                 onChange={e => setEmail(e.target.value)} />
        </div>
        {tab !== 'reset' && (
          <div className="field">
            <label htmlFor="authPassword">{t.app.auth.password}</label>
            <input id="authPassword" name="password" type="password" required minLength={8} value={password}
                   autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                   onChange={e => setPassword(e.target.value)} />
          </div>
        )}
        {tab === 'signin' && (
          <button type="button" className="link-btn" onClick={() => { setTab('reset'); setError(null); }}>
            {t.app.auth.forgot}
          </button>
        )}
        {tab === 'reset' && (
          <button type="button" className="link-btn" onClick={() => setTab('signin')}>{t.app.auth.backToSignIn}</button>
        )}
        <ErrorText error={error} />
        {info && <div className="form-info" role="status">{info}</div>}
      </form>
    </Modal>
  );
}

/** Shown after following a password-reset email link. */
export function NewPasswordModal() {
  const auth = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await auth.updatePassword(password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t.app.auth.newPasswordTitle}
      onClose={() => auth.signOut()}
      footer={<button className="btn btn-add" type="submit" form="newPasswordForm" disabled={busy}>{t.app.auth.savePassword}</button>}
    >
      <form id="newPasswordForm" className="auth-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="newPassword">{t.app.auth.newPassword}</label>
          <input id="newPassword" type="password" required minLength={8} autoComplete="new-password" autoFocus
                 value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <ErrorText error={error} />
      </form>
    </Modal>
  );
}
