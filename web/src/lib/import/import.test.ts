import { describe, expect, it } from 'vitest';
import { autoMap, repeatGroups } from './automap';
import type { RawTable } from './parse';
import { gridToTable, jsonToTable } from './parse';
import { applyMapping } from './rows';
import { buildPayload, geocodeQueries, type ResolvedSpot } from './resolve';
import { parseActivity, parseAscentList, parseDate, parseNumber, parsePartners } from './transforms';

const table = (name: string, headers: string[], rows: (string | number | null)[][]): RawTable =>
  ({ name, headers, rows: rows.map(r => r.map(v => ({ v }))) });

describe('transforms', () => {
  it('reads dates as people type them', () => {
    expect(parseDate('2026-05-16')).toBe('2026-05-16');
    expect(parseDate('06/06/02026')).toBe('2026-06-06');
    expect(parseDate('3.10.26')).toBe('2026-10-03');
    expect(parseDate('05/23/2026')).toBe('2026-05-23');      // can't be day-first
    expect(parseDate('05/04/2026', 'mdy')).toBe('2026-05-04');
    expect(parseDate(46165)).toBe('2026-05-23');               // Excel serial
    expect(parseDate('N/A')).toBeNull();
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('splits partner lists', () => {
    expect(parsePartners('Fra. Japo, Vale, Sara G.')).toEqual(['Fra', 'Japo', 'Vale', 'Sara G.']);
    expect(parsePartners('Sere (?)')).toEqual(['Sere']);
    expect(parsePartners('Ale Merlo (amica Andre)')).toEqual(['Ale Merlo']);
    expect(parsePartners('Paolo, Fede, Elena\nAndrea M., Fra A.')).toEqual(['Paolo', 'Fede', 'Elena', 'Andrea M.', 'Fra A.']);
    expect(parsePartners('Vale e Japo')).toEqual(['Vale', 'Japo']);
    expect(parsePartners('?')).toEqual([]);
  });

  it('reads route lists with a status carried back', () => {
    expect(parseAscentList('5c (ok), 6a, 6a, 6a+ (no)')).toEqual([
      { name: '', grade: '5c', comment: 'ok' },
      { name: '', grade: '6a', comment: 'no' },
      { name: '', grade: '6a', comment: 'no' },
      { name: '', grade: '6a+', comment: 'no' },
    ]);
    expect(parseAscentList('5c ok, 6a+ (no)').map(a => a.comment)).toEqual(['ok', 'no']);
    expect(parseAscentList('Via Bianca 6a; Spigolo 5c (top)')).toEqual([
      { name: 'Via Bianca', grade: '6a', comment: 'top' },
      { name: 'Spigolo', grade: '5c', comment: 'top' },
    ]);
  });

  it('reads numbers and activities', () => {
    expect(parseNumber('1.311')).toBe(1311);
    expect(parseNumber('4,5 km')).toBe(4.5);
    expect(parseNumber('750 m')).toBe(750);
    expect(parseActivity('Vie Lunghe')).toBe('multipitch');
    expect(parseActivity('Falesie')).toBe('crag');
    expect(parseActivity('Neve&Misto')).toBe('alpine');
    expect(parseActivity('Scialpinismo')).toBe('ski');
    expect(parseActivity('Sportiva')).toBeNull();
  });
});

describe('parse', () => {
  it('finds the header row below a title and drops empty columns', () => {
    const t = gridToTable('S', [
      [{ v: 'My log 2026' }],
      [],
      [{ v: 'Name' }, { v: 'Date' }, { v: null }],
      [{ v: 'Butch' }, { v: '2026-05-23' }, { v: null }],
    ].map(r => r.map(c => ({ v: c.v ?? null }))));
    expect(t?.headers).toEqual(['Name', 'Date']);
    expect(t?.rows).toHaveLength(1);
  });

  it('flattens JSON records', () => {
    const t = jsonToTable({ data: { items: [{ crag: 'A', pin: { lat: 1 }, with: ['x', 'y'] }] } }, 'j');
    expect(t.headers).toEqual(['crag', 'pin.lat', 'with']);
    expect(t.rows[0].map(c => c.v)).toEqual(['A', 1, 'x, y']);
  });
});

describe('automap', () => {
  const falesie = table('Falesie',
    ['#', 'Nome falesia', 'Settore', 'Località', 'Provincia', 'Tipo di Roccia', 'Data ripetizione', 'Colonna1', 'Tiri fatti',
      'Compagni', 'Data ripetizione (2)', 'Tiri fatti (2)', 'Compagni (2)', 'Link'],
    [
      ['F2', 'Predore', 'Spigolo del Vento', 'Predore', 'BG', 'Calcare', '2026-05-09', null, '5c, 6a (ok), 6a+ (no)', 'Nico',
        '2026-10-03', '6a, 6a+, 6a (ok), 6b, 6b (no)', 'Ale Marzollo, Sara G., Vale, Morgana', 'https://www.falesia.it/crag/99/predore.html'],
      ['F7', "Calusco d'Adda", 'Primo Settore', 'Bergamo', 'BG', 'Conglomerato', '06/06/02026', null, '5c ok, 6a+, 6a+, 6a+ (no)',
        'Fra. Japo, Vale, Sara G.', null, null, null, null],
    ]);

  it('maps the Falesie sheet', () => {
    const m = autoMap(falesie);
    expect(m.activity).toBe('crag');
    expect(m.columns.map(c => `${c.field}${c.group ? `#${c.group}` : ''}`)).toEqual([
      'ignore', 'spot.name', 'sector', 'place.locality', 'place.region', 'spot.rock', 'visit.date', 'ignore', 'visit.ascents',
      'visit.partners', 'visit.date#1', 'visit.ascents#1', 'visit.partners#1', 'link',
    ]);
  });

  it('turns repeat columns into extra visits', () => {
    const { spots } = applyMapping(falesie, autoMap(falesie));
    const predore = spots.find(s => s.name === 'Predore')!;
    expect(predore.visits.map(v => v.date)).toEqual(['2026-05-09', '2026-10-03']);
    expect(predore.visits[1].ascents).toHaveLength(5);
    expect(predore.visits[0].ascents[0]).toEqual({ name: '', grade: '5c', comment: 'ok', sector: 'Spigolo del Vento' });
    expect(predore.links[0].url).toContain('falesia.it');
    expect(spots.find(s => s.name === "Calusco d'Adda")!.visits).toHaveLength(1);
  });

  it('maps the Vie Lunghe sheet, keeping unmapped columns as notes', () => {
    const t = table('Vie Lunghe',
      ['#', 'Nome via', 'Settore', 'Zona', 'Zona montuosa', 'Località Partenza', 'Stato', 'Provincia', 'Tipo', 'Grado alpinistico',
        'Difficoltà', 'Sviluppo arrampicata (m)', 'Tiri', 'Roccia', 'Data ripetizione', 'Compagni', 'Altre Cordate', 'Giudizio', 'Link'],
      [['VL8', 'Caramba!', 'Engilberge', 'Valle di Ailefroide', 'Vallouise-Pelvoux', 'Ailefroide', 'FR', null, 'Sportiva', 'TD-',
        '6a+>5c', 150, 5, 'Granito', '2026-05-30', 'Bea Bassi', 'Paolo, Fede', 4, null],
       ['VL3 (A)', 'Cane Trippa', 'Placche Zebrate', 'Valle del Sarca', 'Prealpi Trentine', 'Dro', null, 'TN', 'Sportiva', null,
        '5c', 270, 7, 'Calcare ', 'N/A', '?', null, 'nd', null]]);
    const m = autoMap(t);
    expect(m.activity).toBe('multipitch');
    const field = (h: string) => m.columns[t.headers.indexOf(h)].field;
    expect(field('Nome via')).toBe('spot.name');
    expect(field('Zona')).toBe('area.name');
    expect(field('Difficoltà')).toBe('spot.grade');
    expect(field('Località Partenza')).toBe('place.locality');
    expect(field('Stato')).toBe('place.country');
    expect(field('Tiri')).toBe('note');
    expect(field('Tipo')).toBe('note');

    const { spots } = applyMapping(t, m);
    const v = spots[0].visits[0];
    expect(v.summary).toContain('Settore: Engilberge');   // multipitch spots have no sectors
    expect(v.summary).toContain('Giudizio: 4');
    expect(spots[1].visits[0].date).toBeNull();

    const payload = buildPayload('x.xlsx', spots.map(s => ({ ...s, lat: 45, lng: 7, matches: [], choice: 'new', pinSource: 'geocoded', pinLabel: '' }) as ResolvedSpot), 'private');
    expect(payload.visits[0].ascents).toEqual([
      { name: 'Caramba!', grade: '6a+>5c', comment: '', route_id: null, place_id: null, sector: '', style: null, pitches: null, aid: '' },
    ]);
    expect(geocodeQueries(spots[1], 'Italia')).toEqual(['Dro, TN, Italia', 'Dro, Italia', 'Valle del Sarca, Italia', 'Cane Trippa, Italia']);
  });

  it('maps a one-route-per-row CSV (our own export)', () => {
    const t = table('log', ['date', 'spot', 'area', 'activity', 'latitude', 'longitude', 'with', 'route', 'grade', 'sector', 'route_comment'], [
      ['2026-05-23', 'Muro del Butch', 'Lecco', 'Crag', 45.85, 9.39, 'Fra; Vale', 'Su alto', '6c', 'Scala', 'ok'],
      ['2026-05-23', 'Muro del Butch', 'Lecco', 'Crag', 45.85, 9.39, 'Fra; Vale', 'Giù basso', '6a', 'Scala', ''],
    ]);
    expect(repeatGroups(t.headers).every(g => g.group === 0)).toBe(true);
    const m = autoMap(t);
    const { spots } = applyMapping(t, m);
    expect(spots).toHaveLength(1);
    expect(spots[0].lat).toBe(45.85);
    expect(spots[0].visits).toHaveLength(1);
    expect(spots[0].visits[0].ascents.map(a => a.name)).toEqual(['Su alto', 'Giù basso']);
    expect(spots[0].visits[0].partners).toEqual(['Fra', 'Vale']);
  });
});
