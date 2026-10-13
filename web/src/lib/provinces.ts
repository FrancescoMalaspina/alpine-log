/**
 * Italian provinces (and metropolitan cities, free consortia, autonomous
 * provinces) by name, to their two-letter code: what Italian climbers write
 * ("TO", "LC"). Keys are lower-case; reverse geocoding returns these names.
 */
const IT: Record<string, string> = {
  agrigento: 'AG', alessandria: 'AL', ancona: 'AN', aosta: 'AO', "valle d'aosta": 'AO', 'aosta valley': 'AO', "vallée d'aoste": 'AO', arezzo: 'AR', 'ascoli piceno': 'AP',
  asti: 'AT', avellino: 'AV', bari: 'BA', 'barletta-andria-trani': 'BT', belluno: 'BL', benevento: 'BN', bergamo: 'BG',
  biella: 'BI', bologna: 'BO', bolzano: 'BZ', 'bozen': 'BZ', 'südtirol': 'BZ', 'alto adige': 'BZ', 'south tyrol': 'BZ', brescia: 'BS',
  brindisi: 'BR', cagliari: 'CA', caltanissetta: 'CL', campobasso: 'CB', caserta: 'CE', catania: 'CT', catanzaro: 'CZ',
  chieti: 'CH', como: 'CO', cosenza: 'CS', cremona: 'CR', crotone: 'KR', cuneo: 'CN', enna: 'EN', fermo: 'FM',
  ferrara: 'FE', firenze: 'FI', foggia: 'FG', 'forlì-cesena': 'FC', frosinone: 'FR', genova: 'GE', gorizia: 'GO',
  grosseto: 'GR', imperia: 'IM', isernia: 'IS', "l'aquila": 'AQ', 'la spezia': 'SP', latina: 'LT', lecce: 'LE',
  lecco: 'LC', livorno: 'LI', lodi: 'LO', lucca: 'LU', macerata: 'MC', mantova: 'MN', 'massa-carrara': 'MS',
  matera: 'MT', messina: 'ME', milano: 'MI', milan: 'MI', modena: 'MO', 'monza e brianza': 'MB', 'monza e della brianza': 'MB',
  napoli: 'NA', novara: 'NO', nuoro: 'NU', oristano: 'OR', padova: 'PD', palermo: 'PA', parma: 'PR', pavia: 'PV',
  perugia: 'PG', 'pesaro e urbino': 'PU', pescara: 'PE', piacenza: 'PC', pisa: 'PI', pistoia: 'PT', pordenone: 'PN',
  potenza: 'PZ', prato: 'PO', ragusa: 'RG', ravenna: 'RA', 'reggio calabria': 'RC', 'reggio emilia': 'RE',
  "reggio nell'emilia": 'RE', rieti: 'RI', rimini: 'RN', roma: 'RM', rovigo: 'RO', salerno: 'SA', sassari: 'SS',
  savona: 'SV', siena: 'SI', siracusa: 'SR', sondrio: 'SO', 'sud sardegna': 'SU', taranto: 'TA', teramo: 'TE',
  terni: 'TR', torino: 'TO', turin: 'TO', trapani: 'TP', trento: 'TN', trentino: 'TN', treviso: 'TV', trieste: 'TS', udine: 'UD',
  varese: 'VA', venezia: 'VE', 'verbano-cusio-ossola': 'VB', vercelli: 'VC', verona: 'VR', 'vibo valentia': 'VV',
  vicenza: 'VI', viterbo: 'VT',
};

const CODES = new Set(Object.values(IT));
/** "TN" is an Italian province code. */
export const isItalianProvinceCode = (v: string) => CODES.has(v.trim().toUpperCase());

const PREFIX = /^(provincia autonoma di|provincia di|città metropolitana di|libero consorzio comunale di|province of)\s+/i;

/** "Lecco" → "LC" in Italy; elsewhere (or unknown) the name as given. */
export function provinceCode(country: string | null, name: string | null): string | null {
  if (!name) return null;
  if (country !== 'IT') return name;
  const key = name.trim().replace(PREFIX, '').toLowerCase();
  return IT[key] ?? IT[key.split(/\s*[-/]\s*/)[0]] ?? name;
}
