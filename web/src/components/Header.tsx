import { useAuth } from '../auth/useAuth';

export type Stats = { places: number; areas: number; visits: number };

type Props = {
  isMobile: boolean;
  armed: boolean;
  onToggleArmed: () => void;
  onAddByCoords: () => void;
  onSignIn: () => void;
};

/** The red-white-red trail blaze painted on rocks along every Alpine path. */
export function Blaze() {
  return <span className="blaze" aria-hidden="true"><i /><i /><i /></span>;
}

export function Header({ isMobile, armed, onToggleArmed, onAddByCoords, onSignIn }: Props) {
  const { session, profile, isAdmin, signOut } = useAuth();

  return (
    <header className="app-header">
      <div className="brand">
        <Blaze />
        <h1 translate="no">Alpine Log</h1>
      </div>

      {isMobile ? (
        armed && <span className="header-hint" role="status">Tap the map to drop a pin</span>
      ) : session ? (
        <div className="header-actions">
          <button className="btn btn-quiet" type="button" onClick={onAddByCoords}>Add by coordinates</button>
          <button className={`btn btn-primary${armed ? ' armed' : ''}`} type="button" onClick={onToggleArmed}>
            {armed ? 'Cancel' : 'Add a place'}
          </button>
          <div className="account">
            <span className="account-name">
              {profile?.username ?? '…'}
              {isAdmin && <span className="admin-badge">admin</span>}
            </span>
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
