import { describe, expect, it } from 'vitest';
import { auraRenderSignature, isDebuffAura, visiblePartyFrameAuras } from '../src/ui/aura_view';

describe('aura_view', () => {
  it('bakes the render mode into the aura signature', () => {
    const auras = [{ id: 'battle_shout', kind: 'buff_ap', remaining: 120 }];
    expect(auraRenderSignature(7, 'all', auras)).not.toBe(auraRenderSignature(7, 'debuffs', auras));
  });

  it('treats crowd control and negative stat drains as debuffs', () => {
    expect(isDebuffAura({ kind: 'stun', value: 1 })).toBe(true);
    expect(isDebuffAura({ kind: 'buff_sta', value: -12 })).toBe(true);
    expect(isDebuffAura({ kind: 'buff_sta', value: 12 })).toBe(false);
  });

  it('limits party-frame auras without reordering them', () => {
    const auras = [
      { id: 'a', name: 'A', kind: 'buff_ap' as const },
      { id: 'b', name: 'B', kind: 'buff_sta' as const },
      { id: 'c', name: 'C', kind: 'absorb' as const },
    ];
    expect(visiblePartyFrameAuras(auras, 2).map((a) => a.id)).toEqual(['a', 'b']);
  });
});
