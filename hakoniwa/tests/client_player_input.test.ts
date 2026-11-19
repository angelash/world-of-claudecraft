// The game side of the action layer (src/client/app/player_input.ts; PK-M1-07) on a real game
// in act 1, driven through the input hub: Esc, the pad's B and Start each close or open what
// ux_and_onboarding.md 1.3 and 16.3 say; R3 locks and lets go of the soft target; a hard target
// past 40 m is dropped (16.4); a loose line takes Space and the pad's A while A on the keyboard
// still walks; an open conversation keeps its number keys; the window, item and party rings
// list what is available, pick, and slow the world only in a fight (16.5).

import { beforeAll, describe, expect, it } from 'vitest';
import { RING_TIME_SCALE } from '../src/client/input/radial';
import { scenePolicy } from '../src/game/autoplay/scene_policy';
import { sceneView } from '../src/systems/scenes';
import { type InputHarness, inputHarness, nearestMonster } from './input_harness';

/** A harness already in act 1 (the prologue played with Space and number keys). */
function inAct1(): InputHarness {
  const h = inputHarness();
  const policy = scenePolicy('release', h.engine.world, h.engine.content);
  for (let guard = 0; guard < 4000; guard++) {
    const sv = sceneView(h.engine.world, h.engine.content);
    if (!sv) {
      if (h.engine.world.meta.flags.act === 'act1') break;
      h.keyFrame();
      continue;
    }
    const ids = sv.choices.map((c) => c.id);
    if (sv.waiting === 'advance') h.press({ code: 'Space' });
    else if (sv.waiting === 'ui' && sv.ui) {
      // the spirit mirror (P4) is not wired in this harness: it closes as it is
      h.host.queue([
        { kind: 'scenes.ui_done', data: { runId: sv.runId, revision: sv.revision, ui: sv.ui } },
      ]);
      h.keyFrame();
    } else if (ids.length)
      h.press({ code: `Digit${ids.indexOf(policy(sv.sceneId, sv.nodeId, ids)) + 1}` });
    else {
      if (sv.waiting === 'input') h.player.submitText('');
      h.keyFrame();
    }
  }
  if (h.engine.world.meta.flags.act !== 'act1') {
    const sv = sceneView(h.engine.world, h.engine.content);
    throw new Error(`prologue not finished: ${sv?.nodeId} ${sv?.waiting} tick ${h.engine.tick}`);
  }
  for (let i = 0; i < 4; i++) h.keyFrame();
  return h;
}

let base: InputHarness;
beforeAll(() => {
  base = inAct1();
});

describe('free text', () => {
  it("an empty answer (the floating keyboard's default key) takes the node's default name", () => {
    expect(base.engine.world.meta.flags['player.name']).toBe('无名氏');
    // the unsent reply of the first opening (P1), the name (P6), the name once more (the
    // nameless player's "其实，我有名字。" among the call's questions, left empty too), and three
    // free questions at the call, offered without a model once the written ones are asked
    // (PK-M1-19)
    expect(base.sent['scenes.input']).toBe(6);
    expect(base.engine.world.meta.flags.p_unsent_words).toBe('（没有回）');
  });
});

describe('back, menu and Start (1.3, 16.3)', () => {
  it('B closes the front window, then clears the target, then stops', () => {
    const h = base;
    h.host.windows.show('quests');
    h.host.select(h.view.playerId());
    h.tap('b');
    expect(h.open).toEqual([]);
    expect(h.host.selection).toBe(h.view.playerId());
    h.tap('b');
    expect(h.host.selection).toBeNull();
    h.tap('b');
    expect(h.open).toEqual([]);
  });

  it('Start closes every window, or opens the menu; Esc layers, then opens the menu', () => {
    const h = base;
    h.host.windows.show('quests');
    h.host.windows.show('map');
    h.tap('start');
    expect(h.open).toEqual([]);
    h.host.select(h.view.playerId());
    h.tap('start');
    expect(h.open).toEqual(['menu']);
    // Start did not clear the target the way Esc's layering does
    expect(h.host.selection).toBe(h.view.playerId());
    h.tap('start');
    expect(h.open).toEqual([]);
    h.press({ code: 'Escape' });
    expect(h.host.selection).toBeNull();
    h.press({ code: 'Escape' });
    expect(h.open).toEqual(['menu']);
    h.press({ code: 'Escape' });
    expect(h.open).toEqual([]);
  });
});

describe('soft targeting through the pad (16.4)', () => {
  it('R3 locks the soft target and lets go of it; the leash drops a far hard target', () => {
    const h = inAct1();
    // face the nearest monster: one push of the stick toward it
    for (let i = 0; i < 400 && !h.player.softTarget; i++) {
      const m = nearestMonster(h);
      if (!m) break;
      h.pad.axes[0] = m.dx;
      h.pad.axes[1] = m.dy;
      h.frame();
    }
    h.pad.axes[0] = 0;
    h.pad.axes[1] = 0;
    h.frame();
    const soft = h.player.softTarget;
    expect(soft).not.toBeNull();
    expect(h.host.selection).toBeNull();
    h.tap('r3');
    expect(h.host.selection).toBe(soft);
    expect(h.player.softTarget).toBeNull();
    h.tap('r3');
    expect(h.host.selection).toBeNull();
    // lock again, then move the target past the 40 m leash: the next tick drops it
    h.tap('r3');
    expect(h.host.selection).toBe(soft);
    const e = h.engine.world.slices.world.entities[soft ?? ''];
    const me = h.engine.world.slices.world.entities[h.engine.world.slices.world.playerId];
    if (!e || !me) throw new Error('no entities');
    e.x = me.x + 45;
    h.frame();
    expect(h.host.selection).toBeNull();
  });

  it('keeps soft targeting off for keyboard and mouse unless the setting turns it on', () => {
    const h = inAct1();
    expect(h.hub.device).toBe('kbm');
    // walk with WASD until a monster stands in front, close by
    let m = nearestMonster(h);
    const keys = () => {
      const out: string[] = [];
      if (!m) return out;
      if (m.dx > 0.38) out.push('KeyD');
      if (m.dx < -0.38) out.push('KeyA');
      if (m.dy > 0.38) out.push('KeyS');
      if (m.dy < -0.38) out.push('KeyW');
      return out;
    };
    for (let i = 0; i < 600 && m && m.d > 6; i++) {
      const k = keys();
      for (const c of k) h.hub.key({ code: c }, 'down');
      h.keyFrame();
      for (const c of k) h.hub.key({ code: c }, 'up');
      m = nearestMonster(h);
    }
    h.keyFrame();
    expect(h.player.softTarget).toBeNull();
    h.player.configure({ ...h.hub.settings, softLockKbm: true });
    h.keyFrame();
    expect(h.player.softTarget).toBe(nearestMonster(h)?.id);
  });
});

describe('talk over the field', () => {
  it('a loose line takes Space and the pad A; A on the keyboard still walks', () => {
    const h = base;
    const me = h.view.playerId();
    h.loose.push({ speakerId: me, speakerName: '', text: 'x', kind: 'narrate' } as never, me);
    h.loose.push({ speakerId: me, speakerName: '', text: 'y', kind: 'narrate' } as never, me);
    expect(h.loose.current).not.toBeNull();
    const before = h.sent['world.set_intent'] ?? 0;
    h.hub.key({ code: 'KeyA' }, 'down');
    h.keyFrame();
    h.hub.key({ code: 'KeyA' }, 'up');
    h.keyFrame();
    expect(h.sent['world.set_intent'] ?? 0).toBeGreaterThan(before);
    h.press({ code: 'Space' });
    expect(h.loose.pending).toBe(0);
    h.tap('a');
    expect(h.loose.current).toBeNull();
  });
});

describe('rings (16.5)', () => {
  it('lists the available windows, opens the picked one, and keeps the world at full speed', () => {
    const h = base;
    const sectors = h.player.ringSectors('windows').map((s) => s.id);
    expect(sectors.slice(0, 4)).toEqual(['character', 'inventory', 'doors', 'quests']);
    h.player.ringChoose('windows', 'inventory');
    expect(h.open).toEqual(['inventory']);
    h.host.windows.closeAll();
    h.player.ringOpen(true);
    h.player.ringOpen(false);
    expect(h.timeScales.slice(-2)).toEqual([1, 1]);
  });

  it('slows the world to 0.3x while a ring is open in a fight', () => {
    const h = inAct1();
    // walk at the nearest monster until the fight starts
    let fighting = false;
    for (let i = 0; i < 1200 && !fighting; i++) {
      const me = h.engine.world.slices.combat.units[h.view.playerId()];
      fighting = !!me && me.combatUntil > h.engine.tick;
      const m = nearestMonster(h);
      h.pad.axes[0] = fighting || !m ? 0 : m.dx;
      h.pad.axes[1] = fighting || !m ? 0 : m.dy;
      h.frame();
    }
    expect(fighting).toBe(true);
    h.player.ringOpen(true);
    expect(h.timeScales.at(-1)).toBe(RING_TIME_SCALE);
    h.player.ringOpen(false);
    expect(h.timeScales.at(-1)).toBe(1);
  });

  it('offers the party orders only with companions, and consumables on the item ring', () => {
    const h = base;
    const party = h.player.ringSectors('party');
    const companions = h.adapters.party?.companions(h.view) ?? [];
    // four orders, plus the single-companion sector once there are two or more (16.5)
    expect(party.length).toBe(companions.length === 0 ? 0 : companions.length > 1 ? 5 : 4);
    for (const s of h.player.ringSectors('items')) {
      expect(h.view.itemDef(s.id)?.kind).toBe('consumable');
    }
    expect(h.player.ringSectors('items').length).toBeLessThanOrEqual(8);
  });
});
