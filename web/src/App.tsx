import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth/useAuth';
import { useI18n } from './i18n';
import { AccountPanel } from './components/AccountPanel';
import { AreaView } from './components/AreaView';
import { AuthModal, NewPasswordModal } from './components/AuthModal';
import { Header } from './components/Header';
import { MapView, type MapCommand } from './components/MapView';
import { MobileNav, type MobileTab } from './components/MobileNav';
import { MyLog } from './components/MyLog';
import { NewAreaModal } from './components/NewAreaModal';
import { PlaceModal } from './components/PlaceModal';
import { PlaceView, type PlaceTab } from './components/PlaceView';
import { SectorView } from './components/SectorView';
import { Sidebar, type ListMode } from './components/Sidebar';
import { UsersPage } from './components/UsersPage';
import { VisitModal } from './components/VisitModal';
import { WishModal } from './components/WishModal';
import { useDebounced } from './hooks/useDebounced';
import { MOBILE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import {
  fetchAreas, fetchAttachments, fetchSectors, fetchMyPartners, fillMissingTrackStats, fetchMyWishes, fetchPlaces, fetchRocks, fetchTrackFile, fetchVisits,
} from './lib/api';
import type { LatLng } from './lib/coords';
import { trackLines, TRACK_COLORS, type Track, type TrackLayer } from './lib/gpx';
import { errorMessage } from './lib/labels';
import {
  EMPTY_PLACE_FILTERS, EMPTY_VISIT_FILTERS,
  type Area, type Partner, type Place, type Sector, type PlaceFilters, type VisitDetail, type VisitSummary, type Wish,
} from './lib/types';

const hasPlaceFilters = (f: PlaceFilters) =>
  !!(f.search.trim() || f.activities.length || f.areaId || f.rock || f.exposition.length || f.near
    || f.protection.length || f.maxObligatoryRank != null || f.country);

const NO_TRACKS = new Map<number, Track>();
/** A spot with more tracks than this starts with only the first one drawn. */
const MAX_TRACKS_SHOWN = 3;

type Panel =
  | { kind: 'place'; placeId: number; tab: PlaceTab; visitId?: number }
  | { kind: 'area'; areaId: number }
  | { kind: 'sector'; sectorId: number }
  | { kind: 'log' }
  | { kind: 'account' }
  | { kind: 'users' };

/** The open panel lives in the URL hash (#place-12, #area-3, #sector-5, #log…): shareable, and Back closes it. */
const panelHash = (p: Panel | null) =>
  !p ? '' : p.kind === 'place' ? `#place-${p.placeId}` : p.kind === 'area' ? `#area-${p.areaId}`
    : p.kind === 'sector' ? `#sector-${p.sectorId}` : `#${p.kind}`;
function panelFromHash(hash: string): Panel | null {
  if (hash === '#log') return { kind: 'log' };
  if (hash === '#account') return { kind: 'account' };
  if (hash === '#users') return { kind: 'users' };
  const m = hash.match(/^#(place|area|sector)-(\d+)$/);
  if (!m) return null;
  if (m[1] === 'place') return { kind: 'place', placeId: +m[2], tab: 'info' };
  return m[1] === 'area' ? { kind: 'area', areaId: +m[2] } : { kind: 'sector', sectorId: +m[2] };
}

/** Loads and parses every GPX attachment of a place. */
async function loadTracks(placeId: number): Promise<Map<number, Track>> {
  const gpx = (await fetchAttachments({ placeId })).filter(a => a.kind === 'gpx');
  const parsed = await Promise.all(gpx.map(async a => {
    try {
      const file = await fetchTrackFile(a);
      return file ? [a.id, trackLines(file)] as const : null;
    } catch {
      return null;
    }
  }));
  return new Map(parsed.filter(x => x !== null));
}

export default function App() {
  const { session, profile, isAdmin, recovering, signOut } = useAuth();
  // Subscribes the whole tree to the language: switching re-renders everything.
  const { t } = useI18n();
  const userId = session?.user.id ?? null;
  const isMobile = useMediaQuery(MOBILE_QUERY);

  // ---- data -------------------------------------------------------------
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const [mode, setMode] = useState<ListMode>('places');
  const [placeFilters, setPlaceFilters] = useState(EMPTY_PLACE_FILTERS);
  const [visitFilters, setVisitFilters] = useState(EMPTY_VISIT_FILTERS);
  const [areaSearch, setAreaSearch] = useState('');
  const debouncedPlaceFilters = useDebounced(placeFilters);
  const debouncedVisitFilters = useDebounced(visitFilters);

  const [catalog, setCatalog] = useState<Place[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [filteredPlaces, setFilteredPlaces] = useState<Place[] | null>(null);
  const [visits, setVisits] = useState<{ key: string; rows: VisitSummary[] } | null>(null);
  const [rocks, setRocks] = useState<string[]>([]);
  const [myPartners, setMyPartners] = useState<Partner[]>([]);
  const [myWishes, setMyWishes] = useState<Wish[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Signed out: "only mine" and partner filters can't apply.
  const effectiveVisitFilters = useMemo(
    () => (userId ? debouncedVisitFilters : { ...debouncedVisitFilters, scope: 'all' as const, partnerId: null }),
    [debouncedVisitFilters, userId]);
  const visitsKey = `${JSON.stringify(effectiveVisitFilters)}|${userId}|${reloadKey}`;
  const loading = visits?.key !== visitsKey;

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPlaces(EMPTY_PLACE_FILTERS), fetchAreas(), fetchSectors(), fetchRocks()])
      .then(([places, areaList, sectorList, rockList]) => {
        if (cancelled) return;
        setCatalog(places);
        setAreas(areaList);
        setSectors(sectorList);
        setRocks(rockList);
      })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [reloadKey, userId]);

  useEffect(() => {
    if (!hasPlaceFilters(debouncedPlaceFilters)) return;
    let cancelled = false;
    fetchPlaces(debouncedPlaceFilters)
      .then(p => { if (!cancelled) setFilteredPlaces(p); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [debouncedPlaceFilters, reloadKey, userId]);

  useEffect(() => {
    let cancelled = false;
    fetchVisits(effectiveVisitFilters, userId)
      .then(rows => { if (!cancelled) { setVisits({ key: visitsKey, rows }); setError(null); } })
      .catch(e => { if (!cancelled) { setVisits({ key: visitsKey, rows: [] }); setError(errorMessage(e)); } });
    return () => { cancelled = true; };
  }, [effectiveVisitFilters, visitsKey, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyPartners(userId).then(p => { if (!cancelled) setMyPartners(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, reloadKey]);
  const partners = userId ? myPartners : [];

  // Tracks saved before their statistics were stored get measured once, in the background.
  useEffect(() => {
    if (userId) fillMissingTrackStats(userId).catch(() => {});
  }, [userId]);

  const [wishesKey, setWishesKey] = useState(0);
  const reloadWishes = useCallback(() => setWishesKey(k => k + 1), []);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyWishes(userId).then(w => { if (!cancelled) setMyWishes(w); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, reloadKey, wishesKey]);
  const wishes = useMemo(() => (userId ? myWishes.filter(w => w.user_id === userId) : []), [userId, myWishes]);
  const openWishByPlace = useMemo(
    () => new Map(wishes.filter(w => !w.done_at).map(w => [w.place_id, w])), [wishes]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const searched = (hasPlaceFilters(debouncedPlaceFilters) && filteredPlaces) || catalog;
  const places = useMemo(
    () => (placeFilters.wishlist && userId ? searched.filter(p => openWishByPlace.has(p.id)) : searched),
    [placeFilters.wishlist, userId, searched, openWishByPlace]);
  const visitRows = useMemo(() => visits?.rows ?? [], [visits]);
  const placeById = useMemo(() => new Map(catalog.map(p => [p.id, p])), [catalog]);
  const shownAreas = useMemo(() => {
    const s = areaSearch.trim().toLowerCase();
    return s ? areas.filter(a => a.name.toLowerCase().includes(s)) : areas;
  }, [areas, areaSearch]);

  const stats = useMemo(() => ({
    places: catalog.length,
    areas: areas.length,
    visits: catalog.reduce((n, p) => n + p.visit_count, 0),
  }), [catalog, areas]);

  // ---- map, panels & dialogs -------------------------------------------
  const [mobileTab, setMobileTab] = useState<MobileTab>('map');
  const [tempPin, setTempPin] = useState<LatLng | null>(null);
  const [searchPin, setSearchPin] = useState<(LatLng & { name: string }) | null>(null);
  // While set, the open form is hidden and the next map click answers it.
  const [picking, setPicking] = useState<{ label: string; apply: (at: LatLng) => void } | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(() => {
    const p = panelFromHash(window.location.hash);
    return p?.kind === 'place' ? p.placeId : null;
  });
  const [command, setCommand] = useState<MapCommand | null>(null);
  // A ref, not state: the map moves constantly and only the "near" filter reads this.
  const mapCenter = useRef<LatLng>({ lat: 42.5, lng: 12.5 });

  const [authOpen, setAuthOpen] = useState(false);
  const [newAreaOpen, setNewAreaOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(() => panelFromHash(window.location.hash));

  useEffect(() => {
    const want = panelHash(panel);
    if (window.location.hash !== want) {
      window.history.pushState(null, '', want || window.location.pathname + window.location.search);
    }
  }, [panel]);
  useEffect(() => {
    const onPop = () => {
      const next = panelFromHash(window.location.hash);
      setPanel(next);
      if (next?.kind === 'place') setFocusedId(next.placeId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [placeModal, setPlaceModal] = useState<{ place?: Place; at?: LatLng } | null>(null);
  const [visitModal, setVisitModal] = useState<{ placeId?: number; visit?: VisitDetail; withPeople?: string[] } | null>(null);
  const [wishModal, setWishModal] = useState<{ place: Place; wish?: Wish } | null>(null);

  // GPX tracks of the focused place, drawn on the map and summarised in its panel.
  const [tracks, setTracks] = useState<{ placeId: number; byId: Map<number, Track> } | null>(null);
  useEffect(() => {
    if (focusedId == null) return;
    let cancelled = false;
    loadTracks(focusedId)
      .then(byId => { if (!cancelled) setTracks({ placeId: focusedId, byId }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [focusedId, reloadKey]);
  const trackMap = tracks && tracks.placeId === focusedId ? tracks.byId : NO_TRACKS;
  const trackList = useMemo(() => [...trackMap.values()], [trackMap]);
  // Tracks switched on or off by hand, for the focused place; the rest follow the default.
  const [trackToggles, setTrackToggles] = useState<{ placeId: number; shown: Map<number, boolean> } | null>(null);
  const trackLayers = useMemo((): TrackLayer[] => {
    const toggled = trackToggles?.placeId === focusedId ? trackToggles.shown : undefined;
    const many = trackMap.size > MAX_TRACKS_SHOWN;
    return [...trackMap].map(([id, track], i) => ({
      id, track, color: TRACK_COLORS[i % TRACK_COLORS.length], shown: toggled?.get(id) ?? (!many || i === 0),
    }));
  }, [trackMap, trackToggles, focusedId]);
  const toggleTrack = (id: number) => {
    const layer = trackLayers.find(l => l.id === id);
    if (focusedId == null || !layer) return;
    const shown = new Map(trackToggles?.placeId === focusedId ? trackToggles.shown : []);
    shown.set(id, !layer.shown);
    setTrackToggles({ placeId: focusedId, shown });
  };

  const pins = useMemo(() => {
    if (mode === 'places') return places;
    if (mode === 'areas') return catalog;
    const ids = new Set(visitRows.map(v => v.place_id));
    return catalog.filter(p => ids.has(p.id));
  }, [mode, places, visitRows, catalog]);

  const canEdit = useCallback(
    (p: Place) => !!userId && (isAdmin || p.created_by === userId), [userId, isAdmin]);

  /** Centres the map on a place and opens its popup (switching to the map on phones). */
  const focusOnMap = useCallback((place: Place) => {
    setFocusedId(place.id);
    setCommand({ kind: 'focus', place, nonce: Date.now() });
    if (isMobile) setMobileTab('map');
  }, [isMobile]);

  const openPlace = useCallback((place: Place, tab: PlaceTab = 'info', visitId?: number) => {
    setFocusedId(place.id);
    setPanel({ kind: 'place', placeId: place.id, tab, visitId });
    if (!isMobile) setCommand({ kind: 'focus', place, nonce: Date.now() });
  }, [isMobile]);

  const areaPlaces = useCallback((areaId: number) => catalog.filter(p => p.area_id === areaId), [catalog]);
  const showAreaOnMap = useCallback((areaId: number) => {
    const pts = areaPlaces(areaId).map(p => ({ lat: p.lat, lng: p.lng }));
    if (pts.length) setCommand({ kind: 'fit', points: pts, nonce: Date.now() });
  }, [areaPlaces]);
  const openArea = useCallback((areaId: number) => {
    setPanel({ kind: 'area', areaId });
    if (!isMobile) showAreaOnMap(areaId);
  }, [isMobile, showAreaOnMap]);

  const sectorPlaces = useCallback((sectorId: number) => catalog.filter(p => p.sector_id === sectorId), [catalog]);
  const showSectorOnMap = useCallback((sectorId: number) => {
    const pts = sectorPlaces(sectorId).map(p => ({ lat: p.lat, lng: p.lng }));
    if (pts.length) setCommand({ kind: 'fit', points: pts, nonce: Date.now() });
  }, [sectorPlaces]);
  const openSector = useCallback((sectorId: number) => {
    setPanel({ kind: 'sector', sectorId });
    if (!isMobile) showSectorOnMap(sectorId);
  }, [isMobile, showSectorOnMap]);

  const closeForms = () => {
    setPlaceModal(null);
    setVisitModal(null);
    setPicking(null);
    setTempPin(null);
  };
  const requireSignIn = (fn: () => void) => () => (userId ? fn() : setAuthOpen(true));
  const openAddPlace = requireSignIn(() => setPlaceModal({}));
  const openLogVisit = requireSignIn(() => setVisitModal({}));
  const openAddVisit = (place: Place) => {
    if (!userId) return setAuthOpen(true);
    setVisitModal({ placeId: place.id });
  };
  const pickOnMap = useCallback((label: string, apply: (at: LatLng) => void) => {
    setPicking({ label, apply });
    if (isMobile) setMobileTab('map');
  }, [isMobile]);
  /** After a save, show the result: the place's panel, on its visits if one was logged. */
  const showSaved = (placeId: number, visitLogged: boolean) => {
    closeForms();
    reload();
    setFocusedId(placeId);
    setPanel({ kind: 'place', placeId, tab: visitLogged ? 'visits' : 'info' });
    setNotice(visitLogged ? t.app.app.visitSaved : t.app.app.spotSaved);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (picking) return setPicking(null);
      if (!placeModal && !visitModal && !wishModal) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [placeModal, visitModal, wishModal, picking]);
  const panelPlace = panel?.kind === 'place' ? placeById.get(panel.placeId) : undefined;
  const panelArea = panel?.kind === 'area' ? areas.find(a => a.id === panel.areaId) : undefined;
  const panelSector = panel?.kind === 'sector' ? sectors.find(x => x.id === panel.sectorId) : undefined;
  const focusedPlace = focusedId != null ? placeById.get(focusedId) ?? null : null;

  return (
    <>
      <Header
        isMobile={isMobile}
        onAddPlace={openAddPlace}
        onLogVisit={openLogVisit}
        onSignIn={() => setAuthOpen(true)}
        onOpenLog={() => setPanel({ kind: 'log' })}
        onOpenAccount={() => setPanel({ kind: 'account' })}
      />

      <div className={`stage${isMobile ? ` mobile show-${mobileTab}` : ''}`}>
        <Sidebar
          mode={mode}
          onModeChange={setMode}
          placeFilters={placeFilters}
          onPlaceFilters={setPlaceFilters}
          visitFilters={visitFilters}
          onVisitFilters={setVisitFilters}
          areaSearch={areaSearch}
          onAreaSearch={setAreaSearch}
          places={places}
          areas={shownAreas}
          visits={visitRows}
          loading={loading}
          error={error}
          rocks={rocks}
          partners={partners}
          getMapCenter={() => mapCenter.current}
          userId={userId}
          isAdmin={isAdmin}
          onPlaceClick={focusOnMap}
          onPlaceDetails={p => openPlace(p)}
          onAddVisit={openAddVisit}
          onAreaClick={openArea}
          onSectorClick={openSector}
          onNewArea={() => setNewAreaOpen(true)}
          onLocationPick={loc => {
            setSearchPin({ lat: loc.lat, lng: loc.lng, name: loc.name });
            setPanel(null);
            if (isMobile) setMobileTab('map');
            if (loc.extent) {
              const [w, n, e, s] = loc.extent;
              setCommand({ kind: 'fit', points: [{ lat: n, lng: w }, { lat: s, lng: e }], nonce: Date.now() });
            } else {
              setCommand({ kind: 'fly', at: loc, zoom: 14, nonce: Date.now() });
            }
          }}
          onVisitClick={v => {
            const place = placeById.get(v.place_id);
            if (place) openPlace(place, 'visits', v.id);
          }}
        />

        <MapView
          pins={pins}
          focusedPlace={focusedPlace}
          tracks={trackList}
          trackLayers={trackLayers}
          tempPin={tempPin}
          searchPin={placeFilters.search.trim() ? searchPin : null}
          armed={!!picking}
          command={command}
          visibleKey={`${isMobile}-${mobileTab}-${!!panel}`}
          insetRight={panel && !isMobile ? 460 : 0}
          signedIn={!!userId}
          onMapClick={at => {
            if (picking) {
              picking.apply(at);
              setPicking(null);
            } else if (panel?.kind !== 'place') {
              setFocusedId(null);
            }
          }}
          onPinClick={p => setFocusedId(p.id)}
          onDetails={p => openPlace(p)}
          onViewVisits={p => openPlace(p, 'visits')}
          onAddVisit={openAddVisit}
          onAddPlaceAt={at => setPlaceModal({ at: { lat: at.lat, lng: at.lng } })}
          onCenterChange={c => { mapCenter.current = c; }}
        />

        {panel?.kind === 'place' && panelPlace && (
          <PlaceView
            key={`place-panel-${panelPlace.id}-${panel.visitId ?? ''}`}
            place={panelPlace}
            tab={panel.tab}
            initialVisitId={panel.visitId}
            userId={userId}
            isAdmin={isAdmin}
            canEdit={canEdit(panelPlace)}
            reloadKey={reloadKey}
            tracks={trackLayers}
            onToggleTrack={toggleTrack}
            isMobile={isMobile}
            onTab={tab => setPanel({ ...panel, tab })}
            onClose={() => setPanel(null)}
            onShowOnMap={() => { setPanel(null); focusOnMap(panelPlace); }}
            onOpenArea={openArea}
            onOpenSector={openSector}
            onEdit={() => setPlaceModal({ place: panelPlace })}
            onAddVisit={() => openAddVisit(panelPlace)}
            wish={openWishByPlace.get(panelPlace.id)}
            onWish={() => requireSignIn(() => setWishModal({ place: panelPlace, wish: openWishByPlace.get(panelPlace.id) }))()}
            onEditVisit={visit => setVisitModal({ placeId: panelPlace.id, visit })}
            onChanged={reload}
          />
        )}

        {panel?.kind === 'log' && userId && (
          <MyLog
            userId={userId}
            username={profile?.username ?? ''}
            reloadKey={reloadKey}
            onClose={() => setPanel(null)}
            onChanged={reload}
            onOpenLoggedVisit={v => {
              const place = placeById.get(v.place_id);
              if (place) openPlace(place, 'visits', v.id);
            }}
            wishes={wishes}
            placeById={placeById}
            onEditWish={(place, wish) => setWishModal({ place, wish })}
            onLogVisit={place => setVisitModal({ placeId: place.id, withPeople: openWishByPlace.get(place.id)?.with_people })}
            onOpenPlace={place => openPlace(place)}
            onOpenVisit={(place, visitId) => openPlace(place, 'visits', visitId)}
            onWishesChanged={reloadWishes}
          />
        )}

        {panel?.kind === 'account' && userId && (
          <AccountPanel
            userId={userId}
            onClose={() => setPanel(null)}
            onOpenUsers={() => setPanel({ kind: 'users' })}
            onDeleted={() => {
              setPanel(null);
              void signOut();
              setNotice(t.app.app.accountDeleted);
              reload();
            }}
          />
        )}

        {panel?.kind === 'users' && userId && isAdmin && (
          <UsersPage myId={userId} onClose={() => setPanel({ kind: 'account' })} />
        )}

        {panel?.kind === 'area' && panelArea && (
          <AreaView
            key={`area-panel-${panelArea.id}`}
            area={panelArea}
            places={areaPlaces(panelArea.id)}
            allPlaces={catalog}
            canEditPlace={canEdit}
            userId={userId}
            isAdmin={isAdmin}
            onClose={() => setPanel(null)}
            onShowOnMap={() => {
              if (isMobile) { setPanel(null); setMobileTab('map'); }
              showAreaOnMap(panelArea.id);
            }}
            onOpenPlace={p => openPlace(p)}
            onOpenSector={openSector}
            onChanged={reload}
            onDeleted={() => { setPanel(null); reload(); }}
          />
        )}

        {panel?.kind === 'sector' && panelSector && (
          <SectorView
            key={`sector-panel-${panelSector.id}`}
            sector={panelSector}
            areas={areas}
            places={sectorPlaces(panelSector.id)}
            allPlaces={catalog}
            canEditPlace={canEdit}
            userId={userId}
            isAdmin={isAdmin}
            onClose={() => setPanel(null)}
            onShowOnMap={() => {
              if (isMobile) { setPanel(null); setMobileTab('map'); }
              showSectorOnMap(panelSector.id);
            }}
            onOpenArea={openArea}
            onOpenPlace={p => openPlace(p)}
            onChanged={reload}
            onDeleted={() => { setPanel(null); reload(); }}
          />
        )}
      </div>

      {isMobile && (
        <MobileNav
          tab={mobileTab}
          onTab={tab => { setMobileTab(tab); setPanel(null); }}
          stats={stats}
          onAddPlace={openAddPlace}
          onLogVisit={openLogVisit}
          onSignIn={() => setAuthOpen(true)}
          onOpenLog={() => setPanel({ kind: 'log' })}
          onOpenAccount={() => setPanel({ kind: 'account' })}
        />
      )}

      {picking && (
        <div className="toast show picking" role="status">
          <span>{t.app.app.pickOnMap(isMobile, picking.label)}</span>
          <button type="button" className="link-btn invert" onClick={() => setPicking(null)}>{t.common.cancel}</button>
        </div>
      )}
      {notice && <div className="toast show notice" role="status">{notice}</div>}

      {placeModal && userId && (
        <PlaceModal
          key={`place-${placeModal.place?.id ?? 'new'}`}
          place={placeModal.place}
          initialAt={placeModal.at}
          rocks={rocks}
          areas={areas}
          sectors={sectors}
          partners={partners}
          canDelete={!!placeModal.place && canEdit(placeModal.place)}
          hidden={!!picking}
          onPickOnMap={pickOnMap}
          onCoordsChange={setTempPin}
          onClose={closeForms}
          onSaved={showSaved}
          onDeleted={() => { closeForms(); setPanel(null); setFocusedId(null); reload(); }}
          onOpenExisting={id => {
            const existing = catalog.find(p => p.id === id);
            closeForms();
            if (existing) openPlace(existing);
          }}
        />
      )}

      {visitModal && userId && (
        <VisitModal
          key={`visit-${visitModal.visit?.id ?? 'new'}-${visitModal.placeId ?? ''}`}
          placeId={visitModal.placeId}
          visit={visitModal.visit}
          places={catalog}
          areas={areas}
          sectors={sectors}
          userId={userId}
          rocks={rocks}
          partners={partners}
          openWishByPlace={openWishByPlace}
          initialWithPeople={visitModal.withPeople}
          hidden={!!picking}
          onPickOnMap={pickOnMap}
          onCoordsChange={setTempPin}
          onClose={closeForms}
          onSaved={(placeId, wishResolved) => {
            showSaved(placeId, true);
            if (wishResolved) setNotice(t.app.app.visitSavedWishDone);
          }}
        />
      )}

      {wishModal && userId && (
        <WishModal
          key={`wish-${wishModal.place.id}-${wishModal.wish?.id ?? 'new'}`}
          place={wishModal.place}
          wish={wishModal.wish}
          partners={partners}
          onClose={() => setWishModal(null)}
          onSaved={message => { setWishModal(null); reloadWishes(); setNotice(message); }}
        />
      )}

      {newAreaOpen && userId && (
        <NewAreaModal
          onClose={() => setNewAreaOpen(false)}
          onCreated={areaId => {
            setNewAreaOpen(false);
            reload();
            setPanel({ kind: 'area', areaId });
            setNotice(t.app.app.areaCreated);
          }}
        />
      )}

      {authOpen && !session && <AuthModal onClose={() => setAuthOpen(false)} />}
      {recovering && session && <NewPasswordModal />}
    </>
  );
}
