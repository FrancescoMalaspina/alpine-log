import { describe, expect, it } from 'vitest';
import { isLikelySame, type SimilarSpot } from './duplicates';
import { foldName, sameName } from './names';

// The same examples are checked against public.fold_name in supabase/tests/similar_names.test.sql.
describe('foldName', () => {
  it.each([
    ['Valsàssina', 'valsassina'],
    ['  Val  Sassina!', 'val sassina'],
    ['Straße Øresund', 'strasse oresund'],
    ['Corna Rossa - Parete N°1', 'corna rossa parete n 1'],
    ["ÉCRINS l'Ailefroide", 'ecrins l ailefroide'],
  ])('%s → %s', (name, folded) => expect(foldName(name)).toBe(folded));

  it('compares names once folded', () => {
    expect(sameName('Rocca di Baiedo', 'ROCCA DI  BAIEDO ')).toBe(true);
    expect(sameName('Rocca di Baiedo', 'Rocca Baiedo')).toBe(false);
  });
});

describe('isLikelySame', () => {
  const match = (m: Partial<SimilarSpot>): SimilarSpot => ({
    place_id: 1, name: 'Muro del Butch', activity: 'crag', area_name: 'Lecco', sector_name: null,
    lat: 45.85, lng: 9.39, similarity: 0.9, distance_km: 0.2, ...m,
  });

  it('takes a close, very similar spot of the same activity for the same', () => {
    expect(isLikelySame({ activity: 'crag' }, match({}))).toBe(true);
    expect(isLikelySame({ activity: 'crag' }, match({ distance_km: null }))).toBe(true);
  });

  it('only suggests a spot of another activity, sector, or far away', () => {
    expect(isLikelySame({ activity: 'multipitch' }, match({}))).toBe(false);
    expect(isLikelySame({ activity: 'crag', sector: 'Breithorn' }, match({ sector_name: 'Monte Rosa' }))).toBe(false);
    expect(isLikelySame({ activity: 'crag', sector: 'breithorn' }, match({ sector_name: 'Breithorn' }))).toBe(true);
    expect(isLikelySame({ activity: 'crag' }, match({ distance_km: 40 }))).toBe(false);
    expect(isLikelySame({ activity: 'crag' }, match({ similarity: 0.5 }))).toBe(false);
  });
});
