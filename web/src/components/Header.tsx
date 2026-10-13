import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n';
import { LanguageSwitch } from './LanguageSwitch';

export type Stats = { places: number; areas: number; visits: number };

type Props = {
  isMobile: boolean;
  onAddPlace: () => void;
  onLogVisit: () => void;
  onSignIn: () => void;
  onOpenLog: () => void;
  onOpenAccount: () => void;
};

/** Two peaks, the higher one snow-capped. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 24" aria-hidden="true">
      <path d="M1 23 11 8l4.5 6.5L21 5l10 18z" fill="currentColor" />
      <path d="M21 5l-3.2 5.6 1.9-1.1 1.5 1.6 1.7-1.5 1.4.9z" fill="#fff" />
    </svg>
  );
}

export function Header({ isMobile, onAddPlace, onLogVisit, onSignIn, onOpenLog, onOpenAccount }: Props) {
  const { session, profile, isAdmin, signOut } = useAuth();
  const { t } = useI18n();

  return (
    <header className="app-header">
      <div className="brand">
        <Logo />
        <h1 translate="no">Alpine Log</h1>
      </div>

      <LanguageSwitch className="header-lang" />
      {isMobile ? null : session ? (
        <div className="header-actions">
          <button className="btn btn-ghost" type="button" onClick={onAddPlace}>{t.app.header.addSpot}</button>
          <button className="btn btn-primary" type="button" onClick={onLogVisit}>{t.app.header.logVisit}</button>
          <div className="account">
            <button type="button" className="account-name" onClick={onOpenLog} title={t.app.header.logbookTitle}>
              {t.app.header.logbook}
              {isAdmin && <span className="admin-badge">{t.common.admin}</span>}
            </button>
            <button type="button" className="link-btn account-user" onClick={onOpenAccount} title={t.app.header.accountTitle}>
              {profile?.username ?? '…'}
            </button>
            <button className="link-btn" type="button" onClick={() => signOut()}>{t.app.header.signOut}</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" type="button" onClick={onSignIn}>{t.app.header.signIn}</button>
      )}
    </header>
  );
}

export function StatsLine({ stats }: { stats: Stats }) {
  const { t } = useI18n();
  return (
    <p className="stats-line">
      {t.app.header.stats(stats.places, stats.areas, stats.visits)}
    </p>
  );
}
