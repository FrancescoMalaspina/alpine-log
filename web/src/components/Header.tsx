import { useAuth } from '../auth/useAuth';

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

  return (
    <header className="app-header">
      <div className="brand">
        <Logo />
        <h1 translate="no">Alpine Log</h1>
      </div>

      {isMobile ? null : session ? (
        <div className="header-actions">
          <button className="btn btn-ghost" type="button" onClick={onAddPlace}>Add a spot</button>
          <button className="btn btn-primary" type="button" onClick={onLogVisit}>Log a visit</button>
          <div className="account">
            <button type="button" className="account-name" onClick={onOpenLog} title="Your visits, wishlist and totals">
              My logbook
              {isAdmin && <span className="admin-badge">admin</span>}
            </button>
            <button type="button" className="link-btn account-user" onClick={onOpenAccount} title="Your account">
              {profile?.username ?? '…'}
            </button>
            <button className="link-btn" type="button" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" type="button" onClick={onSignIn}>Sign in to log climbs</button>
      )}
    </header>
  );
}

export function StatsLine({ stats }: { stats: Stats }) {
  return (
    <p className="stats-line">
      {stats.places} places in {stats.areas} areas, {stats.visits} visits you can see
    </p>
  );
}
