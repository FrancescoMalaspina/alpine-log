import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { StatsLine, type Stats } from './Header';

export type MobileTab = 'map' | 'list';

type Props = {
  tab: MobileTab;
  onTab: (tab: MobileTab) => void;
  stats: Stats;
  armed: boolean;
  onTapOnMap: () => void;
  onByCoords: () => void;
  onAtMyLocation: () => void;
  onSignIn: () => void;
};

/** Bottom tab bar for phones: map, list, add, account. */
export function MobileNav({ tab, onTab, stats, armed, onTapOnMap, onByCoords, onAtMyLocation, onSignIn }: Props) {
  const { session, profile, isAdmin, signOut } = useAuth();
  const [sheet, setSheet] = useState<'add' | 'account' | null>(null);
  const pick = (fn: () => void) => () => { setSheet(null); fn(); };

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);

  return <>
    {sheet && (
      <div className="sheet-backdrop" onClick={() => setSheet(null)}>
        <div className="sheet" role="dialog" aria-modal="true" aria-label={sheet === 'add' ? 'Add a place' : 'Account'}
             onClick={e => e.stopPropagation()}>
          {sheet === 'add' ? <>
            <div className="sheet-title">Add a place</div>
            <button type="button" autoFocus onClick={pick(onAtMyLocation)}>Here, at my current location</button>
            <button type="button" onClick={pick(onTapOnMap)}>Tap a spot on the map</button>
            <button type="button" onClick={pick(onByCoords)}>Type in coordinates</button>
          </> : <>
            <div className="sheet-title">
              {profile?.username}{isAdmin && <span className="admin-badge">admin</span>}
            </div>
            <StatsLine stats={stats} />
            <button type="button" autoFocus onClick={pick(() => signOut())}>Sign out</button>
          </>}
          <button type="button" className="sheet-cancel" onClick={() => setSheet(null)}>Cancel</button>
        </div>
      </div>
    )}
    <nav className="mobile-nav" aria-label="Main">
      <button type="button" className={tab === 'map' ? 'active' : ''} aria-current={tab === 'map'} onClick={() => onTab('map')}>
        <NavIcon d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" />Map
      </button>
      <button type="button" className={tab === 'list' ? 'active' : ''} aria-current={tab === 'list'} onClick={() => onTab('list')}>
        <NavIcon d="M4 6h16 M4 12h16 M4 18h16" />List
      </button>
      {session && (
        <button type="button" className={`add${armed ? ' armed' : ''}`} onClick={() => (armed ? onTapOnMap() : setSheet('add'))}>
          <span className="add-disc" aria-hidden="true">{armed ? '×' : '+'}</span>{armed ? 'Cancel' : 'Add'}
        </button>
      )}
      <button type="button" onClick={() => (session ? setSheet('account') : onSignIn())}>
        <NavIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1-4 4-6 8-6s7 2 8 6" />
        <span className="nav-label">{session ? profile?.username ?? 'Me' : 'Sign in'}</span>
      </button>
    </nav>
  </>;
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
