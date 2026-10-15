import { describe, expect, it } from 'vitest';
import { isLikelySame, likelyMatch, type SimilarSpot } from './duplicates';
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
    lat: 45.85, lng: 9.39, similarity: 0.9, same_sector: null, distance_km: 0.2, ...m,
  });

  it('takes a close, very similar spot of the same activity for the same', () => {
    expect(isLikelySame({ activity: 'crag' }, match({}))).toBe(true);
    expect(isLikelySame({ activity: 'crag' }, match({ distance_km: null }))).toBe(true);
  });

  it('only suggests a spot of another activity, far away, or not alike', () => {
    expect(isLikelySame({ activity: 'multipitch' }, match({}))).toBe(false);
    expect(isLikelySame({ activity: 'crag' }, match({ distance_km: 40 }))).toBe(false);
    expect(isLikelySame({ activity: 'crag' }, match({ similarity: 0.5 }))).toBe(false);
  });

  // Similarities as public.similar_places gives them for these names.
  const normale = (m: Partial<SimilarSpot>) => match({ name: 'via normale', activity: 'alpine', distance_km: null, ...m });

  it('takes the same route of the same mountain for the same', () => {
    // Weissmies › via normale / Weissmies › Via Normale
    expect(isLikelySame({ activity: 'alpine' }, normale({ similarity: 1, same_sector: true }))).toBe(true);
    // Weissmies › via normale / "Weissmies - via normale" with no sector
    expect(isLikelySame({ activity: 'alpine' }, normale({ similarity: 1, same_sector: null }))).toBe(true);
  });

  it("doesn't take another mountain's route of the same name for the same", () => {
    // Weissmies › via normale / Gran Paradiso › via normale
    expect(isLikelySame({ activity: 'alpine' }, normale({ similarity: 0.33, same_sector: false }))).toBe(false);
    // Breithorn › via normale / Breithorn Occidentale › via normale
    expect(isLikelySame({ activity: 'alpine' }, normale({ similarity: 0.69, same_sector: false }))).toBe(false);
    // Weissmies › via normale / "Via Normale" with no sector
    expect(isLikelySame({ activity: 'alpine' }, normale({ similarity: 0.55, same_sector: null }))).toBe(false);
  });

  it('picks the first likely match, not only the first', () => {
    const matches = [normale({ place_id: 1, similarity: 0.55 }), normale({ place_id: 2, similarity: 1, same_sector: true })];
    expect(likelyMatch({ activity: 'alpine' }, matches)?.place_id).toBe(2);
  });
});
