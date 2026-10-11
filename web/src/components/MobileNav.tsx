import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { StatChips, type Stats } from './Header';

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

  return <>
    {sheet && (
      <div className="sheet-backdrop" onClick={() => setSheet(null)}>
        <div className="sheet" role="menu" onClick={e => e.stopPropagation()}>
          {sheet === 'add' ? <>
            <div className="sheet-title">Add a place</div>
            <button type="button" role="menuitem" onClick={pick(onAtMyLocation)}>◎ At my current location</button>
            <button type="button" role="menuitem" onClick={pick(onTapOnMap)}>📍 Tap a spot on the map</button>
            <button type="button" role="menuitem" onClick={pick(onByCoords)}>⌖ Enter coordinates</button>
          </> : <>
            <div className="sheet-title">
              {profile?.username}{isAdmin && <span className="admin-badge">admin</span>}
            </div>
            <StatChips stats={stats} />
            <button type="button" role="menuitem" onClick={pick(() => signOut())}>Sign out</button>
          </>}
          <button type="button" className="sheet-cancel" onClick={() => setSheet(null)}>Cancel</button>
        </div>
      </div>
    )}
    <nav className="mobile-nav" aria-label="Main">
      <button type="button" className={tab === 'map' ? 'active' : ''} aria-current={tab === 'map'} onClick={() => onTab('map')}>
        <span aria-hidden="true">🗺</span>Map
      </button>
      <button type="button" className={tab === 'list' ? 'active' : ''} aria-current={tab === 'list'} onClick={() => onTab('list')}>
        <span aria-hidden="true">☰</span>List
      </button>
      {session && (
        <button type="button" className={`add${armed ? ' armed' : ''}`} onClick={() => (armed ? onTapOnMap() : setSheet('add'))}>
          <span aria-hidden="true">{armed ? '✕' : '+'}</span>{armed ? 'Cancel' : 'Add'}
        </button>
      )}
      <button type="button" onClick={() => (session ? setSheet('account') : onSignIn())}>
        <span aria-hidden="true">●</span>{session ? profile?.username ?? 'Me' : 'Sign in'}
      </button>
    </nav>
  </>;
}
