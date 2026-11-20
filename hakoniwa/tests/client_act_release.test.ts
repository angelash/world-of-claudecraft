// The interface layers an act has opened (ux_and_onboarding.md 1.5, src/client/hud/act_release.ts):
// the prologue puts its class on the HUD root so only the prompt and the hint bar show while
// its roam nodes let the player walk; act 1 takes it off; the painter writes only on change.

import { describe, expect, it } from 'vitest';
import { ActRelease, actReleaseClass } from '../src/client/hud/act_release';

function fakeRoot() {
  const classes = new Set<string>();
  let writes = 0;
  return {
    classes,
    writes: () => writes,
    classList: {
      add: (c: string) => {
        writes++;
        classes.add(c);
      },
      remove: (c: string) => {
        writes++;
        classes.delete(c);
      },
    } as unknown as DOMTokenList,
  };
}

describe('act release on the HUD root', () => {
  it('marks the prologue only', () => {
    expect(actReleaseClass('prologue')).toBe('hk-act-prologue');
    expect(actReleaseClass('act1')).toBeNull();
    expect(actReleaseClass(undefined)).toBeNull();
  });

  it('adds the class in the prologue, keeps still frames free, and removes it in act 1', () => {
    const root = fakeRoot();
    const painter = new ActRelease();
    painter.paint(root, 'prologue');
    expect(root.classes.has('hk-act-prologue')).toBe(true);
    const after = root.writes();
    for (let i = 0; i < 5; i++) painter.paint(root, 'prologue');
    expect(root.writes()).toBe(after);
    painter.paint(root, 'act1');
    expect(root.classes.has('hk-act-prologue')).toBe(false);
  });
});
