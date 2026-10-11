import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { errorMessage } from '../lib/labels';
import { ErrorText, Modal } from './Modal';

type Tab = 'signin' | 'signup' | 'reset';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
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
        if (mustConfirm) setInfo(`Almost there — we sent a confirmation link to ${email}.`);
        else onClose();
      } else {
        await auth.sendPasswordReset(email);
        setInfo(`If ${email} has an account, a reset link is on its way.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Tab, string> = { signin: 'Sign in', signup: 'Create an account', reset: 'Reset your password' };

  return (
    <Modal
      title={titles[tab]}
      subtitle={tab === 'signup'
        ? 'Log your own climbs. Visits are private until you make them public.'
        : tab === 'reset' ? "We'll email you a link to choose a new password." : undefined}
      onClose={onClose}
      closeOnBackdrop
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>
        <button className="btn btn-add" type="submit" form="authForm" disabled={busy}>
          {tab === 'signin' ? 'Sign in' : tab === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </>}
    >
      <form id="authForm" className="auth-form" onSubmit={submit}>
        <div className="list-mode-tabs auth-tabs">
          {(['signin', 'signup'] as const).map(t => (
            <button key={t} type="button" className={`list-mode-tab${tab === t ? ' active' : ''}`}
                    onClick={() => { setTab(t); setError(null); setInfo(null); }}>
              {t === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
        {tab === 'signup' && (
          <div className="field">
            <label htmlFor="authUsername">Username</label>
            <input id="authUsername" required autoComplete="username" value={username} minLength={3} maxLength={30}
                   pattern="[A-Za-z0-9_.\-]{3,30}" title="3–30 letters, digits, dots, dashes or underscores"
                   onChange={e => setUsername(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="authEmail">Email</label>
          <input id="authEmail" type="email" required autoComplete="email" autoFocus value={email}
                 onChange={e => setEmail(e.target.value)} />
        </div>
        {tab !== 'reset' && (
          <div className="field">
            <label htmlFor="authPassword">Password</label>
            <input id="authPassword" type="password" required minLength={8} value={password}
                   autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                   onChange={e => setPassword(e.target.value)} />
          </div>
        )}
        {tab === 'signin' && (
          <button type="button" className="link-btn" onClick={() => { setTab('reset'); setError(null); }}>
            Forgot your password?
          </button>
        )}
        {tab === 'reset' && (
          <button type="button" className="link-btn" onClick={() => setTab('signin')}>Back to sign in</button>
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
      title="Choose a new password"
      onClose={() => auth.signOut()}
      footer={<button className="btn btn-add" type="submit" form="newPasswordForm" disabled={busy}>Save password</button>}
    >
      <form id="newPasswordForm" className="auth-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" type="password" required minLength={8} autoComplete="new-password" autoFocus
                 value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <ErrorText error={error} />
      </form>
    </Modal>
  );
}
