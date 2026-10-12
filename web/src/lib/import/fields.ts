/*
 * What an imported column can become. Every file format and every layout is
 * mapped onto these fields; nothing downstream knows about source headers.
 */

export type FieldId =
  | 'ignore' | 'note'
  | 'spot.name' | 'area.name' | 'spot.activity' | 'sector'
  | 'place.locality' | 'place.region' | 'place.country' | 'lat' | 'lng' | 'coords'
  | 'spot.grade' | 'spot.rock' | 'spot.elevation_gain' | 'spot.max_altitude' | 'spot.distance_km' | 'spot.description'
  | 'link'
  | 'visit.date' | 'visit.partners' | 'visit.ascents' | 'visit.summary' | 'visit.conditions'
  | 'visit.approach' | 'visit.descent' | 'visit.duration_hours'
  | 'ascent.name' | 'ascent.grade' | 'ascent.comment';

export type FieldDef = {
  id: FieldId;
  label: string;
  /** Belongs to the visit (may repeat as "Date (2)"), or to the spot. */
  level: 'spot' | 'visit' | 'none';
  /** Header phrases (normalized: lowercase, no accents) with how sure they make us. */
  synonyms: [string, number][];
};

const s = (weight: number, ...phrases: string[]): [string, number][] => phrases.map(p => [p, weight]);

export const FIELDS: FieldDef[] = [
  { id: 'spot.name', label: 'Spot name', level: 'spot', synonyms: [
    ...s(1, 'spot', 'crag', 'falesia', 'nome falesia', 'nome via', 'nome salita', 'nome spot', 'nome', 'name', 'climb',
      'itinerario', 'salita', 'voie', 'nom', 'site', 'spot name', 'crag name', 'place', 'luogo', 'cascata', 'icefall', 'gipfel', 'peak', 'cima'),
    ...s(0.6, 'route', 'via', 'tour', 'meta'),
  ] },
  { id: 'area.name', label: 'Area', level: 'spot', synonyms: [
    ...s(1, 'area', 'zona', 'zone', 'gebiet', 'secteur geographique', 'massiccio', 'gruppo', 'valle', 'massif', 'region climbing area'),
    ...s(0.5, 'zona montuosa', 'catena'),
  ] },
  { id: 'spot.activity', label: 'Activity', level: 'spot', synonyms: s(1, 'activity', 'attivita', 'tipo attivita', 'disciplina', 'discipline', 'sport', 'type', 'tipo') },
  { id: 'sector', label: 'Sector', level: 'visit', synonyms: s(1, 'settore', 'sector', 'secteur', 'sektor', 'parete', 'wall') },
  { id: 'place.locality', label: 'Town / start point (for the map pin)', level: 'spot', synonyms: [
    ...s(1, 'localita', 'localita partenza', 'partenza', 'location', 'town', 'village', 'paese', 'comune', 'city', 'ort', 'lieu', 'start', 'trailhead', 'parcheggio'),
  ] },
  { id: 'place.region', label: 'Province / region (for the map pin)', level: 'spot', synonyms: s(1, 'provincia', 'prov', 'province', 'regione', 'region', 'state', 'kanton', 'canton', 'departement', 'county') },
  { id: 'place.country', label: 'Country (for the map pin)', level: 'spot', synonyms: s(1, 'stato', 'nazione', 'country', 'pays', 'land', 'nation') },
  { id: 'lat', label: 'Latitude', level: 'spot', synonyms: s(1, 'lat', 'latitude', 'latitudine', 'breite', 'y') },
  { id: 'lng', label: 'Longitude', level: 'spot', synonyms: s(1, 'lng', 'lon', 'long', 'longitude', 'longitudine', 'lange', 'x') },
  { id: 'coords', label: 'Coordinates (lat, lng)', level: 'spot', synonyms: s(1, 'coordinate', 'coordinates', 'coords', 'gps', 'posizione', 'position', 'pin') },
  { id: 'spot.grade', label: 'Spot grade', level: 'spot', synonyms: [
    ...s(1, 'difficolta', 'grado', 'grade', 'difficulty', 'cotation', 'schwierigkeit', 'diff'),
    ...s(0.7, 'grado alpinistico', 'grado complessivo', 'overall grade'),
  ] },
  { id: 'spot.rock', label: 'Rock', level: 'spot', synonyms: s(1, 'roccia', 'tipo di roccia', 'rock', 'rock type', 'roche', 'fels', 'gestein', 'litologia') },
  { id: 'spot.elevation_gain', label: 'Elevation gain (m)', level: 'spot', synonyms: s(1, 'dislivello', 'dislivello positivo', 'elevation gain', 'gain', 'd', 'denivele', 'hohenmeter', 'ascent m', 'vertical') },
  { id: 'spot.max_altitude', label: 'Max altitude (m)', level: 'spot', synonyms: s(1, 'quota', 'quota max', 'quota max vetta', 'quota vetta', 'altitude', 'max altitude', 'altitudine', 'altezza', 'elevation', 'hohe', 'summit') },
  { id: 'spot.distance_km', label: 'Distance (km)', level: 'spot', synonyms: s(1, 'distanza', 'distance', 'km', 'distance km', 'distanza km') },
  { id: 'spot.description', label: 'Spot description', level: 'spot', synonyms: s(1, 'descrizione', 'description', 'beschreibung') },
  { id: 'link', label: 'Link (guide, topo)', level: 'spot', synonyms: s(1, 'link', 'url', 'relazione', 'topo', 'fonte', 'source', 'sito', 'website', 'web', 'guida') },
  { id: 'visit.date', label: 'Date', level: 'visit', synonyms: [
    ...s(1, 'data', 'date', 'data ripetizione', 'data salita', 'giorno', 'day', 'datum', 'when', 'quando'),
  ] },
  { id: 'visit.partners', label: 'With (partners)', level: 'visit', synonyms: s(1, 'compagni', 'compagno', 'compagni di cordata', 'partner', 'partners', 'with', 'con', 'cordata', 'avec', 'seilpartner', 'mit', 'climbing partners') },
  { id: 'visit.ascents', label: 'Routes climbed (list: "6a (ok), 6b (no)")', level: 'visit', synonyms: [
    ...s(1, 'tiri fatti', 'vie fatte', 'routes climbed', 'ascents', 'voies', 'routes', 'tiri saliti'),
    ...s(0.5, 'tiri'),
  ] },
  { id: 'visit.summary', label: 'Visit notes', level: 'visit', synonyms: s(1, 'note', 'notes', 'commento', 'commenti', 'comment', 'comments', 'summary', 'remarks', 'osservazioni', 'diario', 'report') },
  { id: 'visit.conditions', label: 'Conditions', level: 'visit', synonyms: s(1, 'condizioni', 'conditions', 'meteo', 'weather', 'bedingungen') },
  { id: 'visit.approach', label: 'Approach notes', level: 'visit', synonyms: s(1, 'avvicinamento', 'approach', 'accesso', 'zustieg') },
  { id: 'visit.descent', label: 'Descent notes', level: 'visit', synonyms: s(1, 'discesa', 'descent', 'rientro', 'abstieg') },
  { id: 'visit.duration_hours', label: 'Duration (hours)', level: 'visit', synonyms: s(1, 'durata', 'duration', 'duration hours', 'ore', 'hours', 'tempo', 'time') },
  { id: 'ascent.name', label: 'Route name (one route per row)', level: 'visit', synonyms: [
    ...s(0.9, 'route', 'route name', 'nome tiro', 'tiro', 'via', 'climb name', 'problem'),
  ] },
  { id: 'ascent.grade', label: 'Route grade (one route per row)', level: 'visit', synonyms: s(0.8, 'route grade', 'grado tiro', 'grade') },
  { id: 'ascent.comment', label: 'Route comment / style', level: 'visit', synonyms: s(1, 'route comment', 'style', 'stile', 'ascent type', 'tick type', 'esito') },
  { id: 'note', label: 'Keep as a note on the visit', level: 'none', synonyms: [] },
  { id: 'ignore', label: 'Skip this column', level: 'none', synonyms: s(1, '#', 'id', 'n', 'nr', 'no', 'num') },
];

export const FIELD_BY_ID = Object.fromEntries(FIELDS.map(f => [f.id, f])) as Record<FieldId, FieldDef>;

/** Fields a sheet can map at most one column to (per repeat group). */
export const isSingle = (f: FieldId) => f !== 'note' && f !== 'ignore' && f !== 'link';

/** "Località Partenza " → "localita partenza". */
export const normalizeHeader = (h: string) =>
  h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
