import { describe, expect, it } from 'vitest';
import { autoMap, repeatGroups } from './automap';
import type { RawTable } from './parse';
import { gridToTable, jsonToTable, parseFile } from './parse';
import { applyMapping, splitRouteName } from './rows';
import { buildPayload, geocodeQueries, type ResolvedSpot } from './resolve';
import {
  parseActivity, parseAscentList, parseCountry, parseDate, parseDifficulty, parseNumber, parsePartners, parseProtection,
  parseRating, parseStyle,
} from './transforms';

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

  it('reads route lists with a status carried back, known statuses as the style', () => {
    expect(parseAscentList('5c (ok), 6a, 6a, 6a+ (no)')).toEqual([
      { name: '', grade: '5c', comment: '', style: 'redpoint' },
      { name: '', grade: '6a', comment: '', style: 'attempt' },
      { name: '', grade: '6a', comment: '', style: 'attempt' },
      { name: '', grade: '6a+', comment: '', style: 'attempt' },
    ]);
    expect(parseAscentList('5c ok, 6a+ (no)').map(a => a.style)).toEqual(['redpoint', 'attempt']);
    expect(parseAscentList('Via Bianca 6a; Spigolo 5c (os)')).toEqual([
      { name: 'Via Bianca', grade: '6a', comment: '', style: 'onsight' },
      { name: 'Spigolo', grade: '5c', comment: '', style: 'onsight' },
    ]);
    expect(parseAscentList('Spigolo 5c (bagnata)')).toEqual([{ name: 'Spigolo', grade: '5c', comment: 'bagnata', style: null }]);
    expect(parseStyle('flash')).toBe('flash');
    expect(parseStyle('tr')).toBe('toprope');
  });

  it('splits a difficulty into hardest grade, mandatory grade and aid', () => {
    expect(parseDifficulty('6a+>5c')).toEqual({ grade: '6a+', obligatory: '5c', aid: '' });
    expect(parseDifficulty('6c>6a')).toEqual({ grade: '6c', obligatory: '6a', aid: '' });
    expect(parseDifficulty('VI/V, A0')).toEqual({ grade: 'VI', obligatory: 'V', aid: 'A0' });
    expect(parseDifficulty('6a un passo/5b, A0')).toEqual({ grade: '6a', obligatory: '5b', aid: 'A0' });
    expect(parseDifficulty(' V+ (5b)')).toEqual({ grade: 'V+ (5b)', obligatory: '', aid: '' });
    expect(parseDifficulty('5c')).toEqual({ grade: '5c', obligatory: '', aid: '' });
    expect(parseDifficulty('6a/b')).toEqual({ grade: '6a/b', obligatory: '', aid: '' });
  });

  it('reads protection, ratings and countries', () => {
    expect(parseProtection('Sportiva')).toBe('bolted');
    expect(parseProtection('Trad')).toBe('trad');
    expect(parseProtection('mista')).toBe('mixed');
    expect(parseRating(4)).toBe(4);
    expect(parseRating('nd')).toBeNull();
    expect(parseRating('★★★')).toBe(3);
    expect(parseCountry('FR')).toBe('FR');
    expect(parseCountry('Svizzera')).toBe('CH');
  });

  it('reads numbers and activities', () => {
    expect(parseNumber('1.311')).toBe(1311);
    expect(parseNumber('4,5 km')).toBe(4.5);
    expect(parseNumber('750 m')).toBe(750);
    expect(parseActivity('Vie Lunghe')).toBe('multipitch');
    expect(parseActivity('Falesie')).toBe('crag');
    expect(parseActivity('Blocchi')).toBe('boulder');
    expect(parseActivity('boulder')).toBe('boulder');
    expect(parseActivity('Palestra boulder')).toBe('indoor');
    expect(parseActivity('Neve&Misto')).toBe('alpine');
    expect(parseActivity('Scialpinismo')).toBe('ski');
    expect(parseActivity('MTB')).toBe('mtb');
    expect(parseActivity('Mountain bike')).toBe('mtb');
    expect(parseActivity('Trail running')).toBe('trail');
    expect(parseActivity('Sportiva')).toBeNull();
  });
});

describe('parse', () => {
  it('reads a UTF-8 CSV without a byte-order mark as UTF-8', async () => {
    const f = await parseFile(new File(['spot,area\nSpigolo Dòrn,Valsàssina\n'], 'log.csv', { type: 'text/csv' }));
    expect(f.kind === 'tables' && f.tables[0].rows[0].map(c => c.v)).toEqual(['Spigolo Dòrn', 'Valsàssina']);
  });

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
      'ignore', 'spot.name', 'sector.name', 'place.locality', 'place.region', 'spot.rock', 'visit.date', 'ignore', 'visit.ascents',
      'visit.partners', 'visit.date#1', 'visit.ascents#1', 'visit.partners#1', 'link',
    ]);
  });

  it('turns repeat columns into extra visits, the crag as the spot and its sector on each route', () => {
    const { spots } = applyMapping(falesie, autoMap(falesie));
    const predore = spots.find(s => s.name === 'Predore')!;
    expect(predore.sector).toBe('');
    expect(predore.country).toBe('IT');
    expect(predore.visits.map(v => v.date)).toEqual(['2026-05-09', '2026-10-03']);
    expect(predore.visits[1].ascents).toHaveLength(5);
    expect(predore.visits[0].ascents[0]).toEqual({ name: '', grade: '5c', comment: '', sector: 'Spigolo del Vento', style: 'redpoint' });
    expect(predore.links[0].url).toContain('falesia.it');
    expect(spots.find(s => s.name === "Calusco d'Adda")!.visits[0].ascents[0].sector).toBe('Primo Settore');
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
    expect(field('Settore')).toBe('sector.name');
    expect(field('Zona montuosa')).toBe('area.description');
    expect(field('Tiri')).toBe('spot.pitches');
    expect(field('Sviluppo arrampicata (m)')).toBe('spot.length_m');
    expect(field('Tipo')).toBe('spot.protection');
    expect(field('Grado alpinistico')).toBe('spot.alpine_grade');
    expect(field('Altre Cordate')).toBe('visit.other_partners');
    expect(field('Giudizio')).toBe('visit.rating');

    const { spots } = applyMapping(t, m);
    const caramba = spots[0];
    expect({
      sector: caramba.sector, areaDescription: caramba.areaDescription, country: caramba.country,
      pitches: caramba.pitches, length: caramba.length_m, protection: caramba.protection, alpine: caramba.alpine_grade,
      grade: caramba.grade, obligatory: caramba.grade_obligatory,
    }).toEqual({
      sector: 'Engilberge', areaDescription: 'Vallouise-Pelvoux', country: 'FR', pitches: 5, length: 150,
      protection: 'bolted', alpine: 'TD-', grade: '6a+', obligatory: '5c',
    });
    const v = caramba.visits[0];
    expect(v.rating).toBe(4);
    expect(v.otherPartners).toEqual(['Paolo', 'Fede']);
    expect(v.summary).not.toContain('Giudizio');
    expect(spots[1].country).toBe('IT');
    expect(spots[1].visits[0].date).toBeNull();
    expect(spots[1].visits[0].rating).toBeNull();

    const payload = buildPayload('x.xlsx', spots.map(s => ({ ...s, lat: 45, lng: 7, matches: [], choice: 'new', pinSource: 'geocoded', pinLabel: '' }) as ResolvedSpot), [], 'private');
    expect(payload.visits[0].ascents).toEqual([
      { name: 'Caramba!', grade: '6a+', comment: '', route_id: null, place_id: null, sector: '', style: null, pitches: null, aid: '' },
    ]);
    expect(payload.spots[0]).toMatchObject({ area_description: 'Vallouise-Pelvoux', place: { sector_name: 'Engilberge', pitches: 5 } });
    expect(geocodeQueries(spots[1], 'Italia')).toEqual(
      ['Dro, TN, Italia', 'Dro, Italia', 'Placche Zebrate, Italia', 'Valle del Sarca, Italia', 'Cane Trippa, Italia']);
  });

  it('splits "Mountain - route" alpine names into sector and spot', () => {
    const t = table('Neve&Misto', ['Nome salita', 'Zona', 'Difficoltà', 'Data ripetizione'],
      [['Breithorn - via normale', 'Massiccio Monte Rosa', 'PD+', '2026-06-14']]);
    const { spots } = applyMapping(t, autoMap(t));
    expect(spots[0]).toMatchObject({ sector: 'Breithorn', name: 'via normale', splitFrom: 'Breithorn - via normale', grade: 'PD+' });
  });

  it.each([
    ['Breithorn - via normale', 'Breithorn', 'via normale'],
    ['Castore: via normale', 'Castore', 'via normale'],
    ['Breithorn (via normale)', 'Breithorn', 'via normale'],
    ['Via normale al Weissmies', 'Weissmies', 'Via normale'],
    ["Cresta Nord all'Aiguille", 'Aiguille', 'Cresta Nord'],
    ['Pizzo Tambò - da Montespluga', 'Pizzo Tambò', 'da Montespluga'],
  ])('reads "%s" as %s › %s', (whole, sector, name) => {
    expect(splitRouteName(whole)).toEqual({ sector, name });
  });

  it.each(['Canale della Nona', 'Zucco di Pesciola (m.2092)', 'Via dei Bergamaschi', 'Spigolo Dorn'])(
    'keeps "%s" as one name', whole => expect(splitRouteName(whole)).toBeNull());

  it('splits names at every spot that is a route, not at crags', () => {
    const t = table('log', ['spot', 'activity', 'date'], [
      ['Campanile Basso - via normale', 'Multipitch', '2026-08-01'],
      ['Pizzo Tambò - da Montespluga', 'Ski touring', '2026-03-01'],
      ['Esigo - Ponte Romano', 'Crag', '2026-06-28'],
    ]);
    const { spots } = applyMapping(t, autoMap(t));
    expect(spots.map(s => [s.sector, s.name])).toEqual([
      ['Campanile Basso', 'via normale'], ['Pizzo Tambò', 'da Montespluga'], ['', 'Esigo - Ponte Romano'],
    ]);
  });

  it("drops the sector from a name that repeats it", () => {
    const t = table('log', ['spot', 'settore', 'activity'], [['Breithorn - via normale', 'Breithorn', 'Alpine']]);
    const { spots } = applyMapping(t, autoMap(t));
    expect(spots[0]).toMatchObject({ sector: 'Breithorn', name: 'via normale' });
  });

  it('reads a peak column and a route column as sector and spot', () => {
    const t = table('Alpinismo', ['Cima', 'Via', 'activity', 'date'], [['Weissmies', 'Via normale', 'Alpine', '2026-06-21']]);
    const m = autoMap(t);
    expect(m.columns.map(c => c.field).slice(0, 2)).toEqual(['spot.name', 'ascent.name']);
    const { spots } = applyMapping(t, m);
    expect(spots[0]).toMatchObject({ sector: 'Weissmies', name: 'Via normale', splitFrom: 'Weissmies - Via normale' });
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
    expect(spots[0].sector).toBe('');
    expect(spots[0].visits[0].ascents.map(a => a.sector)).toEqual(['Scala', 'Scala']);
  });

  it('keeps notes private and posts a "consigli" column as a tip', () => {
    const t = table('log', ['data', 'spot', 'area', 'attività', 'latitude', 'longitude', 'note', 'consigli'], [
      ['2026-05-23', 'Muro del Butch', 'Lecco', 'Crag', 45.85, 9.39, 'stanco morto', 'Parcheggio pieno dopo le 9'],
    ]);
    const m = autoMap(t);
    expect(m.columns.map(c => c.field).slice(-2)).toEqual(['visit.summary', 'visit.tip']);
    const { spots } = applyMapping(t, m);
    const resolved: ResolvedSpot[] = spots.map(s => ({ ...s, matches: [], choice: 'new', pinSource: 'file', pinLabel: '' }));
    const [visit] = buildPayload('log.csv', resolved, [], 'public').visits;
    expect(visit).toMatchObject({ summary: 'stanco morto', tip: { body: 'Parcheggio pieno dopo le 9', topic: null } });
  });

  it('takes rows whose spot differs only in accents, case or punctuation for the same spot', () => {
    const t = table('log', ['date', 'spot', 'area', 'activity'], [
      ['2026-05-23', 'Muro del Butch', 'Valsassina', 'Crag'],
      ['2026-06-01', 'muro del bùtch!', 'VALSÀSSINA', 'Crag'],
    ]);
    const { spots } = applyMapping(t, autoMap(t));
    expect(spots).toHaveLength(1);
    expect(spots[0].visits).toHaveLength(2);
  });
});
