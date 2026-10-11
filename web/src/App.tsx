import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth/useAuth';
import { AreaView } from './components/AreaView';
import { AuthModal, NewPasswordModal } from './components/AuthModal';
import { CoordPicker } from './components/CoordPicker';
import { Header } from './components/Header';
import { MapView, type MapCommand } from './components/MapView';
import { MobileNav, type MobileTab } from './components/MobileNav';
import { PlaceModal } from './components/PlaceModal';
import { PlaceView, type PlaceTab } from './components/PlaceView';
import { Sidebar, type ListMode } from './components/Sidebar';
import { VisitModal } from './components/VisitModal';
import { useDebounced } from './hooks/useDebounced';
import { MOBILE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import {
  attachmentUrl, fetchAreas, fetchAttachments, fetchMyPartners, fetchPlaces, fetchRocks, fetchVisits,
} from './lib/api';
import { currentPosition, type LatLng } from './lib/coords';
import { parseGpx, type Track } from './lib/gpx';
import { errorMessage } from './lib/labels';
import {
  EMPTY_PLACE_FILTERS, EMPTY_VISIT_FILTERS,
  type Area, type Partner, type Place, type PlaceFilters, type VisitDetail, type VisitSummary,
} from './lib/types';

const hasPlaceFilters = (f: PlaceFilters) =>
  !!(f.search.trim() || f.types.length || f.areaId || f.rock || f.exposition.length || f.near);

const NO_TRACKS = new Map<number, Track>();

type Panel =
  | { kind: 'place'; placeId: number; tab: PlaceTab; visitId?: number }
  | { kind: 'area'; areaId: number };

/** The open panel lives in the URL hash (#place-12, #area-3): shareable, and Back closes it. */
const panelHash = (p: Panel | null) => (!p ? '' : p.kind === 'place' ? `#place-${p.placeId}` : `#area-${p.areaId}`);
function panelFromHash(hash: string): Panel | null {
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
  const { session, isAdmin, recovering } = useAuth();
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
  const [armedState, setArmed] = useState(false);
  const armed = armedState && !!userId;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempPin, setTempPin] = useState<LatLng | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(() => {
    const p = panelFromHash(window.location.hash);
    return p?.kind === 'place' ? p.placeId : null;
  });
  const [command, setCommand] = useState<MapCommand | null>(null);
  // A ref, not state: the map moves constantly and only the "near" filter reads this.
  const mapCenter = useRef<LatLng>({ lat: 42.5, lng: 12.5 });

  const [authOpen, setAuthOpen] = useState(false);
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
  const [placeModal, setPlaceModal] = useState<{ place: Place } | { at: LatLng } | null>(null);
  const [visitModal, setVisitModal] = useState<{ placeId: number; visit?: VisitDetail } | null>(null);

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

  const closePlaceModal = () => {
    setPlaceModal(null);
    setTempPin(null);
  };
  const closePicker = () => {
    setPickerOpen(false);
    setTempPin(null);
  };
  const openAddVisit = (place: Place) => {
    if (!userId) return setAuthOpen(true);
    setVisitModal({ placeId: place.id });
  };
  const addAtMyLocation = async () => {
    try {
      setPlaceModal({ at: await currentPosition() });
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setArmed(false);
      setPickerOpen(false);
      if (!placeModal && !visitModal) setPanel(null);
      if (!placeModal) setTempPin(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [placeModal, visitModal]);

  const visitModalPlace = visitModal && placeById.get(visitModal.placeId);
  const panelPlace = panel?.kind === 'place' ? placeById.get(panel.placeId) : undefined;
  const panelArea = panel?.kind === 'area' ? areas.find(a => a.id === panel.areaId) : undefined;
  const focusedPlace = focusedId != null ? placeById.get(focusedId) ?? null : null;

  return (
    <>
      <Header
        isMobile={isMobile}
        armed={armed}
        onToggleArmed={() => { closePicker(); setArmed(a => !a); }}
        onAddByCoords={() => { setArmed(false); closePlaceModal(); setPickerOpen(true); }}
        onSignIn={() => setAuthOpen(true)}
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
          armed={armed}
          command={command}
          visibleKey={`${isMobile}-${mobileTab}-${!!panel}`}
          insetRight={panel && !isMobile ? 460 : 0}
          signedIn={!!userId}
          onMapClick={at => {
            if (armed) {
              setArmed(false);
              setPlaceModal({ at });
            } else if (panel?.kind !== 'place') {
              setFocusedId(null);
            }
          }}
          onPinClick={p => setFocusedId(p.id)}
          onDetails={p => openPlace(p)}
          onViewVisits={p => openPlace(p, 'visits')}
          onAddVisit={openAddVisit}
          onCenterChange={c => { mapCenter.current = c; }}
        />

        {pickerOpen && userId && (
          <CoordPicker
            onPreview={at => {
              setTempPin(at);
              if (at) setCommand({ kind: 'fly', at, nonce: Date.now() });
            }}
            onNext={at => { setPickerOpen(false); setPlaceModal({ at }); }}
            onClose={closePicker}
          />
        )}

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

        {panel?.kind === 'area' && panelArea && (
          <AreaView
            key={`area-panel-${panelArea.id}`}
            area={panelArea}
            places={areaPlaces(panelArea.id)}
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
          armed={armed}
          onTapOnMap={() => { closePicker(); setPanel(null); setMobileTab('map'); setArmed(a => !a); }}
          onByCoords={() => { setArmed(false); setPanel(null); setMobileTab('map'); setPickerOpen(true); }}
          onAtMyLocation={addAtMyLocation}
          onSignIn={() => setAuthOpen(true)}
        />
      )}

      {armed && !isMobile && (
        <div className="toast show" role="status">Click the map where the place is. Press <kbd>Esc</kbd> to cancel.</div>
      )}
      {notice && <div className="toast show notice" role="status">{notice}</div>}

      {placeModal && userId && (
        <PlaceModal
          key={`place-${'place' in placeModal ? placeModal.place.id : 'new'}`}
          target={placeModal}
          rocks={rocks}
          areas={areas}
          canDelete={'place' in placeModal && canEdit(placeModal.place)}
          onCoordsChange={setTempPin}
          onClose={closePlaceModal}
          onSaved={(id, thenAddVisit) => {
            closePlaceModal();
            reload();
            if (thenAddVisit) setVisitModal({ placeId: id });
          }}
          onDeleted={() => { closePlaceModal(); setPanel(null); setFocusedId(null); reload(); }}
        />
      )}

      {visitModal && visitModalPlace && userId && (
        <VisitModal
          key={`visit-${visitModal.visit?.id ?? 'new'}`}
          place={visitModalPlace}
          visit={visitModal.visit}
          partners={partners}
          onClose={() => setVisitModal(null)}
          onSaved={() => { setVisitModal(null); reload(); }}
        />
      )}

      {authOpen && !session && <AuthModal onClose={() => setAuthOpen(false)} />}
      {recovering && session && <NewPasswordModal />}
    </>
  );
}
