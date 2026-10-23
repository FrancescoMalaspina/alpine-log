import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth/useAuth';
import { useI18n } from './i18n';
import { AccountPanel } from './components/AccountPanel';
import { AreaView } from './components/AreaView';
import { AuthModal, NewPasswordModal } from './components/AuthModal';
import { Header } from './components/Header';
import { DuplicatesSection } from './components/DuplicatesSection';
import { useUsernames } from './hooks/useUsernames';
import { PhotoReviewSection } from './components/PhotoReviewSection';
import { SuggestionsSection } from './components/SuggestionsSection';
import { MapView, type MapCommand } from './components/MapView';
import { MergeModal, type MergeTarget } from './components/MergeModal';
import { MobileNav, type MobileTab } from './components/MobileNav';
import { MyLog } from './components/MyLog';
import { NewAreaModal } from './components/NewAreaModal';
import { PlaceModal } from './components/PlaceModal';
import { PlaceView, type PlaceTab } from './components/PlaceView';
import { SectorView } from './components/SectorView';
import { Sidebar, type SidebarView } from './components/Sidebar';
import { UsersPage } from './components/UsersPage';
import { VisitModal } from './components/VisitModal';
import { WishModal } from './components/WishModal';
import { useDebounced } from './hooks/useDebounced';
import { MOBILE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useRemembered } from './hooks/useRemembered';
import {
  fetchAreas, fetchAttachments, fetchSectors, fetchInvitations, fetchInvitePrefill, fetchMyPartners, fillMissingTrackStats, fetchMyWishes, fetchPlaces,
  fetchRocks, fetchTrackFile, partnerForUser,
} from './lib/api';
import { visitPrefillFromInvite, type VisitValues } from './components/forms/visitForm';
import { inBounds, type Bounds, type LatLng } from './lib/coords';
import { trackLines, TRACK_COLORS, type Track, type TrackLayer } from './lib/gpx';
import { errorMessage } from './lib/labels';
import { removeLeftoverPhotoFiles } from './lib/photos';
import {
  EMPTY_PLACE_FILTERS,
  type Area, type Invitation, type Partner, type Place, type Sector, type PlaceFilters, type VisitDetail, type VisitSummary, type Wish,
} from './lib/types';

/** Filters the database applies; the wishlist and "on the map" ones are applied here. */
const hasPlaceFilters = (f: PlaceFilters) =>
  !!(f.search.trim() || f.activities.length || f.areaId || f.rock || f.exposition.length || f.near
    || f.protection.length || f.maxObligatoryRank != null || f.country || f.withPublicVisits);

const NO_TRACKS = new Map<number, Track>();
/** A spot with more tracks than this starts with only the first one drawn. */
const MAX_TRACKS_SHOWN = 3;

type Panel =
  | { kind: 'place'; placeId: number; tab: PlaceTab; visitId?: number }
  | { kind: 'area'; areaId: number }
  | { kind: 'sector'; sectorId: number }
  | { kind: 'log' }
  | { kind: 'logbook'; userId: string }
  | { kind: 'account' }
  | { kind: 'users' };

/** The open panel lives in the URL hash (#place-12, #area-3, #sector-5, #log…): shareable, and Back closes it. */
const panelHash = (p: Panel | null) =>
  !p ? '' : p.kind === 'place' ? `#place-${p.placeId}` : p.kind === 'area' ? `#area-${p.areaId}`
    : p.kind === 'sector' ? `#sector-${p.sectorId}` : p.kind === 'logbook' ? `#logbook-${p.userId}` : `#${p.kind}`;
function panelFromHash(hash: string): Panel | null {
  if (hash === '#log') return { kind: 'log' };
  const logbook = hash.match(/^#logbook-([0-9a-f-]{36})$/);
  if (logbook) return { kind: 'logbook', userId: logbook[1] };
  if (hash === '#account') return { kind: 'account' };
  if (hash === '#users') return { kind: 'users' };
  const m = hash.match(/^#(place|area|sector)-(\d+)$/);
  if (!m) return null;
  if (m[1] === 'place') return { kind: 'place', placeId: +m[2], tab: 'info' };
  return m[1] === 'area' ? { kind: 'area', areaId: +m[2] } : { kind: 'sector', sectorId: +m[2] };
}

/** Whether a key press is typing into a field, rather than a shortcut. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

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

  const [placeFilters, setPlaceFilters] = useState(EMPTY_PLACE_FILTERS);
  const debouncedPlaceFilters = useDebounced(placeFilters);

  const [catalog, setCatalog] = useState<Place[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [filteredPlaces, setFilteredPlaces] = useState<Place[] | null>(null);
  const [rocks, setRocks] = useState<string[]>([]);
  const [myPartners, setMyPartners] = useState<Partner[]>([]);
  const [myWishes, setMyWishes] = useState<Wish[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    if (!userId) return;
    let cancelled = false;
    fetchMyPartners(userId).then(p => { if (!cancelled) setMyPartners(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, reloadKey]);
  const partners = userId ? myPartners : [];

  // Invitations and requests to answer; checked on sign-in and after every change.
  const [myInvitations, setMyInvitations] = useState<Invitation[]>([]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchInvitations().then(i => { if (!cancelled) setMyInvitations(i); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, reloadKey]);
  const invitations = userId ? myInvitations : [];

  // In the background on sign-in: tracks saved before their statistics were stored get
  // measured, and files of your photos the database dropped get removed.
  useEffect(() => {
    if (!userId) return;
    fillMissingTrackStats(userId).catch(() => {});
    removeLeftoverPhotoFiles().catch(() => {});
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

  // Refs, not state: the map moves constantly. Only the "on the map" filter
  // follows it, through viewBounds, and only while it is on.
  const mapCenter = useRef<LatLng>({ lat: 42.5, lng: 12.5 });
  const mapBounds = useRef<Bounds | null>(null);
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);
  const changePlaceFilters = (f: PlaceFilters) => {
    if (f.inView && !placeFilters.inView) setViewBounds(mapBounds.current);
    setPlaceFilters(f);
  };

  const searched = (hasPlaceFilters(debouncedPlaceFilters) && filteredPlaces) || catalog;
  // On the map: every spot the search and filters keep. In the list: only those in view, if asked.
  const places = useMemo(
    () => (placeFilters.wishlist && userId ? searched.filter(p => openWishByPlace.has(p.id)) : searched),
    [placeFilters.wishlist, userId, searched, openWishByPlace]);
  const listedPlaces = useMemo(
    () => (placeFilters.inView && viewBounds ? places.filter(p => inBounds(p, viewBounds)) : places),
    [placeFilters.inView, viewBounds, places]);
  const placeById = useMemo(() => new Map(catalog.map(p => [p.id, p])), [catalog]);

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
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [focusSearch, setFocusSearch] = useState(0);

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
  const [mergeTarget, setMergeTarget] = useState<MergeTarget | null>(null);
  const [visitModal, setVisitModal] = useState<{
    placeId?: number; visit?: VisitDetail; prefill?: Partial<VisitValues>; invite?: Invitation;
  } | null>(null);
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

  // While a logbook is open, the map shows only the spots of the visits it lists.
  const [logPlaces, setLogPlaces] = useState<{ log: string; ids: Set<number> } | null>(null);
  const logKeyNow = panel?.kind === 'log' || panel?.kind === 'logbook' ? panelHash(panel) : null;
  const logPlaceIds = logPlaces && logPlaces.log === logKeyNow ? logPlaces.ids : null;
  const pins = useMemo(
    () => (logPlaceIds ? catalog.filter(p => logPlaceIds.has(p.id)) : places), [logPlaceIds, catalog, places]);
  const fitTo = useCallback((list: Place[]) => {
    if (list.length) setCommand({ kind: 'fit', points: list.map(p => ({ lat: p.lat, lng: p.lng })), nonce: Date.now() });
  }, []);
  const showLogPlaces = useCallback((ids: number[], first: boolean) => {
    if (!logKeyNow) return;
    const set = new Set(ids);
    setLogPlaces({ log: logKeyNow, ids: set });
    if (first) fitTo(catalog.filter(p => set.has(p.id)));
  }, [logKeyNow, catalog, fitTo]);
  // On a phone, "Show on map" hides the logbook (still open) behind its spots.
  const [logOnMap, setLogOnMap] = useState<string | null>(null);
  const showingLogOnMap = isMobile && !!logKeyNow && logOnMap === logKeyNow;

  // The spot list: open, folded (remembered on this device) or across the whole
  // width. A logbook folds it while it is open, unless it's opened again meanwhile.
  const [listFolded, setListFolded] = useRemembered('sidebar.collapsed', false);
  const [listFull, setListFull] = useState(false);
  const logKey = logKeyNow;
  const [peekedLog, setPeekedLog] = useState<string | null>(null);
  const sidebarView: SidebarView = isMobile ? 'open'
    : (logKey && peekedLog !== logKey) || listFolded ? 'collapsed' : listFull ? 'full' : 'open';
  const setSidebarView = (view: SidebarView) => {
    setPeekedLog(view === 'collapsed' ? null : logKey);
    setListFolded(view === 'collapsed');
    setListFull(view === 'full');
  };

  const canEdit = useCallback(
    (p: Place) => !!userId && (isAdmin || p.created_by === userId), [userId, isAdmin]);

  /** Centres the map on a place and opens its popup (switching to the map on phones). */
  const focusOnMap = useCallback((place: Place) => {
    setFocusedId(place.id);
    setCommand({ kind: 'focus', place, nonce: Date.now() });
    setListFull(false);
    if (isMobile) setMobileTab('map');
  }, [isMobile]);

  const openPlace = useCallback((place: Place, tab: PlaceTab = 'info', visitId?: number) => {
    setFocusedId(place.id);
    setPanel({ kind: 'place', placeId: place.id, tab, visitId });
    if (!isMobile) setCommand({ kind: 'focus', place, nonce: Date.now() });
  }, [isMobile]);

  const openPlaceById = (id: number) => {
    const place = placeById.get(id);
    if (place) openPlace(place);
  };
  const openLoggedVisit = (v: VisitSummary) => {
    const place = placeById.get(v.place_id);
    if (place) openPlace(place, 'visits', v.id);
  };
  /** Someone's logbook: yours, with its tools, or another user's, read-only. */
  const openLogbook = (id: string) => setPanel(id === userId ? { kind: 'log' } : { kind: 'logbook', userId: id });
  const users = useUsernames();
  /** What every logbook panel gets, yours or someone else's. */
  const logbookProps = {
    reloadKey,
    onClose: () => setPanel(null),
    onOpenLoggedVisit: openLoggedVisit,
    onOpenLogbook: userId ? openLogbook : undefined,
    onShownPlaces: showLogPlaces,
    onShowOnMap: isMobile ? () => {
      setLogOnMap(logKeyNow);
      setMobileTab('map');
      fitTo(pins);
    } : undefined,
    hidden: showingLogOnMap,
  };

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
  /** A wish's people start the visit that ticks it off. */
  const logWishVisit = (place: Place) => {
    const people = openWishByPlace.get(place.id)?.with_people;
    setVisitModal({ placeId: place.id, prefill: people?.length ? { withPeople: people } : undefined });
  };
  /** "Add to my logbook": a visit filled in from the invitation, the people by the names you know them by. */
  const acceptWithVisit = async (invite: Invitation) => {
    try {
      const prefill = await fetchInvitePrefill(invite.id);
      const users = [...new Set(prefill.people.flatMap(p => (p.user_id ? [p.user_id] : [])))];
      const names = new Map(await Promise.all(users.map(async u => [u, await partnerForUser(u)] as const)));
      setVisitModal({ placeId: invite.place_id, invite, prefill: visitPrefillFromInvite(prefill, u => names.get(u) ?? '') });
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };
  const pickOnMap = useCallback((label: string, apply: (at: LatLng) => void) => {
    setPicking({ label, apply });
    if (isMobile) setMobileTab('map');
  }, [isMobile]);
  /** After a save, show the result: the place's panel, on its visits if one was logged. */
  const showSaved = (placeId: number, visitLogged: boolean, suggested = false) => {
    closeForms();
    reload();
    setFocusedId(placeId);
    setPanel({ kind: 'place', placeId, tab: visitLogged ? 'visits' : 'info' });
    setNotice(visitLogged ? t.app.app.visitSaved : suggested ? t.app.app.suggestionSent : t.app.app.spotSaved);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const formOpen = !!(placeModal || visitModal || wishModal || mergeTarget || newAreaOpen || authOpen);
      if (e.key === '/' && !formOpen && !isTyping(e.target)) {
        // "/" goes to the spot search, wherever it is.
        e.preventDefault();
        if (isMobile) setMobileTab('list');
        else if (listFolded || logKey) { setListFolded(false); setPeekedLog(logKey); }
        setFocusSearch(n => n + 1);
        return;
      }
      if (e.key !== 'Escape') return;
      if (picking) return setPicking(null);
      if (!placeModal && !visitModal && !wishModal) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [placeModal, visitModal, wishModal, mergeTarget, newAreaOpen, authOpen, picking, isMobile, listFolded, logKey, setListFolded]);
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
        invitations={invitations.length}
      />

      <div className={`stage${isMobile ? ` mobile show-${mobileTab}` : ` sidebar-${sidebarView}`}`}>
        <Sidebar
          view={sidebarView}
          onView={setSidebarView}
          isMobile={isMobile}
          placeFilters={placeFilters}
          onPlaceFilters={changePlaceFilters}
          places={listedPlaces}
          areas={areas}
          error={error}
          rocks={rocks}
          getMapCenter={() => mapCenter.current}
          userId={userId}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          focusSearch={focusSearch}
          onPlaceClick={focusOnMap}
          onPlaceDetails={p => openPlace(p)}
          onAddVisit={openAddVisit}
          onAreaClick={openArea}
          onSectorClick={openSector}
          onNewArea={() => setNewAreaOpen(true)}
          onLocationPick={loc => {
            setSearchPin({ lat: loc.lat, lng: loc.lng, name: loc.name });
            setPanel(null);
            setListFull(false);
            if (isMobile) setMobileTab('map');
            if (loc.extent) {
              const [w, n, e, s] = loc.extent;
              setCommand({ kind: 'fit', points: [{ lat: n, lng: w }, { lat: s, lng: e }], nonce: Date.now() });
            } else {
              setCommand({ kind: 'fly', at: loc, zoom: 14, nonce: Date.now() });
            }
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
          visibleKey={`${isMobile}-${mobileTab}-${!!panel}-${sidebarView}`}
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
          onViewChange={v => {
            mapCenter.current = v.center;
            mapBounds.current = v.bounds;
            if (placeFilters.inView) setViewBounds(v.bounds);
          }}
          hoveredId={hoveredId}
          onHover={setHoveredId}
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
            onOpenLogbook={openLogbook}
          />
        )}

        {panel?.kind === 'log' && userId && (
          <MyLog
            {...logbookProps}
            userId={userId}
            username={profile?.username ?? ''}
            own={{
              partners,
              onChanged: reload,
              wishes,
              placeById,
              invitations,
              onAddInvitation: acceptWithVisit,
              onEditWish: (place, wish) => setWishModal({ place, wish }),
              onLogVisit: logWishVisit,
              onOpenPlace: place => openPlace(place),
              onOpenVisit: (place, visitId) => openPlace(place, 'visits', visitId),
              onWishesChanged: reloadWishes,
            }}
          />
        )}

        {panel?.kind === 'logbook' && (
          <MyLog
            {...logbookProps}
            key={panel.userId}
            userId={panel.userId}
            username={users.find(u => u.id === panel.userId)?.username ?? ''}
            onOpenMine={userId ? () => openLogbook(userId) : undefined}
          />
        )}

        {showingLogOnMap && (
          <div className="map-chip" role="status">
            <span className="map-chip-name">
              {panel?.kind === 'logbook' ? t.account.myLog.title(users.find(u => u.id === panel.userId)?.username ?? '')
                : t.account.myLog.titleNoName}
            </span>
            <button type="button" className="link-btn" onClick={() => setLogOnMap(null)}>{t.app.app.backToLogbook}</button>
            <button type="button" className="icon-btn small" aria-label={t.app.drawer.closePanel}
                    onClick={() => { setLogOnMap(null); setPanel(null); }}>×</button>
          </div>
        )}

        {panel?.kind === 'account' && userId && (
          <AccountPanel
            userId={userId}
            onClose={() => setPanel(null)}
            onOpenUsers={() => setPanel({ kind: 'users' })}
            onOpenLogbook={openLogbook}
            onPartnersChanged={reload}
            onDeleted={() => {
              setPanel(null);
              void signOut();
              setNotice(t.app.app.accountDeleted);
              reload();
            }}
          />
        )}

        {panel?.kind === 'users' && userId && isAdmin && (
          <UsersPage myId={userId} onClose={() => setPanel({ kind: 'account' })} onOpenLogbook={openLogbook}>
            <SuggestionsSection onChanged={reload} onOpenPlace={openPlaceById} />
            <PhotoReviewSection onChanged={reload} onOpenPlace={openPlaceById} />
            <DuplicatesSection places={catalog} areas={areas} onMerge={setMergeTarget} />
          </UsersPage>
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
            onMerge={isAdmin ? () => setMergeTarget({ kind: 'area', duplicate: panelArea.id }) : undefined}
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
          onTab={tab => { setMobileTab(tab); setPanel(null); setLogOnMap(null); }}
          stats={stats}
          onAddPlace={openAddPlace}
          onLogVisit={openLogVisit}
          onSignIn={() => setAuthOpen(true)}
          onOpenLog={() => setPanel({ kind: 'log' })}
          onOpenAccount={() => setPanel({ kind: 'account' })}
          invitations={invitations.length}
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
          suggest={!!placeModal.place && !canEdit(placeModal.place)}
          hidden={!!picking}
          onPickOnMap={pickOnMap}
          onCoordsChange={setTempPin}
          onClose={closeForms}
          onSaved={showSaved}
          onDeleted={() => { closeForms(); setPanel(null); setFocusedId(null); reload(); }}
          onMerge={isAdmin && placeModal.place ? () => setMergeTarget({ kind: 'place', duplicate: placeModal.place!.id }) : undefined}
          onOpenExisting={id => {
            const existing = catalog.find(p => p.id === id);
            closeForms();
            if (existing) openPlace(existing);
          }}
        />
      )}

      {visitModal && userId && (
        <VisitModal
          key={`visit-${visitModal.visit?.id ?? 'new'}-${visitModal.placeId ?? ''}-${visitModal.invite?.id ?? ''}`}
          placeId={visitModal.placeId}
          visit={visitModal.visit}
          places={catalog}
          areas={areas}
          sectors={sectors}
          userId={userId}
          rocks={rocks}
          partners={partners}
          openWishByPlace={openWishByPlace}
          prefill={visitModal.prefill}
          invite={visitModal.invite}
          invitations={invitations}
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

      {mergeTarget && isAdmin && (
        <MergeModal
          key={`merge-${mergeTarget.kind}-${mergeTarget.duplicate}`}
          {...mergeTarget}
          places={catalog}
          areas={areas}
          onClose={() => setMergeTarget(null)}
          onMerged={(kind, keep) => {
            setMergeTarget(null);
            // From the spot form, the kept spot opens; from the admins' list, the list stays.
            if (placeModal) {
              closeForms();
              const kept = catalog.find(p => p.id === keep);
              if (kept) openPlace(kept);
            } else if (kind === 'area' && panel?.kind === 'area') {
              openArea(keep);
            }
            reload();
            setNotice(t.spot.merge.merged);
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
