import { useAuth } from '../auth/useAuth';

export type Stats = { places: number; areas: number; visits: number };

type Props = {
  stats: Stats;
  isMobile: boolean;
  armed: boolean;
  onToggleArmed: () => void;
  onAddByCoords: () => void;
  onSignIn: () => void;
};

export function Header({ stats, isMobile, armed, onToggleArmed, onAddByCoords, onSignIn }: Props) {
  const { session, profile, isAdmin, signOut } = useAuth();

  return (
    <header>
      <svg className="contours" viewBox="0 0 1200 76" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="#F6F3EB" strokeWidth="1.2">
          <path d="M0 60 Q150 30 320 46 T650 40 T980 52 T1200 38" />
          <path d="M0 44 Q160 18 340 30 T680 24 T1000 36 T1200 22" />
          <path d="M0 28 Q170 6 360 16 T700 10 T1020 20 T1200 8" />
        </g>
      </svg>

      <div className="brand">
        <h1>Climbing Log</h1>
        {!isMobile && <span className="tag mono">Field survey · rock touched</span>}
      </div>

      {!isMobile && <StatChips stats={stats} />}

      {isMobile ? (
        armed && <span className="header-hint">Tap the map to drop a pin</span>
      ) : session ? <>
        <button className="btn btn-ghost-invert" type="button" onClick={onAddByCoords}>+ By coordinates</button>
        <button className={`btn btn-add${armed ? ' armed' : ''}`} type="button" onClick={onToggleArmed}>
          {armed ? '✕ Cancel' : '+ Add a place'}
        </button>
        <div className="account">
          <span className="account-name">
            {profile?.username ?? '…'}
            {isAdmin && <span className="admin-badge">admin</span>}
          </span>
          <button className="link-btn invert" type="button" onClick={() => signOut()}>Sign out</button>
        </div>
      </> : (
        <button className="btn btn-add" type="button" onClick={onSignIn}>Sign in to log climbs</button>
      )}
    </header>
  );
}

export function StatChips({ stats }: { stats: Stats }) {
  return (
    <div className="stats">
      <div className="chip"><b>{stats.places}</b><span>Places</span></div>
      <div className="chip"><b>{stats.areas}</b><span>Areas</span></div>
      <div className="chip"><b>{stats.visits}</b><span>Visits</span></div>
    </div>
  );
}
