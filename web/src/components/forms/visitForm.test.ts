import { describe, expect, it } from 'vitest';
import type { InvitePrefill } from '../../lib/types';
import { visitPrefillFromInvite } from './visitForm';

describe('visitPrefillFromInvite', () => {
  const prefill = (p: Partial<InvitePrefill>): InvitePrefill => ({
    place_id: 1, date: '2026-10-12', people: [], ascents: [], ...p,
  });
  const nameOf = (id: string) => ({ anna: 'Anna', luca: 'Luca B.' }[id] ?? id);

  it('puts people in your rope or in other ropes, by the names you know them by', () => {
    const v = visitPrefillFromInvite(prefill({
      people: [
        { user_id: 'anna', username: 'anna', name: null, same_rope: true },
        { user_id: null, username: null, name: 'Marco', same_rope: false },
        { user_id: 'luca', username: 'luca', name: null, same_rope: false },
        { user_id: 'anna', username: 'anna', name: null, same_rope: true },
      ],
    }), nameOf);
    expect(v.date).toBe('2026-10-12');
    expect(v.withPeople).toEqual(['Anna']);
    expect(v.otherPeople).toEqual(['Marco', 'Luca B.']);
  });

  it('copies the rope\'s routes without their style', () => {
    const v = visitPrefillFromInvite(prefill({
      ascents: [{ sector: 'Placche', route_id: 3, name: 'Spigolo', grade: '6a', pitches: 4, aid: null }],
    }), nameOf);
    expect(v.ascents).toHaveLength(1);
    expect(v.ascents![0]).toMatchObject({ name: 'Spigolo', grade: '6a', sector: 'Placche', pitches: '4', aid: '', style: null });
  });

  it('leaves the route rows alone when there are none to copy', () => {
    expect(visitPrefillFromInvite(prefill({}), nameOf).ascents).toBeUndefined();
  });
});
