import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth/useAuth';
import { AreaView } from './components/AreaView';
import { AuthModal, NewPasswordModal } from './components/AuthModal';
import { Header } from './components/Header';
import { MapView, type MapCommand } from './components/MapView';
import { MobileNav, type MobileTab } from './components/MobileNav';
import { MyLog } from './components/MyLog';
import { NewAreaModal } from './components/NewAreaModal';
import { PlaceModal } from './components/PlaceModal';
import { PlaceView, type PlaceTab } from './components/PlaceView';
import { Sidebar, type ListMode } from './components/Sidebar';
import { UsersModal } from './components/UsersModal';
import { VisitModal } from './components/VisitModal';
import { useDebounced } from './hooks/useDebounced';
import { MOBILE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import {
  attachmentUrl, fetchAreas, fetchAttachments, fetchMyPartners, fetchPlaces, fetchRocks, fetchVisits,
} from './lib/api';
import type { LatLng } from './lib/coords';
import { parseGpx, type Track } from './lib/gpx';
import { errorMessage } from './lib/labels';
import {
  EMPTY_PLACE_FILTERS, EMPTY_VISIT_FILTERS,
  type Area, type Partner, type Place, type PlaceFilters, type VisitDetail, type VisitSummary,
} from './lib/types';

const hasPlaceFilters = (f: PlaceFilters) =>
  !!(f.search.trim() || f.activities.length || f.areaId || f.rock || f.exposition.length || f.near);

const NO_TRACKS = new Map<number, Track>();

type Panel =
  | { kind: 'place'; placeId: number; tab: PlaceTab; visitId?: number }
  | { kind: 'area'; areaId: number }
  | { kind: 'log' };

/** The open panel lives in the URL hash (#place-12, #area-3, #log): shareable, and Back closes it. */
const panelHash = (p: Panel | null) =>
  !p ? '' : p.kind === 'place' ? `#place-${p.placeId}` : p.kind === 'area' ? `#area-${p.areaId}` : '#log';
function panelFromHash(hash: string): Panel | null {
  if (hash === '#log') return { kind: 'log' };
  const m = hash.match(/^#(place|area)-(\d+)$/);
  if (!m) return null;
  return m[1] === 'place' ? { kind: 'place', placeId: +m[2], tab: 'info' } : { kind: 'area', areaId: +m[2] };
}

/** Loads and parses every GPX attachment of a place. */
async function loadTracks(placeId: number): Promise<Map<number, Track>> {
  const gpx = (await fetchAttachments({ placeId })).filter(a => a.kind === 'gpx');
  const parsed = await Promise.all(gpx.map(async a => {
    try {
      const track = parseGpx(await (await fetch(attachmentUrl(a))).text());
      return track ? [a.id, track] as const : null;
    } catch {
      return null;
    }
  }));
  return new Map(parsed.filter(x => x !== null));
}

export default function App() {
  const { session, profile, isAdmin, recovering } = useAuth();
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
  const [filteredPlaces, setFilteredPlaces] = useState<Place[] | null>(null);
  const [visits, setVisits] = useState<{ key: string; rows: VisitSummary[] } | null>(null);
  const [rocks, setRocks] = useState<string[]>([]);
  const [myPartners, setMyPartners] = useState<Partner[]>([]);
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
    Promise.all([fetchPlaces(EMPTY_PLACE_FILTERS), fetchAreas(), fetchRocks()])
      .then(([places, areaList, rockList]) => {
        if (cancelled) return;
        setCatalog(places);
        setAreas(areaList);
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

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const places = (hasPlaceFilters(debouncedPlaceFilters) && filteredPlaces) || catalog;
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
  const [usersOpen, setUsersOpen] = useState(false);
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
  const [visitModal, setVisitModal] = useState<{ placeId?: number; visit?: VisitDetail } | null>(null);

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
    setNotice(visitLogged ? 'Visit saved' : 'Spot saved');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (picking) return setPicking(null);
      if (!placeModal && !visitModal) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [placeModal, visitModal, picking]);
  const panelPlace = panel?.kind === 'place' ? placeById.get(panel.placeId) : undefined;
  const panelArea = panel?.kind === 'area' ? areas.find(a => a.id === panel.areaId) : undefined;
  const focusedPlace = focusedId != null ? placeById.get(focusedId) ?? null : null;

  return (
    <>
      <Header
        isMobile={isMobile}
        onAddPlace={openAddPlace}
        onLogVisit={openLogVisit}
        onSignIn={() => setAuthOpen(true)}
        onOpenLog={() => setPanel({ kind: 'log' })}
        onOpenUsers={() => setUsersOpen(true)}
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
            tracks={trackMap}
            isMobile={isMobile}
            onTab={tab => setPanel({ ...panel, tab })}
            onClose={() => setPanel(null)}
            onShowOnMap={() => { setPanel(null); focusOnMap(panelPlace); }}
            onOpenArea={openArea}
            onEdit={() => setPlaceModal({ place: panelPlace })}
            onAddVisit={() => openAddVisit(panelPlace)}
            onEditVisit={visit => setVisitModal({ placeId: panelPlace.id, visit })}
            onChanged={reload}
          />
        )}

        {panel?.kind === 'log' && userId && (
          <MyLog
            userId={userId}
            username={profile?.username ?? 'Your'}
            reloadKey={reloadKey}
            onClose={() => setPanel(null)}
            onChanged={reload}
            onOpenVisit={v => {
              const place = placeById.get(v.place_id);
              if (place) openPlace(place, 'visits', v.id);
            }}
          />
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
            onChanged={reload}
            onDeleted={() => { setPanel(null); reload(); }}
          />
        )}
      </div>

      {isMobile && (
        <MobileNav
          tab={mobileTab}
          onTab={t => { setMobileTab(t); setPanel(null); }}
          stats={stats}
          onAddPlace={openAddPlace}
          onLogVisit={openLogVisit}
          onSignIn={() => setAuthOpen(true)}
          onOpenLog={() => setPanel({ kind: 'log' })}
          onOpenUsers={() => setUsersOpen(true)}
        />
      )}

      {picking && (
        <div className="toast show picking" role="status">
          <span>{isMobile ? 'Tap' : 'Click'} the map to set {picking.label}.</span>
          <button type="button" className="link-btn invert" onClick={() => setPicking(null)}>Cancel</button>
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
          partners={partners}
          canDelete={!!placeModal.place && canEdit(placeModal.place)}
          hidden={!!picking}
          onPickOnMap={pickOnMap}
          onCoordsChange={setTempPin}
          onClose={closeForms}
          onSaved={showSaved}
          onDeleted={() => { closeForms(); setPanel(null); setFocusedId(null); reload(); }}
        />
      )}

      {visitModal && userId && (
        <VisitModal
          key={`visit-${visitModal.visit?.id ?? 'new'}-${visitModal.placeId ?? ''}`}
          placeId={visitModal.placeId}
          visit={visitModal.visit}
          places={catalog}
          areas={areas}
          userId={userId}
          rocks={rocks}
          partners={partners}
          hidden={!!picking}
          onPickOnMap={pickOnMap}
          onCoordsChange={setTempPin}
          onClose={closeForms}
          onSaved={placeId => showSaved(placeId, true)}
        />
      )}

      {newAreaOpen && userId && (
        <NewAreaModal
          onClose={() => setNewAreaOpen(false)}
          onCreated={areaId => {
            setNewAreaOpen(false);
            reload();
            setPanel({ kind: 'area', areaId });
            setNotice('Area created. Add spots to it below.');
          }}
        />
      )}

      {usersOpen && isAdmin && <UsersModal onClose={() => setUsersOpen(false)} />}

      {authOpen && !session && <AuthModal onClose={() => setAuthOpen(false)} />}
      {recovering && session && <NewPasswordModal />}
    </>
  );
}
